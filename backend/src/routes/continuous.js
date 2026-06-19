// Continuous feedback (praise/notes) and 1:1 meeting logs — the informal layer
// between formal review cycles.
//   • Continuous feedback is visible to the recipient and their manager (plus the
//     author and admins). No anonymous or hidden notes.
//   • 1:1s are maintained by the manager (or admin) and shared-read with the report.

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { notify } from "../lib/notify.js";

const router = Router();

const KINDS = ["PRAISE", "NOTE"];
const fullName = (u) => `${u.firstName} ${u.lastName}`;

// May `viewer` see person `ownerId`'s feedback / 1:1s? Owner, their manager, admin.
async function canViewPerson(viewer, ownerId) {
  if (viewer.id === ownerId || viewer.role === "ADMIN") return true;
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { managerId: true } });
  return !!owner && owner.managerId === viewer.id;
}

// May `viewer` create/edit 1:1s for `reportId`? Their manager, or an admin.
async function canManageOneOnOne(viewer, reportId) {
  if (viewer.role === "ADMIN") return true;
  const report = await prisma.user.findUnique({ where: { id: reportId }, select: { managerId: true } });
  return !!report && report.managerId === viewer.id;
}

function shapeFeedback(f) {
  return {
    id: f.id, kind: f.kind, body: f.body, at: f.createdAt,
    author: { id: f.author.id, name: fullName(f.author), title: f.author.title },
    recipient: { id: f.recipient.id, name: fullName(f.recipient), title: f.recipient.title },
  };
}

function shapeOneOnOne(o) {
  return {
    id: o.id, heldOn: o.heldOn, notes: o.notes, at: o.createdAt,
    manager: { id: o.manager.id, name: fullName(o.manager) },
    report: { id: o.report.id, name: fullName(o.report) },
  };
}

// ── Feedback received by a person (default: me) ──
router.get("/feedback", requireAuth, async (req, res) => {
  const recipientId = req.query.recipientId || req.user.id;
  if (!(await canViewPerson(req.user, recipientId))) return res.status(403).json({ error: "Forbidden" });
  const items = await prisma.continuousFeedback.findMany({
    where: { recipientId },
    include: { author: true, recipient: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(items.map(shapeFeedback));
});

// ── Feedback I've given ──
router.get("/feedback/given", requireAuth, async (req, res) => {
  const items = await prisma.continuousFeedback.findMany({
    where: { authorId: req.user.id },
    include: { author: true, recipient: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(items.map(shapeFeedback));
});

// ── Give praise / a note to a colleague ──
router.post("/feedback", requireAuth, async (req, res) => {
  if (req.user.role === "CLIENT") return res.status(403).json({ error: "Forbidden" });
  const { recipientId, kind = "PRAISE", body } = req.body || {};
  if (!recipientId) return res.status(400).json({ error: "recipientId is required" });
  if (!body || !body.trim()) return res.status(400).json({ error: "A message is required" });
  if (!KINDS.includes(kind)) return res.status(400).json({ error: "Invalid kind" });
  if (recipientId === req.user.id) return res.status(400).json({ error: "You can't give feedback to yourself" });
  const recipient = await prisma.user.findUnique({ where: { id: recipientId } });
  if (!recipient || !recipient.active || recipient.role === "CLIENT") return res.status(400).json({ error: "Unknown recipient" });

  const created = await prisma.continuousFeedback.create({
    data: { authorId: req.user.id, recipientId, kind, body: body.trim() },
    include: { author: true, recipient: true },
  });
  const verb = kind === "PRAISE" ? "praised you" : "left you a note";
  await notify(recipientId, kind === "PRAISE" ? "PRAISE" : "FEEDBACK_NOTE", `${fullName(created.author)} ${verb}`, "/me");
  res.status(201).json(shapeFeedback(created));
});

// ── Delete feedback (author or admin) ──
router.delete("/feedback/:id", requireAuth, async (req, res) => {
  const item = await prisma.continuousFeedback.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: "Not found" });
  if (item.authorId !== req.user.id && req.user.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });
  await prisma.continuousFeedback.delete({ where: { id: item.id } });
  res.json({ ok: true });
});

// ── 1:1s for a report (default: me). Report, their manager, or admin may view. ──
router.get("/one-on-ones", requireAuth, async (req, res) => {
  const reportId = req.query.reportId || req.user.id;
  if (!(await canViewPerson(req.user, reportId))) return res.status(403).json({ error: "Forbidden" });
  const items = await prisma.oneOnOne.findMany({
    where: { reportId },
    include: { manager: true, report: true },
    orderBy: { heldOn: "desc" },
    take: 50,
  });
  const canManage = await canManageOneOnOne(req.user, reportId);
  res.json({ canManage, items: items.map(shapeOneOnOne) });
});

// ── Log a 1:1 (the report's manager, or an admin) ──
router.post("/one-on-ones", requireAuth, async (req, res) => {
  const { reportId, notes, heldOn } = req.body || {};
  if (!reportId) return res.status(400).json({ error: "reportId is required" });
  if (!notes || !notes.trim()) return res.status(400).json({ error: "Notes are required" });
  if (!(await canManageOneOnOne(req.user, reportId))) return res.status(403).json({ error: "Only the manager can log a 1:1" });
  const report = await prisma.user.findUnique({ where: { id: reportId }, select: { managerId: true } });
  const managerId = req.user.role === "ADMIN" ? (report?.managerId || req.user.id) : req.user.id;
  const created = await prisma.oneOnOne.create({
    data: { managerId, reportId, createdById: req.user.id, notes: notes.trim(), heldOn: heldOn ? new Date(heldOn) : new Date() },
    include: { manager: true, report: true },
  });
  await notify(reportId, "ONE_ON_ONE", `${fullName(created.manager)} logged a 1:1 with you`, "/me");
  res.status(201).json(shapeOneOnOne(created));
});

// ── Edit / delete a 1:1 (manager or admin) ──
router.patch("/one-on-ones/:id", requireAuth, async (req, res) => {
  const item = await prisma.oneOnOne.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: "Not found" });
  if (!(await canManageOneOnOne(req.user, item.reportId))) return res.status(403).json({ error: "Forbidden" });
  const { notes, heldOn } = req.body || {};
  const data = {};
  if (notes !== undefined) data.notes = String(notes).trim();
  if (heldOn !== undefined) data.heldOn = heldOn ? new Date(heldOn) : item.heldOn;
  const updated = await prisma.oneOnOne.update({ where: { id: item.id }, data, include: { manager: true, report: true } });
  res.json(shapeOneOnOne(updated));
});

router.delete("/one-on-ones/:id", requireAuth, async (req, res) => {
  const item = await prisma.oneOnOne.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: "Not found" });
  if (!(await canManageOneOnOne(req.user, item.reportId))) return res.status(403).json({ error: "Forbidden" });
  await prisma.oneOnOne.delete({ where: { id: item.id } });
  res.json({ ok: true });
});

export default router;
