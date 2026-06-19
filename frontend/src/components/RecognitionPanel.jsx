// Continuous feedback (praise / notes) panel. Lists feedback a person has
// received and — when `canGive` — offers a composer to recognise a colleague
// (free picker in `self` mode, or a fixed recipient when a manager gives to a
// report). Visibility is enforced server-side: recipient + their manager + admin.
import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "./Toast.jsx";

const KIND_PILL = { PRAISE: ["Praise", "green"], NOTE: ["Note", "blue"] };

export function RecognitionPanel({ ownerId, self = false, canGive = false, fixedRecipientId = null, recipientName = null, title }) {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [colleagues, setColleagues] = useState([]);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("PRAISE");
  const [recipientId, setRecipientId] = useState(fixedRecipientId || "");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api.get(`/continuous/feedback?recipientId=${ownerId}`).then(setItems).catch(() => setItems([]));
  }
  useEffect(() => { if (ownerId) load(); /* eslint-disable-next-line */ }, [ownerId]);

  // Colleague list is only needed for the free picker (self mode).
  useEffect(() => {
    if (canGive && !fixedRecipientId && open && colleagues.length === 0) {
      api.get("/users").then((us) => setColleagues(us.filter((u) => u.id !== user.id && u.role !== "CLIENT"))).catch(() => {});
    }
    /* eslint-disable-next-line */
  }, [open]);

  async function submit() {
    const rid = fixedRecipientId || recipientId;
    if (!rid || !body.trim()) return;
    setBusy(true);
    try {
      await api.post("/continuous/feedback", { recipientId: rid, kind, body: body.trim() });
      toast(kind === "PRAISE" ? "Recognition sent" : "Note sent", "success");
      setBody(""); setOpen(false); if (!fixedRecipientId) setRecipientId("");
      if (rid === ownerId) load(); // giving to the person whose panel this is
    } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  }

  async function remove(id) {
    try { await api.del(`/continuous/feedback/${id}`); load(); }
    catch (e) { toast(e.message, "error"); }
  }

  if (items === null) return null;

  const heading = title || (self ? "Feedback & recognition" : "Continuous feedback");
  const giveLabel = fixedRecipientId ? `Recognize ${recipientName || "this person"}` : "Recognize a colleague";

  return (
    <div className="card">
      <div className="card-head">
        <h2>{heading}</h2>
        {canGive && !open && <button className="btn small" onClick={() => setOpen(true)}>{giveLabel}</button>}
      </div>

      {canGive && open && (
        <div className="cf-compose">
          <div className="cf-compose-row">
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="okr-status">
              <option value="PRAISE">Praise</option>
              <option value="NOTE">Note</option>
            </select>
            {!fixedRecipientId
              ? <select value={recipientId} onChange={(e) => setRecipientId(e.target.value)} className="okr-status cf-recipient">
                  <option value="">Choose a colleague…</option>
                  {colleagues.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.title ? ` · ${c.title}` : ""}</option>)}
                </select>
              : <span className="muted small">to {recipientName}</span>}
          </div>
          <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder={kind === "PRAISE" ? "What did they do well? Be specific." : "A quick, constructive observation."} />
          <div className="okr-actions">
            <button className="btn primary small" disabled={busy || !body.trim() || (!fixedRecipientId && !recipientId)} onClick={submit}>Send</button>
            <button className="btn ghost small" onClick={() => { setOpen(false); setBody(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {items.length === 0 && <p className="muted">{self ? "No feedback yet. Recognition from colleagues will appear here." : "No continuous feedback yet."}</p>}

      <div className="cf-list">
        {items.map((it) => {
          const [label, tone] = KIND_PILL[it.kind] || ["Note", "grey"];
          return (
            <div className="cf-item" key={it.id}>
              <div className="cf-item-head">
                <span className={`pill ${tone}`}>{label}</span>
                <span className="cf-from"><strong>{it.author.name}</strong>{it.author.title ? <span className="muted"> · {it.author.title}</span> : null}</span>
                <span className="cf-date muted small">{new Date(it.at).toLocaleDateString()}</span>
                {it.author.id === user.id && <button className="icon-btn" title="Delete" onClick={() => remove(it.id)}>×</button>}
              </div>
              <p className="cf-body">{it.body}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
