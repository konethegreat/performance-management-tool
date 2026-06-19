// AI Briefing — a decisive situational read of the manager's in-flight reviews,
// shown at the top of the manager dashboard. Gated on AI being configured;
// degrades quietly when off or empty. The partner asks for it (or refreshes);
// it never auto-mutates anything — purely advisory.
import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAiStatus } from "../hooks/useAiStatus.js";
import { AiBadge } from "./AiBadge.jsx";
import { useToast } from "./Toast.jsx";

export function AiBriefing() {
  const { aiEnabled } = useAiStatus();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  // Auto-load on mount so the briefing is already there when the manager arrives.
  useEffect(() => {
    if (aiEnabled) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiEnabled]);

  if (!aiEnabled) return null;

  async function run() {
    setLoading(true);
    try {
      const r = await api.post("/ai/briefing", {});
      if (r.aiEnabled === false) {
        toast("AI is not configured.", "info");
        return;
      }
      setData(r);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  const b = data && data.briefing;

  return (
    <div className="ai-panel briefing">
      <div className="briefing-head">
        <h3>✦ AI Briefing <AiBadge label="assistive" /></h3>
        <button className="btn ai small" onClick={run} disabled={loading}>
          {loading ? "Reading the team…" : data ? "Refresh" : "Generate briefing"}
        </button>
      </div>

      {!data && !loading && (
        <p className="ai-note">A plain-language read of where your reviews stand — overdue SLAs, stalled feedback, scores and trends, with ranked next actions.</p>
      )}

      {!data && loading && <p className="ai-note">Reading the team…</p>}

      {data && data.empty && (
        <p className="ai-note">No reviews in flight yet — launch a cycle and the briefing will have something to say.</p>
      )}

      {b && (
        <div className="briefing-body">
          <p className="briefing-headline">{b.headline}</p>

          {b.priorities && b.priorities.length > 0 && (
            <ol className="briefing-priorities">
              {b.priorities.map((p, i) => (
                <li key={i}>
                  <span className={`pill ${p.urgency === "high" ? "red" : p.urgency === "medium" ? "amber" : "grey"}`}>
                    {p.urgency}
                  </span>
                  <span className="briefing-pri-text">
                    <strong>{p.title}</strong>
                    <small>{p.detail}</small>
                  </span>
                </li>
              ))}
            </ol>
          )}

          {b.watch && b.watch.length > 0 && (
            <div className="briefing-watch">
              <h4>Worth watching</h4>
              <ul>
                {b.watch.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
