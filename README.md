# Findgym

Findgym is a Taiwan gym discovery product focused on gyms that are easy to enter without long-term contracts.

The first product direction is a mobile-first directory that helps users:

- Find nearby pay-per-use or no-contract gyms.
- Compare price, facilities, ratings, opening hours, and travel distance.
- Navigate from a map-first experience.
- Report missing or outdated gym information.

The initial product design is documented in:

- `docs/superpowers/specs/2026-07-06-findgym-mvp-design.md`

## Local Prototype

Run a static server from the repo root:

```bash
python3 -m http.server 5173
```

Open `http://localhost:5173`.

Run core tests:

```bash
node --test tests/*.mjs
```

Validate gym data:

```bash
node scripts/validate-data.mjs data/gyms.json
```

Import candidate gyms from an allowed public or authorized source package:

```bash
node scripts/import-public-gyms.mjs data/public-gym-sources.sample.json --output /tmp/findgym-import-candidates.json
```

## Prototype Scope

This prototype uses demonstration gym records. Prices, opening hours, ratings, and facilities must be re-verified before public launch.

## Data Sourcing Policy

Findgym should expand coverage from sources that are safe to reuse:

- government open data with reuse terms
- official venue or city sports-center pages
- venue-submitted data
- licensed partner feeds with a written authorization reference
- manual research backed by an allowed `sourceUrl`

Do not import Google Maps, Google Places, Gymnomad, or another competitor directory as raw venue data unless a written license explicitly permits it. Gymnomad is useful for product research and UI benchmarking, but its directory data is blocked from import by default.

Imported rows are written as candidate JSON and must be manually reviewed before merging into `data/gyms.json`. Large contract-first chain rows are rejected by default through `data/large-chain-blocklist.json`.

The data-sourcing design is documented in:

- `docs/superpowers/specs/2026-07-07-findgym-data-sourcing-design.md`
