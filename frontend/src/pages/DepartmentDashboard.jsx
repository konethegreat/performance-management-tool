// Department (practice group) KPIs — which teams are working effectively.
// ADMIN/MANAGER only. Data-first: ranked by composite score, with completion,
// SLA, cycle time, and per-department competency strengths vs improvement areas.
import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { Stat, ScoreBadge, Bar } from "../components/ui.jsx";
import { SkeletonCard } from "../components/Skeleton.jsx";

export default function DepartmentDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [trends, setTrends] = useState(null);

  useEffect(() => {
    api.get("/dashboard/departments").then(setData).catch((e) => setErr(e.message));
    api.get("/dashboard/trends").then((r) => setTrends(r.trends || [])).catch(() => {});
  }, []);

  if (err) return <div className="error">{err}</div>;
  if (!data) return <div className="grid-2"><SkeletonCard /><SkeletonCard /></div>;

  const s = data.summary;

  return (
    <div>
      <h1>Departments</h1>
      <p className="subtitle">How each practice group is performing — ranked by composite score, with feedback completion, SLA health, and the competencies each team is strongest and weakest in.</p>

      <div className="stat-grid">
        <Stat label="Practice groups" value={s.groupCount} />
        <Stat label="People" value={s.peopleCount} />
        <Stat label="Reviews" value={s.reviewCount} />
        <Stat label="Firm avg score" value={s.avgScore != null ? s.avgScore.toFixed(2) : "—"} hint="weighted, /5" tone={s.avgScore == null ? undefined : s.avgScore >= 4 ? "green" : s.avgScore >= 3 ? "amber" : "red"} />
        <Stat label="Overdue (SLA)" value={s.overdueCount} tone={s.overdueCount ? "red" : "green"} />
      </div>

      {trends && trends.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Firm-wide trends</h2><small className="muted">avg approved score &amp; feedback completion by cycle</small></div>
          <div className="trend">
            {trends.map((t) => (
              <div className="trend-col" key={t.cycleId}>
                <div className="trend-bar" style={{ height: `${t.avgScore != null ? (t.avgScore / 5) * 100 : 0}%` }} title={t.avgScore != null ? `${t.avgScore}/5` : "no approved scores yet"} />
                <small>{t.cycle}</small>
                <strong>{t.avgScore != null ? t.avgScore.toFixed(1) : "—"}</strong>
                <small className="muted">{t.completionPct}% in</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.departments.length === 0 && (
        <div className="empty"><h3>No practice groups yet</h3><p>Assign people to practice groups to see department-level performance here.</p></div>
      )}

      {data.departments.map((d, i) => (
        <div className="card dept-card" key={d.groupId}>
          <div className="card-head">
            <div className="dept-title">
              <span className="dept-rank">{i + 1}</span>
              <div>
                <h2>{d.name}</h2>
                <small>{d.head ? `Headed by ${d.head}` : "No head assigned"} · {d.memberCount} {d.memberCount === 1 ? "person" : "people"}</small>
              </div>
            </div>
            <ScoreBadge score={d.avgScore} />
          </div>

          <div className="stat-row">
            <Stat label="Reviews" value={d.reviewCount} hint={`${d.approvedCount} approved`} />
            <Stat label="Feedback completion" value={`${d.completionPct}%`} tone={d.completionPct >= 80 ? "green" : d.completionPct >= 50 ? "amber" : "red"} />
            <Stat label="Overdue (SLA)" value={d.overdueCount} tone={d.overdueCount ? "red" : "green"} />
            <Stat label="Avg cycle time" value={d.avgCycleDays != null ? `${d.avgCycleDays}d` : "—"} hint="launch → approved" />
          </div>

          {(d.strengths.length > 0 || d.improvements.length > 0) ? (
            <div className="grid-2 dept-competencies">
              <div>
                <h3 className="sub">Strongest competencies</h3>
                {d.strengths.length > 0
                  ? d.strengths.map((c) => <Bar key={c.competencyId} label={c.name} value={c.average} />)
                  : <p className="muted small">No approved scores yet.</p>}
              </div>
              <div>
                <h3 className="sub">Areas to improve</h3>
                {d.improvements.length > 0
                  ? d.improvements.map((c) => <Bar key={c.competencyId} label={c.name} value={c.average} />)
                  : <p className="muted small">No approved scores yet.</p>}
              </div>
            </div>
          ) : (
            <p className="muted small">No approved reviews in this group yet — competency signals will appear once a cycle is approved.</p>
          )}
        </div>
      ))}
    </div>
  );
}
