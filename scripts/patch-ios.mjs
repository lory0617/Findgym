import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Idempotently inject the iOS location-usage strings the app's geolocation
// needs into the generated (git-ignored) iOS project. Run after `npx cap add
// ios`. Keeps the required native tweak reproducible without committing ios/.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plistPath = resolve(root, "ios/App/App/Info.plist");

const ENTRIES = {
  NSLocationWhenInUseUsageDescription:
    "Findgym uses your location to show nearby gyms and sort results by distance."
};

let plist;
try {
  plist = await readFile(plistPath, "utf8");
} catch {
  console.error(`iOS project not found at ${plistPath}. Run 'npx cap add ios' first.`);
  process.exit(1);
}

let added = 0;
for (const [key, value] of Object.entries(ENTRIES)) {
  if (plist.includes(`<key>${key}</key>`)) {
    continue;
  }
  const block = `\t<key>${key}</key>\n\t<string>${value}</string>\n`;
  plist = plist.replace(/(\n?)<\/dict>\n<\/plist>/, `\n${block}</dict>\n</plist>`);
  added += 1;
}

if (added > 0) {
  await writeFile(plistPath, plist);
}

console.log(`patch-ios: added ${added} Info.plist entr${added === 1 ? "y" : "ies"} (${Object.keys(ENTRIES).length} required)`);
