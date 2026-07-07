import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { summarizeGymDataset, validateGymDataset } from "../src/gym-data-validation.js";

const datasetPath = process.argv[2] || "data/gyms.json";
const absolutePath = resolve(datasetPath);

try {
  const raw = await readFile(absolutePath, "utf8");
  const data = JSON.parse(raw);
  const validation = validateGymDataset(data);
  const summary = summarizeGymDataset(Array.isArray(data) ? data : []);

  printSummary(datasetPath, summary, validation);

  if (!validation.valid) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Findgym data validation");
  console.error(`File: ${datasetPath}`);
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}

function printSummary(filePath, summary, validation) {
  console.log("Findgym data validation");
  console.log(`File: ${filePath}`);
  console.log(`Total gyms: ${summary.total}`);
  console.log(`Flexible access gyms: ${summary.flexibleAccessCount}`);
  console.log(`Single-entry gyms: ${summary.singleEntryCount}`);
  console.log(`No-contract monthly gyms: ${summary.noContractCount}`);
  console.log(`Hidden by default: ${summary.hiddenByDefaultCount}`);
  console.log(`Stale or unverified: ${summary.staleOrUnverifiedCount}`);
  console.log(`Blocking errors: ${validation.errors.length}`);
  console.log(`Warnings: ${validation.warnings.length}`);

  printCounts("Cities", summary.byCity);
  printCounts("Confidence", summary.byConfidence);
  printIssues("Errors", validation.errors);
  printIssues("Warnings", validation.warnings);
}

function printCounts(label, counts) {
  console.log(`${label}:`);

  const entries = Object.entries(counts);

  if (entries.length === 0) {
    console.log("  - none");
    return;
  }

  entries
    .sort(([left], [right]) => left.localeCompare(right, "zh-Hant"))
    .forEach(([key, value]) => {
      console.log(`  - ${key}: ${value}`);
    });
}

function printIssues(label, issues) {
  console.log(`${label}:`);

  if (issues.length === 0) {
    console.log("  - none");
    return;
  }

  issues.forEach((issue) => {
    console.log(`  - ${issue.path}: ${issue.message}`);
  });
}
