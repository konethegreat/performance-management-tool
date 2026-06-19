// Full notifications history — reminders, feedback requests, recognition and
// review state changes — with mark-all-read. The bell shows the latest few; this
// is the complete list.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { Empty } from "../components/Empty.jsx";

export default function Notifications() {
  const nav = useNavigate();
  const [data, setData] = useState(null);

  function load() { api.get("/notifications").then(setData).catch(() => setData({ items: [], unread: 0 })); }
  useEffect(load, []);

  async function open(n) {
    if (!n.read) await api.post(`/notifications/${n.id}/read`).catch(() => {});
    if (n.link) nav(n.link); else load();
  }
  async function markAll() { await api.post("/notifications/read-all").catch(() => {}); load(); }

  if (!data) return <div className="loading">Loading…</div>;

  return (
    <div>
      <div className="detail-head">
        <div><h1>Notifications</h1><p className="subtitle">Reminders, feedback requests, recognition and review updates.</p></div>
        {data.unread > 0 && <button className="btn small" onClick={markAll}>Mark all read</button>}
      </div>
      <div className="card">
        {data.items.length === 0 && <Empty title="You're all caught up" hint="New notifications will appear here." />}
        {data.items.map((n) => (
          <div key={n.id} className={`notif-row ${n.read ? "" : "unread"}`} onClick={() => open(n)}>
            <span className="notif-dot" />
            <div className="notif-row-body"><span>{n.message}</span><small className="muted">{new Date(n.createdAt).toLocaleString()}</small></div>
          </div>
        ))}
      </div>
    </div>
  );
}
