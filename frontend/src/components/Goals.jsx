// Goals & OKRs panel. An objective (Goal) holds measurable key results that roll
// up to a progress %. Reused on the attorney dashboard (own goals) and the review
// page (manager managing a report). All editing is gated behind `canManage`.
import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { StatusPill } from "./ui.jsx";
import { useToast } from "./Toast.jsx";

const STATUS_OPTIONS = [
  ["OPEN", "Open"],
  ["IN_PROGRESS", "In progress"],
  ["ACHIEVED", "Achieved"],
  ["MISSED", "Missed"],
];

function progressTone(pct) {
  return pct >= 75 ? "green" : pct >= 40 ? "amber" : "red";
}

function ProgressBar({ value }) {
  const pct = value == null ? 0 : value;
  return (
    <div className="okr-progress">
      <div className="okr-progress-track">
        <div className={`okr-progress-fill ${progressTone(pct)}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="okr-progress-val">{value == null ? "—" : `${value}%`}</span>
    </div>
  );
}

function KeyResultRow({ kr, goalId, canManage, onChanged }) {
  const toast = useToast();
  const [progress, setProgress] = useState(kr.progress);
  const [saving, setSaving] = useState(false);

  async function commit(next) {
    const v = Math.max(0, Math.min(100, Math.round(Number(next) || 0)));
    setProgress(v);
    if (v === kr.progress) return;
    setSaving(true);
    try { await api.patch(`/goals/${goalId}/key-results/${kr.id}`, { progress: v }); onChanged(); }
    catch (e) { toast(e.message, "error"); setProgress(kr.progress); }
    finally { setSaving(false); }
  }
  async function remove() {
    try { await api.del(`/goals/${goalId}/key-results/${kr.id}`); onChanged(); }
    catch (e) { toast(e.message, "error"); }
  }

  return (
    <div className="kr-row">
      <span className="kr-title">{kr.title}</span>
      <ProgressBar value={typeof progress === "number" ? progress : Number(progress) || 0} />
      {canManage && (
        <span className="kr-controls">
          <input
            className="kr-input" type="number" min={0} max={100} value={progress} disabled={saving}
            onChange={(e) => setProgress(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <button className="icon-btn" title="Remove key result" onClick={remove}>×</button>
        </span>
      )}
    </div>
  );
}

function ObjectiveCard({ goal, canManage, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description || "");
  const [dueDate, setDueDate] = useState(goal.dueDate ? goal.dueDate.slice(0, 10) : "");
  const [newKr, setNewKr] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveObjective() {
    if (!title.trim()) return;
    setBusy(true);
    try { await api.patch(`/goals/${goal.id}`, { title: title.trim(), description, dueDate: dueDate || null }); setEditing(false); onChanged(); }
    catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  }
  async function setStatus(status) {
    try { await api.patch(`/goals/${goal.id}`, { status }); onChanged(); }
    catch (e) { toast(e.message, "error"); }
  }
  async function remove() {
    if (!window.confirm("Delete this objective and its key results?")) return;
    try { await api.del(`/goals/${goal.id}`); onChanged(); }
    catch (e) { toast(e.message, "error"); }
  }
  async function addKr() {
    if (!newKr.trim()) return;
    try { await api.post(`/goals/${goal.id}/key-results`, { title: newKr.trim(), progress: 0 }); setNewKr(""); onChanged(); }
    catch (e) { toast(e.message, "error"); }
  }

  return (
    <div className="okr-objective">
      <div className="okr-head">
        <div className="okr-title-wrap">
          {editing
            ? <input className="okr-title-input" value={title} onChange={(e) => setTitle(e.target.value)} />
            : <strong>{goal.title}</strong>}
          {goal.assignedByManager && <span className="pill blue">Assigned by manager</span>}
        </div>
        {canManage
          ? <select className="okr-status" value={goal.status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          : <StatusPill status={goal.status} />}
      </div>

      {editing ? (
        <>
          <textarea className="okr-desc-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does success look like?" />
          <label className="okr-due">Target date <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
        </>
      ) : (
        goal.description && <p className="okr-desc">{goal.description}</p>
      )}

      <ProgressBar value={goal.progress} />

      <div className="kr-list">
        {goal.keyResults.map((kr) => (
          <KeyResultRow key={kr.id} kr={kr} goalId={goal.id} canManage={canManage} onChanged={onChanged} />
        ))}
        {goal.keyResults.length === 0 && <p className="muted small">No key results yet{canManage ? " — add one below." : "."}</p>}
      </div>

      {canManage && (
        <div className="okr-foot">
          <div className="kr-add">
            <input value={newKr} onChange={(e) => setNewKr(e.target.value)} placeholder="Add a key result…"
              onKeyDown={(e) => e.key === "Enter" && addKr()} />
            <button className="btn small" onClick={addKr}>Add</button>
          </div>
          <div className="okr-actions">
            {goal.dueDate && !editing && <span className="muted small">Target {new Date(goal.dueDate).toLocaleDateString()}</span>}
            {editing ? (
              <>
                <button className="btn small" disabled={busy} onClick={saveObjective}>Save</button>
                <button className="btn ghost small" onClick={() => { setEditing(false); setTitle(goal.title); setDescription(goal.description || ""); }}>Cancel</button>
              </>
            ) : (
              <>
                <button className="btn ghost small" onClick={() => setEditing(true)}>Edit</button>
                <button className="btn ghost small" onClick={remove}>Delete</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Goals({ ownerId, canManage = true, reviewId = null, self = false, title }) {
  const toast = useToast();
  const [goals, setGoals] = useState(null);
  const [err, setErr] = useState(null);
  const [adding, setAdding] = useState(false);
  const [nt, setNt] = useState("");
  const [nd, setNd] = useState("");
  const [ndue, setNdue] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api.get(`/goals?ownerId=${ownerId}`).then((d) => setGoals(d.goals)).catch((e) => setErr(e.message));
  }
  useEffect(() => { if (ownerId) load(); /* eslint-disable-next-line */ }, [ownerId]);

  async function create() {
    if (!nt.trim()) return;
    setBusy(true);
    try {
      await api.post("/goals", { title: nt.trim(), description: nd.trim() || null, dueDate: ndue || null, ownerId, reviewId });
      setNt(""); setNd(""); setNdue(""); setAdding(false); load();
    } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  }

  // 403 (not allowed to see this owner's goals) or still loading → render nothing.
  if (err || !goals) return null;

  const heading = title || (self ? "My goals & OKRs" : "Goals & OKRs");

  return (
    <div className="card okr-card">
      <div className="card-head">
        <h2>{heading}</h2>
        {canManage && !adding && <button className="btn small" onClick={() => setAdding(true)}>New objective</button>}
      </div>

      {canManage && adding && (
        <div className="okr-new">
          <input value={nt} onChange={(e) => setNt(e.target.value)} placeholder="Objective title (e.g. Build a stronger BD pipeline)" />
          <textarea rows={2} value={nd} onChange={(e) => setNd(e.target.value)} placeholder="Optional: what does success look like?" />
          <label className="okr-due">Target date <input type="date" value={ndue} onChange={(e) => setNdue(e.target.value)} /></label>
          <div className="okr-actions">
            <button className="btn primary small" disabled={busy || !nt.trim()} onClick={create}>Add objective</button>
            <button className="btn ghost small" onClick={() => { setAdding(false); setNt(""); setNd(""); setNdue(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {goals.length === 0 && !adding && (
        <p className="muted">{self ? "No goals yet. Set an objective to track measurable progress this cycle." : "No goals set yet."}</p>
      )}

      {goals.map((g) => <ObjectiveCard key={g.id} goal={g} canManage={canManage} onChanged={load} />)}
    </div>
  );
}
