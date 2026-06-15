# Mostoeneng PMS — AI Upgrade & "The Counsel" Redesign — Design Spec

**Date:** 2026-06-15
**Status:** Approved (design); pending spec review
**Author:** AI development session with Kone (erictshivhinda@gmail.com)

---

## 1. Context & goal

Mostoeneng PMS is a working v1 360° performance-management system for a high-end law
firm (React/Vite SPA + Node/Express + Prisma/PostgreSQL). The current build is functional
but visually generic and has no intelligence layer. This project turns it into a slick,
AI-assisted, one-of-a-kind PMS:

1. An **Anthropic-powered intelligence layer** with persistent memory of each attorney.
2. **PDF export** of formal reports and client feedback.
3. A **premium UI/UX redesign** ("The Counsel" — quiet-luxury editorial identity).
4. The supporting pieces a modern PMS needs but this build lacks (in-app notifications,
   SLA nudges, lightweight admin, polished UX states).

Existing domain model is unchanged conceptually: roles `ADMIN/MANAGER/ATTORNEY/CLIENT`,
review lifecycle `NOT_STARTED → LAUNCHED → DRAFT → IN_REVIEW → FINALIZED → APPROVED`,
the "launch button" fan-out, weighted scoring, quarterly→annual rollup, `ReportEvent`
audit trail. See `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/CADENCE.md`.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| UI direction | **A — "The Counsel"**: warm ivory `#F6F2EA`, ink-navy `#1B2440`, brass `#B08D57`, serif display + Inter body |
| Anthropic key | Read `ANTHROPIC_API_KEY` from `backend/.env` (gitignored); user supplies it |
| Default model | `claude-opus-4-8`; overridable via `AI_MODEL` env var |
| AI features | All four: Review Organizer, Bias & Quality Check, Report Draft Assistant, Attorney Memory |
| PDF exports | All four: Approved Review Report, Annual Rollup Report, Client Feedback Summary, Manager Team Snapshot |
| AI governance | Enabled by default behind `AI_ENABLED` flag; POPIA note documented |
| AI authority | Every AI output is labeled "AI-assisted," editable, never auto-finalized; a human always owns the decision |

## 3. Architecture

### 3.1 AI service module (backend)

New `backend/src/lib/ai/`:

- `client.js` — singleton `Anthropic` client (`@anthropic-ai/sdk`). Exposes:
  - `aiEnabled()` → `true` only if `AI_ENABLED !== "false"` **and** `ANTHROPIC_API_KEY` is set.
  - `model()` → `process.env.AI_MODEL || "claude-opus-4-8"`.
  - A thin `run()` helper that wraps a call, records an `AiRun` audit row (kind, model,
    input/output tokens from `usage`, actorId, refId), and surfaces typed errors.
- `organizeFeedback.js` — structured output via Zod schema (`@anthropic-ai/sdk/helpers/zod`,
  `client.messages.parse`): input = raw strengths/improvements/ratings; output =
  `{ strengths: string[], improvements: string[], themes: string[] }`.
- `biasCheck.js` — structured output: input = draft feedback text; output =
  `{ flags: [{ quote, issue, type: "vague"|"non_actionable"|"potentially_biased", suggestion }], specificityScore: 1-5, summary }`.
- `draftReport.js` — **streaming** narrative (`client.messages.stream`, adaptive thinking)
  from the 360 ratings + comments + attorney memory; returns a manager-editable draft.
- `memory.js` — `refreshAttorneyMemory(attorneyId)`: gathers the attorney's APPROVED
  reviews (scores, competency breakdowns, finalized summaries) and produces/updates the
  `AttorneyMemory` profile (adaptive thinking).

**Graceful degradation:** when `aiEnabled()` is false, every AI route returns HTTP 200
`{ aiEnabled: false }` (not an error), and the UI shows a tasteful "AI not configured"
affordance. No feature hard-depends on AI to function.

**Model/params:** default `claude-opus-4-8`. Organizer + bias check are simple, fast,
structured (no thinking config needed). Draft + memory use `thinking: {type:"adaptive"}`
and streaming. Never downgrade silently — `AI_MODEL` is the user's lever.

### 3.2 Data model additions (`prisma db push`)

