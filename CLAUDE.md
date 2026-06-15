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

- **Roles:** `ADMIN`, `MANAGER`, `ATTORNEY`, `CLIENT`. The 360 feedback *sources* are a
  separate enum: `SELF`, `MANAGER`, `PEER`, `SUBORDINATE`, `CLIENT`.
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
- **No test suite exists.** "Verification" today = `node --check` on backend files and the
  Vite bundle building cleanly. Don't claim tests pass.
- **Secrets:** `.env` files are gitignored (see `.gitignore`, hardened to exclude all
  `.env*` except `.env.example`). Never commit real `DATABASE_URL` / `JWT_SECRET`.

## Where to read more

`docs/DATA_MODEL.md` (entity rationale), `docs/CADENCE.md` (launch/SLA rules),
`docs/ARCHITECTURE.md` (layers, auth, hardening list), `HANDOVER.md` (decisions + open
questions). When changing review-state or scoring logic, re-read CADENCE + DATA_MODEL first.
