# Findgym Data Sourcing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compliant import-candidate pipeline for public or authorized gym sources while blocking Google Maps, Gymnomad, and large contract-first chains from direct import.

**Architecture:** Keep source normalization isolated from UI code. The CLI reads source packages, calls pure normalization functions, validates normalized candidates with the existing gym validator, and writes candidates to a separate file.

**Tech Stack:** Node.js ESM, built-in `node:test`, JSON source/config files, no runtime dependencies.

## Global Constraints

- Do not scrape or copy Google Maps, Gymnomad, or competitor directory data into Findgym.
- Keep imported candidates separate from `data/gyms.json`.
- Reject large contract-first chain rows by default.
- Add failing tests before production code.
- Do not add external package dependencies.

---

### Task 1: Source Normalization Core

**Files:**
- Create: `src/gym-source-normalization.js`
- Create: `tests/gym-source-normalization.test.mjs`
- Create: `data/large-chain-blocklist.json`

**Interfaces:**
- Produces: `isLargeChainName(name, patterns) -> boolean`
- Produces: `validateSourcePackage(packageInput) -> { valid: boolean, errors: Issue[] }`
- Produces: `normalizeSourcePackage(packageInput, options) -> { candidates: Gym[], rejected: Rejection[], errors: Issue[] }`

- [ ] Write tests for chain matching, blocked aggregation source rejection, and normalized candidate shape.
- [ ] Run `node --test tests/gym-source-normalization.test.mjs` and confirm expected failures.
- [ ] Implement the pure functions with deterministic IDs and source attribution.
- [ ] Run `node --test tests/gym-source-normalization.test.mjs` and confirm pass.
- [ ] Run `node --test tests/*.mjs` and confirm existing tests still pass.

### Task 2: Import CLI

**Files:**
- Create: `scripts/import-public-gyms.mjs`
- Modify: `tests/gym-source-normalization.test.mjs`
- Create: `data/public-gym-sources.sample.json`

**Interfaces:**
- Consumes: `normalizeSourcePackage(packageInput, options)`
- Produces: CLI `node scripts/import-public-gyms.mjs <source.json> --output <file.json>`

- [ ] Write a CLI test that imports the sample source file, rejects a large chain row, writes candidates to a temp JSON file, and prints counts.
- [ ] Run the CLI test and confirm expected failure before the script exists.
- [ ] Implement the CLI using only Node built-ins.
- [ ] Run the CLI test and confirm pass.
- [ ] Run `node scripts/import-public-gyms.mjs data/public-gym-sources.sample.json --output /tmp/findgym-import-candidates.json` and inspect counts.

### Task 3: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-07-findgym-data-sourcing-design.md`

**Interfaces:**
- Documents source classes, blocked sources, and import command.

- [ ] Add source-policy and import-candidate usage notes to README.
- [ ] Run `node --test tests/*.mjs`.
- [ ] Run `node --check src/gym-source-normalization.js`.
- [ ] Run `node --check scripts/import-public-gyms.mjs`.
- [ ] Run `python3 -m json.tool data/large-chain-blocklist.json`.
- [ ] Run `python3 -m json.tool data/public-gym-sources.sample.json`.
- [ ] Run `node scripts/validate-data.mjs data/gyms.json`.
- [ ] Commit and push the branch.
