# Mostoeneng PMS — AI Upgrade & "The Counsel" Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Anthropic-powered intelligence layer (review organizer, bias check, report drafting, attorney memory), PDF export of reports/feedback, in-app notifications + SLA nudges, and a premium "The Counsel" UI redesign to the Mostoeneng PMS.

**Architecture:** Server-side AI module in the existing Express app calls the Anthropic SDK, persists results to Postgres, and degrades gracefully without a key. PDFs are generated client-side with `@react-pdf/renderer`. The SPA gets a CSS-variable design system plus notifications, admin, and AI affordances.

**Tech Stack:** Node/Express (ESM), Prisma + PostgreSQL, `@anthropic-ai/sdk` + `zod`, React 18 + Vite, `@react-pdf/renderer`.

**Verification note:** This repo has no automated test suite. Verification per task = `node --check` on changed backend files, `npm run build` (frontend) succeeds, and a manual smoke of the touched flow with the dev servers running. AI paths are smoke-tested both with a key present and with `AI_ENABLED=false`.

**Git:** Work happens on branch `feat/ai-pms-upgrade`. Each task is committed with its own message and pushed (`git push`). Remote: `origin` (github.com/konethegreat/mostoeneng-pms).

---

## File structure (what gets created / modified)

**Backend**
- Create `backend/src/lib/ai/client.js` — Anthropic singleton, `aiEnabled()`, `model()`, `runAndLog()`.
- Create `backend/src/lib/ai/organizeFeedback.js`, `biasCheck.js`, `draftReport.js`, `memory.js`.
- Create `backend/src/routes/ai.js`, `backend/src/routes/notifications.js`.
- Create `backend/src/lib/notify.js` — helper to write `Notification` rows.
- Modify `backend/prisma/schema.prisma` — add models + fields.
- Modify `backend/src/server.js` — mount new routers.
- Modify `backend/src/routes/reviews.js` — notification + memory hooks.
- Modify `backend/src/routes/feedback.js` — clear `organized` on resubmit.
- Modify `backend/package.json`, `backend/.env.example`.

**Frontend**
- Create `frontend/src/pdf/letterhead.jsx`, `ReviewReport.jsx`, `AnnualReport.jsx`, `ClientFeedback.jsx`, `TeamSnapshot.jsx`.
- Create `frontend/src/components/Toast.jsx`, `Skeleton.jsx`, `Empty.jsx`, `NotificationsBell.jsx`, `AiBadge.jsx`.
- Create `frontend/src/pages/Admin.jsx`, `frontend/src/pages/AttorneyMemory.jsx` (or panel within ReviewDetail).
- Modify `frontend/src/api/client.js` (add `del`, streaming helper), `styles.css` (design system), `Layout.jsx`, `components/ui.jsx`, all `pages/*.jsx`, `App.jsx`, `main.jsx` (ToastProvider).
- Modify `frontend/package.json`.

**Docs**
- Modify `README.md`, `docs/ARCHITECTURE.md`, `CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`.

---

## Task 1: AI client scaffolding + `/api/ai/status` + graceful fallback

**Files:**
- Modify: `backend/package.json` (add `@anthropic-ai/sdk`)
- Modify: `backend/.env.example`
- Create: `backend/src/lib/ai/client.js`
- Create: `backend/src/routes/ai.js`
- Modify: `backend/src/server.js`

- [ ] **Step 1: Install the SDK**

Run in `backend/`: `npm install @anthropic-ai/sdk`
Expected: `package.json` gains `@anthropic-ai/sdk` under dependencies.

- [ ] **Step 2: Add env keys to `.env.example`**

Append:
```
# ── AI (Anthropic) ──
AI_ENABLED="true"
ANTHROPIC_API_KEY=""           # paste your key in .env (gitignored)
AI_MODEL="claude-opus-4-8"     # or claude-sonnet-4-6 / claude-haiku-4-5
```

- [ ] **Step 3: Write `backend/src/lib/ai/client.js`**

```js
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../prisma.js";

let _client = null;

export function aiEnabled() {
  return process.env.AI_ENABLED !== "false" && !!process.env.ANTHROPIC_API_KEY;
}

export function model() {
  return process.env.AI_MODEL || "claude-opus-4-8";
}

export function client() {
  if (!aiEnabled()) return null;
  if (!_client) _client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return _client;
}

// Records an AiRun audit row from a message response's usage block.
export async function logRun({ kind, refId, actorId, usage }) {
  try {
    await prisma.aiRun.create({
      data: {
        kind, refId: refId || null, actorId: actorId || null, model: model(),
        inputTokens: usage?.input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
      },
    });
  } catch (e) {
    console.error("AiRun log failed:", e.message);
  }
}
```

- [ ] **Step 4: Write `backend/src/routes/ai.js` with the status route**

```js
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { aiEnabled, model } from "../lib/ai/client.js";

const router = Router();

router.get("/status", requireAuth, (_req, res) => {
  res.json({ aiEnabled: aiEnabled(), model: aiEnabled() ? model() : null });
});

export default router;
```

