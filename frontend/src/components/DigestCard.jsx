// A compact personal digest: the feedback you owe and recent recognition, with
// a one-click "email it to me" (log-only unless the server has email configured).
import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useToast } from "./Toast.jsx";

export function DigestCard() {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [emailing, setEmailing] = useState(false);

  useEffect(() => { api.get("/cadence/digest").then(setD).catch(() => setD(null)); }, []);
  if (!d) return null;

  async function emailMe() {
    setEmailing(true);
    try {
      const res = await api.post("/cadence/digest/email");
      toast(res.delivered ? "Digest emailed" : "Digest composed — logged on the server (email not configured)", "success");
    } catch (e) { toast(e.message, "error"); } finally { setEmailing(false); }
  }

  const owed = d.feedbackOwed || [];
  const recog = d.recognition || [];

  return (
    <div className="card">
      <div className="card-head">
        <h2>Your digest</h2>
        <button className="btn small" disabled={emailing} onClick={emailMe}>{emailing ? "Sending…" : "Email it to me"}</button>
      </div>

      <div className="digest-section">
        <h4>Feedback you owe</h4>
        {owed.length === 0 && <p className="digest-empty small">You're all caught up.</p>}
        {owed.map((f) => (
          <div className="digest-line" key={f.requestId}>
            <span>{f.subject} · {f.cycle}</span>
            {f.overdue ? <span className="pill red">overdue</span> : f.dueSoon ? <span className="pill amber">due soon</span> : null}
          </div>
        ))}
      </div>

      {recog.length > 0 && (
        <div className="digest-section">
          <h4>Recent recognition</h4>
          {recog.map((r, i) => (
            <div className="digest-line" key={i}>
              <span className={`pill ${r.kind === "PRAISE" ? "green" : "blue"}`}>{r.kind === "PRAISE" ? "Praise" : "Note"}</span>
              <span className="muted small">from {r.from}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
