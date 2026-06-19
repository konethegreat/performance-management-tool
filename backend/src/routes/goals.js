// Goals / OKRs. Each Goal is an objective; measurable KeyResults hang off it and
// roll up as their average progress (0–100). An attorney owns and manages their
// own objectives; their manager (or an admin) may also set and update them.

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const STATUSES = ["OPEN", "IN_PROGRESS", "ACHIEVED", "MISSED"];
const clampProgress = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

// Objective progress = average of its key results (0–100), or null if none yet.
function rollupProgress(keyResults) {
  if (!keyResults || keyResults.length === 0) return null;
  return Math.round(keyResults.reduce((a, k) => a + (k.progress ?? 0), 0) / keyResults.length);
}

function shape(goal) {
  return {
    id: goal.id,
    ownerId: goal.ownerId,
    reviewId: goal.reviewId,
    assignedByManager: !!goal.createdById && goal.createdById !== goal.ownerId,
    title: goal.title,
    description: goal.description,
    status: goal.status,
    dueDate: goal.dueDate,
    keyResults: (goal.keyResults || []).map((k) => ({ id: k.id, title: k.title, progress: k.progress })),
    progress: rollupProgress(goal.keyResults),
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

// May the current user view/manage objectives owned by ownerId?
// Owner themselves, an admin, or the owner's direct manager.
async function canManageGoalsFor(user, ownerId) {
  if (user.id === ownerId || user.role === "ADMIN") return true;
  if (user.role === "MANAGER") {
    const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { managerId: true } });
    return !!owner && owner.managerId === user.id;
  }
  return false;
}

// Load a goal and confirm the caller may manage it; sends the error response and
// returns null if not.
async function loadManageableGoal(req, res) {
  const goal = await prisma.goal.findUnique({
    where: { id: req.params.id },
    include: { keyResults: { orderBy: { createdAt: "asc" } } },
  });
  if (!goal) { res.status(404).json({ error: "Goal not found" }); return null; }
  if (!(await canManageGoalsFor(req.user, goal.ownerId))) { res.status(403).json({ error: "Forbidden" }); return null; }
  return goal;
}

// ── List objectives for an owner (defaults to me) ──
router.get("/", requireAuth, async (req, res) => {
  const ownerId = req.query.ownerId || req.user.id;
  if (!(await canManageGoalsFor(req.user, ownerId))) return res.status(403).json({ error: "Forbidden" });
  const goals = await prisma.goal.findMany({
    where: { ownerId },
    include: { keyResults: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  res.json({ ownerId, goals: goals.map(shape) });
});

// ── Create an objective (optionally with initial key results) ──
router.post("/", requireAuth, async (req, res) => {
  const { title, description, dueDate, ownerId: bodyOwner, reviewId, keyResults } = req.body || {};
  const ownerId = bodyOwner || req.user.id;
  if (!title || !title.trim()) return res.status(400).json({ error: "Title is required" });
  if (!(await canManageGoalsFor(req.user, ownerId))) return res.status(403).json({ error: "Forbidden" });

  const krCreate = Array.isArray(keyResults)
    ? keyResults.filter((k) => k && k.title && k.title.trim()).map((k) => ({ title: k.title.trim(), progress: clampProgress(k.progress) }))
    : [];

  const goal = await prisma.goal.create({
    data: {
      ownerId,
      createdById: req.user.id,
      reviewId: reviewId || null,
      title: title.trim(),
      description: description?.trim() || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      keyResults: krCreate.length ? { create: krCreate } : undefined,
    },
    include: { keyResults: { orderBy: { createdAt: "asc" } } },
  });
  res.status(201).json(shape(goal));
});

// ── Update objective fields (title / description / status / due date) ──
router.patch("/:id", requireAuth, async (req, res) => {
  const goal = await loadManageableGoal(req, res);
  if (!goal) return;
  const { title, description, status, dueDate } = req.body || {};
  if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: "Invalid status" });
  const data = {};
  if (title !== undefined) data.title = String(title).trim();
  if (description !== undefined) data.description = description ? String(description).trim() : null;
  if (status !== undefined) data.status = status;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  const updated = await prisma.goal.update({
    where: { id: goal.id }, data,
    include: { keyResults: { orderBy: { createdAt: "asc" } } },
  });
  res.json(shape(updated));
});

// ── Delete an objective (cascades its key results) ──
router.delete("/:id", requireAuth, async (req, res) => {
  const goal = await loadManageableGoal(req, res);
  if (!goal) return;
  await prisma.goal.delete({ where: { id: goal.id } });
  res.json({ ok: true });
});

// ── Add a key result to an objective ──
router.post("/:id/key-results", requireAuth, async (req, res) => {
  const goal = await loadManageableGoal(req, res);
  if (!goal) return;
  const { title, progress } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: "Key result title is required" });
  const kr = await prisma.keyResult.create({
    data: { goalId: goal.id, title: title.trim(), progress: clampProgress(progress) },
  });
  res.status(201).json({ id: kr.id, title: kr.title, progress: kr.progress });
});

// ── Update a key result (title and/or progress) ──
router.patch("/:id/key-results/:krId", requireAuth, async (req, res) => {
  const goal = await loadManageableGoal(req, res);
  if (!goal) return;
  const kr = goal.keyResults.find((k) => k.id === req.params.krId);
  if (!kr) return res.status(404).json({ error: "Key result not found" });
  const { title, progress } = req.body || {};
  const data = {};
  if (title !== undefined) data.title = String(title).trim();
  if (progress !== undefined) data.progress = clampProgress(progress);
  const updated = await prisma.keyResult.update({ where: { id: kr.id }, data });
  res.json({ id: updated.id, title: updated.title, progress: updated.progress });
});

// ── Delete a key result ──
router.delete("/:id/key-results/:krId", requireAuth, async (req, res) => {
  const goal = await loadManageableGoal(req, res);
  if (!goal) return;
  const kr = goal.keyResults.find((k) => k.id === req.params.krId);
  if (!kr) return res.status(404).json({ error: "Key result not found" });
  await prisma.keyResult.delete({ where: { id: kr.id } });
  res.json({ ok: true });
});

export default router;
