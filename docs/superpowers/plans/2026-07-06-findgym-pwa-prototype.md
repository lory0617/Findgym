# Findgym PWA Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable mobile-first static PWA prototype for discovering, filtering, comparing, and reporting flexible-access gyms in Taiwan.

**Architecture:** The prototype is a dependency-free static web app. Domain logic lives in `src/findgym-core.js` and is covered by Node-based tests; UI rendering lives in `src/app.js`; seed data lives in `data/gyms.json`.

**Tech Stack:** HTML, CSS, vanilla JavaScript ES modules, Web App Manifest, Node.js built-in `node:test` and `assert`.

## Global Constraints

- Build a mobile-first PWA prototype first; do not add native app tooling.
- Use structured data for gym pricing, contract policy, facilities, location, verification, and reports.
- Keep the MVP focused on discovery, filters, comparison, gym details, and user reports.
- Exclude booking, payments, trainer marketplace, workout tracking, and AI coaching.
- Show confidence/freshness instead of pretending all data is verified.
- Do not use external map, CSS, or JavaScript dependencies in the first prototype.

---

## File Structure

- Create: `index.html` - Static app shell and root containers.
- Create: `manifest.webmanifest` - PWA metadata.
- Create: `src/styles.css` - Responsive mobile-first visual system.
- Create: `src/findgym-core.js` - Pure functions for filtering, ranking, comparing, formatting, and report validation.
- Create: `src/app.js` - Browser state, DOM rendering, interactions, local storage persistence.
- Create: `data/gyms.json` - Seed gyms for Taipei/New Taipei validation.
- Create: `tests/findgym-core.test.mjs` - Node tests for core behavior.
- Modify: `README.md` - Add run/test instructions.

---

### Task 1: Static PWA Shell And Seed Data

**Files:**
- Create: `index.html`
- Create: `manifest.webmanifest`
- Create: `src/styles.css`
- Create: `data/gyms.json`
- Modify: `README.md`

**Interfaces:**
- Produces: Browser loads `src/app.js` as an ES module.
- Produces: Seed data path `data/gyms.json`.
- Produces: DOM containers with ids `app`, `filterForm`, `gymList`, `mapCanvas`, `detailPanel`, `comparePanel`, and `reportPanel`.

- [ ] **Step 1: Create app shell**

Create `index.html` with this structure:

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#145c55" />
    <title>Findgym</title>
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="stylesheet" href="./src/styles.css" />
  </head>
  <body>
    <main id="app" class="app-shell">
      <section class="topbar" aria-label="Findgym search and filters">
        <div>
          <p class="eyebrow">免綁約健身房搜尋</p>
          <h1>Findgym</h1>
        </div>
        <button id="locateButton" class="icon-button" type="button" aria-label="Use current location">⌖</button>
      </section>

      <form id="filterForm" class="filter-panel">
        <label class="search-field">
          <span>搜尋</span>
          <input id="searchInput" name="query" type="search" placeholder="城市、行政區、捷運站或健身房" autocomplete="off" />
        </label>
        <div class="filter-grid" aria-label="Filters">
          <label><input name="openNow" type="checkbox" /> 營業中</label>
          <label><input name="singleEntry" type="checkbox" checked /> 單次收費</label>
          <label><input name="noContract" type="checkbox" /> 免綁月繳</label>
          <label><input name="squatRack" type="checkbox" /> 深蹲架</label>
          <label><input name="shower" type="checkbox" /> 淋浴</label>
          <label><input name="parking" type="checkbox" /> 停車</label>
        </div>
      </form>

      <section class="workspace">
        <section class="map-section" aria-label="Gym map">
          <div id="mapCanvas" class="map-canvas"></div>
        </section>
        <section class="results-section" aria-label="Gym list">
          <div class="section-heading">
            <h2>附近選項</h2>
            <span id="resultCount"></span>
          </div>
          <div id="gymList" class="gym-list"></div>
        </section>
      </section>

      <section id="detailPanel" class="drawer" aria-live="polite"></section>
      <section id="comparePanel" class="drawer drawer-secondary" aria-live="polite"></section>
      <section id="reportPanel" class="drawer drawer-secondary" aria-live="polite"></section>
    </main>
    <script type="module" src="./src/app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create manifest**

Create `manifest.webmanifest`:

