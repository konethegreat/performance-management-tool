// AI feature endpoints. Every route degrades gracefully when AI is not
// configured (returns { aiEnabled: false } instead of erroring).

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { aiEnabled, model } from "../lib/ai/client.js";

const router = Router();

// Lets the frontend show/hide AI affordances and pick copy.
router.get("/status", requireAuth, (_req, res) => {
  res.json({ aiEnabled: aiEnabled(), model: aiEnabled() ? model() : null });
});

export default router;
