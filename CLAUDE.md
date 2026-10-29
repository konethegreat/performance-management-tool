# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Mostoeneng PMS — a 360°, institution-wide **performance management system** for a
professional-services (legal) firm. An attorney **launches** a quarterly review cycle;
managers, peers, subordinates, a client and the attorney themselves submit feedback;
managers draft → finalize → approve a report; approved quarterly reports roll up into an
annual report. This is a reviewable, runnable v1 (see `docs/ARCHITECTURE.md` for the
production-hardening punch list that is deliberately out of scope).

## Repo layout

Two independently runnable apps plus a database. They communicate **only** over the
`/api/*` HTTP surface, so either side can be changed in isolation.

```
backend/    Express API + Prisma schema + seed   → see backend/CLAUDE.md
frontend/   React + Vite SPA                      → see frontend/CLAUDE.md
docs/       ARCHITECTURE, DATA_MODEL, CADENCE, HOSTING_AND_SCALING, ui mockups
docker-compose.yml   Optional Postgres for local dev (HANDOVER notes it is NOT used —
                     dev uses a local Postgres `mostoeneng_pms` DB via pgAdmin4)
```

## Run order (full stack, from a clean checkout)

```bash
# 1. (optional) Postgres via Docker — or point DATABASE_URL at a local instance
docker compose up -d

# 2. Backend  →  API on http://localhost:4000
cd backend
cp .env.example .env          # then set a real DATABASE_URL / JWT_SECRET
npm install
npm run db:push               # create tables from prisma/schema.prisma
npm run db:seed               # load the seeded firm + Q1 approved + Q2 in-flight
npm run dev

# 3. Frontend (new terminal)  →  SPA on http://localhost:5173 (proxies /api → :4000)
cd frontend
npm install
npm run dev
```

Seeded logins, password `Password123!` for all:
`admin@mostoeneng.law` (ADMIN), `t.dlamini@mostoeneng.law` (MANAGER),
`n.khumalo@mostoeneng.law` (ATTORNEY), `s.naidoo@mostoeneng.law` (ATTORNEY, mid-cycle),
`client@acme-holdings.com` (CLIENT).

## Core domain model (the big picture)

- **Roles (capability tiers):** `ADMIN`, `MANAGER`, `ATTORNEY`, `SUPPORT`, `CLIENT`. The 360
  feedback *sources* are a separate enum: `SELF`, `MANAGER`, `PEER`, `SUBORDINATE`, `SUPPORT`, `CLIENT`
  (`SUPPORT` raters are weighted 0.7 and may score only social/soft competencies — see Feature stages).
- **Positions vs roles:** `Role` is the small set of permission tiers; the human job title is a
  `User.position` catalog key (`backend/src/lib/positions.js`) that maps each position →
  a tier + capability flags (`firmWide`, `manageReports`, `reviewSubject`, `socialRaterOnly`).
  Don't add a dashboard per title — map titles onto tiers. Sign-up (`POST /api/auth/register`,
  list via `GET /api/auth/positions`) derives the tier from the chosen position; leadership/
  firm-wide and client positions are admin-provisioned, not self-registerable. `publicUser`
  returns `position` + derived `capabilities`; use `capabilitiesForUser(user)` (position-first,
  role fallback) rather than hardcoding role checks for new capability-gated features. SUPPORT =
  social/soft raters only — now **enforced** server-side (Stage 2): they may rate only competencies
  whose `category` is social (`backend/src/lib/competencies.js`). See Feature stages below.
- **Review lifecycle:** `NOT_STARTED → LAUNCHED → DRAFT → IN_REVIEW → FINALIZED → APPROVED`.
  A manager can `send-back` (→ `DRAFT`) any time before `APPROVED`. Approved reports are
  immutable and feed the annual rollup.
- **The "launch button":** an attorney pressing launch (`POST /api/reviews/launch`) is the
  spine of the whole system. It stamps `launchedAt`, fans out one `FeedbackRequest` per 360
  source, and anchors **all** SLA / completion-rate / cycle-time analytics. Treat
  `launchedAt` as load-bearing — analytics in `backend/src/lib/scoring.js` measure from it.
- **Scoring:** composite score = weighted mean of every rating, weight =
  `competency.weight × response.sourceWeight`. Source weights: Manager 1.5, Client 0.9,
  Peer 1.0, Subordinate 1.0, Self 0.8. This encodes two firm policies (which competencies
  matter, which voices matter) in one number.
