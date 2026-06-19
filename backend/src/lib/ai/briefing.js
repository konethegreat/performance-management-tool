// Team Briefing: a decisive, plain-language situational read of the manager's
// in-flight 360 reviews — "what needs your attention right now". It summarizes
// data the manager already sees (overdue SLAs, stalled completion, low scores,
// trends) and ranks concrete next actions. Advisory only; never changes state.

import { z } from "zod/v4"; // SDK's zodOutputFormat requires zod v4 schemas
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { client, model, logRun } from "./client.js";

const Schema = z.object({
  headline: z.string().describe("One decisive sentence on where the team stands right now"),
  priorities: z
    .array(
      z.object({
        title: z.string().describe("Short imperative action title"),
        detail: z.string().describe("One sentence: what to do and why, referencing the numbers"),
        urgency: z.enum(["high", "medium", "low"]),
      })
    )
    .describe("Ranked, concrete next actions, most urgent first"),
  watch: z.array(z.string()).describe("Quieter signals or trends worth monitoring"),
});

// payload: a compact text snapshot of the team's reviews (built by the route).
export async function teamBriefing(payload, { actorId } = {}) {
  const c = client();
  if (!c) return null;

  const prompt = `You are chief of staff to the managing partner of a law firm, reading the live state of in-flight 360° performance reviews. Write a brief, decisive situational read: what needs attention now and what to do about it. Ground every point in the snapshot's numbers — overdue reviews (SLA is measured from the launch date), stalled feedback completion, low or missing scores, and notable trends. Do not invent data. Rank priorities most-urgent first; keep each action concrete and partner-ready.

TEAM SNAPSHOT:
${payload}`;

  const m = model("balanced"); // Sonnet — judgement + concise narrative
  const res = await c.messages.parse({
    model: m,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(Schema) },
  });

  await logRun({ kind: "BRIEFING", refId: null, actorId, usage: res.usage, model: m });
  return res.parsed_output ?? res.parsed ?? null;
}
