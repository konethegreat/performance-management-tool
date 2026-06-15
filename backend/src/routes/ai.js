// AI feature endpoints. Every route degrades gracefully when AI is not
// configured (returns { aiEnabled: false } instead of erroring).

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { aiEnabled, model } from "../lib/ai/client.js";
import { organizeFeedback } from "../lib/ai/organizeFeedback.js";

const router = Router();

// Lets the frontend show/hide AI affordances and pick copy.
router.get("/status", requireAuth, (_req, res) => {
  res.json({ aiEnabled: aiEnabled(), model: aiEnabled() ? model() : null });
});

// ── Review Organizer: structure one submitted feedback response ──
router.post("/organize/:requestId", requireAuth, async (req, res) => {
  if (!aiEnabled()) return res.json({ aiEnabled: false });
  const request = await prisma.feedbackRequest.findUnique({
    where: { id: req.params.requestId },
    include: { review: true, response: { include: { ratings: { include: { competency: true } } } } },
  });
  if (!request || !request.response) return res.status(404).json({ error: "No feedback to organize" });

  const isOwner = request.reviewerId === req.user.id;
  const isManager = request.review.managerId === req.user.id;
  if (!isOwner && !isManager && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const raw = {
    strengths: request.response.strengths,
    improvements: request.response.improvements,
    ratings: request.response.ratings.map((r) => ({ competency: r.competency.name, score: r.score })),
  };
  const organized = await organizeFeedback(raw, { actorId: req.user.id, refId: request.id });
  if (!organized) return res.json({ aiEnabled: false });

  await prisma.feedbackResponse.update({
    where: { id: request.response.id },
    data: { organized: JSON.stringify(organized) },
  });
  res.json({ aiEnabled: true, organized });
});

export default router;
