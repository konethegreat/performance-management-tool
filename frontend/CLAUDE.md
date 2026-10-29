# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Frontend for Mostoeneng PMS — a React 18 + Vite SPA. See the root `../CLAUDE.md` for the
domain model (roles, review lifecycle, scoring, the launch button). This file covers the
client app specifically.

## Stack & commands

React 18, React Router v6, Vite 5. **No TypeScript, no CSS framework, no state library** —
plain `.jsx`, `fetch`, React context, and one hand-written `styles.css`.

```bash
npm run dev       # vite dev server → http://localhost:5173
npm run build     # vite build (esbuild; production bundle)
npm run preview   # serve the built bundle
```

`vite.config.js` proxies `/api` → `http://localhost:4000`, so the backend must be running
for anything beyond the login screen to work. There is no lint or test step.

## Architecture

```
src/main.jsx              Mounts <App/> inside <AuthProvider> + <BrowserRouter>
src/App.jsx               All routes; Home redirects by role; <Protected roles={...}> gate
src/context/AuthContext.jsx   useAuth(): { user, loading, login, logout }; restores session via /auth/me
src/api/client.js         api.get/post/patch — fetch wrapper; attaches Bearer token; throws Error(data.error)
src/components/Layout.jsx Full-bleed app shell: fixed green left icon-rail + slim top bar + <Outlet/>
src/components/ui.jsx     Presentational helpers: StatusPill, ScoreBadge, Bar, ProgressRing, Stat, sourceLabel
src/pages/*.jsx           One page per route (see below)
src/styles.css            All styling (class-based; pill/score/bar tones live here)
```

### Routing & role homes (`App.jsx`)
- `Home` redirects: ADMIN/MANAGER → `/manager`, ATTORNEY → `/me`, SUPPORT → `/feedback`, CLIENT → `/client`.
- **Sign-up:** `/register` (`pages/Register.jsx`) fetches `/auth/positions` and posts to
  `/auth/register`; `useAuth().register(payload)` mirrors `login`. The chosen position derives
  the tier server-side. `user.capabilities` (from the auth payload) is the preferred gate for
  capability-specific UI; `user.position` is the catalog key, `user.title` the human label.
- `<Protected roles={[...]}>` blocks render until `auth.loading` resolves, redirects to
  `/login` if unauthenticated, and shows a no-access message if the role doesn't match.
- Pages: `ManagerDashboard` (`/manager`), `DepartmentDashboard` (`/departments`, ADMIN/MANAGER —
  practice-group KPIs + firm-wide trends), `AttorneyDashboard` (`/me`), `ClientPortal` (`/client`),
  `MyFeedback` (`/feedback`), `FeedbackForm` (`/feedback/:requestId`), `ReviewDetail` (`/reviews/:id`),
  `Cadence` (`/cadence`, ADMIN/MANAGER), `Notifications` (`/notifications`), `Admin` (`/admin`), `Login`.

## Conventions to follow when adding/editing pages

- **Data fetching pattern** (used by every page): local `useState` for `data`/`err`, a
  `load()` that calls `api.get(...)`, `useEffect(load, [])`, then render
  `if (err) ... if (!data) <loading> ...`. There is no shared data cache — copy this shape.
- **API calls** always go through `src/api/client.js` (`api.get/post/patch`). It reads the
  JWT from `localStorage` (`pms_token`), prefixes `/api`, and on a 401 clears the token.
  Throw paths surface `data.error` from the backend — display `e.message`.
- **Auth** comes from `useAuth()`; never read the token directly in a component.
- **Presentational tone helpers** live in `ui.jsx` and map values to CSS classes
  (`StatusPill` status→label/color, `ScoreBadge`/`Bar` score→green/amber/red). Reuse them
  instead of re-deriving colors; add new shared widgets there, not inline.
- **Styling** is plain CSS classes in `styles.css` — no CSS modules, Tailwind, or inline
  design systems. Match existing class names (`card`, `stat`, `pill`, `btn`, `grid-2`).
- **App shell:** `Layout.jsx` renders a Zoho-style full-bleed layout — a fixed full-height
  green icon-rail (`.rail` / `.rail-item`, role-based nav with inline SVG icons), a slim top
  bar (`.shell-top`: AI chip + bell + user chip), and a `.shell-main` content area that fills
  the page. Page components render inside `.shell-main`; don't reintroduce the old centered
  `.container`.
