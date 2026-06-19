// Reminder + digest logic, shared by the cadence routes (manual triggers) and the
// scripts/reminders.js cron sweep. Reminders are written as in-app notifications;
// digests are composed here and delivered via the email seam (lib/email.js).

import { prisma } from "./prisma.js";
import { notify } from "./notify.js";
import { sendEmail } from "./email.js";

export const DUE_SOON_DAYS = 3;
const ACTIVE_STATUSES = ["LAUNCHED", "DRAFT", "IN_REVIEW"]; // collecting feedback
const REVIEW_INCLUDE = { subject: true, cycle: true, requests: true };
const DAY = 86400000;

const fullName = (u) => `${u.firstName} ${u.lastName}`;
const dateStr = (d) => (d ? new Date(d).toLocaleDateString("en-ZA") : "no due date");

function dueState(dueDate) {
  if (!dueDate) return { overdue: false, dueSoon: false, days: null };
  const days = Math.ceil((new Date(dueDate) - Date.now()) / DAY);
  return { overdue: days < 0, dueSoon: days >= 0 && days <= DUE_SOON_DAYS, days };
}

// Notify reviewers who still owe feedback on the given (active) reviews.
// onlyDueSoon limits to requests overdue or due within DUE_SOON_DAYS.
async function remindReviewers(reviews, { onlyDueSoon = false } = {}) {
  let remindersSent = 0;
  const touched = new Set();
  for (const review of reviews) {
    if (!ACTIVE_STATUSES.includes(review.status)) continue;
    for (const req of review.requests) {
      if (req.status !== "PENDING") continue;
      const ds = dueState(req.dueDate);
      if (onlyDueSoon && !(ds.overdue || ds.dueSoon)) continue;
      const when = ds.overdue ? `was due ${dateStr(req.dueDate)} (overdue)` : `is due ${dateStr(req.dueDate)}`;
      await notify(
        req.reviewerId,
        "FEEDBACK_REMINDER",
        `Reminder: your feedback for ${fullName(review.subject)}'s ${review.cycle.name} review ${when}.`,
        "/feedback"
      );
      remindersSent += 1;
      touched.add(review.id);
    }
  }
  return { remindersSent, reviewsTouched: touched.size };
}

// Remind reviewers across the reviews a manager owns (admin: all active reviews).
export async function remindOwnedReviews(user, { onlyDueSoon = false } = {}) {
  const where = user.role === "ADMIN"
    ? { status: { in: ACTIVE_STATUSES } }
    : { managerId: user.id, status: { in: ACTIVE_STATUSES } };
  const reviews = await prisma.performanceReview.findMany({ where, include: REVIEW_INCLUDE });
  return remindReviewers(reviews, { onlyDueSoon });
}

// Remind reviewers for a single review (caller authorizes).
export async function remindForReview(reviewId, { onlyDueSoon = false } = {}) {
  const review = await prisma.performanceReview.findUnique({ where: { id: reviewId }, include: REVIEW_INCLUDE });
  if (!review) return { remindersSent: 0, reviewsTouched: 0 };
  return remindReviewers([review], { onlyDueSoon });
}

// A personal digest: feedback you owe, your own reviews, recent recognition.
export async function buildPersonalDigest(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const owed = await prisma.feedbackRequest.findMany({
    where: { reviewerId: userId, status: "PENDING", review: { status: { in: ACTIVE_STATUSES } } },
    include: { review: { include: { subject: true, cycle: true } } },
    orderBy: { dueDate: "asc" },
  });
  const feedbackOwed = owed.map((r) => {
    const ds = dueState(r.dueDate);
    return { requestId: r.id, subject: fullName(r.review.subject), cycle: r.review.cycle.name, dueDate: r.dueDate, overdue: ds.overdue, dueSoon: ds.dueSoon };
  });

  const myRows = await prisma.performanceReview.findMany({
    where: { subjectId: userId }, include: { cycle: true, requests: true },
    orderBy: { updatedAt: "desc" }, take: 5,
  });
  const myReviews = myRows.map((rv) => ({
    cycle: rv.cycle.name, status: rv.status,
    submitted: rv.requests.filter((q) => q.status === "SUBMITTED").length, total: rv.requests.length,
  }));

  const since = new Date(Date.now() - 7 * DAY);
  const recent = await prisma.continuousFeedback.findMany({
    where: { recipientId: userId, createdAt: { gte: since } }, include: { author: true },
    orderBy: { createdAt: "desc" }, take: 10,
  });
  const recognition = recent.map((f) => ({ kind: f.kind, from: fullName(f.author), body: f.body, at: f.createdAt }));

  return {
    user: { id: user.id, name: fullName(user), email: user.email, role: user.role },
    feedbackOwed, myReviews, recognition, generatedAt: new Date().toISOString(),
  };
}