```
model AttorneyMemory {
  id          String   @id @default(cuid())
  attorneyId  String   @unique
  attorney    User     @relation(fields:[attorneyId], references:[id], onDelete: Cascade)
  summary     String?  @db.Text   // narrative profile
  themes      String?  @db.Text   // recurring themes (JSON string)
  strengths   String?  @db.Text
  risks       String?  @db.Text
  trajectory  String?  @db.Text   // score/performance direction over cycles
  lastCycleId String?
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())
}

model Notification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields:[userId], references:[id], onDelete: Cascade)
  type      String   // FEEDBACK_REQUESTED, STATE_CHANGE, APPROVED, OVERDUE, ...
  message   String
  link      String?  // e.g. /reviews/:id or /feedback/:id
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
  @@index([userId, read])
}

model AiRun {
  id           String   @id @default(cuid())
  kind         String   // ORGANIZE | BIAS_CHECK | DRAFT | MEMORY
  model        String
  refId        String?  // review/request/attorney id
  actorId      String?
  inputTokens  Int?
  outputTokens Int?
  createdAt    DateTime @default(now())
  @@index([kind, createdAt])
}
```

New fields: `FeedbackResponse.organized String? @db.Text` (AI-structured JSON),
`PerformanceReview.aiDraftSummary String? @db.Text` (AI draft, separate from the
human `draftSummary`). New relations added to `User` for `AttorneyMemory`/`Notification`.

### 3.3 API surface (new)

`backend/src/routes/ai.js` (all `requireAuth`):
- `GET  /api/ai/status` → `{ aiEnabled, model }`.
- `POST /api/ai/organize/:requestId` → organize one feedback response; persists `organized`. Authz: reviewer who owns it, the review's manager, or admin.
- `POST /api/ai/bias-check` → body `{ strengths, improvements, ratings }`; returns flags (not persisted — pre-submit advisory).
- `POST /api/ai/reviews/:id/draft` → **streamed** AI draft for the manager; persists `aiDraftSummary`. Authz: owning manager or admin. Manager then edits + saves via existing `PATCH /api/reviews/:id/draft`.
- `GET  /api/ai/attorneys/:id/memory` → memory profile. Authz: the attorney, their manager, or admin.
- `POST /api/ai/attorneys/:id/memory/refresh` → regenerate. Authz: manager/admin.

`backend/src/routes/notifications.js`:
- `GET  /api/notifications` → current user's notifications (newest first).
- `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`.

**Hooks into existing flow:** `reviews.js` `launch` → notify each reviewer
(`FEEDBACK_REQUESTED`); each state transition → notify subject/manager; on `APPROVED`
→ enqueue `refreshAttorneyMemory(subjectId)` (best-effort, non-blocking) and notify the
attorney their report is ready.

### 3.4 Frontend additions

- `frontend/src/pdf/` — `@react-pdf/renderer` templates: `ReviewReport.jsx`,
  `AnnualReport.jsx`, `ClientFeedback.jsx`, `TeamSnapshot.jsx`, shared `letterhead.jsx`.
  Built-in Times serif (no font hosting) in Counsel colours; "Download PDF" buttons wired
  to `<PDFDownloadLink>` on the matching pages.
- Design system: rewrite `styles.css` with CSS-variable tokens; rework `Layout.jsx`,
  `ui.jsx`, all pages to "The Counsel."
- New UI: `Admin.jsx` (create/close cycles, view competencies), `Notifications` (bell +
  dropdown in `Layout`), attorney **Memory** panel, inline AI affordances (Organize button
  on feedback, "Draft with AI" on review detail, bias hints in `FeedbackForm`).
- UX layer: toast system, loading skeletons, real empty states, micro-interactions,
  responsive/mobile, basic a11y (labels, focus states, contrast).

## 4. Feature behaviour detail

### 4.1 Review Organizer
Reviewer or manager clicks "Organize with AI" on a submitted feedback response. The model
restructures the free-text into clean Strengths / Areas-to-improve bullets + themes,
persisted to `FeedbackResponse.organized`. Rendered wherever feedback is shown. Original
text is preserved; organized view is additive and labeled "AI-assisted."

### 4.2 Bias & Quality Check
In `FeedbackForm`, a "Check before submit" action sends the draft to `biasCheck`. Inline
flags highlight vague / non-actionable / potentially-biased phrasing with concrete
rewrite suggestions, plus a 1–5 specificity score. Advisory only — never blocks submit.