- [ ] **Step 5: Mount the router in `server.js`**

Add import `import aiRoutes from "./routes/ai.js";` and `app.use("/api/ai", aiRoutes);` alongside the other `app.use` lines.

- [ ] **Step 6: Verify**

Run: `node --check src/routes/ai.js && node --check src/lib/ai/client.js && node --check src/server.js`
Expected: no output (pass). Start `npm run dev`; `GET http://localhost:4000/api/ai/status` with a token returns `{ aiEnabled: false, model: null }` when no key, `{ aiEnabled: true, model: "claude-opus-4-8" }` with a key.

- [ ] **Step 7: Commit & push**

```bash
git add backend/package.json backend/package-lock.json backend/.env.example backend/src/lib/ai/client.js backend/src/routes/ai.js backend/src/server.js
git commit -m "chore(ai): add Anthropic client scaffolding, /api/ai/status, graceful fallback"
git push
```

---

## Task 2: Prisma schema additions + db push

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add new models at the end of `schema.prisma`**

```prisma
model AttorneyMemory {
  id          String   @id @default(cuid())
  attorneyId  String   @unique
  attorney    User     @relation("AttorneyMemory", fields: [attorneyId], references: [id], onDelete: Cascade)
  summary     String?  @db.Text
  themes      String?  @db.Text
  strengths   String?  @db.Text
  risks       String?  @db.Text
  trajectory  String?  @db.Text
  lastCycleId String?
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())
}

model Notification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation("UserNotifications", fields: [userId], references: [id], onDelete: Cascade)
  type      String
  message   String
  link      String?
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
  @@index([userId, read])
}

model AiRun {
  id           String   @id @default(cuid())
  kind         String
  model        String
  refId        String?
  actorId      String?
  inputTokens  Int?
  outputTokens Int?
  createdAt    DateTime @default(now())
  @@index([kind, createdAt])
}
```

- [ ] **Step 2: Add new fields/relations to existing models**

In `model User { ... }` add:
```prisma
  memory        AttorneyMemory? @relation("AttorneyMemory")
  notifications Notification[]  @relation("UserNotifications")
```
In `model PerformanceReview { ... }` add after `finalSummary`:
```prisma
  aiDraftSummary String? @db.Text
```
In `model FeedbackResponse { ... }` add after `improvements`:
```prisma
  organized   String?  @db.Text
```

- [ ] **Step 3: Apply schema**

Run in `backend/`: `npm run db:push`
Expected: "Your database is now in sync with your Prisma schema." Prisma Client regenerates.

- [ ] **Step 4: Verify**

Run: `node --check prisma/schema.prisma` is not applicable; instead confirm `npx prisma validate` passes (or that `db:push` succeeded). Start `npm run dev` — server boots without Prisma errors.

- [ ] **Step 5: Commit & push**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(db): add AttorneyMemory, Notification, AiRun models and AI fields"
git push
```

---

## Task 3: Review Organizer (service + endpoint)

**Files:**
- Create: `backend/src/lib/ai/organizeFeedback.js`
- Modify: `backend/src/routes/ai.js`
- Modify: `backend/src/routes/feedback.js` (clear `organized` on resubmit)

- [ ] **Step 1: Write `organizeFeedback.js`**

```js
import { z } from "zod";
import { zodResponseFormat } from "@anthropic-ai/sdk/helpers/zod";
import { client, model, logRun } from "./client.js";

const Schema = z.object({
  strengths: z.array(z.string()).describe("Clear, concrete strength bullet points"),
  improvements: z.array(z.string()).describe("Specific, actionable areas to improve"),
  themes: z.array(z.string()).describe("Short cross-cutting themes (1-3 words each)"),
});

// raw: { strengths, improvements, ratings: [{competency, score}] }
export async function organizeFeedback(raw, { actorId, refId } = {}) {
  const c = client();
  if (!c) return null;
  const ratingLines = (raw.ratings || [])
    .map((r) => `- ${r.competency}: ${r.score}/5`).join("\n");
  const prompt = `You are organizing one reviewer's 360 feedback about an attorney into a clear, structured form for a performance report. Do not invent content; only restructure and lightly clarify what is given. Keep it professional and specific.

RATINGS:
${ratingLines || "(none)"}

STRENGTHS (free text):
${raw.strengths || "(none provided)"}

AREAS TO IMPROVE (free text):
${raw.improvements || "(none provided)"}`;

  const res = await c.messages.parse({
    model: model(),
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodResponseFormat(Schema, "organized_feedback") },
  });
  await logRun({ kind: "ORGANIZE", refId, actorId, usage: res.usage });
  return res.parsed ?? null;
}
```
Note: confirm the exact helper export name (`zodResponseFormat` vs `zodOutputFormat`) against the installed SDK version; if `messages.parse`/helper differs, fall back to a tool-call or a plain `messages.create` with a JSON instruction and `JSON.parse`. Verify at implementation time.

- [ ] **Step 2: Add the organize route to `ai.js`**

```js
import { prisma } from "../lib/prisma.js";
import { organizeFeedback } from "../lib/ai/organizeFeedback.js";
import { aiEnabled } from "../lib/ai/client.js"; // already imported—merge imports

