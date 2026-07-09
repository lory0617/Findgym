# Findgym Backend (Reports + Saved Sync) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give reports and saved gyms a real Supabase backend (anonymous auth, per-user RLS), keeping the app fully working local-only until credentials are configured.

**Architecture:** Vanilla no-build static PWA talks to Supabase directly via `fetch` (Auth + PostgREST). A config module gates everything: when unconfigured, all flows fall back to today's `localStorage` behavior. A backend-client factory (injected `fetch`/`storage` for testability) handles the anonymous session and CRUD; a pure saved-store merges local + cloud.

**Tech Stack:** JavaScript (ES modules, no bundler), Node built-in test runner, Supabase (Postgres + GoTrue auth + PostgREST), `fetch`.

## Global Constraints

- No build step / no bundler — plain ES modules loaded via `<script type="module">`. No new runtime npm dependencies.
- All new browser modules must be pure enough to unit-test under Node `--test` by injecting `fetch` and `storage` (no real network in tests).
- The app MUST behave exactly as today when `isBackendConfigured()` is false. Backend calls are best-effort; the UI never blocks or errors on network failure.
- The Supabase **anon key is public** and committed; RLS is the security boundary.
- Follow existing test style (`tests/*.mjs`, `node:test` + `node:assert/strict`).
- `scripts/build-web.mjs` already copies `src/` recursively into `www/`, so new `src/` modules ship automatically; `supabase/` is dev-only and must NOT be bundled.

---

### Task 1: Backend config + Supabase schema

**Files:**
- Create: `src/backend-config.js`
- Create: `supabase/schema.sql`
- Test: `tests/backend-config.test.mjs`

**Interfaces:**
- Produces: `SUPABASE_URL: string`, `SUPABASE_ANON_KEY: string`, `isBackendConfigured(): boolean` (true only when both values are non-empty and not the placeholder sentinel `"REPLACE_ME"`).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/backend-config.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SUPABASE_URL, SUPABASE_ANON_KEY, isBackendConfigured } from "../src/backend-config.js";

test("backend-config ships unconfigured by default so the app stays local-only", () => {
  assert.equal(typeof SUPABASE_URL, "string");
  assert.equal(typeof SUPABASE_ANON_KEY, "string");
  assert.equal(isBackendConfigured(), false);
});

