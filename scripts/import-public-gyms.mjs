import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateGymDataset } from "../src/gym-data-validation.js";
import { normalizeSourcePackage } from "../src/gym-source-normalization.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { inputPath, outputPath } = parseArgs(process.argv.slice(2));

if (!inputPath) {
  console.error("Usage: node scripts/import-public-gyms.mjs <source.json> --output <candidates.json>");
  process.exit(1);
}

await main();

async function main() {
  try {
    const source = JSON.parse(await readFile(resolve(inputPath), "utf8"));
    const chainPatterns = JSON.parse(await readFile(resolve(repoRoot, "data/large-chain-blocklist.json"), "utf8"));
    const importResult = normalizeSourcePackage(source, { chainPatterns });
    const validation = validateGymDataset(importResult.candidates);
    const errors = [...importResult.errors, ...validation.errors];

    printSummary(source, importResult, validation, outputPath);

    if (errors.length > 0) {
      process.exitCode = 1;
      return;
    }

    if (outputPath) {
      await writeFile(resolve(outputPath), `${JSON.stringify(importResult.candidates, null, 2)}\n`);
    }
  } catch (error) {
    console.error("Findgym public gym import");
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

function parseArgs(args) {
  const input = args.find((arg) => !arg.startsWith("--"));
  const outputFlagIndex = args.indexOf("--output");

  return {
    inputPath: input,
    outputPath: outputFlagIndex >= 0 ? args[outputFlagIndex + 1] : ""
  };
}

function printSummary(source, importResult, validation, outputPath) {
  console.log("Findgym public gym import");
  console.log(`Source: ${source.sourceName ?? "unknown"}`);
  console.log(`Records: ${Array.isArray(source.records) ? source.records.length : 0}`);
  console.log(`Candidates: ${importResult.candidates.length}`);
  console.log(`Rejected: ${importResult.rejected.length}`);
  console.log(`Errors: ${importResult.errors.length + validation.errors.length}`);
  console.log(`Output: ${outputPath || "not written"}`);

  if (importResult.rejected.length > 0) {
    console.log("Rejected rows:");
    importResult.rejected.forEach((row) => {
      console.log(`  - [${row.index}] ${row.name || "unnamed"}: ${row.reason}`);
    });
  }

  if (importResult.errors.length > 0 || validation.errors.length > 0) {
    console.log("Errors:");
    [...importResult.errors, ...validation.errors].forEach((error) => {
      console.log(`  - ${error.path}: ${error.message}`);
    });
  }
}
