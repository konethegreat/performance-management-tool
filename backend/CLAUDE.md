# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Backend for Mostoeneng PMS. See the root `../CLAUDE.md` for the domain model (roles,
review lifecycle, launch button, scoring weights, annual rollup). This file covers the
API layer specifically.

## Stack & commands

Node.js + Express (ESM — `"type": "module"`, use `import`), Prisma ORM, PostgreSQL, JWT
auth (`jsonwebtoken`), `bcryptjs`, `zod` (available; validation is mostly hand-rolled).

```bash
npm run dev        # node --watch src/server.js  → http://localhost:4000
npm run start      # production start (no watch)
npm run db:push    # apply prisma/schema.prisma to the DB (NO migration history)
npm run db:seed    # node prisma/seed.js — wipes & reseeds the firm
npm run db:reset   # prisma db push --force-reset && reseed (nuke everything)
npm run db:studio  # Prisma Studio GUI
```

There is no lint step and no automated test suite. To smoke-check syntax: `node --check src/**/*.js`.
Health check: `GET /api/health`.

## Layout & layering

```
src/server.js              Express app: CORS, JSON, morgan, mounts /api/* routers, error handler
src/middleware/auth.js     signToken, requireAuth (verifies Bearer JWT → req.user), requireRole(...)
src/routes/*.js            HTTP handlers + validation + authorization (auth, users, cycles,
                           reviews, feedback, dashboard)
src/lib/scoring.js         Pure functions: computeOverallScore, competencyBreakdown,
                           bySourceBreakdown, completionRate, cycleTime
src/lib/prisma.js          Singleton PrismaClient
prisma/schema.prisma       The full relational model (read this first for any data change)
prisma/seed.js             8-competency framework + group + users + Q1 APPROVED + Q2 in-flight
```

`reviews.js` is the heart of the system and worth reading in full before touching review
flow — it owns `launch`, the `transition()` factory (submit/finalize/approve), `send-back`,
`build360()`, and `refreshScore()`.

## Authorization is two-layered — preserve both

1. **Route gate:** `requireAuth` on every protected route; `requireRole(...)` on
   privileged ones (e.g. only ADMIN creates cycles; only MANAGER/ADMIN draft/transition).
2. **Row-level checks inside handlers**, which the role gate does NOT cover:
   - A `MANAGER` may only act on reviews where `review.managerId === user.id`
     (ADMIN bypasses). See `canView()` and the per-handler `managerId` checks.
   - Reviewers (peer/client/subordinate) can fetch a review *skeleton*, but the
     `analytics` block is returned `null` unless caller is the subject, owning manager,
     or admin. See the `privileged` flag in `GET /api/reviews/:id`.
   - The attorney (subject) does not get scores/summary until status is `APPROVED`
     (enforced in `dashboard.js` `/attorney`, not just the client).

When adding endpoints that expose review or feedback data, replicate this pattern — a
role gate alone is not sufficient.

## Things that will bite you

- **`prisma db push`, not migrations.** No `prisma/migrations/` history exists. Edit
  `schema.prisma` then `npm run db:push`; use `db:reset` when the schema diverges.
- **Source weights live in two places.** Composite-score source weights are applied at
  *submit* time in `routes/feedback.js` (`SOURCE_WEIGHT`) and persisted onto
  `FeedbackResponse.sourceWeight`; `lib/scoring.js` then reads that stored value. Changing
  the policy means changing the map AND re-submitting/reseeding to repersist it.
- **Score is denormalized.** `PerformanceReview.overallScore` is a cached value written by
  `refreshScore()` on draft-save and finalize — it is not recomputed on every read. If you
  change scoring math, call `refreshScore()` (or reseed) or stored scores go stale.
- **`build360()` reviewer selection is heuristic/demo-grade:** self, manager, up to 3 peers
  in the same practice group, up to 3 subordinates, and the *first active client* (real
  client↔attorney matching needs matter data — see HANDOVER open questions).
- **Uniqueness constraints** to respect: one review per `(subjectId, cycleId)`; one request
  per `(reviewId, reviewerId, reviewerRole)`; one rating per `(responseId, competencyId)`.
  `launch` and feedback-submit use `upsert`/replace to stay idempotent.
- **Env:** `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `CLIENT_ORIGIN`
  (see `.env.example`). `.env` is gitignored; never commit it.
