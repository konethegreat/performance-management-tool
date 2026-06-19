// Cadence: the review calendar, on-demand reminders, and personal digests.

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { remindOwnedReviews, remindForReview, buildPersonalDigest, digestToText } from "../lib/reminders.js";
import { sendEmail } from "../lib/email.js";
import { completionRate, cycleTime } from "../lib/scoring.js";

const router = Router();

// ── Calendar: every cycle with its window, status and live review stats ──
router.get("/calendar", requireAuth, async (_req, res) => {
  const cycles = await prisma.reviewCycle.findMany({
    orderBy: [{ periodStart: "asc" }],
    include: { reviews: { include: { requests: true } } },
  });
  res.json(cycles.map((c) => {
    const allReqs = c.reviews.flatMap((r) => r.requests);
    const overdue = c.reviews.filter((r) => cycleTime(r, c.slaDays).overdue).length;
    return {
      id: c.id, name: c.name, type: c.type, status: c.status, parentId: c.parentId,
      periodStart: c.periodStart, periodEnd: c.periodEnd, slaDays: c.slaDays,
      reviewCount: c.reviews.length,
      approved: c.reviews.filter((r) => r.status === "APPROVED").length,
      completionPct: completionRate(allReqs).pct,
      overdue,
    };
  }));
});

// ── Send reminders for outstanding feedback (manager/admin) ──
// Body: { reviewId? } — one review (must own it) or all the caller's in-flight reviews.
router.post("/remind", requireAuth, requireRole("MANAGER", "ADMIN"), async (req, res) => {
  const { reviewId, onlyDueSoon } = req.body || {};
  if (reviewId) {
    const review = await prisma.performanceReview.findUnique({ where: { id: reviewId }, select: { managerId: true } });
    if (!review) return res.status(404).json({ error: "Review not found" });
    if (req.user.role !== "ADMIN" && review.managerId !== req.user.id) return res.status(403).json({ error: "Not your review" });
    return res.json({ ok: true, ...(await remindForReview(reviewId, { onlyDueSoon: !!onlyDueSoon })) });
  }
  res.json({ ok: true, ...(await remindOwnedReviews(req.user, { onlyDueSoon: !!onlyDueSoon })) });
});

// ── My personal digest (in-app) ──
router.get("/digest", requireAuth, async (req, res) => {
  const digest = await buildPersonalDigest(req.user.id);
  if (!digest) return res.status(404).json({ error: "Not found" });
  res.json(digest);
});

// ── Email my digest to myself (log-only unless EMAIL_ENABLED) ──
router.post("/digest/email", requireAuth, async (req, res) => {
  const digest = await buildPersonalDigest(req.user.id);
  if (!digest) return res.status(404).json({ error: "Not found" });
  const body = digestToText(digest);
  const sent = await sendEmail({ to: digest.user.email, subject: "Your performance digest", body });
  res.json({ ok: true, delivered: sent.delivered, to: digest.user.email, preview: body });
});

export default router;
