// Individual Development Plan panel — a kind, growth-oriented read for the
// attorney (or their manager), generated from longitudinal memory + competency
// scores. Always assistive and downloadable as a structured PDF.
import { useState } from "react";
import { api } from "../api/client.js";
import { useAiStatus } from "../hooks/useAiStatus.js";
import { AiBadge } from "./AiBadge.jsx";
import { useToast } from "./Toast.jsx";
import DevelopmentPlanPdf from "../pdf/DevelopmentPlan.jsx";
import { downloadPdf } from "../pdf/download.js";

export function DevelopmentPlan({ attorneyId, attorneyName, self = true }) {
  const { aiEnabled } = useAiStatus();
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState({}); // suggested-goal index → adopted
  const toast = useToast();

  if (!aiEnabled) return null;

  async function generate() {
    setLoading(true);
    try {
      const r = await api.get(`/ai/attorneys/${attorneyId}/development-plan`);
      if (r.aiEnabled === false) { toast("AI is not configured.", "info"); return; }
      setRes(r);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function download() {
    try {
      const name = (res && res.context && res.context.attorneyName) || attorneyName;
      await downloadPdf(<DevelopmentPlanPdf plan={res.plan} attorneyName={name} />, "development-plan.pdf");
    } catch (e) {
      toast(e.message, "error");
    }
  }

  // Adopt an AI-suggested goal as a real, trackable objective for this attorney.
  async function adopt(g, i) {
    try {
      await api.post("/goals", { title: g.title, description: g.detail, ownerId: attorneyId });
      setAdded((a) => ({ ...a, [i]: true }));
      toast("Added to goals", "success");
    } catch (e) { toast(e.message, "error"); }
  }

  const plan = res && res.plan;

  return (
    <div className="ai-panel devplan">
      <div className="briefing-head">
        <h3>✦ {self ? "Your development plan" : "Development plan"} <AiBadge label="assistive" /></h3>
        <div className="ai-actions" style={{ margin: 0 }}>
          {plan && <button className="btn small" onClick={download}>Download PDF</button>}
          <button className="btn ai small" onClick={generate} disabled={loading}>
            {loading ? "Reflecting…" : res ? "Refresh" : "Generate plan"}
          </button>
        </div>
      </div>

      {!res && !loading && (
        <p className="ai-note">
          {self
            ? "A kind, forward-looking plan built from your review history — your strengths, the areas you can grow, and concrete next steps you can own."
            : "A growth-oriented plan built from this attorney's review history — strengths, development areas, and suggested goals."}
        </p>
      )}

      {res && res.empty && (
        <p className="ai-note">There isn't an approved review on record yet, so there's nothing to build a plan from. Once a cycle is approved, this will fill in.</p>
      )}

      {plan && (
        <div className="devplan-body">
          {plan.openingNote && <p className="briefing-headline">{plan.openingNote}</p>}

          {plan.strengthsToBuildOn && plan.strengthsToBuildOn.length > 0 && (
            <div className="devplan-section">
              <h4>Strengths to build on</h4>
              <ul className="devplan-list">
                {plan.strengthsToBuildOn.map((str, i) => <li key={i}>{str}</li>)}
              </ul>
            </div>
          )}

          {plan.growthAreas && plan.growthAreas.length > 0 && (
            <div className="devplan-section">
              <h4>Growth areas</h4>
              {plan.growthAreas.map((g, i) => (
                <div key={i} className="devplan-growth">
                  <strong>{g.area}</strong>
                  {g.why && <p className="devplan-why">{g.why}</p>}
                  {g.actions && g.actions.length > 0 && (
                    <ul className="devplan-list">
                      {g.actions.map((a, j) => <li key={j}>{a}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {plan.suggestedGoals && plan.suggestedGoals.length > 0 && (
            <div className="devplan-section">
              <h4>Suggested goals for next cycle</h4>
              {plan.suggestedGoals.map((g, i) => (
                <div key={i} className="goal">
                  <span><strong>{g.title}</strong><br /><small>{g.detail}</small></span>
                  <button className="btn ghost small" disabled={added[i]} onClick={() => adopt(g, i)}>
                    {added[i] ? "Added ✓" : "Add to goals"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {plan.encouragement && <p className="devplan-encouragement">{plan.encouragement}</p>}
        </div>
      )}
    </div>
  );
}
