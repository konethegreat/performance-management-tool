// Anthropic AI client + small helpers shared by every AI feature.
//
// The whole AI layer is optional: if AI_ENABLED is "false" or there is no
// ANTHROPIC_API_KEY, aiEnabled() returns false and callers must degrade
// gracefully (return { aiEnabled: false } rather than erroring). The API key
// never leaves the server.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../prisma.js";

let _client = null;

export function aiEnabled() {
  return process.env.AI_ENABLED !== "false" && !!process.env.ANTHROPIC_API_KEY;
}

// Tiered model routing — the system uses the full Claude range, picking the
// right model for each task instead of one model for everything:
//   fast     → Haiku  : cheap, low-latency classification (bias/quality check)
//   balanced → Sonnet : structured restructuring / theming (review organizer)
//   deep     → Opus   : high-stakes synthesis (report draft, attorney memory)
// Each tier can be overridden via env; AI_MODEL (legacy) pins ALL tiers to one
// model as an escape hatch for cost control or testing.
const TIERS = {
  fast:     () => process.env.AI_MODEL_FAST     || "claude-haiku-4-5-20251001",
  balanced: () => process.env.AI_MODEL_BALANCED || "claude-sonnet-4-6",
  deep:     () => process.env.AI_MODEL_DEEP     || "claude-opus-4-8",
};

export function model(tier = "balanced") {
  if (process.env.AI_MODEL) return process.env.AI_MODEL; // global pin (legacy)
  return (TIERS[tier] || TIERS.balanced)();
}

// The tier→model map for the /status endpoint and the top-bar chip.
export function models() {
  return {
    fast: model("fast"),
    balanced: model("balanced"),
    deep: model("deep"),
    pinned: process.env.AI_MODEL || null,
  };
}

// Lazily construct a single Anthropic client (reads ANTHROPIC_API_KEY from env).
export function client() {
  if (!aiEnabled()) return null;
  if (!_client) _client = new Anthropic();
  return _client;
}

// Records an AiRun audit row from a message response's usage block.
// Never throws — auditing must not break the feature it is logging.
export async function logRun({ kind, refId, actorId, usage, model: usedModel }) {
  try {
    await prisma.aiRun.create({
      data: {
        kind,
        model: usedModel || model(),
        refId: refId || null,
        actorId: actorId || null,
        inputTokens: usage?.input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
      },
    });
  } catch (e) {
    console.error("AiRun log failed:", e.message);
  }
}
