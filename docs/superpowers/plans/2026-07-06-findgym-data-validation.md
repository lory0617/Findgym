# Findgym Data Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dependency-free data validation layer so Findgym can safely grow from demo records toward a Taiwan-wide gym dataset.

**Architecture:** Validation logic lives in `src/gym-data-validation.js` as pure functions. A small Node CLI in `scripts/validate-data.mjs` reads a JSON dataset, prints a summary, prints issues, and exits non-zero only for blocking errors. Tests use Node's built-in `node:test`.

**Tech Stack:** JavaScript ES modules, Node.js built-in `node:test`, `assert`, `fs/promises`, and `path`.

## Global Constraints

- Do not add runtime or npm dependencies.
- Keep validation deterministic and local; do not call third-party APIs.
- Treat stale or unverified data as warnings, not blocking errors.
- Treat malformed structure, duplicate ids, invalid coordinates, invalid prices, and invalid hours as blocking errors.
- Keep the current PWA data shape in `data/gyms.json`.

---

## File Structure

- Create: `src/gym-data-validation.js` - Pure validation and summary functions.
- Create: `scripts/validate-data.mjs` - CLI wrapper for validating JSON files.
- Create: `tests/gym-data-validation.test.mjs` - Unit tests for validator and current dataset.
- Modify: `README.md` - Add the validation command.

---

### Task 1: Dataset Validator Core

**Files:**
- Create: `tests/gym-data-validation.test.mjs`
- Create: `src/gym-data-validation.js`

**Interfaces:**
- Produces: `validateGymRecord(gym: object, index?: number): { errors: Issue[], warnings: Issue[] }`
- Produces: `validateGymDataset(input: unknown): { valid: boolean, errors: Issue[], warnings: Issue[] }`
- Produces: `summarizeGymDataset(gyms: object[]): object`
- Defines: `Issue = { path: string, message: string }`

- [ ] **Step 1: Write the failing tests**

Create `tests/gym-data-validation.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  summarizeGymDataset,
  validateGymDataset,
  validateGymRecord
} from "../src/gym-data-validation.js";

const validGym = {
  id: "taipei-test-gym",
  name: "台北測試健身房",
  brandName: "Test",
  branchName: "台北",
  city: "台北市",
  district: "中正區",
  address: "台北市中正區測試路1號",
  latitude: 25.03,
  longitude: 121.52,
  status: "open",
  isLargeContractFirstChain: false,
  isHiddenByDefault: false,
  access: {
    supportsSingleEntry: true,
    supportsNoContractMonthly: false,
    supportsTrial: true,
    requiresMembershipCard: false,
    requiresReservation: false,
    contractNote: "測試資料"
  },
  pricing: [
    {
      type: "single_entry",
      amountTwd: 150,
      unit: "per_entry",
      timeLimitMinutes: 120,
      sourceNote: "測試資料",
      lastVerifiedAt: "2026-07-06"
    }
  ],
  facilities: {
    hasFreeWeights: true,
    hasSquatRack: true,
    hasPowerRack: false,
    hasBenchPress: true,
    hasDeadliftPlatform: false,
    hasCableMachine: true,
    hasCardio: true,
    hasGroupClasses: false,
    hasPersonalTraining: true,
    hasShower: true,
    hasLocker: true,
    hasParking: false,
    is24Hours: false
  },
  openingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    opensAt: "06:00",
    closesAt: "22:00",
    isClosed: false
  })),
  rating: {
    externalRating: 4.5,
    externalRatingCount: 10,
    externalSource: "manual",
    summaryTags: ["測試"]
  },
  verification: {
    confidenceLevel: "verified",
    verificationSource: "manual_research",
    verifiedAt: "2026-07-06"
  },
  contact: {
    phone: "",
    website: "",
    mapUrl: "https://maps.google.com/?q=台北測試健身房"
  }
};

test("validateGymRecord accepts a complete flexible-access gym", () => {
  const result = validateGymRecord(validGym, 0);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("validateGymDataset rejects duplicate ids and invalid Taiwan coordinates", () => {
  const invalid = {
    ...validGym,
    latitude: 41,
    longitude: -73
  };
  const result = validateGymDataset([validGym, invalid]);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((issue) => issue.message.includes("duplicate id")), true);
  assert.equal(result.errors.some((issue) => issue.path === "[1].latitude"), true);
  assert.equal(result.errors.some((issue) => issue.path === "[1].longitude"), true);
});

test("validateGymDataset warns for unverified records without blocking the dataset", () => {
  const unverified = {
    ...validGym,
    id: "taipei-unverified-gym",
    verification: {
      ...validGym.verification,
      confidenceLevel: "unverified"
    }
  };
  const result = validateGymDataset([unverified]);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.some((issue) => issue.message.includes("unverified")), true);
});

test("summarizeGymDataset counts access, city, and confidence coverage", () => {
  const summary = summarizeGymDataset([
    validGym,
    {
      ...validGym,
      id: "newtaipei-test-gym",
      city: "新北市",
      access: {
        ...validGym.access,
        supportsNoContractMonthly: true
      },
      verification: {
        ...validGym.verification,
        confidenceLevel: "likely"
      }
    }
  ]);
  assert.deepEqual(summary.byCity, { "台北市": 1, "新北市": 1 });
  assert.equal(summary.total, 2);
  assert.equal(summary.singleEntryCount, 2);
  assert.equal(summary.noContractCount, 1);
  assert.deepEqual(summary.byConfidence, { verified: 1, likely: 1 });
});

test("current data/gyms.json is structurally valid", async () => {
  const raw = await readFile(new URL("../data/gyms.json", import.meta.url), "utf8");
  const gyms = JSON.parse(raw);
  const result = validateGymDataset(gyms);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/gym-data-validation.test.mjs`