router.post("/organize/:requestId", requireAuth, async (req, res) => {
  if (!aiEnabled()) return res.json({ aiEnabled: false });
  const request = await prisma.feedbackRequest.findUnique({
    where: { id: req.params.requestId },
    include: { review: true, response: { include: { ratings: { include: { competency: true } } } } },
  });
  if (!request || !request.response) return res.status(404).json({ error: "No feedback to organize" });
  const isOwner = request.reviewerId === req.user.id;
  const isManager = request.review.managerId === req.user.id;
  if (!isOwner && !isManager && req.user.role !== "ADMIN")
    return res.status(403).json({ error: "Forbidden" });

  const raw = {
    strengths: request.response.strengths,
    improvements: request.response.improvements,
    ratings: request.response.ratings.map((r) => ({ competency: r.competency.name, score: r.score })),
  };
  const organized = await organizeFeedback(raw, { actorId: req.user.id, refId: request.id });
  if (!organized) return res.json({ aiEnabled: false });
  await prisma.feedbackResponse.update({
    where: { id: request.response.id }, data: { organized: JSON.stringify(organized) },
  });
  res.json({ aiEnabled: true, organized });
});
```

- [ ] **Step 3: Clear `organized` when feedback is resubmitted**

In `feedback.js` `POST /request/:id`, in the `existing` update branch, add `organized: null` to the `data` object so a new submission invalidates the stale organized version.

- [ ] **Step 4: Verify**

`node --check src/lib/ai/organizeFeedback.js src/routes/ai.js src/routes/feedback.js`. With a key: `POST /api/ai/organize/:requestId` for a submitted request returns `{ aiEnabled: true, organized: {...} }`. With `AI_ENABLED=false`: returns `{ aiEnabled: false }`.

- [ ] **Step 5: Commit & push**

```bash
git add backend/src/lib/ai/organizeFeedback.js backend/src/routes/ai.js backend/src/routes/feedback.js
git commit -m "feat(ai): review organizer endpoint and service"
git push
```

---

## Task 4: Bias & Quality Check (service + endpoint)

**Files:**
- Create: `backend/src/lib/ai/biasCheck.js`
- Modify: `backend/src/routes/ai.js`

- [ ] **Step 1: Write `biasCheck.js`**

```js
import { z } from "zod";
import { zodResponseFormat } from "@anthropic-ai/sdk/helpers/zod";
import { client, model, logRun } from "./client.js";

const Schema = z.object({
  flags: z.array(z.object({
    quote: z.string().describe("The exact phrase from the feedback"),
    type: z.enum(["vague", "non_actionable", "potentially_biased"]),
    suggestion: z.string().describe("A concrete rewrite suggestion"),
  })),
  specificityScore: z.number().min(1).max(5),
  summary: z.string(),
});

export async function biasCheck({ strengths, improvements }, { actorId, refId } = {}) {
  const c = client();
  if (!c) return null;
  const prompt = `You review draft 360 performance feedback for quality and fairness before it is submitted. Identify phrases that are vague, non-actionable, or potentially biased (e.g. about personality, gender, age, or unrelated traits). For each, suggest a concrete, behavior-based rewrite. Rate overall specificity 1-5. Be constructive and brief.

STRENGTHS:
${strengths || "(none)"}

AREAS TO IMPROVE:
${improvements || "(none)"}`;

  const res = await c.messages.parse({
    model: model(),
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodResponseFormat(Schema, "bias_check") },
  });
  await logRun({ kind: "BIAS_CHECK", refId, actorId, usage: res.usage });
  return res.parsed ?? null;
}
```

- [ ] **Step 2: Add route to `ai.js`**

```js
import { biasCheck } from "../lib/ai/biasCheck.js";

router.post("/bias-check", requireAuth, async (req, res) => {
  if (!aiEnabled()) return res.json({ aiEnabled: false });
  const { strengths, improvements } = req.body || {};
  if (!strengths && !improvements) return res.status(400).json({ error: "Nothing to check" });
  const result = await biasCheck({ strengths, improvements }, { actorId: req.user.id });
  res.json({ aiEnabled: true, ...result });
});
```

- [ ] **Step 3: Verify**

`node --check src/lib/ai/biasCheck.js src/routes/ai.js`. `POST /api/ai/bias-check` with `{strengths, improvements}` returns flags + score. Fallback returns `{ aiEnabled: false }`.

- [ ] **Step 4: Commit & push**

```bash
git add backend/src/lib/ai/biasCheck.js backend/src/routes/ai.js
git commit -m "feat(ai): bias & quality pre-submit check endpoint"
git push
```

---

## Task 5: Report Draft Assistant (streaming service + endpoint)

**Files:**
- Create: `backend/src/lib/ai/draftReport.js`
- Modify: `backend/src/routes/ai.js`

- [ ] **Step 1: Write `draftReport.js`**

```js
import { client, model, logRun } from "./client.js";

