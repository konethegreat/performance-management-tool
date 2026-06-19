// Global command bar (⌘K / Ctrl+K). Jumps to role-aware pages and searches people
// and reviews via /api/search. Self-contained: opens on the shortcut or an
// "open-cmdk" window event (dispatched by the top-bar search button).
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";

function pagesFor(role) {
  const p = [];
  if (role === "MANAGER" || role === "ADMIN") { p.push(["/manager", "Team"], ["/departments", "Departments"], ["/cadence", "Cadence"]); }
  if (role === "ATTORNEY" || role === "MANAGER") p.push(["/me", "My Reviews"]);
  if (role === "CLIENT") p.push(["/client", "Client portal"]);
  p.push(["/feedback", "Feedback"], ["/notifications", "Notifications"]);
  if (role === "ADMIN") p.push(["/admin", "Admin"]);
  return p.map(([to, label]) => ({ type: "Page", label, sub: to, link: to }));
}

export default function CommandBar() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [people, setPeople] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    }
    function onOpen() { setOpen(true); }
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-cmdk", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("open-cmdk", onOpen); };
  }, []);

  useEffect(() => {
    if (open) { setQ(""); setPeople([]); setReviews([]); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) { setPeople([]); setReviews([]); return; }
    const t = setTimeout(() => {
      api.get(`/search?q=${encodeURIComponent(term)}`)
        .then((r) => { setPeople(r.people || []); setReviews(r.reviews || []); setActive(0); })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!open || !user) return null;

  const term = q.trim().toLowerCase();
  const pages = pagesFor(user.role).filter((p) => !term || p.label.toLowerCase().includes(term));
  const items = [
    ...pages,
    ...people.map((p) => ({ type: "Person", label: p.name, sub: p.title || "", link: p.link })),
    ...reviews.map((r) => ({ type: "Review", label: r.subject, sub: `${r.cycle} · ${r.status}`, link: r.link })),
  ];

  function go(item) {
    if (!item || !item.link) return;
    setOpen(false);
    nav(item.link);
  }
  function onKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(items[active]); }
  }

  return (
    <div className="cmdk-overlay" onMouseDown={() => setOpen(false)}>
      <div className="cmdk" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={inputRef} className="cmdk-input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
          placeholder="Search people, reviews, pages…" />
        <div className="cmdk-results">
          {items.length === 0 && <div className="cmdk-empty">{term.length < 2 ? "Type to search…" : "No matches."}</div>}
          {items.map((it, i) => (
            <button key={i} className={`cmdk-item ${i === active ? "active" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => go(it)} disabled={!it.link}>
              <span className="cmdk-type">{it.type}</span>
              <span className="cmdk-label">{it.label}</span>
              {it.sub && <span className="cmdk-sub muted">{it.sub}</span>}
            </button>
          ))}
        </div>
        <div className="cmdk-foot muted small">↑↓ navigate · ↵ open · esc close</div>
      </div>
    </div>
  );
}