Expected: FAIL with module not found for `src/gym-data-validation.js`.

- [ ] **Step 3: Implement the minimal validator**

Create `src/gym-data-validation.js` with validators for required strings, booleans, enums, Taiwan coordinate bounds, price rows, facilities, opening hours, verification, duplicate ids, and summary counts.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/gym-data-validation.test.mjs`

Expected: PASS for all five validation tests.

- [ ] **Step 5: Commit**

```bash
git add src/gym-data-validation.js tests/gym-data-validation.test.mjs docs/superpowers/plans/2026-07-06-findgym-data-validation.md
git commit -m "feat: add gym data validation core"
```

---

### Task 2: Validation CLI And Documentation

**Files:**
- Create: `scripts/validate-data.mjs`
- Modify: `README.md`
- Modify: `tests/gym-data-validation.test.mjs`

**Interfaces:**
- Consumes: `validateGymDataset(input)` and `summarizeGymDataset(gyms)` from `src/gym-data-validation.js`.
- Produces: CLI command `node scripts/validate-data.mjs [path]`.

- [ ] **Step 1: Write the failing CLI test**

Append this test to `tests/gym-data-validation.test.mjs`:

```js
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("validation CLI prints a summary for the current dataset", async () => {
  const { stdout } = await execFileAsync("node", ["scripts/validate-data.mjs", "data/gyms.json"]);
  assert.equal(stdout.includes("Findgym data validation"), true);
  assert.equal(stdout.includes("Total gyms: 6"), true);
  assert.equal(stdout.includes("Blocking errors: 0"), true);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/gym-data-validation.test.mjs`

Expected: FAIL because `scripts/validate-data.mjs` does not exist.

- [ ] **Step 3: Implement CLI**

Create `scripts/validate-data.mjs` that reads `process.argv[2] || "data/gyms.json"`, parses JSON, prints summary and issues, exits `1` for parse errors or validation errors, and exits `0` for valid data with warnings.

- [ ] **Step 4: Update README**

Add:

```markdown
Validate gym data:

```bash
node scripts/validate-data.mjs data/gyms.json
```
```

- [ ] **Step 5: Run validation**

Run:

```bash
node --test tests/gym-data-validation.test.mjs
node scripts/validate-data.mjs data/gyms.json
```

Expected: tests pass; CLI reports 6 total gyms, 0 blocking errors, and warnings for unverified demo records.

- [ ] **Step 6: Commit**

```bash
git add scripts/validate-data.mjs tests/gym-data-validation.test.mjs README.md
git commit -m "feat: add gym data validation CLI"
```

---

## Self-Review

Spec coverage:

- Data freshness and confidence are checked as warnings.
- Structured fields for pricing, access policy, facilities, opening hours, location, and verification are validated.
- The CLI gives a repeatable local gate before expanding the dataset.

Placeholder scan:

- No `TBD`, `TODO`, `FIXME`, or unresolved "implement later" language should remain in this plan.

Type consistency:

- Tests, CLI, and implementation use camelCase field names matching `data/gyms.json`.
