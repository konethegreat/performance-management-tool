# Mostoeneng — Attorney Performance Management System (PMS)

A 360°, institution-wide performance management platform for a professional-services
(legal) firm. Attorneys **launch** a review cycle; managers, peers, subordinates,
clients and the attorney themselves contribute feedback; managers draft, finalize and
approve reports; quarterly approved reports roll up into an end-of-year report.

Built by the AI development team as a reviewable, runnable v1.

---

## Stack

| Layer    | Tech                                            |
|----------|-------------------------------------------------|
| Frontend | React 18 + Vite + React Router                  |
| Backend  | Node.js + Express                               |
| Database | PostgreSQL (via Prisma ORM)                     |
| Auth     | JWT (access tokens) + bcrypt password hashing   |

```
mostoeneng-pms/
├─ backend/         Express API + Prisma schema + seed
├─ frontend/        React + Vite SPA
├─ docker-compose.yml   Postgres for local dev
└─ docs/            Architecture, data model, cadence rationale
```

---

## Quick start

You need **Node 18+** and **Docker** (for Postgres). If you already run Postgres
locally, skip Docker and just point `DATABASE_URL` at your instance.

```bash
# 1. Start Postgres
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env          # adjust if needed
npm install
npm run db:push               # create tables from schema
npm run db:seed               # load realistic sample data
npm run dev                   # API on http://localhost:4000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                   # app on http://localhost:5173
```

Open http://localhost:5173 and log in with one of the seeded accounts below.

---

## Seeded logins (password for all: `Password123!`)

| Role      | Email                          | What they see                              |
|-----------|--------------------------------|--------------------------------------------|
| Admin     | admin@mostoeneng.law            | Everything + cycle management              |
| Manager   | t.dlamini@mostoeneng.law        | Team dashboard, draft/approve reports      |
| Attorney  | n.khumalo@mostoeneng.law        | Own dashboard, launch button, self-review  |
| Attorney  | s.naidoo@mostoeneng.law         | Own dashboard (mid-cycle, partial feedback)|
| Client    | client@acme-holdings.com       | Client portal: feedback they owe           |

---

## The "launch button" model

An attorney opens a review by pressing **Launch Review**. At that instant the system:

1. stamps `launchedAt`,
2. creates 360° feedback requests (manager, peers, subordinates, client, self),
3. begins tracking **elapsed time** and **completion rate** against the firm's cadence SLA.

Everything downstream — reminders, completion %, cycle-time analytics — is measured
from that timestamp. See `docs/CADENCE.md` for the industry-standard cadence we adopted.

---

## Report lifecycle

```
DRAFT ──submit──▶ IN_REVIEW ──finalize──▶ FINALIZED ──approve──▶ APPROVED
  ▲                                                                  │
  └────────────────────── (manager can send back) ◀─────────────────┘
```

Approved quarterly reports are immutable and feed the **annual rollup**.

See `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md` for the full design.
