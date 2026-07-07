import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildCuratedGymSourcePackage } from "../src/curated-gym-source.js";

const { inputPath, outputPath, existingPath, fetchedAt } = parseArgs(process.argv.slice(2));

if (!inputPath) {
  console.error(
    "Usage: node scripts/build-curated-gyms.mjs <curated.csv> --output <source-package.json> [--existing <gyms.json>] [--fetched-at <YYYY-MM-DD>]"
  );
  process.exit(1);
}

try {
  const csvText = await readFile(resolve(inputPath), "utf8");
  const existingGyms = existingPath ? JSON.parse(await readFile(resolve(existingPath), "utf8")) : [];
  const result = buildCuratedGymSourcePackage(csvText, { fetchedAt, existingGyms });

  printSummary(result, outputPath);

  if (outputPath) {
    await writeFile(resolve(outputPath), `${JSON.stringify(result.sourcePackage, null, 2)}\n`);
  }
} catch (error) {
  console.error("Findgym curated gym source build");
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}

function parseArgs(args) {
  const input = args.find((arg) => !arg.startsWith("--"));
  const outputFlagIndex = args.indexOf("--output");
  const existingFlagIndex = args.indexOf("--existing");
  const fetchedAtFlagIndex = args.indexOf("--fetched-at");

  return {
    inputPath: input,
    outputPath: outputFlagIndex >= 0 ? args[outputFlagIndex + 1] : "",
    existingPath: existingFlagIndex >= 0 ? args[existingFlagIndex + 1] : "",
    fetchedAt: fetchedAtFlagIndex >= 0 ? args[fetchedAtFlagIndex + 1] : new Date().toISOString().slice(0, 10)
  };
}

function printSummary(result, outputPath) {
  console.log("Findgym curated gym source build");
  console.log(`Source records: ${result.sourcePackage.records.length}`);
  console.log(`Skipped: ${result.skipped.length}`);
  console.log(`Output: ${outputPath || "not written"}`);

  const reasonCounts = new Map();

  result.skipped.forEach((row) => {
    reasonCounts.set(row.reason, (reasonCounts.get(row.reason) ?? 0) + 1);
  });

  if (reasonCounts.size > 0) {
    console.log("Skipped by reason:");
    [...reasonCounts.entries()].forEach(([reason, count]) => {
      console.log(`  - ${reason}: ${count}`);
    });
  }
}
