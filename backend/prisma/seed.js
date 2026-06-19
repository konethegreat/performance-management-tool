// Seeds a realistic firm: one practice group, a manager, attorneys, a client,
// the 8-competency framework, an APPROVED Q1 report and an in-flight Q2 cycle
// with partial 360 feedback (so completion-rate analytics have something to show).

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SOCIAL_CATEGORIES } from "../src/lib/competencies.js";

const prisma = new PrismaClient();
const PW = bcrypt.hashSync("Password123!", 10);

const COMPETENCIES = [
  { name: "Legal Knowledge", category: "Technical", weight: 1.5, order: 1, description: "Command of relevant law, precedent and procedure." },
  { name: "Quality of Work", category: "Technical", weight: 1.5, order: 2, description: "Accuracy, thoroughness and reliability of work product." },
  { name: "Client Service", category: "Client", weight: 1.2, order: 3, description: "Responsiveness, judgment and trust built with clients." },
  { name: "Productivity", category: "Business", weight: 1.0, order: 4, description: "Throughput, utilisation and meeting deadlines." },
  { name: "Business Development", category: "Business", weight: 0.8, order: 5, description: "Originating work, networking and growing the practice." },
  { name: "Mentorship & Teamwork", category: "Behavioural", weight: 1.0, order: 6, description: "Developing juniors, collaboration and firm citizenship." },
  { name: "Communication", category: "Behavioural", weight: 1.0, order: 7, description: "Clarity in writing and speech, internal and external." },
  { name: "Ethics & Professional Responsibility", category: "Behavioural", weight: 1.5, order: 8, description: "Integrity, confidentiality and compliance with conduct rules." },
];

