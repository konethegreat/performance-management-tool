# Architecture

## Overview

```
┌──────────────┐     HTTPS/JSON      ┌──────────────────┐     SQL      ┌────────────┐
│  React SPA   │ ───────────────────▶│  Express API     │ ────────────▶│ PostgreSQL │
│  (Vite)      │   Bearer JWT         │  (Prisma ORM)    │   Prisma     │            │
└──────────────┘                      └──────────────────┘              └────────────┘
   dashboards                            auth · routes ·                  relational
   role-based UI                         scoring · audit                  model
```

Two independently runnable apps plus a database. The frontend talks to the backend
only through the `/api/*` HTTP surface, so either side can be swapped or deployed
separately.

## Backend layers

| Layer        | Files                         | Responsibility                                  |
|--------------|-------------------------------|-------------------------------------------------|
| Entry        | `src/server.js`               | Express app, CORS, JSON, route mounting         |
| Auth         | `src/middleware/auth.js`      | JWT sign/verify, `requireAuth`, `requireRole`   |
| Routes       | `src/routes/*.js`             | HTTP handlers, validation, authorization checks |
| Domain logic | `src/lib/scoring.js`          | Weighted scoring, completion rate, cycle time   |
| Data         | `src/lib/prisma.js` + schema  | Prisma client + the relational model            |

## Authorization model

Every protected route runs `requireAuth` (validates the JWT) and the sensitive ones
add `requireRole(...)`. Beyond role gates, the reviews routes do **row-level** checks:

- A `MANAGER` can only act on reviews where `review.managerId === user.id`.
- An `ATTORNEY` only sees reviews where they are the subject — and detailed scores stay
  hidden until the report is `APPROVED`.
- A reviewer (peer/client/subordinate) can open a review skeleton but the `analytics`
  block (scores by competency/source) is returned as `null` unless they are the manager,
  the subject, or an admin.

## Key flows

### Launch (the "launch button")
`POST /api/reviews/launch { cycleId }`
1. Finds/creates the attorney's `PerformanceReview` for that cycle.
2. Builds the 360 reviewer list (`build360`): self, manager, up to 3 peers in the same
   practice group, subordinates, and a client.
3. Creates one `FeedbackRequest` per reviewer.
4. Stamps `launchedAt` and sets status `LAUNCHED`, then writes a `ReportEvent`.

### Feedback collection
Each reviewer submits via `POST /api/feedback/request/:id` — a set of 1–5 ratings across
the competency framework plus free-text strengths/improvements. On submit, the request
flips to `SUBMITTED`, which moves the completion rate.

### Report lifecycle
`DRAFT → IN_REVIEW → FINALIZED → APPROVED`, each transition guarded server-side and
recorded in the audit trail. Finalizing recomputes and persists the composite score.
Approved reports are immutable and feed the annual rollup.

## Scoring

Composite score = weighted mean of every rating, where each rating's weight is
`competency.weight × response.sourceWeight`. This encodes two firm policies in one
number: which competencies matter most (e.g. Ethics > Business Development) and which
voices carry most weight (e.g. Manager > a single Peer). See `src/lib/scoring.js`.

## What a production hardening pass would add

This is a faithful, runnable v1. Before going live a firm would want:

- Refresh tokens + token revocation, password reset, SSO (most firms use Microsoft 365).
- Rate limiting, request logging to a store, and structured error tracking.
- Email/Teams notifications and reminders driven off `launchedAt` + `slaDays`.
- A proper migration history (`prisma migrate`) instead of `db push`.
- Tenanting if the platform serves multiple offices/entities.
- POPIA/GDPR controls: data-subject export, retention windows, and field-level access
  logging (performance data is sensitive personal information).
- Tests (the route logic is structured to be unit-testable; see `docs/CADENCE.md` for the
  SLA rules worth covering first).