- **Theme:** Editorial Chambers (warm paper, serif headings, mono figures) with **Motsoeneng
  Bill green** as the primary accent. Green lives in `--brand`/`--brand-deep`/`--brand-soft`
  and the rail palette (`--rail-bg` etc.); the legacy `--brass*` tokens are aliased to the
  green ones, so accent color flows through existing classes — don't hardcode hex, use tokens.
  User-facing brand name is **"Motsoeneng Bill"** (the repo/DB/emails keep the `mostoeneng`
  identifier; don't rename those without an explicit migration).
- **AI status chip** (`AiStatusChip.jsx`) reflects tiered routing: it shows the active tier
  models (Haiku · Sonnet · Opus) from `/api/ai/status` `models`, or a single pinned model.

## AI, notifications, PDF (added capabilities)

- **AI affordances** are gated on `useAiStatus()` (`src/hooks/useAiStatus.js`, fetches
  `/api/ai/status` once, module-cached). Only render AI buttons when `aiEnabled`, and handle
  the `{ aiEnabled: false }` response from AI POSTs (show a toast/note, don't crash). AI
  output is shown with `<AiBadge/>` and is always presented as editable/assistive.
  - Review Organizer + "Draft with AI" + Attorney Memory panel live in `pages/ReviewDetail.jsx`.
  - Bias & Quality Check lives in `pages/FeedbackForm.jsx`.
  - **AI Briefing** (`components/AiBriefing.jsx`) sits atop `ManagerDashboard`; it POSTs
    `/ai/briefing` and renders a headline + ranked priorities (urgency pills) + watch list.
    Gated on `aiEnabled`, degrades on empty/off; styled with `.ai-panel.briefing`.
- **Toasts:** `useToast()` from `components/Toast.jsx` (provider wraps the app in `main.jsx`).
  Use for action feedback. `Skeleton`/`SkeletonCard` and `Empty` are the loading/empty primitives.
- **Notifications:** `components/NotificationsBell.jsx` polls `/api/notifications` every 30s;
  it's mounted in `Layout`. SLA nudge banner is on `ManagerDashboard`.
- **Individual Development Plan** (`components/DevelopmentPlan.jsx`) sits on `AttorneyDashboard`
  (attorney's own, `self`); reusable for managers by passing `attorneyId`. GETs
  `/ai/attorneys/:id/development-plan`, renders a kind plan, and downloads `pdf/DevelopmentPlan.jsx`.
- **PDF export:** `src/pdf/` templates (`@react-pdf/renderer`) + `pdf/download.js`
  (`downloadPdf(<Doc/>, filename)`); call it on click, fetching data first if needed. Note
  react-pdf is heavy and lands in the main bundle (the 500 kB build warning is expected).
- **Admin** (`pages/Admin.jsx`, route `/admin`, ADMIN-only) manages cycles + views competencies.

## Home overview widgets (Zoho-style)

- `components/OverviewHeader.jsx` (greeting + daily quote + weather), `WeekSchedule.jsx`
  (week strip with weekends/holidays), `ActivityFeed.jsx` (recent events), and `Avatar.jsx`
  compose the home overview on the role dashboards. Data comes from `/api/widgets/*` and
  `/api/activity` (cached/proxied server-side).
- `AiStatusChip.jsx` (top bar) shows whether AI is active and which model, via `useAiStatus()`.
- **`Avatar.jsx` hashes its seed (SHA-256 + salt) before calling DiceBear** — never pass a raw
  name/id expecting it to be sent in the clear; the hash keeps PII off the third party (POPIA),
  with a monogram fallback when offline.

## Feature-stage UI (Stages 2–6 — see ../CLAUDE.md for the why)

- **Stage 2 (social raters):** FeedbackForm honours `socialOnly` from the API (renders only social
  competencies for SUPPORT raters) + a `.rater-note`; `sourceLabel.SUPPORT`.
- **Stage 3 (OKRs):** `components/Goals.jsx` (reusable objective/key-result panel, `canManage` gate)
  on AttorneyDashboard + ReviewDetail; goal statuses added to `StatusPill`; `api.del` added to the client.
- **Stage 4 (continuous feedback + 1:1s):** `components/RecognitionPanel.jsx` (praise/notes — colleague
  picker in self mode, fixed recipient on a review) + `components/OneOnOnes.jsx` (shared 1:1 notes),
  on AttorneyDashboard + ReviewDetail.
- **Stage 5 (cadence/reminders/digests):** `components/DigestCard.jsx` (owed feedback + recognition +
  "email it to me") on both dashboards; "Send reminders"/"Remind pending" buttons; `pages/Cadence.jsx`
  (cycle timeline); `pages/Notifications.jsx` (+ a "See all" link in `NotificationsBell`).
- **Stage 6 (polish):** `components/CommandBar.jsx` (⌘K palette over role pages + `/api/search`,
  mounted once in `Layout` with a top-bar search trigger that dispatches an `open-cmdk` window event);
  AI Briefing auto-loads on mount; `Empty` gained an icon + action slot; firm-wide trends card on
  DepartmentDashboard (`/api/dashboard/trends`).
- **Rail nav / routes:** Cadence (`calendar` icon, MANAGER/ADMIN) added to `Layout`; `App.jsx` routes
  `/cadence` (MANAGER/ADMIN) and `/notifications` (any authed).

## Mind the backend visibility rules

The server hides an attorney's scores, competency breakdown, and final summary until the
report is `APPROVED`, and returns the review `analytics` block as `null` for non-privileged
viewers. The UI must tolerate these nulls (e.g. AttorneyDashboard only renders `byCompetency`
/ `overallScore` / `finalSummary` when `status === "APPROVED"`). Don't assume scores are
present — guard on status and null before rendering.