export function digestToText(d) {
  const lines = [`Hi ${d.user.name.split(" ")[0]}, here's your performance digest.`, ""];
  if (d.feedbackOwed.length) {
    lines.push(`Feedback you owe (${d.feedbackOwed.length}):`);
    for (const f of d.feedbackOwed) {
      const tag = f.overdue ? " [OVERDUE]" : f.dueSoon ? " [due soon]" : "";
      lines.push(`  • ${f.subject} — ${f.cycle}${tag}`);
    }
  } else {
    lines.push("Feedback you owe: none — you're all caught up.");
  }
  if (d.myReviews.length) {
    lines.push("", "Your reviews:");
    for (const r of d.myReviews) lines.push(`  • ${r.cycle} — ${r.status} (feedback ${r.submitted}/${r.total})`);
  }
  if (d.recognition.length) {
    lines.push("", `Recent recognition (${d.recognition.length}):`);
    for (const r of d.recognition) lines.push(`  • ${r.kind === "PRAISE" ? "Praise" : "Note"} from ${r.from}: ${r.body}`);
  }
  lines.push("", "— Motsoeneng Bill Performance Management");
  return lines.join("\n");
}

// A manager team digest: the status of every active review they own.
export async function buildManagerDigest(managerId) {
  const mgr = await prisma.user.findUnique({ where: { id: managerId } });
  if (!mgr) return null;
  const reviews = await prisma.performanceReview.findMany({
    where: { managerId, status: { in: ACTIVE_STATUSES } }, include: REVIEW_INCLUDE,
  });
  const rows = reviews.map((rv) => {
    const submitted = rv.requests.filter((q) => q.status === "SUBMITTED").length;
    const total = rv.requests.length;
    const overdue = !!rv.launchedAt && rv.status !== "APPROVED" &&
      Math.floor((Date.now() - new Date(rv.launchedAt)) / DAY) > (rv.cycle.slaDays ?? 30);
    return { subject: fullName(rv.subject), cycle: rv.cycle.name, status: rv.status, submitted, total, pending: total - submitted, overdue };
  });
  return { user: { name: fullName(mgr), email: mgr.email }, rows, generatedAt: new Date().toISOString() };
}

export function managerDigestToText(d) {
  const lines = [`Hi ${d.user.name.split(" ")[0]}, here's your team's review status.`, ""];
  if (!d.rows.length) lines.push("No active reviews right now.");
  for (const r of d.rows) {
    const tag = r.overdue ? " [OVERDUE]" : "";
    lines.push(`  • ${r.subject} — ${r.cycle} — ${r.status} — feedback ${r.submitted}/${r.total}${r.pending ? `, ${r.pending} outstanding` : ""}${tag}`);
  }
  lines.push("", "— Motsoeneng Bill Performance Management");
  return lines.join("\n");
}

// Scheduled sweep: remind reviewers of due-soon/overdue feedback across all open
// cycles, and email each owning manager a team digest. Used by scripts/reminders.js.
export async function sweepReminders() {
  const reviews = await prisma.performanceReview.findMany({
    where: { status: { in: ACTIVE_STATUSES }, cycle: { status: "OPEN" } }, include: REVIEW_INCLUDE,
  });
  const { remindersSent, reviewsTouched } = await remindReviewers(reviews, { onlyDueSoon: true });
  const managerIds = [...new Set(reviews.map((r) => r.managerId))];
  let digestsSent = 0;
  for (const mid of managerIds) {
    const d = await buildManagerDigest(mid);
    if (!d) continue;
    await sendEmail({ to: d.user.email, subject: "Your team performance digest", body: managerDigestToText(d) });
    digestsSent += 1;
  }
  return { reviewsScanned: reviews.length, remindersSent, reviewsTouched, digestsSent, ranAt: new Date().toISOString() };
}
