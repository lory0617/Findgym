# Findgym

Findgym is a Taiwan gym discovery product focused on gyms that are easy to enter without long-term contracts.

The first product direction is a mobile-first directory that helps users:

- Find nearby pay-per-use or no-contract gyms.
- Compare price, facilities, ratings, opening hours, and travel distance.
- Navigate from a map-first experience.
- Report missing or outdated gym information.

The initial product design is documented in:

- `docs/superpowers/specs/2026-07-06-findgym-mvp-design.md`

## Live Demo

Deployed as an installable PWA on GitHub Pages: **https://lory0617.github.io/Findgym/**

The app is offline-capable via `sw.js` — the app shell, map assets, and gym
data are cached, so it opens without a connection (live OpenStreetMap tiles
still require network). Add it to a phone home screen from the browser's
"Add to Home Screen" / install prompt.

## Native App (Capacitor)

The same web app is packaged into native iOS/Android apps with
[Capacitor](https://capacitorjs.com/) — no rewrite; the native shell loads the
bundled web assets. The native projects (`android/`, `ios/`) are generated from
`capacitor.config.json` and are git-ignored; regenerate them from a clean
checkout:

```bash
npm install
npm run build:web          # assemble the web bundle into www/
npx cap add android        # generate the Android project
npx cap add ios            # generate the iOS project (needs full Xcode + CocoaPods)
npm run patch:ios          # inject the location Info.plist keys into ios/
npm run patch:android      # inject the location permissions into android/
npm run sync               # rebuild www/ and copy into the native projects
npm run open:android       # open in Android Studio
npm run open:ios           # open in Xcode
```

After any change to the web app, run `npm run sync` before building the native
apps. Geolocation uses `@capacitor/geolocation` via the Capacitor bridge on
native. The plugin's native permissions are **not** merged automatically, so
after generating the platform projects you must run `npm run patch:android`
(adds `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION` to
`AndroidManifest.xml`) and `npm run patch:ios` (adds the iOS
`NSLocationWhenInUseUsageDescription` string). Rerun both after regenerating
`android/` or `ios/`. `npm run sync` also runs both patches (skipping any
platform that is not present).

### iOS prerequisites (you provide)

`pod install` and building require **full Xcode**, not just Command Line
Tools. After installing Xcode from the Mac App Store:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
cd ios/App && pod install    # or: npm run sync
```

Then open `ios/App/App.xcworkspace` in Xcode, set your signing team, and build.

**Prerequisites** you provide: full Xcode + CocoaPods (`brew install
cocoapods`) for iOS, Android Studio + SDK for Android, and paid developer
accounts to publish — Apple Developer ($99/yr) and Google Play ($25 one-time).

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

Build the Sports Administration (體育署) national sports facility package from the data.gov.tw CSV (dataset 22849), import candidates, and merge them into the app dataset:

```bash
node scripts/build-sagov-gyms.mjs /path/to/sagov-venues.csv --output data/public-gym-sources.sagov-gyms.json --existing data/gyms.json --fetched-at YYYY-MM-DD
node scripts/import-public-gyms.mjs data/public-gym-sources.sagov-gyms.json --output data/import-candidates/sagov-gyms.candidates.json
node scripts/merge-import-candidates.mjs data/gyms.json data/import-candidates/sagov-gyms.candidates.json --output data/gyms.json
```

Build the owner-curated single-entry gym package from the research CSV, import candidates, and merge them into the app dataset:

```bash
node scripts/build-curated-gyms.mjs data/research/taiwan_single_or_minute_gyms_no_big_chains_v3_2026-07-07.csv --output data/public-gym-sources.curated-gyms.json --existing data/gyms.json --fetched-at YYYY-MM-DD
node scripts/import-public-gyms.mjs data/public-gym-sources.curated-gyms.json --output data/import-candidates/curated-gyms.candidates.json
node scripts/merge-import-candidates.mjs data/gyms.json data/import-candidates/curated-gyms.candidates.json --output data/gyms.json
```

Re-apply curated pricing and access details onto venues already in the dataset (safe to re-run; matches by name and normalized address):

```bash
node scripts/enrich-gyms-from-curated.mjs data/gyms.json data/research/taiwan_single_or_minute_gyms_no_big_chains_v3_2026-07-07.csv --output data/gyms.json --fetched-at YYYY-MM-DD
```

## Map

The map view uses [Leaflet](https://leafletjs.com/) (vendored at `assets/vendor/leaflet/`, v1.9.4) with OpenStreetMap standard tiles. Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licensed under ODbL; the attribution control must stay visible. For production traffic, switch to a commercial tile provider or self-hosted tiles per the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

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