### 4.3 Report Draft Assistant
On review detail, manager clicks "Draft with AI." Streams a narrative summary built from
the submitted 360 feedback + the attorney's memory profile. Lands in an editable field;
manager edits and saves through the existing draft → submit → finalize → approve flow.
Stored as `aiDraftSummary` so it's distinguishable from the human-authored `draftSummary`.

### 4.4 Attorney Memory
`AttorneyMemory` is refreshed automatically when a review hits `APPROVED`, and on demand
by a manager/admin. It captures recurring themes, trajectory, durable strengths, and
watch-areas across cycles, and is fed into the Draft Assistant. Visible to the attorney's
manager/admin and (read-only summary) to the attorney.

## 5. Notifications & SLA nudges
In-app only (no email/Teams — explicitly out of scope). `Notification` rows are created on
the hooks in 3.3. Dashboards additionally compute **at-risk / overdue** reviews from
`launchedAt + slaDays` (existing `cycleTime` logic) and surface them prominently. A bell in
the top bar shows unread count + a dropdown.

## 6. PDF export
Client-side `@react-pdf/renderer`. Four branded templates (section 3.4) on the
Counsel letterhead. Real downloadable `.pdf` files, no backend headless browser. Charts
render as simple bars/rects within react-pdf primitives. Data comes from the same
`/api` endpoints the screens already use.

## 7. UI/UX — "The Counsel" design system
- **Palette:** ivory `#F6F2EA`, ink-navy `#1B2440`, brass `#B08D57`, parchment card
  `#FFFFFF`/`#E7DECB` rules, status tones (green/amber/violet/red) tuned warm.
- **Type:** serif display (Newsreader/Fraunces via Google Fonts; Georgia fallback),
  Inter for body/UI. Generous spacing, thin 1px rules, letterpress feel.
- **Components:** refined cards, stat tiles, status pills, score badges, competency bars,
  progress rings — all retoned. Toasts, skeletons, empty states added.
- **Scope:** `Layout`, `ui.jsx`, every page reworked; responsive + a11y pass.

## 8. Privacy / POPIA governance ⚠️
AI features transmit review free-text to the Anthropic API. Anthropic does not train on
API inputs by default and offers retention controls, but performance data is sensitive
personal information under POPIA/GDPR. Mitigations: master `AI_ENABLED` flag (off-switch),
`AiRun` audit trail, no secrets/PII beyond review content sent, and a documented note in
`README.md` + `docs/ARCHITECTURE.md` recommending the firm confirm this with its HR/privacy
owner. Default for this build: **enabled**.

## 9. Security & error handling
- Key stays server-side; never exposed to the SPA. `.env` remains gitignored.
- AI routes keep the existing two-layer authz (role gate + row-level ownership checks).
- All AI calls are wrapped: typed-error handling, graceful `{ aiEnabled:false }` fallback,
  and failures never block the underlying non-AI workflow.
- `prisma db push` (no migration history), consistent with the current project.

## 10. Build sequence (incremental commits, each pushed separately)
1. `chore(ai)`: Anthropic SDK + `src/lib/ai/client.js` scaffolding, env example, graceful fallback, `/api/ai/status`.
2. `feat(db)`: Prisma schema additions (`AttorneyMemory`, `Notification`, `AiRun`, new fields) + `db push`.
3. `feat(ai)`: Review Organizer (endpoint + service).
4. `feat(ai)`: Bias & Quality Check.
5. `feat(ai)`: Report Draft Assistant (streaming).
6. `feat(ai)`: Attorney Memory + auto-refresh on APPROVED.
7. `feat(notifications)`: Notification model wiring + SLA nudges API.
8. `feat(pdf)`: react-pdf templates + download buttons.
9. `feat(ui)`: "The Counsel" design tokens + Layout + ui.jsx.
10. `feat(ui)`: page-by-page redesign + notifications bell + admin + memory + AI affordances + UX states.
11. `docs`: update README, ARCHITECTURE, CLAUDE.md files.

Each commit: one coherent piece, its own message, pushed. GitHub remote verified before
first push.

## 11. Verification
No automated test suite exists. Per commit: `node --check` on changed backend files; Vite
build succeeds; manual smoke of the touched flow. AI paths verified both with a key present
and with `AI_ENABLED=false` (fallback). Prisma schema validated via `db push` on Kone's DB.

## 12. Out of scope (future)
Natural-language "ask your data" analytics; command palette / global search; email/Teams
delivery of notifications; refresh tokens / SSO; automated test suite; `prisma migrate`
history.
