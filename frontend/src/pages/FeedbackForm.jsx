import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { sourceLabel } from "../components/ui.jsx";

const SCALE = [
  [1, "Below expectations"],
  [2, "Developing"],
  [3, "Meets expectations"],
  [4, "Exceeds"],
  [5, "Outstanding"],
];

export default function FeedbackForm() {
  const { requestId } = useParams();
  const nav = useNavigate();
  const [form, setForm] = useState(null);
  const [scores, setScores] = useState({});
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/feedback/request/${requestId}`).then((d) => {
      setForm(d);
      if (d.existing) {
        const s = {};
        d.existing.ratings.forEach((r) => { s[r.competencyId] = r.score; });
        setScores(s);
        setStrengths(d.existing.strengths || "");
        setImprovements(d.existing.improvements || "");
      }
    }).catch((e) => setErr(e.message));
  }, [requestId]);

  if (err) return <div className="error">{err}</div>;
  if (!form) return <div className="loading">Loading form…</div>;

  const allRated = form.competencies.every((c) => scores[c.id]);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await api.post(`/feedback/request/${requestId}`, {
        ratings: form.competencies.map((c) => ({ competencyId: c.id, score: scores[c.id] })),
        strengths, improvements,
      });
      nav("/feedback");
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  const heading = form.reviewerRole === "SELF"
    ? `Self-review · ${form.cycle.name}`
    : `${sourceLabel[form.reviewerRole]} review of ${form.subject.name} · ${form.cycle.name}`;

  return (
    <div className="form-page">
      <h1>{heading}</h1>
      <p className="subtitle">Rate each competency on a 1–5 scale. Comments are optional but valued.</p>

      <div className="card">
        {form.competencies.map((c) => (
          <div className="competency-rate" key={c.id}>
            <div className="competency-meta">
              <strong>{c.name}</strong>
              <small>{c.description}</small>
            </div>
            <div className="scale">
              {SCALE.map(([val, label]) => (
                <button
                  key={val}
                  className={`scale-btn ${scores[c.id] === val ? "selected" : ""}`}
                  onClick={() => setScores({ ...scores, [c.id]: val })}
                  title={label}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <label>Key strengths
          <textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={3} placeholder="What is this person doing well?" />
        </label>
        <label>Areas to improve
          <textarea value={improvements} onChange={(e) => setImprovements(e.target.value)} rows={3} placeholder="Where should they focus to grow?" />
        </label>
      </div>

      {err && <div className="error">{err}</div>}
      <div className="form-actions">
        <button className="btn ghost" onClick={() => nav("/feedback")}>Cancel</button>
        <button className="btn primary" disabled={!allRated || busy} onClick={submit}>
          {busy ? "Submitting…" : "Submit feedback"}
        </button>
      </div>
      {!allRated && <p className="muted small">Rate all {form.competencies.length} competencies to submit.</p>}
    </div>
  );
}
