# Settings Tab — AI Configuration (Design)

> Sub-project A of the Zoho-style pass. Date: 2026-06-17. Status: approved for spec review.

## Goal

Give an ADMIN a **Settings** tab to switch the single global Claude model used by all AI
features at runtime, and to see at a glance whether the Anthropic API key is configured —
without ever editing or exposing the key.

## Scope (locked decisions)

- **Model switching is a single global model** — one dropdown sets the model for every AI
  feature at once. It overrides the `AI_MODEL` env default at runtime and persists across
  restarts.
- **The API key stays in `backend/.env`.** The UI shows only key *status* (present / not
  configured). It never reads, edits, displays, or transmits the key value.
- **ADMIN only.** Mirrors the existing `/admin` route gating.

### Out of scope (YAGNI)

- Editing the API key from the UI.
- Per-feature / per-task model selection (global only).
- Editing any other env var from the UI.
- A general settings framework beyond what this needs (the `AppSetting` table is generic but
  only `ai.model` is used now).

## Security requirements (must hold)

The app sends user-written review text to Anthropic, so prompt injection is in scope. The key
must be protected by construction:

1. **Key never enters a prompt.** The Anthropic SDK reads `ANTHROPIC_API_KEY` from the
   environment and uses it only as the HTTP `x-api-key` header; it is never placed in message
   content. A prompt injection in feedback/review text therefore cannot make the model reveal
   a key it was never shown.
2. **No exfiltration channel.** All AI calls are plain text-in/text-out (`messages.parse`,
   `messages.stream`) with **no tool use**. A hijacked model can only emit text that a human
   reviews; there is no mechanism for it to send a secret anywhere. Do not add tools/function
   calling to these AI features without revisiting this.
3. **Key never crosses the API boundary.** `GET /api/settings/ai` returns an explicitly
   constructed, whitelisted object. No endpoint spreads `process.env`, returns the raw
   `AppSetting` row verbatim, or includes the key. `keyPresent` is a boolean derived from
   `!!process.env.ANTHROPIC_API_KEY`.
4. **Logging hygiene.** The key is never logged. `logRun` records `model()`, not the key.
   Error handlers log `e.message` only — never full request objects, headers, or env dumps.
5. **Allowlist on write.** `PATCH /api/settings/ai` accepts only a model ID from a fixed
   allowlist; any other value is rejected with 400. This prevents typos breaking live AI calls
   and prevents arbitrary strings from flowing into config.

## Architecture

### Storage: generic `AppSetting` key/value table + in-memory cache

Chosen over in-memory-only (loses the choice on restart) and a JSON file (off-convention).
A single small Prisma table persists the override; an in-memory cache keeps `model()`
**synchronous**, so none of the 6 existing `model()` call sites or the `AiRun.model` audit
field change.

```prisma
model AppSetting {
  key         String   @id          // e.g. "ai.model"
  value       String
  updatedAt   DateTime @updatedAt
  updatedById String?
}
```

Applied with `npm run db:push` (no migration history in this project, per convention).

### New module: `backend/src/lib/settings.js` (isolated config logic)

Keeps `client.js` focused. Public surface:

- `loadSettings()` — async; reads the `ai.model` row into the module cache. Called once at
  startup from `server.js` before `listen` (best-effort: on DB error, log and fall back to env
  so the API still boots).
- `getModelOverride()` — sync; returns the cached model ID or `null`.
- `setModelOverride(modelId, actorId)` — async; validates `modelId` against the allowlist,
  upserts the `ai.model` row, updates the cache, returns the new effective state. Throws on an
  invalid model (caught by the route → 400).
- `ALLOWED_MODELS` — the allowlist (id + label), exported for the route and reused by the
  frontend via the GET response.

**Allowlist:**

| Label | Model ID |
|---|---|
| Opus 4.8 | `claude-opus-4-8` |
| Sonnet 4.6 | `claude-sonnet-4-6` |
| Haiku 4.5 | `claude-haiku-4-5-20251001` |

### Change to `backend/src/lib/ai/client.js`

`model()` becomes:

```js
import { getModelOverride } from "../settings.js";
export function model() {
  return getModelOverride() || process.env.AI_MODEL || "claude-opus-4-8";
}
```

Single line of real change. Every AI feature and the top-bar chip pick up the new model
automatically because they all call `model()` (directly or via `/api/ai/status`).

### New route: `backend/src/routes/settings.js` → mounted `/api/settings`

Both endpoints `requireAuth` + `requireRole("ADMIN")`.

- `GET /api/settings/ai` →
  ```json
  {
    "keyPresent": true,
    "aiEnabled": true,
    "model": "claude-opus-4-8",
    "overridden": false,
    "envDefault": "claude-opus-4-8",
    "allowed": [{ "id": "claude-opus-4-8", "label": "Opus 4.8" }, ...]
  }
  ```
  - `keyPresent` = `!!process.env.ANTHROPIC_API_KEY`
  - `aiEnabled` = `aiEnabled()`
  - `model` = current effective `model()`
  - `overridden` = `getModelOverride() != null`
  - `envDefault` = `process.env.AI_MODEL || "claude-opus-4-8"`
  - Object is built field-by-field — never a spread of env or the DB row.