// review: full include (subject, requests->response->ratings->competency); memory: AttorneyMemory|null
export async function draftReport(review, memory, { actorId } = {}) {
  const c = client();
  if (!c) return null;

  const fb = review.requests
    .filter((r) => r.response)
    .map((r) => {
      const ratings = r.response.ratings.map((x) => `${x.competency.name}: ${x.score}/5`).join(", ");
      return `[${r.reviewerRole}] ${ratings}\n  Strengths: ${r.response.strengths || "-"}\n  Improve: ${r.response.improvements || "-"}`;
    }).join("\n\n");

  const mem = memory
    ? `PRIOR PROFILE (from past cycles):\nTrajectory: ${memory.trajectory || "-"}\nThemes: ${memory.themes || "-"}\nStrengths: ${memory.strengths || "-"}\nWatch areas: ${memory.risks || "-"}`
    : "No prior profile on record.";

  const prompt = `Write a balanced, professional performance-review narrative for ${review.subject.firstName} ${review.subject.lastName} (${review.subject.title || "attorney"}) for ${review.cycle.name}. Use the 360 feedback and prior profile. 3-4 short paragraphs: overall performance, key strengths, development areas, and forward-looking note. Be specific and fair; do not fabricate facts. This is a draft a manager will edit.

${mem}

360 FEEDBACK:
${fb || "(no feedback submitted yet)"}`;

  const stream = c.messages.stream({
    model: model(),
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
  });
  const final = await stream.finalMessage();
  const text = final.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  await logRun({ kind: "DRAFT", refId: review.id, actorId, usage: final.usage });
  return text;
}
```
(Non-streamed-to-client for simplicity: we stream server-side to avoid timeouts, then return the full text. A future enhancement can pipe SSE to the client.)

- [ ] **Step 2: Add route to `ai.js`**

```js
import { draftReport } from "../lib/ai/draftReport.js";

const DRAFT_INCLUDE = {
  subject: true, cycle: true,
  requests: { include: { response: { include: { ratings: { include: { competency: true } } } } } },
};

router.post("/reviews/:id/draft", requireAuth, async (req, res) => {
  if (!aiEnabled()) return res.json({ aiEnabled: false });
  const review = await prisma.performanceReview.findUnique({ where: { id: req.params.id }, include: DRAFT_INCLUDE });
  if (!review) return res.status(404).json({ error: "Not found" });
  if (review.managerId !== req.user.id && req.user.role !== "ADMIN")
    return res.status(403).json({ error: "Not your report" });
  const memory = await prisma.attorneyMemory.findUnique({ where: { attorneyId: review.subjectId } });
  const text = await draftReport(review, memory, { actorId: req.user.id });
  if (text == null) return res.json({ aiEnabled: false });
  await prisma.performanceReview.update({ where: { id: review.id }, data: { aiDraftSummary: text } });
  res.json({ aiEnabled: true, draft: text });
});
```

- [ ] **Step 3: Verify**

`node --check src/lib/ai/draftReport.js src/routes/ai.js`. `POST /api/ai/reviews/:id/draft` as the owning manager returns `{ aiEnabled:true, draft:"..." }` and persists `aiDraftSummary`.

- [ ] **Step 4: Commit & push**

```bash
git add backend/src/lib/ai/draftReport.js backend/src/routes/ai.js
git commit -m "feat(ai): report draft assistant (memory-aware, streamed server-side)"
git push
```

---

## Task 6: Attorney Memory (service + endpoints + auto-refresh on APPROVED)

**Files:**
- Create: `backend/src/lib/ai/memory.js`
- Modify: `backend/src/routes/ai.js`
- Modify: `backend/src/routes/reviews.js` (refresh on approve)

- [ ] **Step 1: Write `memory.js`**

```js
import { z } from "zod";
import { zodResponseFormat } from "@anthropic-ai/sdk/helpers/zod";
import { prisma } from "../prisma.js";
import { client, model, logRun, aiEnabled } from "./client.js";

const Schema = z.object({
  summary: z.string(), themes: z.array(z.string()),
  strengths: z.string(), risks: z.string(), trajectory: z.string(),
});

export async function refreshAttorneyMemory(attorneyId, { actorId } = {}) {
  if (!aiEnabled()) return null;
  const c = client();
  const attorney = await prisma.user.findUnique({ where: { id: attorneyId } });
  if (!attorney) return null;
  const approved = await prisma.performanceReview.findMany({
    where: { subjectId: attorneyId, status: "APPROVED" },
    include: { cycle: true }, orderBy: { approvedAt: "asc" },
  });
  if (approved.length === 0) return null;

  const history = approved.map((r) =>
    `${r.cycle.name}: score ${r.overallScore ?? "-"}/5\n  ${r.finalSummary || "(no summary)"}`).join("\n\n");

  const res = await c.messages.parse({
    model: model(), max_tokens: 1200, thinking: { type: "adaptive" },
    messages: [{ role: "user", content:
`Build a concise longitudinal profile of attorney ${attorney.firstName} ${attorney.lastName} from approved performance reports. Capture recurring themes, durable strengths, watch areas, and trajectory across cycles. Factual and fair.

APPROVED REPORTS:
${history}` }],
    output_config: { format: zodResponseFormat(Schema, "attorney_memory") },
  });
  await logRun({ kind: "MEMORY", refId: attorneyId, actorId, usage: res.usage });
  const m = res.parsed;
  if (!m) return null;
  const data = {
    summary: m.summary, themes: JSON.stringify(m.themes), strengths: m.strengths,
    risks: m.risks, trajectory: m.trajectory, lastCycleId: approved.at(-1).cycleId,
  };
  return prisma.attorneyMemory.upsert({
    where: { attorneyId }, update: data, create: { attorneyId, ...data },
  });
}
```

- [ ] **Step 2: Add routes to `ai.js`**

```js
import { refreshAttorneyMemory } from "../lib/ai/memory.js";

