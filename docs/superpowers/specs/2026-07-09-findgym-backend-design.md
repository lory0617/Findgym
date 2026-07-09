# Findgym Backend (Reports + Saved Sync) Design

Date: 2026-07-09

> **Status: draft for review.** Written while the operator was away, using
> best-judgment defaults on the open decisions (identity model, platform).
> Those defaults are called out in **Decisions made in your absence** below —
> change any of them before we write the implementation plan.

## Goal

Give Findgym a real backend for two flows that are currently dead-ends in
`localStorage`:

1. **Reports** (`findgymReports`) — user-submitted corrections and missing-gym
   reports. Today they never leave the device, so the operator never sees them.
   This is the highest-value gap: without it there is no feedback loop.
2. **Saved gyms** (`findgymSaved`) — today per-device only. Back them up to the
   cloud and lay the groundwork for cross-device sync.

The app must keep working exactly as today when no backend is configured — the
backend is additive, not a rewrite.

## Non-goals (YAGNI for this phase)

- Real login UI (Sign in with Apple / Google / Email). The design leaves a
  clean upgrade path but does not build it now.
- True cross-device sync (requires real login — deferred).
- Admin review UI / report moderation workflow. The operator reads reports via
  the Supabase dashboard for now.
- Analytics dashboards, gym-owner claim flow, notifications.

## Decisions made in your absence (please confirm)

| Decision | Chosen default | Alternative |
|---|---|---|
| Backend platform | **Supabase** (Postgres + Auth + auto REST, free tier) | Firebase; a custom server |
| Identity model | **Anonymous auth** — no login screen; each device gets an anonymous Supabase user | Optional login now; required login |
| Client integration | **Direct `fetch` to Supabase REST/Auth** (no bundler) | `@supabase/supabase-js` via a build step |
| Config location | `SUPABASE_URL` + `SUPABASE_ANON_KEY` in a committed `src/config.js` | env injection at build |

The anon key is safe to commit — it is public by design; **Row Level Security
(RLS) is the real security boundary**, not key secrecy.

## Architecture

The app stays a static PWA (GitHub Pages) + Capacitor wrapper. Supabase is the
backend — the client talks to it directly over HTTPS; there is no server of our
own to run.

```
Findgym web app (browser / Capacitor WebView)
   │  fetch() over HTTPS
   ├──> Supabase Auth   /auth/v1   → anonymous user + JWT (persisted locally)
   └──> Supabase REST   /rest/v1   → reports (insert), saved (select/insert/delete)
                                       RLS enforces per-user access
localStorage — offline cache + fallback when Supabase is unconfigured
```

### Components (each independently testable)

1. **`src/backend-config.js`** — exports `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   and `isBackendConfigured()`. When the values are empty placeholders,
   `isBackendConfigured()` returns `false` and the app runs in local-only mode.
2. **`src/backend-client.js`** — thin `fetch` wrapper: ensures an anonymous
   session (calls `/auth/v1/signup` anonymously once, stores the JWT in
   localStorage, refreshes when needed), and exposes
   `insertReport(report)`, `listSaved()`, `addSaved(gymId)`, `removeSaved(gymId)`.
   Pure network/serialization logic — unit-testable by stubbing `fetch`.
3. **`src/saved-store.js`** — reconciles localStorage (fast, offline) with the
   backend: local write first (instant UI), then best-effort cloud sync; on load,
   merge cloud + local. This is the offline-first seam. Pure functions for the
   merge logic (unit-testable); the async sync wraps `backend-client`.
4. **`src/app.js`** — swap the direct `localStorage` calls in the report submit
   and saved toggle for calls into `saved-store` / `backend-client`, keeping the
   current behavior as the offline fallback.

### Data model (Supabase / Postgres)

```sql
-- reports: user-submitted corrections; operator reads via dashboard
create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) default auth.uid(),
  gym_id        text,                    -- null / "missing_gym" allowed
  report_type   text not null,
  submitted_value text,
  evidence_url  text,
  status        text not null default 'pending',
  created_at    timestamptz not null default now()
);

-- saved: one row per (user, gym)
create table public.saved (
  user_id    uuid not null references auth.users(id) default auth.uid(),
  gym_id     text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, gym_id)
);
```

### Security (Row Level Security)

- `reports`: RLS on. Policy allows **INSERT** where `user_id = auth.uid()`;
  **no public SELECT** (only the operator via the service key / dashboard reads
  them). Users can file reports but cannot read others' reports.
- `saved`: RLS on. Policies allow **SELECT / INSERT / DELETE** only where
  `user_id = auth.uid()`. Each device's anonymous user sees only its own saves.

### Data flow

- **Report submit:** validate (existing `validateReport`) → `insertReport()` to
  Supabase → on success show "已送出"; on network failure, queue in
  `localStorage` and retry on next load. The report reaches the operator.
- **Save toggle:** update localStorage immediately (instant UI) →
  `addSaved`/`removeSaved` best-effort to Supabase. On load, `listSaved()` from
  cloud merges with local so a reinstall (same anon session) restores saves.
- **Unconfigured:** `isBackendConfigured()` is false → every path uses only
  localStorage (today's behavior). No errors, no network calls.

### Error handling

- All network calls are best-effort with a local fallback; the UI never blocks
  on the backend.
- A failed report insert is retried from a local queue; a failed save sync
  leaves the local copy intact and retries later.
- Anonymous session creation failure → local-only mode for that session.

## Testing

- `backend-client` and `saved-store` merge logic: Node `--test` with a stubbed
  `fetch` (no real network) — mirror the existing test style.
- Existing tests stay green; the local-only fallback path is covered so the app
  is proven to work without any backend configured.
- End-to-end against a real Supabase project is a manual step the operator runs
  after provisioning (documented in the README).

## Setup steps the operator must do (cannot be automated here)

1. Create a free Supabase project → copy the **Project URL** and **anon key**.
2. Run the schema + RLS SQL (shipped as `supabase/schema.sql`) in the SQL editor.
3. Enable **Anonymous sign-ins** in Supabase Auth settings.
4. Paste URL + anon key into `src/backend-config.js`, commit, deploy.

Until step 4, the app runs local-only exactly as today.

## Future (out of scope now, path preserved)

- **Login / cross-device sync:** add Supabase Auth providers (Apple required by
  App Store if any social login is offered; Google; Email). Linking an anonymous
  user to a real identity keeps the same `user_id`, so existing saves/reports
  carry over and become cross-device. App Store also requires an in-app
  **account deletion** path once accounts exist.
- **Admin/report review UI** and CSV export.
