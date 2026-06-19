// 1:1 meeting log between a manager and a report. Notes are shared — both can
// read them. The manager (or admin) maintains the entries; the report sees them
// read-only. Visibility + write access are enforced server-side.
import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useToast } from "./Toast.jsx";

function todayISO() { return new Date().toISOString().slice(0, 10); }

export function OneOnOnes({ reportId, self = false, title }) {
  const toast = useToast();
  const [data, setData] = useState(null); // { canManage, items }
  const [open, setOpen] = useState(false);
  const [heldOn, setHeldOn] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editNotes, setEditNotes] = useState("");

  function load() {
    api.get(`/continuous/one-on-ones?reportId=${reportId}`).then(setData).catch(() => setData({ canManage: false, items: [] }));
  }
  useEffect(() => { if (reportId) load(); /* eslint-disable-next-line */ }, [reportId]);

  async function add() {
    if (!notes.trim()) return;
    setBusy(true);
    try { await api.post("/continuous/one-on-ones", { reportId, notes: notes.trim(), heldOn }); setNotes(""); setHeldOn(todayISO()); setOpen(false); load(); }
    catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  }
  async function saveEdit(id) {
    try { await api.patch(`/continuous/one-on-ones/${id}`, { notes: editNotes }); setEditId(null); load(); }
    catch (e) { toast(e.message, "error"); }
  }
  async function remove(id) {
    if (!window.confirm("Delete this 1:1 note?")) return;
    try { await api.del(`/continuous/one-on-ones/${id}`); load(); }
    catch (e) { toast(e.message, "error"); }
  }

  if (!data) return null;
  const { canManage, items } = data;
  const heading = title || (self ? "My 1:1s" : "1:1 meetings");

  return (
    <div className="card">
      <div className="card-head">
        <h2>{heading}</h2>
        {canManage && !open && <button className="btn small" onClick={() => setOpen(true)}>Log a 1:1</button>}
      </div>

      {canManage && open && (
        <div className="cf-compose">
          <label className="okr-due">Date <input type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} /></label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did you discuss? Decisions, support, follow-ups…" />
          <div className="okr-actions">
            <button className="btn primary small" disabled={busy || !notes.trim()} onClick={add}>Save 1:1</button>
            <button className="btn ghost small" onClick={() => { setOpen(false); setNotes(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {items.length === 0 && <p className="muted">{self ? "No 1:1s logged yet. Notes your manager shares will appear here." : "No 1:1s logged yet."}</p>}

      <div className="cf-list">
        {items.map((o) => (
          <div className="cf-item" key={o.id}>
            <div className="cf-item-head">
              <strong>{new Date(o.heldOn).toLocaleDateString()}</strong>
              <span className="muted small">with {o.manager.name}</span>
              {canManage && editId !== o.id && (
                <span className="cf-actions">
                  <button className="btn ghost small" onClick={() => { setEditId(o.id); setEditNotes(o.notes); }}>Edit</button>
                  <button className="icon-btn" title="Delete" onClick={() => remove(o.id)}>×</button>
                </span>
              )}
            </div>
            {editId === o.id ? (
              <>
                <textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                <div className="okr-actions">
                  <button className="btn small" onClick={() => saveEdit(o.id)}>Save</button>
                  <button className="btn ghost small" onClick={() => setEditId(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <p className="cf-body">{o.notes}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
