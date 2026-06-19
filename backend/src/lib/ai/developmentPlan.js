// Individual Development Plan (IDP): a kind, forward-looking growth plan for an
// attorney, synthesised from their longitudinal memory, their latest approved
// competency breakdown, and any standing goals. The tone is developmental and
// affirming — this is a tool to help the attorney grow, not to judge them.
// Advisory and editable; it never changes review state or scores.

import { z } from "zod/v4"; // SDK's zodOutputFormat requires zod v4 schemas
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { client, model, logRun } from "./client.js";

const Schema = z.object({
  openingNote: z
    .string()
    .describe("A warm, personal 2-3 sentence opening addressed to the attorney by first name — affirming and human, not corporate"),
  strengthsToBuildOn: z
    .array(z.string())
    .describe("Durable strengths to lean into, phrased as assets to build on"),
  growthAreas: z
    .array(
      z.object({
        area: z.string().describe("A development area, named gently and specifically"),
        why: z.string().describe("Kind, non-judgemental framing of why this matters for their growth"),
        actions: z.array(z.string()).describe("2-4 concrete, achievable next steps"),
      })
    )
    .describe("Development areas framed as opportunities, each with practical steps"),
  suggestedGoals: z
    .array(
      z.object({
        title: z.string().describe("A short, motivating goal title"),
        detail: z.string().describe("One sentence on what success looks like"),
      })
    )
    .describe("A few suggested goals for the next cycle"),
  encouragement: z
    .string()
    .describe("A closing sentence of genuine, specific encouragement"),
});

// ctx: { attorneyName, memory, competencies: [{name, average}], goals: [{title, status}] }
export async function developmentPlan(ctx, { actorId } = {}) {
  const c = client();
  if (!c) return null;

  const mem = ctx.memory
    ? `Trajectory: ${ctx.memory.trajectory || "-"}\nRecurring themes: ${ctx.memory.themes || "-"}\nStrengths: ${ctx.memory.strengths || "-"}\nWatch areas: ${ctx.memory.risks || "-"}\nProfile: ${ctx.memory.summary || "-"}`
    : "No longitudinal profile on record yet.";

  const comp = (ctx.competencies || []).length
    ? ctx.competencies.map((x) => `- ${x.name}: ${x.average != null ? `${Number(x.average).toFixed(2)}/5` : "n/a"}`).join("\n")
    : "No approved competency scores yet.";

  const goals = (ctx.goals || []).length
    ? ctx.goals.map((g) => `- ${g.title}${g.status ? ` (${g.status})` : ""}`).join("\n")
    : "No standing goals on record.";

  const prompt = `You are a thoughtful mentor at a law firm, writing an Individual Development Plan FOR the attorney themselves to read. Your job is to help them grow — be genuinely kind, specific, and encouraging, and frame development areas as opportunities rather than failures. Base everything on the evidence below; do not invent facts. Address them by their first name in the opening note. Where competency scores are lower, treat those as the most useful growth areas, but always pair them with real strengths.

ATTORNEY: ${ctx.attorneyName}

LONGITUDINAL PROFILE (built from approved reviews):
${mem}

LATEST COMPETENCY SCORES:
${comp}

STANDING GOALS:
${goals}`;

  const m = model("deep"); // Opus — careful, personal, high-stakes synthesis
  const res = await c.messages.parse({
    model: m,
    max_tokens: 1600,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(Schema) },
  });

  await logRun({ kind: "DEV_PLAN", refId: ctx.attorneyId || null, actorId, usage: res.usage, model: m });
  return res.parsed_output ?? res.parsed ?? null;
}
