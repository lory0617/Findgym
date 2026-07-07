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

Build the Wikidata public sports-center seed package, import candidates, and merge them into the app dataset:

```bash
node scripts/build-wikidata-sports-centers.mjs /path/to/wikidata-sparql.json --output data/public-gym-sources.wikidata-sports-centers.json
node scripts/import-public-gyms.mjs data/public-gym-sources.wikidata-sports-centers.json --output data/import-candidates/wikidata-sports-centers.candidates.json
node scripts/merge-import-candidates.mjs data/gyms.json data/import-candidates/wikidata-sports-centers.candidates.json --output data/gyms.json
```

Build the Wikipedia public sports-center seed package from a saved page HTML, import candidates, and merge them into the app dataset:

```bash
node scripts/build-wikipedia-sports-centers.mjs /path/to/wikipedia-page.html --output data/public-gym-sources.wikipedia-sports-centers.json
node scripts/import-public-gyms.mjs data/public-gym-sources.wikipedia-sports-centers.json --output data/import-candidates/wikipedia-sports-centers.candidates.json
node scripts/merge-import-candidates.mjs data/gyms.json data/import-candidates/wikipedia-sports-centers.candidates.json --output data/gyms.json
```

## Prototype Scope

This prototype uses demonstration and source-backed candidate gym records. Prices, opening hours, ratings, and facilities must be re-verified before public launch.

## Data Sourcing Policy

Findgym should expand coverage from sources that are safe to reuse:

- government open data with reuse terms
- official venue or city sports-center pages
- venue-submitted data
- licensed partner feeds with a written authorization reference
- manual research backed by an allowed `sourceUrl`
- open knowledge bases such as Wikidata or Wikipedia when their license allows reuse and attribution is recorded

Do not import Google Maps, Google Places, Gymnomad, or another competitor directory as raw venue data unless a written license explicitly permits it. Gymnomad is useful for product research and UI benchmarking, but its directory data is blocked from import by default.

Imported rows are written as candidate JSON and must be manually reviewed before merging into `data/gyms.json`. Large contract-first chain rows are rejected by default through `data/large-chain-blocklist.json`.

The data-sourcing design is documented in:

- `docs/superpowers/specs/2026-07-07-findgym-data-sourcing-design.md`
