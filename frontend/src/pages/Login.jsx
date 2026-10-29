import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const DEMO = [
  ["Admin (HR)", "admin@mostoeneng.law"],
  ["Manager", "t.dlamini@mostoeneng.law"],
  ["Attorney", "n.khumalo@mostoeneng.law"],
  ["Attorney (mid-cycle)", "s.naidoo@mostoeneng.law"],
  ["Client", "client@acme-holdings.com"],
];

export default function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("Password123!");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) { nav("/"); return null; }

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await login(email, password);
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
          <div><strong>Motsoeneng Bill</strong><small>Performance Management</small></div>
        </div>
        <form onSubmit={submit}>
          <label>Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@mostoeneng.law" autoFocus />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {err && <div className="error">{err}</div>}
          <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="auth-switch">New here? <Link to="/register">Create an account</Link></p>
        <div className="demo-logins">
          <p>Demo accounts (password <code>Password123!</code>):</p>
          {DEMO.map(([label, mail]) => (
            <button key={mail} className="demo-btn" onClick={() => setEmail(mail)}>
              <strong>{label}</strong><span>{mail}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