- **Annual rollup:** an `ANNUAL` `ReviewCycle` is the parent of four quarterly `children`;
  `GET /api/dashboard/rollup/:attorneyId/:annualCycleId` averages the approved quarters.
- **Department KPIs:** `GET /api/dashboard/departments` (ADMIN/MANAGER) aggregates per
  `PracticeGroup` — avg composite score, completion %, overdue/SLA, cycle time, and
  source-weighted competency strengths vs improvement areas — ranked by effectiveness. Powers
  the `/departments` page.
- **Audit:** every state transition writes a `ReportEvent` (immutable trail).

## Cross-cutting conventions

- **Visibility rule (enforced server-side):** an attorney does **not** see their own scores,
  competency breakdown, or final summary until the report is `APPROVED`. Don't surface
  mid-cycle scores in the attorney UI/API.
- **Auth:** JWT bearer tokens, 8h expiry, stored in `localStorage`. There are no refresh
  tokens or revocation — by design for v1.
- **Schema changes use `prisma db push`, not `prisma migrate`.** There is no migration
  history. After editing `backend/prisma/schema.prisma`, run `npm run db:push` (or
  `npm run db:reset` to wipe + reseed). Adopt `prisma migrate` only if asked.
- **No test suite exists.** "Verification" today = `node --check` on backend files, the Vite
  bundle building cleanly, and a live smoke: boot the backend, log in as a seeded user
  (e.g. `t.dlamini@mostoeneng.law` / `Password123!`) for a JWT, then `curl` the endpoint
  (the local DB is seeded). For import-resolution use
  `node --input-type=module -e "await import('./src/routes/x.js')"`. Don't claim tests pass.
- **Windows dev gotcha:** the backend binds `:4000` and only one instance can. Git Bash
  `kill`/`pkill` do **not** reliably stop a backgrounded `node` on Windows (this caused
  `EADDRINUSE` for the user). Free the port with PowerShell:
  `Get-NetTCPConnection -LocalPort 4000 -State Listen | %{ Stop-Process -Id $_.OwningProcess -Force }`.
- **Secrets:** `.env` files are gitignored (see `.gitignore`, hardened to exclude all
  `.env*` except `.env.example`). Never commit real `DATABASE_URL` / `JWT_SECRET`.

## AI layer & newer capabilities

- **AI is optional and server-side.** `backend/src/lib/ai/*` calls the Anthropic SDK;
  `aiEnabled()` gates everything on `AI_ENABLED !== "false"` + `ANTHROPIC_API_KEY`. When off,
  AI routes return `{ aiEnabled: false }` (HTTP 200) and the UI degrades — never assume AI is
  available. Key lives in `backend/.env` (gitignored) and must never reach the frontend.
- **Tiered model routing (`ai/client.js`).** Each task uses the right model instead of one
  model for everything: `model("fast")` → Haiku (`claude-haiku-4-5-20251001`, bias/quality
  check), `model("balanced")` → Sonnet (`claude-sonnet-4-6`, review organizer),
  `model("deep")` → Opus (`claude-opus-4-8`, report draft + attorney memory). Each tier is
  overridable via `AI_MODEL_FAST/BALANCED/DEEP`; setting `AI_MODEL` pins ALL tiers to one
  model (legacy escape hatch). `logRun({..., model})` records the actual model used per call,
  and `models()` feeds the tier map to `/api/ai/status` for the top-bar chip. When adding an
  AI feature, pick a tier deliberately and pass its model into `logRun`.
- **Features:** Review Organizer, Bias & Quality Check, Report Draft Assistant, Attorney
  Memory (auto-refreshed on `APPROVED`), and **Team Briefing** (`POST /api/ai/briefing`,
  manager/admin — a ranked situational read of in-flight reviews shown atop the manager
  dashboard; `lib/ai/briefing.js`, Sonnet/`balanced`, reuses the dashboard's review scoping +
  scoring helpers). All outputs are AI-labelled, advisory, never auto-finalized; every call
  writes an `AiRun` audit row.
- **Individual Development Plan (IDP):** `GET /api/ai/attorneys/:id/development-plan`
  (`lib/ai/developmentPlan.js`, Opus/`deep`) generates a kind, growth-oriented plan — opening
  note, strengths to build on, growth areas with concrete actions, suggested goals,
  encouragement — from the attorney's memory + latest **approved** competency breakdown +
  goals. Readable by the attorney themselves, their manager, or admin (`canSeeMemory`); built
  only from approved data so it respects the mid-cycle visibility rule. Shown on
  `AttorneyDashboard` and downloadable as a letterhead PDF (`pdf/DevelopmentPlan.jsx`). The
  tone is deliberately developmental, never judgemental — the PMS is meant to help, not just grade.