```json
{
  "name": "Findgym",
  "short_name": "Findgym",
  "description": "Find no-contract and pay-per-use gyms in Taiwan.",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#f6f2ea",
  "theme_color": "#145c55",
  "icons": []
}
```

- [ ] **Step 3: Create seed data**

Create `data/gyms.json` with at least six gyms using this exact shape:

```json
[
  {
    "id": "taipei-zhongzheng-sports-center",
    "name": "臺北市中正運動中心",
    "brandName": "臺北市運動中心",
    "branchName": "中正",
    "city": "台北市",
    "district": "中正區",
    "address": "台北市中正區信義路一段1號",
    "latitude": 25.0375,
    "longitude": 121.5199,
    "status": "open",
    "isLargeContractFirstChain": false,
    "isHiddenByDefault": false,
    "access": {
      "supportsSingleEntry": true,
      "supportsNoContractMonthly": false,
      "supportsTrial": false,
      "requiresMembershipCard": false,
      "requiresReservation": false,
      "contractNote": "公立運動中心，適合單次使用。"
    },
    "pricing": [
      {
        "type": "hourly",
        "amountTwd": 50,
        "unit": "per_hour",
        "timeLimitMinutes": 60,
        "sourceNote": "示範資料，正式版需重新查證。",
        "lastVerifiedAt": "2026-07-06"
      }
    ],
    "facilities": {
      "hasFreeWeights": true,
      "hasSquatRack": true,
      "hasPowerRack": false,
      "hasBenchPress": true,
      "hasDeadliftPlatform": false,
      "hasCableMachine": true,
      "hasCardio": true,
      "hasGroupClasses": true,
      "hasPersonalTraining": false,
      "hasShower": true,
      "hasLocker": true,
      "hasParking": false,
      "is24Hours": false
    },
    "openingHours": [
      { "weekday": 1, "opensAt": "06:00", "closesAt": "22:00", "isClosed": false },
      { "weekday": 2, "opensAt": "06:00", "closesAt": "22:00", "isClosed": false },
      { "weekday": 3, "opensAt": "06:00", "closesAt": "22:00", "isClosed": false },
      { "weekday": 4, "opensAt": "06:00", "closesAt": "22:00", "isClosed": false },
      { "weekday": 5, "opensAt": "06:00", "closesAt": "22:00", "isClosed": false },
      { "weekday": 6, "opensAt": "06:00", "closesAt": "22:00", "isClosed": false },
      { "weekday": 0, "opensAt": "06:00", "closesAt": "22:00", "isClosed": false }
    ],
    "rating": {
      "externalRating": 4.2,
      "externalRatingCount": 1200,
      "externalSource": "manual",
      "summaryTags": ["公立", "單次", "交通方便"]
    },
    "verification": {
      "confidenceLevel": "unverified",
      "verificationSource": "manual_research",
      "verifiedAt": "2026-07-06"
    },
    "contact": {
      "phone": "",
      "website": "",
      "mapUrl": "https://maps.google.com/?q=臺北市中正運動中心"
    }
  }
]
```

Add five more records by copying the same shape and changing ids, names, districts, coordinates, pricing, and facilities.

- [ ] **Step 4: Create first responsive CSS**

Create `src/styles.css` with variables, shell layout, cards, drawers, filters, and map marker styles. Use fixed dimensions for marker buttons and comparison controls so dynamic labels do not shift layout.

- [ ] **Step 5: Update README**

Add commands:

```markdown
## Local Prototype

Run a static server from the repo root:

```bash
python3 -m http.server 5173
```

Open `http://localhost:5173`.

Run core tests:

```bash
node --test tests/findgym-core.test.mjs
```
```

- [ ] **Step 6: Verify shell**

Run: `python3 -m http.server 5173`

Expected: Server starts and `index.html` loads without missing local files.

- [ ] **Step 7: Commit**

```bash
git add index.html manifest.webmanifest src/styles.css data/gyms.json README.md
git commit -m "feat: scaffold static PWA prototype"
```

---

### Task 2: Core Filtering, Ranking, Formatting, And Report Validation

**Files:**
- Create: `src/findgym-core.js`
- Create: `tests/findgym-core.test.mjs`

**Interfaces:**
- Produces: `normalizeQuery(value: string): string`
- Produces: `isGymOpenNow(gym: object, now: Date): boolean`
- Produces: `getBestFlexiblePrice(gym: object): object | null`
- Produces: `filterGyms(gyms: object[], filters: object, now: Date): object[]`
- Produces: `rankGyms(gyms: object[], userLocation: object | null, now: Date): object[]`
- Produces: `buildComparisonRows(gyms: object[]): object[]`
- Produces: `validateReport(input: object): { valid: boolean, errors: string[] }`

- [ ] **Step 1: Write failing tests**

Create `tests/findgym-core.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildComparisonRows,
  filterGyms,
  getBestFlexiblePrice,
  isGymOpenNow,
  normalizeQuery,
  rankGyms,
  validateReport
} from "../src/findgym-core.js";

const gyms = [
  {
    id: "a",
    name: "Alpha Gym",
    city: "台北市",
    district: "中正區",
    latitude: 25.03,
    longitude: 121.52,
    isHiddenByDefault: false,
    access: { supportsSingleEntry: true, supportsNoContractMonthly: false },
    pricing: [{ type: "single_entry", amountTwd: 120, unit: "per_entry", lastVerifiedAt: "2026-07-06" }],
    facilities: { hasSquatRack: true, hasShower: true, hasParking: false, is24Hours: false },
    openingHours: [{ weekday: 1, opensAt: "06:00", closesAt: "22:00", isClosed: false }],
    rating: { externalRating: 4.5, externalRatingCount: 20 },
    verification: { confidenceLevel: "verified", verifiedAt: "2026-07-06" }
  },
  {
    id: "b",
    name: "Beta Fitness",
    city: "新北市",
    district: "板橋區",
    latitude: 25.01,
    longitude: 121.46,
    isHiddenByDefault: true,
    access: { supportsSingleEntry: false, supportsNoContractMonthly: true },
    pricing: [{ type: "monthly_no_contract", amountTwd: 1200, unit: "per_month", lastVerifiedAt: "2026-07-06" }],
    facilities: { hasSquatRack: false, hasShower: true, hasParking: true, is24Hours: true },
    openingHours: [{ weekday: 1, opensAt: "00:00", closesAt: "23:59", isClosed: false }],
    rating: { externalRating: 4.0, externalRatingCount: 100 },
    verification: { confidenceLevel: "likely", verifiedAt: "2026-06-01" }
  }
];

test("normalizeQuery trims and lowercases text", () => {
  assert.equal(normalizeQuery("  Alpha GYM "), "alpha gym");
});

test("isGymOpenNow checks weekday hours", () => {
  assert.equal(isGymOpenNow(gyms[0], new Date("2026-07-06T12:00:00+08:00")), true);
  assert.equal(isGymOpenNow(gyms[0], new Date("2026-07-06T23:00:00+08:00")), false);
});

test("getBestFlexiblePrice prefers single entry before monthly", () => {
  assert.deepEqual(getBestFlexiblePrice(gyms[0]), gyms[0].pricing[0]);
});

test("filterGyms applies query, default hidden exclusion, and facility filters", () => {
  const result = filterGyms(gyms, { query: "中正", singleEntry: true, squatRack: true }, new Date("2026-07-06T12:00:00+08:00"));
  assert.deepEqual(result.map((gym) => gym.id), ["a"]);
});

test("rankGyms puts nearby verified flexible gyms first", () => {
  const result = rankGyms(gyms, { latitude: 25.03, longitude: 121.52 }, new Date("2026-07-06T12:00:00+08:00"));
  assert.equal(result[0].id, "a");
});

test("buildComparisonRows exposes decision fields", () => {
  const rows = buildComparisonRows([gyms[0], gyms[1]]);
  assert.equal(rows[0].label, "彈性入場");
  assert.equal(rows.some((row) => row.label === "資料可信度"), true);
});

