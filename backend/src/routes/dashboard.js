import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { completionRate, cycleTime, computeOverallScore, competencyBreakdown } from "../lib/scoring.js";

const router = Router();

// ── Manager / admin dashboard: team-wide rollups ──
router.get("/manager", requireAuth, async (req, res) => {
  if (!["MANAGER", "ADMIN"].includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });

  const where = req.user.role === "ADMIN" ? {} : { managerId: req.user.id };
  const reviews = await prisma.performanceReview.findMany({
    where,
    include: { subject: true, cycle: true, requests: true },
    orderBy: { updatedAt: "desc" },
  });

  let totalReq = 0, totalSub = 0, overdue = 0;
  const cycleTimes = [];
  const rows = reviews.map((r) => {
    const comp = completionRate(r.requests);
    const ct = cycleTime(r, r.cycle.slaDays);
    totalReq += comp.total; totalSub += comp.submitted;
    if (ct.overdue) overdue += 1;
    if (ct.completed) cycleTimes.push(ct.elapsedDays);
    return {
      reviewId: r.id, status: r.status, overallScore: r.overallScore,
      subject: `${r.subject.firstName} ${r.subject.lastName}`, title: r.subject.title,
      cycle: r.cycle.name,
      completionPct: comp.pct, completion: comp,
      elapsedDays: ct.elapsedDays ?? null, overdue: ct.overdue ?? false,
      launchedAt: r.launchedAt, approvedAt: r.approvedAt,
    };
  });

  const statusCounts = {};
  reviews.forEach((r) => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });

  res.json({
    summary: {
      reviewCount: reviews.length,
      avgScore: avg(reviews.map((r) => r.overallScore).filter((s) => s != null)),
      completionPct: totalReq ? Math.round((totalSub / totalReq) * 100) : 0,
      overdueCount: overdue,
      avgCycleDays: cycleTimes.length ? Math.round(avg(cycleTimes)) : null,
    },
    statusCounts,
    reviews: rows,
  });
});