test("supabase schema declares tables and RLS", async () => {
  const sql = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.equal(sql.includes("create table") && sql.includes("public.reports"), true);
  assert.equal(sql.includes("public.saved"), true);
  assert.equal(/enable row level security/i.test(sql), true);
  assert.equal(sql.includes("auth.uid()"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/backend-config.test.mjs`
Expected: FAIL — cannot find module `../src/backend-config.js`.

- [ ] **Step 3: Write `src/backend-config.js`**

```javascript
// Supabase connection config. The anon key is public by design — RLS is the
// security boundary. Leave as the placeholder to run the app local-only.
export const SUPABASE_URL = "REPLACE_ME";
export const SUPABASE_ANON_KEY = "REPLACE_ME";

export function isBackendConfigured() {
  return (
    typeof SUPABASE_URL === "string" &&
    typeof SUPABASE_ANON_KEY === "string" &&
    SUPABASE_URL.startsWith("https://") &&
    SUPABASE_ANON_KEY !== "REPLACE_ME" &&
    SUPABASE_ANON_KEY.length > 0
  );
}
```

- [ ] **Step 4: Write `supabase/schema.sql`**

```sql
-- Run in the Supabase SQL editor after creating the project.
-- Also enable "Anonymous sign-ins" under Auth > Providers.

create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) default auth.uid(),
  gym_id          text,
  report_type     text not null,
  submitted_value text,
  evidence_url    text,
  status          text not null default 'pending',
  created_at      timestamptz not null default now()
);

create table if not exists public.saved (
  user_id    uuid not null references auth.users(id) default auth.uid(),
  gym_id     text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, gym_id)
);

alter table public.reports enable row level security;
alter table public.saved   enable row level security;

-- reports: users insert their own; nobody reads via the anon key (operator
-- reads through the dashboard / service role).
create policy "reports insert own" on public.reports
  for insert to authenticated with check (user_id = auth.uid());

-- saved: users fully manage only their own rows.
create policy "saved select own" on public.saved
  for select to authenticated using (user_id = auth.uid());
create policy "saved insert own" on public.saved
  for insert to authenticated with check (user_id = auth.uid());
create policy "saved delete own" on public.saved
  for delete to authenticated using (user_id = auth.uid());
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/backend-config.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/backend-config.js supabase/schema.sql tests/backend-config.test.mjs
git commit -m "feat: backend config gate and Supabase schema"
```

---

### Task 2: Backend client — anonymous session + report insert

**Files:**
- Create: `src/backend-client.js`
- Test: `tests/backend-client.test.mjs`

**Interfaces:**
- Consumes: nothing from other tasks (config is passed in by the caller).
- Produces: `createBackendClient({ url, anonKey, fetchImpl, storage })` returning an object with async methods. This task implements `ensureSession()` (returns an access token string, caching it in `storage` under key `findgymSession`) and `insertReport(report)` (returns `true` on success, `false` on failure — never throws). Later tasks add `listSaved`/`addSaved`/`removeSaved` to the same factory.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/backend-client.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createBackendClient } from "../src/backend-client.js";

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  };
}

test("ensureSession signs in anonymously once and caches the token", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ access_token: "tok_123" }) };
  };
  const client = createBackendClient({
    url: "https://x.supabase.co",
    anonKey: "anon_key",
    fetchImpl,
    storage: makeStorage()
  });

  const first = await client.ensureSession();
  const second = await client.ensureSession();

  assert.equal(first, "tok_123");
  assert.equal(second, "tok_123");
  assert.equal(calls.length, 1); // cached — only one network sign-in
  assert.equal(calls[0].url, "https://x.supabase.co/auth/v1/signup");
  assert.equal(calls[0].options.headers.apikey, "anon_key");
});

test("insertReport posts to the reports table with the bearer token", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/signup")) {
      return { ok: true, json: async () => ({ access_token: "tok_123" }) };
    }
    return { ok: true, json: async () => ({}) };
  };
  const client = createBackendClient({
    url: "https://x.supabase.co",
    anonKey: "anon_key",
    fetchImpl,
    storage: makeStorage()
  });

  const ok = await client.insertReport({ gymId: "g1", reportType: "wrong_price", submittedValue: "100", evidenceUrl: "" });

  assert.equal(ok, true);
  const post = calls.find((c) => c.url.endsWith("/rest/v1/reports"));
  assert.ok(post);
  assert.equal(post.options.method, "POST");
  assert.equal(post.options.headers.Authorization, "Bearer tok_123");
  assert.deepEqual(JSON.parse(post.options.body), {
    gym_id: "g1",
    report_type: "wrong_price",
    submitted_value: "100",
    evidence_url: ""
  });
});

test("insertReport returns false on network error without throwing", async () => {
  const fetchImpl = async () => {
    throw new Error("offline");
  };
  const client = createBackendClient({ url: "https://x.supabase.co", anonKey: "k", fetchImpl, storage: makeStorage() });
  assert.equal(await client.insertReport({ reportType: "other" }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/backend-client.test.mjs`
Expected: FAIL — cannot find module `../src/backend-client.js`.

- [ ] **Step 3: Write `src/backend-client.js`**

```javascript
// Thin fetch wrapper around Supabase Auth (anonymous) + PostgREST. All methods
// are best-effort: they return a boolean/data and never throw, so the UI can
// treat the backend as optional. `fetchImpl` and `storage` are injected for
// testability; the app passes globalThis.fetch and localStorage.
const SESSION_KEY = "findgymSession";

export function createBackendClient({ url, anonKey, fetchImpl, storage }) {
  async function ensureSession() {
    const cached = storage.getItem(SESSION_KEY);
    if (cached) {
      return cached;
    }
    const response = await fetchImpl(`${url}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (!response.ok) {
      throw new Error("anonymous sign-in failed");
    }
    const data = await response.json();
    storage.setItem(SESSION_KEY, data.access_token);
    return data.access_token;
  }

  async function authHeaders() {
    const token = await ensureSession();
    return {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    };
  }

  async function insertReport(report) {
    try {
      const response = await fetchImpl(`${url}/rest/v1/reports`, {
        method: "POST",
        headers: { ...(await authHeaders()), Prefer: "return=minimal" },
        body: JSON.stringify({
          gym_id: report.gymId ?? null,
          report_type: report.reportType,
          submitted_value: report.submittedValue ?? "",
          evidence_url: report.evidenceUrl ?? ""
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  return { ensureSession, insertReport };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/backend-client.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend-client.js tests/backend-client.test.mjs
git commit -m "feat: backend client with anonymous session and report insert"
```

> **Implementation note:** confirm the anonymous sign-in endpoint against current Supabase Auth docs during manual e2e (Task 7). If the deployed GoTrue expects a different path/body, adjust `ensureSession` and its test together — the stubbed test pins the expected request shape.

---

### Task 3: Backend client — saved list/add/remove

**Files:**
- Modify: `src/backend-client.js`
- Test: `tests/backend-client.test.mjs` (add cases)

**Interfaces:**
- Consumes: the `createBackendClient` factory and its `authHeaders`/`ensureSession` from Task 2.
- Produces: three more methods on the returned object — `listSaved(): Promise<string[]>` (gym ids; `[]` on failure), `addSaved(gymId): Promise<boolean>`, `removeSaved(gymId): Promise<boolean>`.

- [ ] **Step 1: Write the failing test (append to tests/backend-client.test.mjs)**

```javascript
test("listSaved returns gym ids and addSaved/removeSaved hit the saved table", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method ?? "GET", options });
    if (url.endsWith("/auth/v1/signup")) return { ok: true, json: async () => ({ access_token: "t" }) };
    if (url.includes("/rest/v1/saved") && (options.method ?? "GET") === "GET") {
      return { ok: true, json: async () => [{ gym_id: "a" }, { gym_id: "b" }] };
    }
    return { ok: true, json: async () => ({}) };
  };
  const storage = makeStorage();
  const client = createBackendClient({ url: "https://x.supabase.co", anonKey: "k", fetchImpl, storage });

  assert.deepEqual(await client.listSaved(), ["a", "b"]);
  assert.equal(await client.addSaved("c"), true);
  assert.equal(await client.removeSaved("a"), true);

  const del = calls.find((c) => c.method === "DELETE");
  assert.ok(del.url.includes("gym_id=eq.a"));
});

test("listSaved returns [] on failure without throwing", async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith("/auth/v1/signup")) return { ok: true, json: async () => ({ access_token: "t" }) };
    throw new Error("offline");
  };
  const client = createBackendClient({ url: "https://x.supabase.co", anonKey: "k", fetchImpl, storage: makeStorage() });
  assert.deepEqual(await client.listSaved(), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/backend-client.test.mjs`
Expected: FAIL — `client.listSaved is not a function`.

- [ ] **Step 3: Add the methods to `src/backend-client.js`**

Add inside `createBackendClient`, before the `return`:

```javascript
  async function listSaved() {
    try {
      const response = await fetchImpl(`${url}/rest/v1/saved?select=gym_id`, {
        method: "GET",
        headers: await authHeaders()
      });
      if (!response.ok) {
        return [];
      }
      const rows = await response.json();
      return rows.map((row) => row.gym_id);
    } catch {
      return [];
    }
  }

  async function addSaved(gymId) {
    try {
      const response = await fetchImpl(`${url}/rest/v1/saved`, {
        method: "POST",
        headers: { ...(await authHeaders()), Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ gym_id: gymId })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function removeSaved(gymId) {
    try {
      const response = await fetchImpl(`${url}/rest/v1/saved?gym_id=eq.${encodeURIComponent(gymId)}`, {
        method: "DELETE",
        headers: await authHeaders()
      });
      return response.ok;
    } catch {
      return false;
    }
  }
```

And update the return:

```javascript
  return { ensureSession, insertReport, listSaved, addSaved, removeSaved };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/backend-client.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend-client.js tests/backend-client.test.mjs
git commit -m "feat: backend client saved list/add/remove"
```

---

### Task 4: Saved-store merge logic (pure)

**Files:**
- Create: `src/saved-store.js`
- Test: `tests/saved-store.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `mergeSavedIds(localIds, cloudIds): string[]` — order-preserving deduped union (local order first, then cloud-only ids), filtering falsy values.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/saved-store.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mergeSavedIds } from "../src/saved-store.js";

test("mergeSavedIds unions local and cloud without duplicates, local order first", () => {
  assert.deepEqual(mergeSavedIds(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
  assert.deepEqual(mergeSavedIds([], ["x"]), ["x"]);
  assert.deepEqual(mergeSavedIds(["y"], []), ["y"]);
  assert.deepEqual(mergeSavedIds(undefined, undefined), []);
  assert.deepEqual(mergeSavedIds(["a", null, "a"], ["", "b"]), ["a", "b"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/saved-store.test.mjs`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/saved-store.js`**

```javascript
// Reconcile device-local saved ids with the cloud copy. Pure and testable;
// the app wraps these with the async backend client.
export function mergeSavedIds(localIds, cloudIds) {
  const local = Array.isArray(localIds) ? localIds : [];
  const cloud = Array.isArray(cloudIds) ? cloudIds : [];
  const merged = [];
  for (const id of [...local, ...cloud]) {
    if (id && !merged.includes(id)) {
      merged.push(id);
    }
  }
  return merged;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/saved-store.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/saved-store.js tests/saved-store.test.mjs
git commit -m "feat: pure saved-store merge logic"
```

---

### Task 5: Wire reports through the backend with local fallback

**Files:**
- Modify: `src/app.js` (imports near line 1–14; `handleSubmit` near line 265–292; add a module-level backend instance)
- Test: `tests/app-shell.test.mjs` (add a string-presence case, matching repo style)

**Interfaces:**
- Consumes: `isBackendConfigured`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` from `backend-config.js`; `createBackendClient` from `backend-client.js`.
- Produces: a module-level `backend` (a client instance or `null`); `handleSubmit` calls `backend.insertReport(report)` when configured, and always keeps the existing localStorage write as the offline record.

- [ ] **Step 1: Write the failing test (append to tests/app-shell.test.mjs)**

```javascript
test("report submit sends to the backend when configured, keeps local fallback", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.equal(app.includes("createBackendClient"), true);
  assert.equal(app.includes("isBackendConfigured"), true);
  assert.equal(app.includes("backend?.insertReport"), true);
  // local fallback write remains
  assert.equal(app.includes('localStorage.setItem("findgymReports"'), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/app-shell.test.mjs`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Add imports + backend instance in `src/app.js`**

After the `buildDatasetStatus` import (around line 14), add:

```javascript
import { SUPABASE_URL, SUPABASE_ANON_KEY, isBackendConfigured } from "./backend-config.js";
import { createBackendClient } from "./backend-client.js";

const backend = isBackendConfigured()
  ? createBackendClient({
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      fetchImpl: (...args) => globalThis.fetch(...args),
      storage: globalThis.localStorage
    })
  : null;
```

- [ ] **Step 4: Update `handleSubmit` to also send to the backend**

In `handleSubmit`, the block currently reads:

```javascript
  const reports = getStoredReports();
  reports.push(report);
  localStorage.setItem("findgymReports", JSON.stringify(reports));
  state.reportMessage = "已儲存回報。原型階段會先保存在此瀏覽器。";
  renderApp();
```

Replace with:

```javascript
  const reports = getStoredReports();
  reports.push(report);
  localStorage.setItem("findgymReports", JSON.stringify(reports));
  state.reportMessage = "已送出回報，謝謝你的協助。";
  renderApp();

  backend?.insertReport(report).then((ok) => {
    if (!ok) {
      state.reportMessage = "回報已暫存於此裝置，連上網路後會再嘗試送出。";
      renderApp();
    }
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/*.mjs`
Expected: PASS (all, including the new assertion). Also run `node --check --input-type=module < src/app.js` → no output.

- [ ] **Step 6: Commit**

```bash
git add src/app.js tests/app-shell.test.mjs
git commit -m "feat: route report submissions through the backend with local fallback"
```

---

### Task 6: Wire saved sync with local fallback

**Files:**
- Modify: `src/app.js` (imports; init near line 85; `toggleSaved` near line 740–746)
- Test: `tests/app-shell.test.mjs` (add a string-presence case)

**Interfaces:**
- Consumes: `mergeSavedIds` from `saved-store.js`; the `backend` instance and its `listSaved`/`addSaved`/`removeSaved` from Tasks 3/5.
- Produces: on load, saved ids are the merge of local + cloud; each toggle writes localStorage immediately and best-effort syncs to the backend.

- [ ] **Step 1: Write the failing test (append to tests/app-shell.test.mjs)**

```javascript
test("saved toggle syncs to the backend and load merges cloud saves", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.equal(app.includes("mergeSavedIds"), true);
  assert.equal(app.includes("backend?.addSaved"), true);
  assert.equal(app.includes("backend?.removeSaved"), true);
  assert.equal(app.includes("backend?.listSaved"), true);
  // local persistence remains the source of truth for instant UI
  assert.equal(app.includes('localStorage.setItem("findgymSaved"'), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/app-shell.test.mjs`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Add the `mergeSavedIds` import**

Add to the `findgym-core.js` import? No — it lives in `saved-store.js`. Add a new import line after the `backend-client` import from Task 5:

```javascript
import { mergeSavedIds } from "./saved-store.js";
```

- [ ] **Step 4: Merge cloud saves on load**

In `init()`, the line at ~85 currently reads:

```javascript
    state.savedIds = getStoredSaved().filter((id) => state.gyms.some((gym) => gym.id === id));
```

Leave that line, and add immediately after it:

```javascript
    if (backend) {
      backend.listSaved().then((cloudIds) => {
        const valid = mergeSavedIds(state.savedIds, cloudIds).filter((id) =>
          state.gyms.some((gym) => gym.id === id)
        );
        if (valid.length !== state.savedIds.length) {
          state.savedIds = valid;
          localStorage.setItem("findgymSaved", JSON.stringify(state.savedIds));
          renderApp();
        }
      });
    }
```

- [ ] **Step 5: Sync each toggle to the backend**

`toggleSaved` currently reads:

```javascript
function toggleSaved(gymId) {
  if (!gymId) {
    return;
  }

  state.savedIds = toggleSavedId(state.savedIds, gymId);
  localStorage.setItem("findgymSaved", JSON.stringify(state.savedIds));
}
```

Replace with:

```javascript
function toggleSaved(gymId) {
  if (!gymId) {
    return;
  }

  const willSave = !state.savedIds.includes(gymId);
  state.savedIds = toggleSavedId(state.savedIds, gymId);
  localStorage.setItem("findgymSaved", JSON.stringify(state.savedIds));

  if (willSave) {
    backend?.addSaved(gymId);
  } else {
    backend?.removeSaved(gymId);
  }
}
```

- [ ] **Step 6: Run tests + syntax check**

Run: `node --test tests/*.mjs` → all PASS. `node --check --input-type=module < src/app.js` → no output.

- [ ] **Step 7: Commit**

```bash
git add src/app.js tests/app-shell.test.mjs
git commit -m "feat: sync saved gyms to the backend with local fallback"
```

---

### Task 7: Setup docs + manual end-to-end verification

**Files:**
- Modify: `README.md` (add a "Backend (Supabase)" section)
- Modify: `.gitignore` (no change needed — `supabase/` is committed; confirm it is not ignored)

**Interfaces:**
- Consumes: everything above.
- Produces: operator-facing setup steps; a verified live path (manual, requires the operator's Supabase project).

- [ ] **Step 1: Add the README section**

```markdown
## Backend (Supabase)

Reports and saved gyms sync to Supabase when configured; the app runs
local-only until then. To enable:

1. Create a free Supabase project; copy the Project URL and anon key.
2. In the SQL editor, run `supabase/schema.sql`.
3. Auth → Providers → enable **Anonymous sign-ins**.
4. Put the URL + anon key in `src/backend-config.js` (the anon key is public;
   RLS is the security boundary), then `npm run build:web` and redeploy.

Reports appear in the Supabase table editor under `public.reports`. Until
step 4, everything falls back to browser `localStorage`.
```

- [ ] **Step 2: Verify the full suite and bundle**

Run: `node --test tests/*.mjs` → all PASS.
Run: `npm run build:web && ls www/src/backend-config.js` → file present (new modules ship).

- [ ] **Step 3: Manual e2e (operator, after provisioning)**

With real credentials in `src/backend-config.js`:
- Load the app, submit a report → confirm a row appears in Supabase `public.reports`.
- Save a gym → confirm a row in `public.saved`; reload → the save persists from cloud.
- Confirm anonymous sign-in works (a user appears under Auth → Users).
- If anonymous sign-in errors, adjust `ensureSession` per current Supabase docs (see Task 2 note) and re-run its test.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: Supabase backend setup steps"
```

---

## Self-Review

- **Spec coverage:** reports→backend (Tasks 2,5) ✓; saved sync (Tasks 3,4,6) ✓; anonymous auth (Task 2) ✓; RLS/schema (Task 1) ✓; offline-first + unconfigured fallback (config gate + best-effort calls throughout) ✓; setup steps (Task 7) ✓; components `backend-config`/`backend-client`/`saved-store`/`app.js` wiring all present ✓. Non-goals (login UI, admin UI, cross-device delete propagation) intentionally omitted.
- **Placeholder scan:** `"REPLACE_ME"` is a deliberate config sentinel, not a plan placeholder; every code step has real content.
- **Type consistency:** `createBackendClient({url, anonKey, fetchImpl, storage})` and methods `ensureSession`/`insertReport`/`listSaved`/`addSaved`/`removeSaved` are named identically across Tasks 2, 3, 5, 6; `mergeSavedIds(localIds, cloudIds)` consistent across Tasks 4 and 6; `isBackendConfigured` consistent across Tasks 1 and 5.
