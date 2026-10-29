import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import NotificationsBell from "./NotificationsBell.jsx";
import { AiStatusChip } from "./AiStatusChip.jsx";
import { Avatar } from "./Avatar.jsx";
import CommandBar from "./CommandBar.jsx";

/* Inline stroke icons — single color via currentColor, no icon dependency. */
const Icon = {
  team: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3.13a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.87" />
      <circle cx="9" cy="7" r="4" /><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" />
    </svg>
  ),
  me: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V10M18 20V4M6 20v-4" />
    </svg>
  ),
  client: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" /><path d="M9 9v.01M9 13v.01M9 17v.01" />
    </svg>
  ),
  dept: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="5" width="3" height="13" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  feedback: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  signout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
};

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  if (!user) { return <Outlet />; }

  // Role-based rail items: [path, label, icon key]
  const items = [];
  if (user.role === "MANAGER" || user.role === "ADMIN") items.push(["/manager", "Team", "team"]);
  if (user.role === "MANAGER" || user.role === "ADMIN") items.push(["/departments", "Departments", "dept"]);
  if (user.role === "MANAGER" || user.role === "ADMIN") items.push(["/cadence", "Cadence", "calendar"]);
  if (user.role === "ATTORNEY" || user.role === "MANAGER") items.push(["/me", "My Reviews", "me"]);
  if (user.role === "CLIENT") items.push(["/client", "Client", "client"]);
  items.push(["/feedback", "Feedback", "feedback"]);
  if (user.role === "ADMIN") items.push(["/admin", "Admin", "admin"]);

  const active = items.find(([to]) => loc.pathname === to) || items[0];
  const pageLabel = active ? active[1] : "";

  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-mark"><span>M</span></div>
        <nav className="rail-nav">
          {items.map(([to, label, key]) => (
            <Link
              key={to}
              to={to}
              className={"rail-item" + (loc.pathname === to ? " active" : "")}
            >
              {Icon[key]}
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="rail-foot">
          <button
            className="rail-signout"
            onClick={() => { logout(); nav("/login"); }}
          >
            {Icon.signout}
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="shell-body">
        <header className="shell-top">
          <div className="shell-title">
            <strong>Motsoeneng Bill</strong>
            <small>{pageLabel} · Performance Management</small>
          </div>
          <div className="shell-top-spacer" />
          <div className="shell-top-right">
            <button className="cmdk-trigger" onClick={() => window.dispatchEvent(new CustomEvent("open-cmdk"))} title="Search (Ctrl/⌘ K)" aria-label="Search">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <span className="cmdk-kbd">⌘K</span>
            </button>
            <AiStatusChip />
            <NotificationsBell />
            <div className="user-chip">
              <Avatar seed={user.id} name={`${user.firstName} ${user.lastName}`} size={36} />
              <div className="user-meta">
                <strong>{user.firstName} {user.lastName}</strong>
                <small>{user.title || user.role}</small>
              </div>
            </div>
          </div>
        </header>

        <main className="shell-main">
          <Outlet />
        </main>
      </div>
      <CommandBar />
    </div>
  );
}
