// Email seam. The demo runs without mail infrastructure, so sendEmail composes
// the message and logs it to the server console. The shape is deliberately
// transport-agnostic: to send for real, drop a transport (e.g. nodemailer) into
// `deliver()` and gate it on EMAIL_ENABLED / SMTP_* env vars — nothing else changes.

export function emailEnabled() {
  return process.env.EMAIL_ENABLED === "true";
}

async function deliver(message) {
  // No transport wired yet. When EMAIL_ENABLED=true, add the real send here.
  return { delivered: false, reason: "no-transport" };
}

export async function sendEmail({ to, subject, body }) {
  if (!to) return { delivered: false, reason: "no-recipient" };
  let result = { delivered: false, reason: "log-only" };
  if (emailEnabled()) {
    try { result = await deliver({ to, subject, body }); }
    catch (e) { result = { delivered: false, reason: e.message }; }
  }
  // Always log so the digest/reminder is visible while running locally.
  console.log(
    `\n── EMAIL ${result.delivered ? "(sent)" : "(log-only)"} ──\n` +
    `To: ${to}\nSubject: ${subject}\n\n${body}\n───────────────────────`
  );
  return { to, subject, ...result, at: new Date().toISOString() };
}