- `PATCH /api/settings/ai` body `{ "model": "<id>" }` → validates against the allowlist,
  `setModelOverride(model, req.user.id)`, returns the same shape as GET. Invalid id → 400.

Mounted in `server.js` alongside the other routers; `loadSettings()` awaited before `listen`.

### Frontend

- **Route + nav:** add `/settings` to `App.jsx` (`<Protected roles={["ADMIN"]}>`) and a
  "Settings" link in `Layout.jsx`, ADMIN-only, mirroring the existing `/admin` entry.
- **Page:** `frontend/src/pages/Settings.jsx`, following the established page shape
  (local `useState` for data/err, `load()` calling `api.get("/settings/ai")`, `useEffect`,
  loading/error guards) and the `card` / `admin-form` styling already in `styles.css`.

  ```
  Settings
  AI configuration
  ┌─────────────────────────────────────────────┐
  │ API key      ● Present (from backend/.env)   │
  │ AI status    ● Active                        │
  │ Model        [ Opus 4.8        ▼ ]  [Save]   │
  │              Default from env: Opus 4.8      │
  │              ⓘ Applies to all AI features.   │
  └─────────────────────────────────────────────┘
  ```

  - Dropdown options come from the GET response `allowed` (single source of truth with the
    backend allowlist).
  - When `keyPresent` is false: status row shows "● Not configured — set `ANTHROPIC_API_KEY`
    in `backend/.env`". The dropdown stays usable; the choice persists and takes effect once a
    key is present.
  - Save → `PATCH /api/settings/ai`, success toast, refresh local state, and **bust the
    `useAiStatus` module cache** so the top-bar `AiStatusChip` reflects the new model without a
    full reload. (Add a small `clearAiStatusCache()` export to `hooks/useAiStatus.js`.)

- **Bug fix bundled in:** `AiStatusChip.jsx`'s `FRIENDLY` map has `"claude-haiku-4-5"`
  (no date) but the real Haiku id is `claude-haiku-4-5-20251001`; selecting Haiku would render
  the raw id. Align the map key to the full id (and keep Opus/Sonnet/Fable entries).

## Data flow

```
Admin picks model → PATCH /api/settings/ai
  → settings.setModelOverride(id, adminId)
      → validate against ALLOWED_MODELS (else 400)
      → prisma.appSetting.upsert({ key: "ai.model", value: id, updatedById })
      → update in-memory cache
  → 200 { keyPresent, aiEnabled, model, overridden, envDefault, allowed }
→ frontend: toast + refresh + clear useAiStatus cache → chip + all AI calls now use new model
```

On restart: `loadSettings()` repopulates the cache from the row; if absent, `model()` falls
back to `AI_MODEL` env, then the hardcoded default.

## Error handling

- DB unreachable at startup: `loadSettings()` logs and leaves the cache empty → `model()`
  falls back to env. The API still boots.
- Invalid model on PATCH: 400 `{ error: "Unsupported model" }`; cache and DB unchanged.
- Non-admin hitting either endpoint: 403 via `requireRole` (route gate), as elsewhere.
- Frontend GET/PATCH failures: surfaced as `e.message` via the existing toast pattern; page
  guards on `err` / loading like every other page.

## Verification (no test suite in this project)

- `node --check` on the three changed/added backend files.
- Import-resolution smoke:
  `node --input-type=module -e "await import('./src/routes/settings.js')"`.
- Live smoke: log in as `admin@mostoeneng.law` / `Password123!`, `GET /api/settings/ai`
  (expect `keyPresent` reflecting `.env`), `PATCH` to Sonnet, confirm `/api/ai/status` now
  reports `claude-sonnet-4-6`, restart the backend, confirm the choice persists.
- Confirm a non-admin (`t.dlamini@mostoeneng.law`) gets 403 on both endpoints.
- Frontend: `npm run build` bundles cleanly; the Settings link appears only for ADMIN.

## Files touched

**Backend**
- `prisma/schema.prisma` — add `AppSetting` model (+ `npm run db:push`).
- `src/lib/settings.js` — **new** (cache, loader, getter, setter, allowlist).
- `src/lib/ai/client.js` — `model()` consults `getModelOverride()`.
- `src/routes/settings.js` — **new** (`GET`/`PATCH /api/settings/ai`, ADMIN-gated).
- `src/server.js` — import + mount router; `await loadSettings()` before `listen`.

**Frontend**
- `src/App.jsx` — `/settings` route, ADMIN-gated.
- `src/components/Layout.jsx` — ADMIN-only "Settings" nav link.
- `src/pages/Settings.jsx` — **new** page.
- `src/hooks/useAiStatus.js` — add `clearAiStatusCache()`.
- `src/components/AiStatusChip.jsx` — fix Haiku id in `FRIENDLY` map.
