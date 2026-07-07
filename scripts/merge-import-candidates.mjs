import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateGymDataset } from "../src/gym-data-validation.js";
import { mergeGymDatasets } from "../src/gym-data-merge.js";

const { existingPath, candidatesPath, outputPath } = parseArgs(process.argv.slice(2));

if (!existingPath || !candidatesPath) {
  console.error("Usage: node scripts/merge-import-candidates.mjs <gyms.json> <candidates.json> --output <merged.json>");
  process.exit(1);
}

await main();

async function main() {
  try {
    const existing = JSON.parse(await readFile(resolve(existingPath), "utf8"));
    const candidates = JSON.parse(await readFile(resolve(candidatesPath), "utf8"));
    const result = mergeGymDatasets(existing, candidates);
    const validation = validateGymDataset(result.merged);

    printSummary(existing, candidates, result, validation, outputPath);

    if (!validation.valid) {
      process.exitCode = 1;
      return;
    }

    if (outputPath) {
      await writeFile(resolve(outputPath), `${JSON.stringify(result.merged, null, 2)}\n`);
    }
  } catch (error) {
    console.error("Findgym candidate merge");
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

function parseArgs(args) {
  const paths = args.filter((arg) => !arg.startsWith("--"));
  const outputFlagIndex = args.indexOf("--output");

  return {
    existingPath: paths[0],
    candidatesPath: paths[1],
    outputPath: outputFlagIndex >= 0 ? args[outputFlagIndex + 1] : ""
  };
}

function printSummary(existing, candidates, result, validation, outputPath) {
  console.log("Findgym candidate merge");
  console.log(`Existing: ${Array.isArray(existing) ? existing.length : 0}`);
  console.log(`Candidates: ${Array.isArray(candidates) ? candidates.length : 0}`);
  console.log(`Added: ${result.added.length}`);
  console.log(`Skipped: ${result.skipped.length}`);
  console.log(`Merged total: ${result.merged.length}`);
  console.log(`Validation errors: ${validation.errors.length}`);
  console.log(`Output: ${outputPath || "not written"}`);

  if (result.skipped.length > 0) {
    console.log("Skipped rows:");
    result.skipped.forEach((row) => {
      console.log(`  - [${row.index}] ${row.name || row.id || "unnamed"}: ${row.reason}`);
    });
  }

  if (validation.errors.length > 0) {
    console.log("Validation errors:");
    validation.errors.forEach((error) => {
      console.log(`  - ${error.path}: ${error.message}`);
    });
  }
}
