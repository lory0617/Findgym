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
node --test tests/findgym-core.test.mjs
```

Validate gym data:

```bash
node scripts/validate-data.mjs data/gyms.json
```

## Prototype Scope

This prototype uses demonstration gym records. Prices, opening hours, ratings, and facilities must be re-verified before public launch.