- **Privacy/POPIA:** AI sends review text to Anthropic. Documented in README/ARCHITECTURE;
  `AI_ENABLED="false"` ships it off.
- **Notifications:** `Notification` rows written by `backend/src/lib/notify.js` on launch +
  state changes; surfaced via the top-bar bell and an SLA nudge banner. In-app only.
- **PDF export:** client-side `@react-pdf/renderer` in `frontend/src/pdf/` (review, annual,
  client, team-snapshot) on the "Counsel" letterhead; `download.js` triggers on click.

## Feature stages (2–6, built on top of v1)

A staged roadmap layered onto the v1 above. All are live; schema changes ship via `prisma db push`
(no migrations), so after pulling, run `npm run db:push && npm run db:seed` once. Each stage was
verified on the real Windows FS (`prisma validate`, `node --check`, `esbuild`).

- **Stage 2 — Social/support raters.** `SUPPORT` staff (paralegals/secretaries/typists) may rate
  only **social/soft** competencies = the `Behavioural` category. Single source of truth:
  `backend/src/lib/competencies.js` (`SOCIAL_CATEGORIES`, `isSocialCompetency`, `socialCategoryWhere`).
  Enforcement is **capability-based** (`capabilitiesForUser().socialRaterOnly`), not role-enum:
  `GET /api/feedback/request/:id` filters the framework + returns `socialOnly`; `POST` 403s any
  non-social rating. `ReviewerRole.SUPPORT` (source weight 0.7) is in the live `build360` fan-out
  (same practice group, cap 2). UI: `.rater-note` on FeedbackForm; `sourceLabel.SUPPORT`.

- **Stage 3 — Goals/OKRs.** `Goal` = an objective; `KeyResult` (new model, `progress` 0–100) rolls
  up to objective progress (avg, computed in-route, not stored). `Goal.createdById` ≠ ownerId ⇒
  manager-assigned. `routes/goals.js` (`/api/goals`): objective + key-result CRUD, authz via
  `canManageGoalsFor` (owner / their manager / admin). UI: reusable `components/Goals.jsx` on the
  attorney dashboard and `ReviewDetail` (manager can assign, linked via `reviewId`); IDP
  `suggestedGoals` got an "Add to goals" button.

- **Stage 4 — Continuous feedback & 1:1s.** `ContinuousFeedback` (author, recipient,
  `FeedbackKind` PRAISE|NOTE, body) — visible to recipient + their manager + author + admin
  (`canViewPerson`); no anonymous notes. `OneOnOne` (manager, report, heldOn, shared `notes`) —
  manager/admin maintains, shared-read with the report (`canManageOneOnOne`). `routes/continuous.js`
  (`/api/continuous`). UI: `RecognitionPanel.jsx` + `OneOnOnes.jsx` on the attorney dashboard and
  ReviewDetail. Both notify the recipient.

- **Stage 5 — Cadence, reminders, digests.** `routes/cadence.js` (`/api/cadence`): `GET /calendar`
  (cycles + live completion/SLA), `POST /remind` (manager/admin; writes `FEEDBACK_REMINDER`
  notifications), `GET /digest`, `POST /digest/email`. Logic in `lib/reminders.js`; email via the
  `lib/email.js` seam — **log-only** (no transport) unless `EMAIL_ENABLED=true` + a transport is
  added in `deliver()`. `scripts/reminders.js` + `npm run reminders` is a cron-ready sweep (schedule
  via Windows Task Scheduler). UI: `pages/Cadence.jsx` (timeline), `components/DigestCard.jsx`,
  "Send reminders"/"Remind pending" buttons, `pages/Notifications.jsx`.

- **Stage 6 — UX polish.** AI Briefing auto-loads on the manager dashboard. Global command bar
  (`components/CommandBar.jsx`, ⌘K) backed by `routes/search.js` (`/api/search` — role-scoped people
  + reviews) plus page nav. Richer `Empty` component (icon + action). Firm-wide trends
  (`GET /api/dashboard/trends`) shown atop the Departments page.

## Where to read more

`docs/DATA_MODEL.md` (entity rationale), `docs/CADENCE.md` (launch/SLA rules),
`docs/ARCHITECTURE.md` (layers, auth, hardening list), `HANDOVER.md` (decisions + open
questions). When changing review-state or scoring logic, re-read CADENCE + DATA_MODEL first.