test("validateReport requires type and submitted value", () => {
  assert.deepEqual(validateReport({ gymId: "a", reportType: "wrong_price", submittedValue: "單次 100" }), { valid: true, errors: [] });
  assert.equal(validateReport({ gymId: "a" }).valid, false);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/findgym-core.test.mjs`

Expected: FAIL with module not found for `src/findgym-core.js`.

- [ ] **Step 3: Implement core functions**

Create `src/findgym-core.js` with pure functions matching the interfaces above.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/findgym-core.test.mjs`

Expected: PASS for all seven tests.

- [ ] **Step 5: Commit**

```bash
git add src/findgym-core.js tests/findgym-core.test.mjs
git commit -m "feat: add gym discovery core logic"
```

---

### Task 3: Interactive Discovery UI

**Files:**
- Create: `src/app.js`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `filterGyms`, `rankGyms`, `isGymOpenNow`, `getBestFlexiblePrice` from `src/findgym-core.js`.
- Consumes: `data/gyms.json`.
- Produces: Browser UI for list, map markers, detail drawer, compare selection, and report drawer.

- [ ] **Step 1: Write manual UI checklist**

Create an implementation checklist in the task notes:

```text
Discovery UI must:
- Load gyms from data/gyms.json.
- Render map markers and list cards from the same filtered array.
- Update results when search or filters change.
- Open a detail drawer from list card or map marker.
- Add or remove up to three gyms from comparison.
- Render comparison rows.
- Validate and save reports to localStorage under findgymReports.
```

- [ ] **Step 2: Implement app state**

Create `src/app.js` with state:

```js
const state = {
  gyms: [],
  filteredGyms: [],
  selectedGymId: null,
  compareIds: [],
  userLocation: { latitude: 25.0478, longitude: 121.517 },
  filters: {
    query: "",
    openNow: false,
    singleEntry: true,
    noContract: false,
    squatRack: false,
    shower: false,
    parking: false
  }
};
```

- [ ] **Step 3: Implement render functions**

Implement `renderApp()`, `renderMap()`, `renderList()`, `renderDetail()`, `renderCompare()`, and `renderReport()` in `src/app.js`.

- [ ] **Step 4: Implement interactions**

Attach listeners for filter changes, location button, detail open/close, compare toggles, report submit, navigation link, phone link, and website link.

- [ ] **Step 5: Run static server**

Run: `python3 -m http.server 5173`

Expected: App loads at `http://localhost:5173`, renders seed gyms, filters update result count, detail drawer opens, comparison drawer updates, and reports persist in localStorage.

- [ ] **Step 6: Commit**

```bash
git add src/app.js src/styles.css
git commit -m "feat: build interactive discovery prototype"
```

---

### Task 4: Visual QA, Accessibility Pass, And Documentation

**Files:**
- Modify: `src/styles.css`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-06-findgym-mvp-design.md` only if implementation intentionally changes scope.

**Interfaces:**
- Consumes: Completed static PWA prototype.
- Produces: Verified mobile and desktop layout.

- [ ] **Step 1: Run core tests**

Run: `node --test tests/findgym-core.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run local server**

Run: `python3 -m http.server 5173`

Expected: Server starts without errors.

- [ ] **Step 3: Verify desktop layout**

Open `http://localhost:5173` at a desktop viewport.

Expected:
- Map and list sit side by side.
- Text does not overlap cards or buttons.
- Drawers do not cover primary actions permanently.

- [ ] **Step 4: Verify mobile layout**

Open `http://localhost:5173` at a mobile viewport.

Expected:
- Search and filters fit without horizontal scrolling.
- Map markers remain tappable.
- List cards, detail drawer, comparison table, and report form fit the viewport.

- [ ] **Step 5: Update README**

Ensure README contains:

```markdown
## Prototype Scope

This prototype uses demonstration gym records. Prices, opening hours, ratings, and facilities must be re-verified before public launch.
```

- [ ] **Step 6: Commit**

```bash
git add README.md src/styles.css docs/superpowers/specs/2026-07-06-findgym-mvp-design.md
git commit -m "docs: document prototype verification"
```

---

## Self-Review

Spec coverage:

- Discovery map/list: Task 1 and Task 3.
- Filters: Task 2 and Task 3.
- Gym detail: Task 3.
- Comparison: Task 2 and Task 3.
- Report flow: Task 2 and Task 3.
- Freshness/confidence: Task 1 seed data, Task 2 comparison rows, Task 3 detail rendering.
- Exclusions for booking/payment/trainer/workout/AI: Global constraints.

Placeholder scan:

- No `TBD`, `TODO`, `FIXME`, or unresolved "implement later" language should remain in this plan.

Type consistency:

- All UI code consumes functions exported by `src/findgym-core.js`.
- Seed data field names use camelCase consistently with tests and app code.

