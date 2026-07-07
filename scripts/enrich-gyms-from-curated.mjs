import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { enrichGymsFromCurated } from "../src/curated-gym-source.js";
import { validateGymDataset } from "../src/gym-data-validation.js";

const { gymsPath, csvPath, outputPath, fetchedAt } = parseArgs(process.argv.slice(2));

if (!gymsPath || !csvPath) {
  console.error(
    "Usage: node scripts/enrich-gyms-from-curated.mjs <gyms.json> <curated.csv> --output <gyms.json> [--fetched-at <YYYY-MM-DD>]"
  );
  process.exit(1);
}

try {
  const gyms = JSON.parse(await readFile(resolve(gymsPath), "utf8"));
  const csvText = await readFile(resolve(csvPath), "utf8");
  const result = enrichGymsFromCurated(gyms, csvText, { fetchedAt });
  const validation = validateGymDataset(result.gyms);

  console.log("Findgym curated enrichment");
  console.log(`Gyms: ${gyms.length}`);
  console.log(`Enriched: ${result.enriched.length}`);
  console.log(`Unmatched: ${result.unmatched.length}`);
  console.log(`Validation errors: ${validation.errors.length}`);
  console.log(`Output: ${outputPath || "not written"}`);

  if (result.unmatched.length > 0) {
    console.log("Unmatched rows:");
    result.unmatched.forEach((row) => {
      console.log(`  - ${row.name}: ${row.address}`);
    });
  }

  if (validation.errors.length > 0) {
    validation.errors.slice(0, 10).forEach((error) => {
      console.log(`  - ${error.path}: ${error.message}`);
    });
    process.exitCode = 1;
  } else if (outputPath) {
    await writeFile(resolve(outputPath), `${JSON.stringify(result.gyms, null, 2)}\n`);
  }
} catch (error) {
  console.error("Findgym curated enrichment");
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}

function parseArgs(args) {
  const positional = args.filter((arg) => !arg.startsWith("--") && !isFlagValue(args, arg));
  const outputFlagIndex = args.indexOf("--output");
  const fetchedAtFlagIndex = args.indexOf("--fetched-at");

  return {
    gymsPath: positional[0],
    csvPath: positional[1],
    outputPath: outputFlagIndex >= 0 ? args[outputFlagIndex + 1] : "",
    fetchedAt: fetchedAtFlagIndex >= 0 ? args[fetchedAtFlagIndex + 1] : new Date().toISOString().slice(0, 10)
  };
}

function isFlagValue(args, arg) {
  const index = args.indexOf(arg);
  return index > 0 && args[index - 1].startsWith("--");
}
