// Sign-up — the new user picks their position; the server derives their
// permission tier + capabilities from it. Leadership/firm-wide and client
// positions aren't offered here (an admin provisions those).
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../api/client.js";

export default function Register() {
  const { register, user } = useAuth();
  const nav = useNavigate();
  const [groups, setGroups] = useState(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", position: "" });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/auth/positions").then((r) => setGroups(r.groups)).catch((e) => setErr(e.message));
  }, []);

  if (user) { nav("/"); return null; }

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await register(form);
      nav("/");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand big">
          <span className="brand-mark">M</span>
          <div><strong>Motsoeneng Bill</strong><small>Create your account</small></div>
        </div>
        <form onSubmit={submit}>
          <div className="grid-2">
            <label>First name
              <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} autoFocus />
            </label>
            <label>Last name
              <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </label>
          </div>
          <label>Work email
            <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@mostoeneng.law" />
          </label>
          <label>Password
            <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="At least 8 characters" />
          </label>
          <label>Your position
            <select value={form.position} onChange={(e) => set("position", e.target.value)}>
              <option value="">Select your position…</option>
              {(groups || []).map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.positions.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <p className="muted small">Your position sets what you can see and do. Leadership and client access is arranged by an administrator.</p>
          {err && <div className="error">{err}</div>}
          <button className="btn primary" disabled={busy || !form.position}>{busy ? "Creating account…" : "Create account"}</button>
        </form>
        <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
}
