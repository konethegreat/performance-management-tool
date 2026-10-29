// Top-bar indicator showing whether AI is active and which models are in use.
// The system routes tasks across Haiku / Sonnet / Opus, so the chip shows the
// active tier models (or a single pinned model). Never shows the API key.
import { useAiStatus } from "../hooks/useAiStatus.js";

const FRIENDLY = {
  "claude-opus-4-8": "Opus",
  "claude-sonnet-4-6": "Sonnet",
  "claude-haiku-4-5": "Haiku",
  "claude-fable-5": "Fable",
};

function friendly(m) {
  if (!m) return m;
  if (FRIENDLY[m]) return FRIENDLY[m];
  const base = m.replace(/-\d{8}$/, ""); // strip a trailing date stamp
  return FRIENDLY[base] || base.replace(/^claude-/, "");
}

export function AiStatusChip() {
  const status = useAiStatus();
  const { aiEnabled, models, model } = status;

  if (!aiEnabled) {
    return (
      <span className="ai-chip off" title="AI not configured (set ANTHROPIC_API_KEY in backend/.env)">
        ✦ AI off
      </span>
    );
  }

  const m = models || (model ? { balanced: model } : {});
  let label, title;

  if (m.pinned) {
    label = friendly(m.pinned);
    title = `AI pinned to ${m.pinned} (AI_MODEL set — all tasks use one model)`;
  } else {
    const names = [m.fast, m.balanced, m.deep].filter(Boolean).map(friendly);
    label = names.join(" · ") || friendly(model);
    title =
      "AI active — model per task:\n" +
      `• fast (bias/quality check): ${m.fast}\n` +
      `• balanced (review organizer): ${m.balanced}\n` +
      `• deep (report draft, memory): ${m.deep}`;
  }

  return (
    <span className={`ai-chip on`} title={title}>
      ✦ {label}
    </span>
  );
}
