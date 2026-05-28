# Mostoeneng PMS — Project Handover

> Compact handover for moving context into Claude Projects.

## Context

Building an institution-wide HR/performance management system for **Mostoeneng** (rebranded law firm transitioning to a tech/AI provider). Client: HR head. User is **Kone** (erictshivhinda@gmail.com), reviewing in VS Code.

## Decisions locked in

- **Stack:** React 18 + Vite + React Router (frontend), Node/Express + Prisma (backend), PostgreSQL
- **Scope:** Full-stack working app with seed data
- **Cadence:** 360° feedback + quarterly cycles + annual rollup (industry standard for pro-services)
- **Client feedback:** Full client portal with login
- **Database:** Local Postgres via pgAdmin4 (not Docker). Connection string in `backend/.env` (gitignored).

## What's been built

Project lives at `C:\Users\Kone\Pulse\mostoeneng-pms\`

```
mostoeneng-pms/
├─ README.md                       Run instructions, seeded logins
├─ docker-compose.yml              (optional, not used)
├─ .gitignore                      Hardened, excludes all .env*
├─ docs/
│  ├─ ARCHITECTURE.md              Layers, auth, flows, hardening punch list
│  ├─ DATA_MODEL.md                Entity-by-entity rationale
│  └─ CADENCE.md                   Launch button + SLA rules
├─ backend/
│  ├─ .env                         Real secrets (gitignored)
│  ├─ .gitignore                   Defence-in-depth
│  ├─ package.json                 Express, Prisma, JWT, bcrypt
│  ├─ prisma/
│  │  ├─ schema.prisma             Full data model
│  │  └─ seed.js                   Firm + Q1 approved + Q2 in-flight
│  └─ src/
│     ├─ server.js
│     ├─ lib/{prisma,scoring}.js   Weighted scoring + cycle-time analytics
│     ├─ middleware/auth.js        JWT + requireRole
│     └─ routes/{auth,users,cycles,reviews,feedback,dashboard}.js
└─ frontend/
   ├─ package.json, vite.config.js, index.html
   └─ src/
      ├─ main.jsx, App.jsx, styles.css
      ├─ api/client.js             Fetch wrapper with JWT
      ├─ context/AuthContext.jsx
      ├─ components/{Layout,ui}.jsx
      └─ pages/{Login,ManagerDashboard,AttorneyDashboard,
                ClientPortal,MyFeedback,FeedbackForm,ReviewDetail}.jsx
```

## Core model

- **Roles:** ADMIN, MANAGER, ATTORNEY, CLIENT
- **Lifecycle:** `NOT_STARTED → LAUNCHED → DRAFT → IN_REVIEW → FINALIZED → APPROVED`
- **Launch button:** stamps `launchedAt`, fans out 360° `FeedbackRequest`s, anchors all SLA/cycle-time analytics
- **Scoring:** weighted by `competency.weight × response.sourceWeight` (Manager 1.5, Client 0.9, Peer 1.0, Subordinate 1.0, Self 0.8)
- **Rollup:** annual `ReviewCycle` is parent of four quarterly `children`; `/api/dashboard/rollup/:attorneyId/:annualCycleId` averages approved quarters
- **Audit:** every state transition writes a `ReportEvent`

## Seeded logins (password `Password123!`)

| Role | Email |
|---|---|
| Admin | admin@mostoeneng.law |
| Manager | t.dlamini@mostoeneng.law |
| Attorney | n.khumalo@mostoeneng.law |
| Attorney (mid-cycle) | s.naidoo@mostoeneng.law |
| Client | client@acme-holdings.com |

## Run order

```bash
cd backend
npm install
npm run db:push        # creates tables in mostoeneng_pms
npm run db:seed
npm run dev            # API on :4000

cd ../frontend
npm install
npm run dev            # SPA on :5173 (proxies /api to :4000)
```

## Verification status

- Backend: all `.js` files pass `node --check`
- Frontend: bundles cleanly via esbuild (50 KB)
- Prisma schema: not run-validated in sandbox (binary CDN blocked) — validates on Kone's machine

## Open questions raised, not yet answered

1. Should source/competency weights be tunable in admin UI, or stay as config?
2. Should attorneys see mid-cycle scores or wait for Approved? (currently: wait)
3. Client-to-attorney matching — currently any-client; real wiring needs matter data
4. What does the formal **annual report** contain beyond avg score + quarterly summaries (promotion rec? comp band? narrative)?

## Suggested next features

- Email/Teams reminders driven off `launchedAt + slaDays`
- PDF export of final report
- Microsoft 365 SSO
- Notifications when a review changes state
- Admin UI for cycle creation and competency framework editing
