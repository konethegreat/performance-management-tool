// Cadence — the review calendar. Annual cycles with the quarters that roll up
// into them, each showing its window, status, live feedback completion and SLA.
import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { StatusPill } from "../components/ui.jsx";

function fmt(d) {
  return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function CycleRow({ c }) {
  const tone = c.completionPct >= 80 ? "green" : c.completionPct >= 50 ? "amber" : "red";
  return (
    <div className="cad-row">
      <div className="cad-row-main">
        <div className="cad-row-title">
          <strong>{c.name}</strong>
          <StatusPill status={c.status} />
          {c.overdue > 0 && <span className="pill red">{c.overdue} overdue</span>}
        </div>
        <div className="cad-row-window muted small">{fmt(c.periodStart)} – {fmt(c.periodEnd)} · SLA {c.slaDays}d</div>
      </div>
      <div className="cad-row-stats">
        <div className="okr-progress">
          <div className="okr-progress-track"><div className={`okr-progress-fill ${tone}`} style={{ width: `${c.completionPct}%` }} /></div>
          <span className="okr-progress-val">{c.completionPct}%</span>
        </div>
        <span className="muted small">{c.approved}/{c.reviewCount} approved · {c.reviewCount} review{c.reviewCount === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}

export default function Cadence() {
  const [cycles, setCycles] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.get("/cadence/calendar").then(setCycles).catch((e) => setErr(e.message)); }, []);

  if (err) return <div className="error">{err}</div>;
  if (!cycles) return <div className="loading">Loading cadence…</div>;

  const annuals = cycles.filter((c) => c.type === "ANNUAL");
  const childrenOf = (id) => cycles.filter((c) => c.parentId === id).sort((a, b) => new Date(a.periodStart) - new Date(b.periodStart));
  const orphans = cycles.filter((c) => c.type === "QUARTERLY" && !c.parentId);

  return (
    <div>
      <h1>Cadence</h1>
      <p className="subtitle">The review calendar — annual cycles and the quarters that roll up into them, with live completion and SLA tracking.</p>

      {annuals.length === 0 && orphans.length === 0 && <p className="muted">No cycles scheduled yet. An admin can create them under Admin.</p>}

      {annuals.map((a) => (
        <div className="card cad-group" key={a.id}>
          <div className="card-head">
            <div><h2>{a.name}</h2><small className="muted">{fmt(a.periodStart)} – {fmt(a.periodEnd)} · annual rollup</small></div>
            <StatusPill status={a.status} />
          </div>
          {childrenOf(a.id).length === 0 && <p className="muted small">No quarters scheduled under this year yet.</p>}
          {childrenOf(a.id).map((c) => <CycleRow key={c.id} c={c} />)}
        </div>
      ))}

      {orphans.length > 0 && (
        <div className="card cad-group">
          <div className="card-head"><h2>Other cycles</h2></div>
          {orphans.map((c) => <CycleRow key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
}
