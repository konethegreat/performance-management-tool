import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { StatusPill, ScoreBadge, Bar, Stat, sourceLabel } from "../components/ui.jsx";

export default function ReviewDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [r, setR] = useState(null);
  const [err, setErr] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api.get(`/reviews/${id}`).then((d) => { setR(d); setDraft(d.finalSummary || d.draftSummary || ""); }).catch((e) => setErr(e.message));
  }
  useEffect(load, [id]);

  if (err) return <div className="error">{err}</div>;
  if (!r) return <div className="loading">Loading review…</div>;

  const isManager = (user.role === "MANAGER" && r.manager?.id === user.id) || user.role === "ADMIN";
  const locked = ["FINALIZED", "APPROVED"].includes(r.status);

  async function act(path, body) {
    setBusy(true); setErr(null);
    try { await api.post(`/reviews/${id}/${path}`, body); load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function saveDraft() {
    setBusy(true); setErr(null);
    try { await api.patch(`/reviews/${id}/draft`, { draftSummary: draft }); load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="detail-head">
        <div>
          <h1>{r.subject.name}</h1>
          <p className="subtitle">{r.subject.title} · {r.cycle.name} · managed by {r.manager?.name}</p>
        </div>
        <div className="detail-head-right">
          <StatusPill status={r.status} />
          <ScoreBadge score={r.analytics?.overallScore ?? r.overallScore} />
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="Completion" value={`${r.completion.pct}%`} hint={`${r.completion.submitted}/${r.completion.total} sources`} tone={r.completion.pct >= 80 ? "green" : "amber"} />
        {r.cycleTime.launched && <Stat label="Days since launch" value={`${r.cycleTime.elapsedDays}d`} hint={`SLA ${r.cycleTime.slaDays}d`} tone={r.cycleTime.overdue ? "red" : undefined} />}
        <Stat label="Launched" value={r.launchedAt ? new Date(r.launchedAt).toLocaleDateString() : "—"} />
        <Stat label="Approved" value={r.approvedAt ? new Date(r.approvedAt).toLocaleDateString() : "—"} />
      </div>

      <div className="grid-2">
        {/* 360 sources */}
        <div className="card">
          <div className="card-head"><h2>360° sources</h2></div>
          <table className="table compact">
            <tbody>
              {r.requests.map((q) => (
                <tr key={q.id}>
                  <td><span className="pill grey">{sourceLabel[q.reviewerRole]}</span></td>
                  <td>{q.reviewer.name}</td>
                  <td><StatusPill status={q.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* analytics (privileged only) */}
        {r.analytics ? (
          <div className="card">
            <div className="card-head"><h2>Competency breakdown</h2></div>
            {r.analytics.byCompetency.length === 0 && <p className="muted">No feedback submitted yet.</p>}
            {r.analytics.byCompetency.map((b) => <Bar key={b.competencyId} label={b.name} value={b.average} />)}
            {r.analytics.bySource.length > 0 && (
              <>
                <h3 className="sub">By source (blind-spot check)</h3>
                {r.analytics.bySource.map((s) => <Bar key={s.source} label={sourceLabel[s.source]} value={s.average} />)}
              </>
            )}
          </div>
        ) : (
          <div className="card"><p className="muted">Detailed scores are visible to the manager and the attorney only.</p></div>
        )}
      </div>

      {/* Manager workflow */}
      {isManager && (
        <div className="card">
          <div className="card-head"><h2>Manager report</h2></div>
          <textarea
            rows={5}
            value={draft}
            disabled={locked}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write the narrative assessment that accompanies the scores…"
          />
          <div className="workflow-actions">
            {!locked && <button className="btn" disabled={busy} onClick={saveDraft}>Save draft</button>}
            {(r.status === "DRAFT") && <button className="btn" disabled={busy} onClick={() => act("submit")}>Submit for review</button>}
            {(r.status === "IN_REVIEW" || r.status === "DRAFT") && (
              <button className="btn primary" disabled={busy} onClick={() => act("finalize", { finalSummary: draft })}>Finalize</button>
            )}
            {r.status === "FINALIZED" && <button className="btn primary" disabled={busy} onClick={() => act("approve")}>Approve (lock)</button>}
            {locked && r.status !== "APPROVED" && <button className="btn ghost" disabled={busy} onClick={() => act("send-back")}>Send back to draft</button>}
            {r.status === "APPROVED" && <span className="pill green">Approved & locked — feeds annual rollup</span>}
          </div>
        </div>
      )}

      {/* Final summary visible to the attorney once approved */}
      {!isManager && r.status === "APPROVED" && r.finalSummary && (
        <div className="card"><div className="card-head"><h2>Manager's summary</h2></div><blockquote className="summary">{r.finalSummary}</blockquote></div>
      )}

      {/* Goals */}
      {r.goals.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Development goals</h2></div>
          {r.goals.map((g) => (
            <div className="goal" key={g.id}>
              <div><strong>{g.title}</strong>{g.description && <small>{g.description}</small>}</div>
              <span className={`pill ${g.status === "ACHIEVED" ? "green" : g.status === "MISSED" ? "red" : "amber"}`}>{g.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Audit trail */}
      <div className="card">
        <div className="card-head"><h2>History</h2></div>
        <ol className="timeline">
          {r.events.map((e) => (
            <li key={e.id}>
              <span className="dot" />
              <div><strong>{prettyAction(e.action)}</strong> by {e.actor}{e.note ? ` — ${e.note}` : ""}
                <small>{new Date(e.at).toLocaleString()}</small></div>
            </li>
          ))}
          {r.events.length === 0 && <p className="muted">No activity yet.</p>}
        </ol>
      </div>
    </div>
  );
}

function prettyAction(a) {
  return ({ LAUNCHED: "Launched", DRAFT_SAVED: "Draft saved", SUBMITTED: "Submitted for review", FINALIZED: "Finalized", APPROVED: "Approved", SENT_BACK: "Sent back" })[a] || a;
}