function canSeeMemory(user, attorneyId, managerId) {
  return user.role === "ADMIN" || user.id === attorneyId || user.id === managerId;
}

router.get("/attorneys/:id/memory", requireAuth, async (req, res) => {
  const attorney = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!attorney) return res.status(404).json({ error: "Not found" });
  if (!canSeeMemory(req.user, attorney.id, attorney.managerId))
    return res.status(403).json({ error: "Forbidden" });
  const memory = await prisma.attorneyMemory.findUnique({ where: { attorneyId: attorney.id } });
  res.json({ aiEnabled: aiEnabled(), memory });
});

router.post("/attorneys/:id/memory/refresh", requireAuth, async (req, res) => {
  if (!aiEnabled()) return res.json({ aiEnabled: false });
  if (!["MANAGER", "ADMIN"].includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
  const memory = await refreshAttorneyMemory(req.params.id, { actorId: req.user.id });
  res.json({ aiEnabled: true, memory });
});
```

- [ ] **Step 3: Hook refresh into approve transition in `reviews.js`**

In the `transition()` factory, after the `prisma.performanceReview.update` for an approve (`toStatus === "APPROVED"`), fire-and-forget:
```js
if (toStatus === "APPROVED") {
  import("../lib/ai/memory.js").then(({ refreshAttorneyMemory }) =>
    refreshAttorneyMemory(review.subjectId, { actorId: req.user.id }).catch(() => {})
  );
}
```
(Dynamic import keeps AI fully optional; the `.catch` ensures approval never fails because of AI.)

- [ ] **Step 4: Verify**

`node --check` the three files. Approve a review (manager/admin) → `AttorneyMemory` row appears/updates. `GET /api/ai/attorneys/:id/memory` returns it.

- [ ] **Step 5: Commit & push**

```bash
git add backend/src/lib/ai/memory.js backend/src/routes/ai.js backend/src/routes/reviews.js
git commit -m "feat(ai): attorney memory profile + auto-refresh on report approval"
git push
```

---

## Task 7: Notifications + SLA nudges

**Files:**
- Create: `backend/src/lib/notify.js`
- Create: `backend/src/routes/notifications.js`
- Modify: `backend/src/server.js`, `backend/src/routes/reviews.js`

- [ ] **Step 1: Write `notify.js`**

```js
import { prisma } from "./prisma.js";
export async function notify(userId, type, message, link) {
  try { await prisma.notification.create({ data: { userId, type, message, link: link || null } }); }
  catch (e) { console.error("notify failed:", e.message); }
}
export async function notifyMany(userIds, type, message, link) {
  await Promise.all([...new Set(userIds)].map((id) => notify(id, type, message, link)));
}
```

- [ ] **Step 2: Write `routes/notifications.js`**

```js
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const items = await prisma.notification.findMany({
    where: { userId: req.user.id }, orderBy: { createdAt: "desc" }, take: 50,
  });
  res.json({ items, unread: items.filter((n) => !n.read).length });
});
router.post("/:id/read", requireAuth, async (req, res) => {
  await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { read: true } });
  res.json({ ok: true });
});
router.post("/read-all", requireAuth, async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } });
  res.json({ ok: true });
});
export default router;
```

- [ ] **Step 3: Mount + hook into reviews**

In `server.js`: `import notificationRoutes from "./routes/notifications.js";` and `app.use("/api/notifications", notificationRoutes);`.
In `reviews.js` `launch`: after fan-out, `await notifyMany(reviewers.map(r=>r.reviewerId), "FEEDBACK_REQUESTED", \`Feedback requested for ${me.firstName}'s ${cycle.name} review\`, "/feedback");`
In the `transition()` factory: notify the subject on each transition, e.g. on APPROVED → `notify(review.subjectId, "APPROVED", \`Your ${...} review was approved\`, \`/reviews/${review.id}\`)`. Import `notify, notifyMany` at top of `reviews.js`.

- [ ] **Step 4: SLA nudges (reuse existing analytics)**

No new endpoint needed — the manager dashboard already returns `overdue`/`elapsedDays` via `cycleTime`. The UI (Task 10) surfaces these as nudge banners. Confirm `dashboard.js /manager` already returns `overdueCount` (it does).

- [ ] **Step 5: Verify**

`node --check` changed files. Launch a review → reviewers get `FEEDBACK_REQUESTED` rows. Approve → subject gets `APPROVED` row. `GET /api/notifications` returns them.

- [ ] **Step 6: Commit & push**

```bash
git add backend/src/lib/notify.js backend/src/routes/notifications.js backend/src/server.js backend/src/routes/reviews.js
git commit -m "feat(notifications): in-app notifications on launch and state changes"
git push
```

---

## Task 8: PDF export (react-pdf templates + download buttons)

**Files:**
- Modify: `frontend/package.json` (add `@react-pdf/renderer`)
- Create: `frontend/src/pdf/letterhead.jsx`, `ReviewReport.jsx`, `AnnualReport.jsx`, `ClientFeedback.jsx`, `TeamSnapshot.jsx`
- Modify: relevant pages to add `<PDFDownloadLink>` buttons

- [ ] **Step 1: Install**

In `frontend/`: `npm install @react-pdf/renderer`.

- [ ] **Step 2: Write `pdf/letterhead.jsx`** — shared styled primitives (Counsel colours, Times serif)

```jsx
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

export const COLORS = { ink: "#1B2440", brass: "#B08D57", ivory: "#F6F2EA", rule: "#D8CDB8", muted: "#6b6357" };
export const s = StyleSheet.create({
  page: { padding: 48, fontFamily: "Times-Roman", color: COLORS.ink, fontSize: 11, backgroundColor: "#fff" },
  brand: { fontSize: 18, fontFamily: "Times-Bold", color: COLORS.ink },
  brandSub: { fontSize: 8, letterSpacing: 2, color: COLORS.brass, marginTop: 2, textTransform: "uppercase" },
  rule: { borderBottomWidth: 1, borderBottomColor: COLORS.brass, marginVertical: 12 },
  h2: { fontSize: 13, fontFamily: "Times-Bold", marginTop: 14, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  muted: { color: COLORS.muted },
  para: { lineHeight: 1.5, marginBottom: 6 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: COLORS.muted, textAlign: "center" },
});

export function Header({ title, subtitle }) {
  return (
    <View>
      <View style={s.row}>
        <View><Text style={s.brand}>Mostoeneng</Text><Text style={s.brandSub}>Counsel · Performance</Text></View>
        <View><Text style={{ fontFamily: "Times-Bold" }}>{title}</Text>
          {subtitle ? <Text style={s.muted}>{subtitle}</Text> : null}</View>
      </View>
      <View style={s.rule} />
    </View>
  );
}
export function Footer() {
  return <Text style={s.footer} render={({ pageNumber, totalPages }) =>
    `Mostoeneng PMS · Confidential · ${pageNumber}/${totalPages}`} fixed />;
}
```

- [ ] **Step 3: Write `ReviewReport.jsx`** (approved quarterly report)

```jsx
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { s, Header, Footer } from "./letterhead.jsx";

export default function ReviewReport({ review }) {
  const a = review.analytics || {};
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Header title="Performance Review" subtitle={review.cycle?.name} />
        <Text style={s.h2}>{review.subject?.name} — {review.subject?.title}</Text>
        <View style={s.row}><Text style={s.muted}>Overall score</Text>
          <Text>{review.overallScore != null ? `${review.overallScore.toFixed(2)} / 5` : "—"}</Text></View>
        <View style={s.row}><Text style={s.muted}>Manager</Text><Text>{review.manager?.name}</Text></View>

        <Text style={s.h2}>Summary</Text>
        <Text style={s.para}>{review.finalSummary || "No summary recorded."}</Text>

        <Text style={s.h2}>Competency breakdown</Text>
        {(a.byCompetency || []).map((b) => (
          <View key={b.competencyId} style={s.row}>
            <Text>{b.name}</Text><Text>{b.average != null ? `${b.average.toFixed(1)} / 5` : "—"}</Text>
          </View>
        ))}
        <Footer />
      </Page>
    </Document>
  );
}
```

- [ ] **Step 4: Write `AnnualReport.jsx`, `ClientFeedback.jsx`, `TeamSnapshot.jsx`**

Follow the same `Header`/`Footer`/`s` pattern:
- `AnnualReport({ rollup })` — annual score, then a row per quarter (`rollup.quarters`: cycle, score, summary).
- `ClientFeedback({ request })` — the client's submitted ratings + strengths/improvements for one feedback request.
- `TeamSnapshot({ summary, rows })` — manager dashboard: summary stats then a table row per review (subject, status, score, completion %, overdue).

Each is a `Document > Page` using `s.h2`, `s.row`, `s.para`. (Concrete row markup mirrors Step 3.)

- [ ] **Step 5: Wire download buttons**

Add to the relevant pages a button:
```jsx
import { PDFDownloadLink } from "@react-pdf/renderer";
import ReviewReport from "../pdf/ReviewReport.jsx";
// ...
{review.status === "APPROVED" && (
  <PDFDownloadLink document={<ReviewReport review={review} />}
    fileName={`review-${review.subject?.name}-${review.cycle?.name}.pdf`} className="btn small">
    {({ loading }) => (loading ? "Preparing…" : "Download PDF")}
  </PDFDownloadLink>
)}
```
Place: `ReviewReport` on `ReviewDetail`; `AnnualReport` on Attorney/Manager view where rollup is shown; `ClientFeedback` on `ClientPortal` (submitted items) and `FeedbackForm` after submit; `TeamSnapshot` on `ManagerDashboard`.

- [ ] **Step 6: Verify**

`npm run build` succeeds. In the running app, each Download button produces a valid, branded PDF.

- [ ] **Step 7: Commit & push**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/pdf
git commit -m "feat(pdf): branded report/feedback/snapshot PDF export via react-pdf"
git push
# (page wiring may be committed here or folded into Task 10 page work)
```

---

## Task 9: "The Counsel" design system (tokens + Layout + ui.jsx + toasts)

**Files:**
- Modify: `frontend/index.html` (font link), `frontend/src/styles.css` (full rewrite to tokens), `frontend/src/components/ui.jsx`, `frontend/src/components/Layout.jsx`
- Create: `frontend/src/components/Toast.jsx`, `Skeleton.jsx`, `Empty.jsx`, `AiBadge.jsx`
- Modify: `frontend/src/main.jsx` (wrap in ToastProvider)

- [ ] **Step 1: Add fonts to `index.html`**

In `<head>`: `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`

- [ ] **Step 2: Rewrite `styles.css` design tokens (top of file)**

```css
:root{
  --ivory:#F6F2EA; --paper:#FFFFFF; --ink:#1B2440; --ink-soft:#3a3f52;
  --brass:#B08D57; --rule:#E7DECB; --muted:#8a7d63;
  --green:#3f7d57; --amber:#B0843E; --violet:#6d5bbf; --red:#b4452f;
  --radius:14px; --shadow:0 1px 2px rgba(27,36,64,.05),0 8px 24px rgba(27,36,64,.06);
  --serif:'Newsreader',Georgia,'Times New Roman',serif; --sans:'Inter',system-ui,sans-serif;
}
*{box-sizing:border-box} body{margin:0;background:var(--ivory);color:var(--ink);font-family:var(--sans);font-size:15px}
h1,h2,h3{font-family:var(--serif);font-weight:500;letter-spacing:.01em}
```
Then retone existing classes (`.card`, `.stat`, `.pill`, `.btn`, `.bar-*`, `.ring`, `.topbar`, `.nav`, `.container`, `.grid-2`) to the tokens: cards `background:var(--paper);border:1px solid var(--rule);border-radius:var(--radius);box-shadow:var(--shadow)`; buttons `.btn.primary{background:var(--ink);color:var(--ivory)}` with brass hover; pills keep tone classes but warmer. Keep all existing class names so pages keep working.

- [ ] **Step 3: Create `Toast.jsx`** — context provider + `useToast()` + viewport

```jsx
import { createContext, useContext, useState, useCallback } from "react";
const Ctx = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, tone="info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toast-wrap">{toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.msg}</div>)}</div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
```
Add `.toast-wrap`/`.toast` styles to `styles.css`. Wrap `<App/>` in `<ToastProvider>` in `main.jsx`.

- [ ] **Step 4: Create `Skeleton.jsx`, `Empty.jsx`, `AiBadge.jsx`**

```jsx
// Skeleton.jsx
export function Skeleton({ h=16, w="100%", r=6 }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} />;
}
// Empty.jsx
export function Empty({ title, hint, action }) {
  return <div className="empty"><h3>{title}</h3>{hint && <p className="muted">{hint}</p>}{action}</div>;
}
// AiBadge.jsx
export function AiBadge({ label="AI-assisted" }) { return <span className="ai-badge">✦ {label}</span>; }
```
Add `.skeleton` (shimmer), `.empty`, `.ai-badge` styles to `styles.css`.

- [ ] **Step 5: Restyle `Layout.jsx`**

Keep structure; refine brand mark (serif M in brass square), nav active state (brass underline), add the notifications bell slot (placeholder `<NotificationsBell/>` added in Task 10). Ensure responsive: nav collapses on narrow screens.

- [ ] **Step 6: Restyle `ui.jsx`**

Keep `StatusPill`, `ScoreBadge`, `Bar`, `ProgressRing`, `Stat`, `sourceLabel` APIs unchanged; adjust tones to new palette (green/amber/red map to the warm tokens). No prop changes so pages keep working.

- [ ] **Step 7: Verify**

`npm run build` succeeds. App renders in the new identity; existing pages still function (classes preserved). Toasts fire from a temporary test call.

- [ ] **Step 8: Commit & push**

```bash
git add frontend/index.html frontend/src/styles.css frontend/src/main.jsx frontend/src/components/ui.jsx frontend/src/components/Layout.jsx frontend/src/components/Toast.jsx frontend/src/components/Skeleton.jsx frontend/src/components/Empty.jsx frontend/src/components/AiBadge.jsx
git commit -m "feat(ui): The Counsel design system, toasts, skeletons, empty states"
git push
```

---

## Task 10: Page-by-page redesign + AI affordances + notifications bell + admin + memory

**Files:**
- Modify: `frontend/src/api/client.js` (add `del`), `App.jsx` (routes for `/admin`)
- Create: `frontend/src/components/NotificationsBell.jsx`, `frontend/src/pages/Admin.jsx`
- Modify: every page in `frontend/src/pages/` + `Layout.jsx`

- [ ] **Step 1: Extend `api/client.js`**

Add a `del` method (`request("DELETE", p)`) and a small `aiStatus` cache helper (`api.get("/ai/status")`). Keep existing exports.

- [ ] **Step 2: `NotificationsBell.jsx`**

Polls `GET /api/notifications` on mount + every 30s, renders bell with unread count and a dropdown; clicking an item marks read (`POST /:id/read`) and navigates `link`. Add to `Layout` top bar. Add `.bell`/`.notif-*` styles.

- [ ] **Step 3: `FeedbackForm.jsx`** — add Bias & Quality check

Add a "Check before submit" button calling `api.post("/ai/bias-check", {strengths, improvements})`; render returned `flags` inline (quote, type pill, suggestion) and the `specificityScore`. Guard on `aiEnabled:false` → show subtle "AI not configured" note. Restyle to Counsel.

- [ ] **Step 4: `ReviewDetail.jsx`** — Organize, Draft with AI, Memory, PDF

- "Organize with AI" per submitted feedback request → `POST /api/ai/organize/:requestId`; render organized bullets with `<AiBadge/>`.
- Manager: "Draft with AI" → `POST /api/ai/reviews/:id/draft`; fill an editable textarea; "Save draft" calls existing `PATCH /api/reviews/:id/draft`.
- Show `<AttorneyMemory/>` panel (manager/admin/subject) from `GET /api/ai/attorneys/:id/memory` with a "Refresh" (manager/admin).
- Add `ReviewReport` PDF button (Task 8) when APPROVED. Restyle.

- [ ] **Step 5: Dashboards** — `ManagerDashboard.jsx`, `AttorneyDashboard.jsx`, `ClientPortal.jsx`, `MyFeedback.jsx`

Restyle to Counsel; add Skeleton loading + Empty states + toasts on actions. Manager: SLA nudge banner using `summary.overdueCount` and per-row `overdue`; add `TeamSnapshot` PDF button. Attorney: keep launch panel; add `AnnualReport` PDF where rollup shown. Client: add `ClientFeedback` PDF for submitted items.

- [ ] **Step 6: `Admin.jsx` + routing**

New page (ADMIN only): list cycles (`GET /api/cycles`), create cycle (`POST /api/cycles`), close cycle (`PATCH /api/cycles/:id/close`), list competencies (`GET /api/users/competencies`, read-only). Add route in `App.jsx` (`/admin`, Protected roles `["ADMIN"]`) and a nav link in `Layout` for admins.

- [ ] **Step 7: Verify**

`npm run build` succeeds. Full manual smoke per role (admin/manager/attorney/client) of: login, dashboards, launch, feedback + bias check, organize, draft, approve, memory, notifications bell, all four PDFs, admin. Repeat key paths with `AI_ENABLED=false` to confirm graceful fallback.

- [ ] **Step 8: Commit & push** (may be split into 2-3 commits: bell+admin, AI affordances, dashboard restyle)

```bash
git add frontend/src
git commit -m "feat(ui): redesigned pages, AI affordances, notifications bell, admin console"
git push
```

---

## Task 11: Docs

**Files:**
- Modify: `README.md`, `docs/ARCHITECTURE.md`, `CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`

- [ ] **Step 1: Update docs**

- `README.md`: add AI setup (`ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_ENABLED`), the POPIA note, PDF export mention, new env vars.
- `docs/ARCHITECTURE.md`: add the AI module, notifications, PDF, and design-system sections; note the POPIA governance decision.
- `CLAUDE.md` files: document the new `src/lib/ai`, routes, models, fallback contract, design tokens, and the AI-data privacy note.

- [ ] **Step 2: Verify & commit**

```bash
git add README.md docs/ARCHITECTURE.md CLAUDE.md backend/CLAUDE.md frontend/CLAUDE.md
git commit -m "docs: document AI layer, notifications, PDF export, design system, POPIA note"
git push
```

---

## Self-review notes
- **Spec coverage:** all four AI features (T3–T6), all four PDFs (T8), notifications + SLA (T7), UI redesign (T9–T10), admin/memory/notifications-bell (T10), graceful fallback (T1, every AI route), POPIA note (T11), data model (T2). Covered.
- **SDK uncertainty:** the exact Zod structured-output helper name/usage is verified against the installed SDK at Task 3 implementation; fallback to JSON-instruction + `JSON.parse` documented there.
- **Type/name consistency:** `aiEnabled()`/`model()`/`logRun()` defined in T1 and used consistently; `organized` (string JSON) and `aiDraftSummary` defined T2, used T3/T5/T10; `notify()`/`notifyMany()` defined T7 used in T7 hooks.