async function main() {
  console.log("Resetting tables…");
  // Order matters for FK constraints
  await prisma.rating.deleteMany();
  await prisma.feedbackResponse.deleteMany();
  await prisma.feedbackRequest.deleteMany();
  await prisma.reportEvent.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.performanceReview.deleteMany();
  await prisma.reviewCycle.deleteMany();
  await prisma.competency.deleteMany();
  await prisma.user.deleteMany();
  await prisma.practiceGroup.deleteMany();

  console.log("Seeding competencies…");
  const comps = {};
  for (const c of COMPETENCIES) {
    const created = await prisma.competency.create({ data: c });
    comps[created.name] = created;
  }
  const compList = Object.values(comps);

  console.log("Seeding users & practice group…");
  const group = await prisma.practiceGroup.create({
    data: { name: "Corporate & Commercial" },
  });

  const admin = await prisma.user.create({
    data: { email: "admin@mostoeneng.law", passwordHash: PW, firstName: "Ava", lastName: "Mokoena", role: "ADMIN", title: "HR Director", position: "administrator" },
  });

  const manager = await prisma.user.create({
    data: {
      email: "t.dlamini@mostoeneng.law", passwordHash: PW, firstName: "Thabo", lastName: "Dlamini",
      role: "MANAGER", title: "Partner", position: "partner", practiceGroupId: group.id,
    },
  });
  await prisma.practiceGroup.update({ where: { id: group.id }, data: { headId: manager.id } });

  // Attorneys reporting to the manager
  const khumalo = await prisma.user.create({
    data: { email: "n.khumalo@mostoeneng.law", passwordHash: PW, firstName: "Naledi", lastName: "Khumalo", role: "ATTORNEY", title: "Senior Associate", position: "senior_associate", managerId: manager.id, practiceGroupId: group.id },
  });
  const naidoo = await prisma.user.create({
    data: { email: "s.naidoo@mostoeneng.law", passwordHash: PW, firstName: "Sanjay", lastName: "Naidoo", role: "ATTORNEY", title: "Associate", position: "associate", managerId: manager.id, practiceGroupId: group.id },
  });
  const botha = await prisma.user.create({
    data: { email: "l.botha@mostoeneng.law", passwordHash: PW, firstName: "Lize", lastName: "Botha", role: "ATTORNEY", title: "Associate", position: "associate", managerId: manager.id, practiceGroupId: group.id },
  });
  // A junior who reports to Khumalo (so Khumalo has a subordinate for 360)
  const junior = await prisma.user.create({
    data: { email: "p.moyo@mostoeneng.law", passwordHash: PW, firstName: "Peter", lastName: "Moyo", role: "ATTORNEY", title: "Candidate Attorney", position: "candidate_attorney", managerId: khumalo.id, practiceGroupId: group.id },
  });

  // Support staff — a social/soft rater (paralegal). Demonstrates the SUPPORT tier.
  const paralegal = await prisma.user.create({
    data: { email: "k.dube@mostoeneng.law", passwordHash: PW, firstName: "Kgomotso", lastName: "Dube", role: "SUPPORT", title: "Paralegal", position: "paralegal", managerId: manager.id, practiceGroupId: group.id },
  });

  const client = await prisma.user.create({
    data: { email: "client@acme-holdings.com", passwordHash: PW, firstName: "Grace", lastName: "Adeyemi", role: "CLIENT", title: "General Counsel", position: "client", clientAccount: "Acme Holdings" },
  });

  console.log("Seeding cycles…");
  const annual = await prisma.reviewCycle.create({
    data: { name: "FY2026 Annual", type: "ANNUAL", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-12-31"), slaDays: 45 },
  });
  const q1 = await prisma.reviewCycle.create({
    data: { name: "Q1 2026", type: "QUARTERLY", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-03-31"), slaDays: 30, status: "CLOSED", parentId: annual.id },
  });
  const q2 = await prisma.reviewCycle.create({
    data: { name: "Q2 2026", type: "QUARTERLY", periodStart: new Date("2026-04-01"), periodEnd: new Date("2026-06-30"), slaDays: 30, status: "OPEN", parentId: annual.id },
  });

  // Helper: create a review and fan out 360 requests
  async function createReview(subject, cycle, managerUser, opts = {}) {
    const review = await prisma.performanceReview.create({
      data: { subjectId: subject.id, cycleId: cycle.id, managerId: managerUser.id, status: opts.status || "NOT_STARTED" },
    });

    const reviewers = [
      { user: subject, role: "SELF", weight: 0.8 },
      { user: managerUser, role: "MANAGER", weight: 1.5 },
      { user: naidoo.id === subject.id ? botha : naidoo, role: "PEER", weight: 1.0 },
      { user: client, role: "CLIENT", weight: 0.9 },
    ];
    // Subordinate feedback only where the subject manages someone
    if (subject.id === khumalo.id) reviewers.push({ user: junior, role: "SUBORDINATE", weight: 1.0 });

    const dueDate = new Date(cycle.periodEnd);
    for (const r of reviewers) {
      const u = typeof r.user === "string" ? { id: r.user } : r.user;
      if (u.id === subject.id && r.role !== "SELF") continue; // don't ask someone to peer-review themselves
      await prisma.feedbackRequest.create({
        data: { reviewId: review.id, reviewerId: u.id, reviewerRole: r.role, dueDate, status: "PENDING" },
      });
    }
    return review;
  }

  // Helper: submit a feedback response with ratings
  async function submitFeedback(reviewId, reviewerId, role, baseScore, sourceWeight, strengths, improvements) {
    const req = await prisma.feedbackRequest.findFirst({ where: { reviewId, reviewerId, reviewerRole: role } });
    if (!req) return;
    const resp = await prisma.feedbackResponse.create({
      data: { requestId: req.id, sourceWeight, strengths, improvements },
    });
    for (const c of compList) {
      // jitter scores a little around the base so charts look natural
      const score = Math.max(1, Math.min(5, baseScore + (Math.random() < 0.4 ? (Math.random() < 0.5 ? -1 : 1) : 0)));
      await prisma.rating.create({ data: { responseId: resp.id, competencyId: c.id, score, comment: null } });
    }
    await prisma.feedbackRequest.update({ where: { id: req.id }, data: { status: "SUBMITTED" } });
  }

  // Support staff submit social/soft competencies only (the Stage 2 restriction).
  async function submitSupportFeedback(reviewId, reviewerId, baseScore, sourceWeight, strengths, improvements) {
    const req = await prisma.feedbackRequest.findFirst({ where: { reviewId, reviewerId, reviewerRole: "SUPPORT" } });
    if (!req) return;
    const resp = await prisma.feedbackResponse.create({ data: { requestId: req.id, sourceWeight, strengths, improvements } });
    const social = compList.filter((c) => SOCIAL_CATEGORIES.includes(c.category));
    for (const c of social) {
      const score = Math.max(1, Math.min(5, baseScore + (Math.random() < 0.4 ? (Math.random() < 0.5 ? -1 : 1) : 0)));
      await prisma.rating.create({ data: { responseId: resp.id, competencyId: c.id, score, comment: null } });
    }
    await prisma.feedbackRequest.update({ where: { id: req.id }, data: { status: "SUBMITTED" } });
  }

  async function logEvent(reviewId, actorId, action, note) {
    await prisma.reportEvent.create({ data: { reviewId, actorId, action, note } });
  }

  // ── Q1: a fully APPROVED report for Khumalo (shows rollup + history) ──
  console.log("Seeding Q1 approved report for Khumalo…");
  const q1Review = await createReview(khumalo, q1, manager, { status: "APPROVED" });
  await prisma.performanceReview.update({
    where: { id: q1Review.id },
    data: {
      launchedAt: new Date("2026-04-02"), submittedAt: new Date("2026-04-10"),
      finalizedAt: new Date("2026-04-14"), approvedAt: new Date("2026-04-18"),
      draftSummary: "Strong quarter on technical work; client feedback excellent.",
      finalSummary: "Naledi exceeded expectations on the Acme transaction. Continue building origination skills toward partnership track.",
      overallScore: 4.3,
    },
  });
  await submitFeedback(q1Review.id, khumalo.id, "SELF", 4, 0.8, "Delivered the Acme deal on time.", "Want more courtroom exposure.");
  await submitFeedback(q1Review.id, manager.id, "MANAGER", 4, 1.5, "Reliable and technically excellent.", "Take on more BD.");
  await submitFeedback(q1Review.id, naidoo.id, "PEER", 4, 1.0, "Great to collaborate with.", null);
  await submitFeedback(q1Review.id, client.id, "CLIENT", 5, 0.9, "Responsive and clear.", null);
  await submitFeedback(q1Review.id, junior.id, "SUBORDINATE", 4, 1.0, "Patient mentor.", null);
  await logEvent(q1Review.id, khumalo.id, "LAUNCHED", null);
  await logEvent(q1Review.id, manager.id, "SUBMITTED", null);
  await logEvent(q1Review.id, manager.id, "FINALIZED", null);
  await logEvent(q1Review.id, admin.id, "APPROVED", "Approved at calibration meeting.");
  // ── Goals / OKRs: objectives with measurable key results that roll up ──
  // Manager-assigned objective tied to the approved Q1 review.
  await prisma.goal.create({
    data: {
      reviewId: q1Review.id, ownerId: khumalo.id, createdById: manager.id,
      title: "Originate R500k of new work", description: "Lead two BD pitches this year and convert at least one.",
      status: "IN_PROGRESS", dueDate: new Date("2026-12-31"),
      keyResults: { create: [
        { title: "Lead 2 new-business pitches", progress: 50 },
        { title: "Convert R500k in new instructions", progress: 30 },
        { title: "Attend 4 industry networking events", progress: 75 },
      ] },
    },
  });
  // A self-set development objective (no review link).
  await prisma.goal.create({
    data: {
      ownerId: khumalo.id, createdById: khumalo.id,
      title: "Grow as a courtroom advocate", description: "Build advocacy experience toward a senior profile.",
      status: "OPEN",
      keyResults: { create: [
        { title: "Second-chair 3 hearings", progress: 33 },
        { title: "Complete an advanced advocacy course", progress: 0 },
      ] },
    },
  });
  // Naidoo: an early-career objective, partially progressed.
  await prisma.goal.create({
    data: {
      ownerId: naidoo.id, createdById: naidoo.id,
      title: "Sharpen time management", description: "Hit deadlines consistently across matters.",
      status: "IN_PROGRESS",
      keyResults: { create: [
        { title: "Log time daily for the full quarter", progress: 60 },
        { title: "Zero missed filing deadlines", progress: 80 },
      ] },
    },
  });

  // ── Q2: in-flight cycle ──
  console.log("Seeding Q2 in-flight reviews…");
  // Khumalo: launched, feedback partially in, manager drafting
  const q2Khumalo = await createReview(khumalo, q2, manager, { status: "DRAFT" });
  await prisma.performanceReview.update({
    where: { id: q2Khumalo.id },
    data: { launchedAt: daysAgo(12), draftSummary: "Mid-cycle: awaiting peer and subordinate input before finalizing." },
  });
  await submitFeedback(q2Khumalo.id, khumalo.id, "SELF", 4, 0.8, "On track with goals.", "Need more BD time.");
  await submitFeedback(q2Khumalo.id, manager.id, "MANAGER", 4, 1.5, "Consistent.", "Push origination.");
  await submitFeedback(q2Khumalo.id, client.id, "CLIENT", 5, 0.9, "Excellent service.", null);
  await logEvent(q2Khumalo.id, khumalo.id, "LAUNCHED", null);
  await logEvent(q2Khumalo.id, manager.id, "DRAFT_SAVED", null);
  // Support staff (paralegal): social/soft feedback submitted on Khumalo's in-flight review.
  await prisma.feedbackRequest.create({
    data: { reviewId: q2Khumalo.id, reviewerId: paralegal.id, reviewerRole: "SUPPORT", dueDate: new Date(q2.periodEnd), status: "PENDING" },
  });
  await submitSupportFeedback(q2Khumalo.id, paralegal.id, 4, 0.7, "Always professional and approachable with the support team.", "Could brief us on matter context a little earlier.");

  // Naidoo: launched, only self submitted (low completion — good demo of analytics)
  const q2Naidoo = await createReview(naidoo, q2, manager, { status: "LAUNCHED" });
  await prisma.performanceReview.update({ where: { id: q2Naidoo.id }, data: { launchedAt: daysAgo(4) } });
  await submitFeedback(q2Naidoo.id, naidoo.id, "SELF", 3, 0.8, "Learning fast.", "Time management.");
  await logEvent(q2Naidoo.id, naidoo.id, "LAUNCHED", null);
  // Support staff (paralegal): a PENDING social-only request — logging in as the
  // paralegal shows the restricted feedback form live.
  await prisma.feedbackRequest.create({
    data: { reviewId: q2Naidoo.id, reviewerId: paralegal.id, reviewerRole: "SUPPORT", dueDate: new Date(q2.periodEnd), status: "PENDING" },
  });

  // Botha: not yet launched (the launch button is live for her)
  await createReview(botha, q2, manager, { status: "NOT_STARTED" });

  // ── Continuous feedback (praise/notes) + 1:1s between the formal cycles ──
  console.log("Seeding continuous feedback & 1:1s…");
  await prisma.continuousFeedback.createMany({
    data: [
      { authorId: manager.id,   recipientId: khumalo.id, kind: "PRAISE", body: "Outstanding work closing the Acme transaction ahead of the deadline — the client noticed." },
      { authorId: naidoo.id,    recipientId: khumalo.id, kind: "PRAISE", body: "Thanks for walking me through the diligence checklist — it really clarified things." },
      { authorId: paralegal.id, recipientId: khumalo.id, kind: "PRAISE", body: "Always clear with instructions and respectful of the support team's time." },
      { authorId: manager.id,   recipientId: naidoo.id,  kind: "NOTE",   body: "Great progress this month. Let's keep an eye on turnaround time on the smaller matters." },
      { authorId: khumalo.id,   recipientId: naidoo.id,  kind: "PRAISE", body: "Your research memo on the Botha matter was thorough and well-structured." },
    ],
  });

  await prisma.oneOnOne.create({ data: { managerId: manager.id, reportId: khumalo.id, createdById: manager.id, heldOn: daysAgo(20), notes: "Checked in on the partnership track. Agreed to put Naledi forward to lead the next BD pitch. She's keen on more courtroom exposure — will look for a second-chair opportunity." } });
  await prisma.oneOnOne.create({ data: { managerId: manager.id, reportId: khumalo.id, createdById: manager.id, heldOn: daysAgo(6), notes: "Reviewed Q2 goals. BD pipeline on track. Discussed delegating more routine drafting to free up origination time." } });
  await prisma.oneOnOne.create({ data: { managerId: manager.id, reportId: naidoo.id, createdById: manager.id, heldOn: daysAgo(10), notes: "Time-management focus: set up a daily time-logging habit and a weekly deadline check. Sanjay feels well-supported." } });

  console.log("Done. Login with Password123!");
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
