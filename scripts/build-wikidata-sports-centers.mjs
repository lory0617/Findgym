import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildWikidataSportsCenterSourcePackage } from "../src/wikidata-sports-center-source.js";

const { inputPath, outputPath } = parseArgs(process.argv.slice(2));

if (!inputPath) {
  console.error("Usage: node scripts/build-wikidata-sports-centers.mjs <wikidata-sparql.json> --output <source-package.json>");
  process.exit(1);
}

try {
  const raw = await readFile(resolve(inputPath), "utf8");
  const data = JSON.parse(raw);
  const result = buildWikidataSportsCenterSourcePackage(data);

  printSummary(data, result, outputPath);

  if (outputPath) {
    await writeFile(resolve(outputPath), `${JSON.stringify(result.sourcePackage, null, 2)}\n`);
  }
} catch (error) {
  console.error("Findgym Wikidata sports center source build");
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}

function parseArgs(args) {
  const input = args.find((arg) => !arg.startsWith("--"));
  const outputFlagIndex = args.indexOf("--output");

  return {
    inputPath: input,
    outputPath: outputFlagIndex >= 0 ? args[outputFlagIndex + 1] : ""
  };
}

function printSummary(data, result, outputPath) {
  const rowCount = Array.isArray(data?.results?.bindings) ? data.results.bindings.length : 0;

  console.log("Findgym Wikidata sports center source build");
  console.log(`Input rows: ${rowCount}`);
  console.log(`Source records: ${result.sourcePackage.records.length}`);
  console.log(`Skipped: ${result.skipped.length}`);
  console.log(`Output: ${outputPath || "not written"}`);

  if (result.skipped.length > 0) {
    console.log("Skipped rows:");
    result.skipped.forEach((row) => {
      console.log(`  - [${row.index}] ${row.name || "unnamed"}: ${row.reason}`);
    });
  }
}