// ── Attorney dashboard: my own performance ──
router.get("/attorney", requireAuth, async (req, res) => {
  const reviews = await prisma.performanceReview.findMany({
    where: { subjectId: req.user.id },
    include: {
      cycle: true,
      requests: { include: { response: { include: { ratings: { include: { competency: true } } } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Open cycles where I have NOT launched yet -> the launch button targets
  const openCycles = await prisma.reviewCycle.findMany({ where: { status: "OPEN" } });
  const myCycleIds = new Set(reviews.filter((r) => r.launchedAt).map((r) => r.cycleId));
  const launchable = openCycles.filter((c) => !myCycleIds.has(c.id));

  const cards = reviews.map((r) => {
    const responses = r.requests.map((q) => q.response).filter(Boolean);
    return {
      reviewId: r.id, status: r.status, cycle: r.cycle.name, cycleType: r.cycle.type,
      launchedAt: r.launchedAt, approvedAt: r.approvedAt,
      finalSummary: r.status === "APPROVED" ? r.finalSummary : null, // attorney sees summary only once approved
      overallScore: r.status === "APPROVED" ? r.overallScore : null,
      completion: completionRate(r.requests),
      cycleTime: cycleTime(r, r.cycle.slaDays),
      byCompetency: r.status === "APPROVED" ? competencyBreakdown(responses) : null,
    };
  });

  // Trend across approved reviews (for a sparkline)
  const trend = reviews
    .filter((r) => r.status === "APPROVED" && r.overallScore != null)
    .sort((a, b) => new Date(a.cycle.periodStart) - new Date(b.cycle.periodStart))
    .map((r) => ({ cycle: r.cycle.name, score: r.overallScore }));

  res.json({ launchable, cards, trend });
});

// ── Annual rollup: average the child (quarterly) approved reports ──
router.get("/rollup/:attorneyId/:annualCycleId", requireAuth, async (req, res) => {
  if (!["MANAGER", "ADMIN"].includes(req.user.role) && req.user.id !== req.params.attorneyId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const annual = await prisma.reviewCycle.findUnique({ where: { id: req.params.annualCycleId }, include: { children: true } });
  if (!annual) return res.status(404).json({ error: "Annual cycle not found" });

  const childIds = annual.children.map((c) => c.id);
  const childReviews = await prisma.performanceReview.findMany({
    where: { subjectId: req.params.attorneyId, cycleId: { in: childIds }, status: "APPROVED" },
    include: { cycle: true },
  });

  const scores = childReviews.map((r) => r.overallScore).filter((s) => s != null);
  res.json({
    annualCycle: annual.name,
    quarters: childReviews.map((r) => ({ cycle: r.cycle.name, score: r.overallScore, summary: r.finalSummary, approvedAt: r.approvedAt })),
    annualScore: scores.length ? Math.round(avg(scores) * 100) / 100 : null,
    quartersComplete: childReviews.length,
    quartersTotal: childIds.length,
  });
});

// ── Department (practice group) KPIs: which teams are working effectively ──
router.get("/departments", requireAuth, async (req, res) => {
  if (!["MANAGER", "ADMIN"].includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });

  const groups = await prisma.practiceGroup.findMany({
    include: { head: true, members: { where: { active: true } } },
    orderBy: { name: "asc" },
  });

  // All reviews with enough nesting to derive completion, cycle time, and
  // source-weighted competency averages for approved work.
  const reviews = await prisma.performanceReview.findMany({
    include: {
      subject: true,
      cycle: true,
      requests: { include: { response: { include: { ratings: { include: { competency: true } } } } } },
    },
  });

  const byGroup = new Map(); // groupId -> reviews[]
  for (const r of reviews) {
    const gid = r.subject.practiceGroupId;
    if (!gid) continue;
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid).push(r);
  }

  const rows = groups.map((g) => {
    const grp = byGroup.get(g.id) || [];
    const approved = grp.filter((r) => r.status === "APPROVED");

    let totalReq = 0, totalSub = 0, overdue = 0;
    const cycleDays = [];
    const statusCounts = {};
    const approvedResponses = [];
    for (const r of grp) {
      const comp = completionRate(r.requests);
      totalReq += comp.total; totalSub += comp.submitted;
      const ct = cycleTime(r, r.cycle.slaDays);
      if (ct.overdue) overdue += 1;
      if (ct.completed) cycleDays.push(ct.elapsedDays);
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    }
    for (const r of approved) {
      for (const q of r.requests) if (q.response) approvedResponses.push(q.response);
    }

    const scores = approved.map((r) => r.overallScore).filter((s) => s != null);
    const comp = competencyBreakdown(approvedResponses)
      .filter((c) => c.average != null)
      .sort((a, b) => b.average - a.average);

    return {
      groupId: g.id,
      name: g.name,
      head: g.head ? `${g.head.firstName} ${g.head.lastName}` : null,
      memberCount: g.members.length,
      reviewCount: grp.length,
      approvedCount: approved.length,
      avgScore: scores.length ? Math.round(avg(scores) * 100) / 100 : null,
      completionPct: totalReq ? Math.round((totalSub / totalReq) * 100) : 0,
      overdueCount: overdue,
      avgCycleDays: cycleDays.length ? Math.round(avg(cycleDays)) : null,
      statusCounts,
      strengths: comp.slice(0, 3),
      improvements: comp.slice(-3).reverse(),
    };
  });

  // Rank by effectiveness: avg score first, then completion. Unscored groups last.
  rows.sort((a, b) => {
    if ((b.avgScore ?? -1) !== (a.avgScore ?? -1)) return (b.avgScore ?? -1) - (a.avgScore ?? -1);
    return b.completionPct - a.completionPct;
  });

  const allScores = rows.map((r) => r.avgScore).filter((s) => s != null);
  res.json({
    summary: {
      groupCount: rows.length,
      peopleCount: rows.reduce((n, r) => n + r.memberCount, 0),
      reviewCount: rows.reduce((n, r) => n + r.reviewCount, 0),
      avgScore: allScores.length ? Math.round(avg(allScores) * 100) / 100 : null,
      overdueCount: rows.reduce((n, r) => n + r.overdueCount, 0),
    },
    departments: rows,
  });
});

// ── Firm-wide trends: per-cycle avg approved score + feedback completion over time ──
router.get("/trends", requireAuth, async (req, res) => {
  if (!["MANAGER", "ADMIN"].includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
  const cycles = await prisma.reviewCycle.findMany({
    where: { type: "QUARTERLY" },
    orderBy: { periodStart: "asc" },
    include: { reviews: { include: { requests: true } } },
  });
  const trends = cycles.map((c) => {
    const reqs = c.reviews.flatMap((r) => r.requests);
    const scores = c.reviews.filter((r) => r.status === "APPROVED" && r.overallScore != null).map((r) => r.overallScore);
    return {
      cycleId: c.id, cycle: c.name,
      avgScore: scores.length ? Math.round(avg(scores) * 100) / 100 : null,
      completionPct: completionRate(reqs).pct,
      reviewCount: c.reviews.length,
      approved: c.reviews.filter((r) => r.status === "APPROVED").length,
    };
  });
  res.json({ trends });
});

function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

export default router;
