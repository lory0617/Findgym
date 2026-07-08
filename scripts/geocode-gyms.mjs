import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Fill missing latitude/longitude on gym records by geocoding their address via
// the OpenStreetMap Nominatim API (no key required). Nominatim's Taiwan
// house-number coverage is sparse, so we fall back to street level; geocoded
// entries are tagged so they can be re-verified with a precise source later.
//
// Usage: node scripts/geocode-gyms.mjs data/gyms.json --output data/gyms.json [--limit N]
// Respects Nominatim's 1 request/second usage policy.

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Findgym/1.0 (Taiwan gym directory; address geocoding)";
const TW_BOUNDS = { minLat: 21.5, maxLat: 25.5, minLng: 118.0, maxLng: 122.5 };
const APPROX_TAG = "座標街區約略";

const { gymsPath, outputPath, limit } = parseArgs(process.argv.slice(2));

if (!gymsPath) {
  console.error("Usage: node scripts/geocode-gyms.mjs <gyms.json> --output <gyms.json> [--limit N]");
  process.exit(1);
}

const gyms = JSON.parse(await readFile(resolve(gymsPath), "utf8"));
const targets = gyms.filter((gym) => gym.latitude === null || gym.longitude === null);
const slice = limit ? targets.slice(0, limit) : targets;

console.log(`Findgym geocode | missing coords: ${targets.length}${limit ? ` | this run: ${slice.length}` : ""}`);

let filled = 0;
let missed = 0;

for (let index = 0; index < slice.length; index += 1) {
  const gym = slice[index];
  const coordinate = await geocode(gym.address);

  if (coordinate) {
    gym.latitude = coordinate.lat;
    gym.longitude = coordinate.lng;
    const tags = gym.rating?.summaryTags;
    if (Array.isArray(tags) && !tags.includes(APPROX_TAG)) {
      tags.push(APPROX_TAG);
    }
    filled += 1;
    console.log(`  [${index + 1}/${slice.length}] ${gym.name} -> ${coordinate.lat},${coordinate.lng} (${coordinate.via})`);
  } else {
    missed += 1;
    console.log(`  [${index + 1}/${slice.length}] ${gym.name} -> no match`);
  }
}

console.log(`Filled: ${filled} | still missing: ${targets.length - filled} | no match this run: ${missed}`);

if (outputPath) {
  await writeFile(resolve(outputPath), `${JSON.stringify(gyms, null, 2)}\n`);
  console.log(`Output: ${outputPath}`);
}

function addressVariants(address) {
  let base = String(address ?? "")
    .replace(/^\[?\d{3,6}\]?/, "")
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .replace(/\s+/g, "")
    .trim();

  const full = base.replace(/([0-9]+號).*$/, "$1");
  let street = base.replace(/[0-9]+(-[0-9]+)?號.*$/, "");
  if (street.includes("段")) {
    street = street.replace(/(段).*$/, "$1");
  }

  return [...new Set([full, street])].filter(Boolean);
}

async function geocode(address) {
  for (const query of addressVariants(address)) {
    const url = `${NOMINATIM}?${new URLSearchParams({ q: query, format: "json", countrycodes: "tw", limit: "1" })}`;
    await sleep(1100); // Nominatim policy: max 1 req/sec

    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!response.ok) {
        continue;
      }
      const results = await response.json();
      if (results.length === 0) {
        continue;
      }
      const lat = Number(Number(results[0].lat).toFixed(6));
      const lng = Number(Number(results[0].lon).toFixed(6));
      if (lat > TW_BOUNDS.minLat && lat < TW_BOUNDS.maxLat && lng > TW_BOUNDS.minLng && lng < TW_BOUNDS.maxLng) {
        return { lat, lng, via: query };
      }
    } catch {
      // network hiccup — try the next variant
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

function parseArgs(args) {
  const positional = args.find((arg) => !arg.startsWith("--"));
  const outputFlagIndex = args.indexOf("--output");
  const limitFlagIndex = args.indexOf("--limit");

  return {
    gymsPath: positional,
    outputPath: outputFlagIndex >= 0 ? args[outputFlagIndex + 1] : "",
    limit: limitFlagIndex >= 0 ? Number(args[limitFlagIndex + 1]) : 0
  };
}
