# Findgym Data Sourcing Design

## Goal

Build a compliant data intake path for expanding Findgym beyond demo records without copying restricted third-party directories.

## Source Policy

Findgym can use these source classes for import candidates:

- `government_open_data`: public government datasets whose license permits reuse with attribution.
- `open_knowledge_base`: open knowledge bases such as Wikidata when their license permits reuse.
- `official_venue`: an individual gym, sports center, city sports bureau, or venue operator official page.
- `venue_submission`: data submitted by the venue through a form or partner workflow.
- `licensed_partner`: third-party directory data only after written permission.
- `manual_research`: human-entered records backed by an allowed `sourceUrl`.

Findgym must not import these as raw data sources without written permission:

- Google Maps or Google Places listings, reviews, photos, ratings, or bulk place details.
- Gymnomad directory/listing data, including venue lists, rewritten descriptions, prices, facilities, photos, and compiled ratings.
- Any competitor directory that marks content as all rights reserved or prohibits commercial reuse.

Gymnomad remains useful as product research: filter vocabulary, result-card density, map/list layout, and missing market coverage. It is not a database source unless we obtain authorization.

## Data Flow

1. A source package is stored as JSON with source metadata and raw venue rows.
2. The import CLI validates the package source type, license, URL, and rows.
3. Rows from blocked aggregation sources are rejected.
4. Large contract-first chains are flagged and excluded from imported candidates by default.
5. Valid rows are normalized into the existing gym record shape and written to an import-candidate JSON file.
6. Import candidates remain separate from `data/gyms.json` until manual review verifies price, hours, facilities, and provenance.

## Data Shape

Each source package includes:

- `sourceId`
- `sourceName`
- `sourceType`
- `sourceUrl`
- `sourceLicense`
- `fetchedAt`
- `records`

Each normalized candidate includes the current gym schema plus a `source` object:

- `sourceId`
- `sourceName`
- `sourceType`
- `sourceUrl`
- `sourceRecordUrl`
- `sourceLicense`
- `importedAt`
- `authorizationDocument` when `sourceType` is `licensed_partner`

## Exclusion Rules

Large contract-first chains are detected by maintainable pattern lists in `data/large-chain-blocklist.json`. Matching rows are rejected by the import CLI unless a future review flow explicitly imports them as hidden records.

Known aggregation sources such as Gymnomad are blocked unless the source package uses `sourceType: "licensed_partner"` and includes an `authorizationDocument` reference. Google Maps and Google Places source types remain blocked.

The first blocklist covers obvious large chain strings such as World Gym, Fitness Factory, Anytime Fitness, True Fitness, and Curves. This list is operational, not a legal or market-size claim, and can be updated as the product definition changes.

## Verification

Automated verification covers:

- source package validation
- blocked source rejection
- chain blocklist matching
- normalized gym schema compatibility
- CLI output writing
- existing dataset validation

Manual verification remains required before public launch because prices, hours, and facilities can change frequently.

## First Seed Batch

The first source-backed expansion uses Wikidata as a seed for Taiwan sports centers. The converter accepts only rows that include venue name, address, district/city, and coordinates. Incomplete rows are skipped and must be completed from official venue or government pages before import.

Wikidata seed rows are imported with `amountTwd: null` for hourly pricing. This marks the venue as a likely single-entry or timed public sports-center candidate without displaying a false price.
