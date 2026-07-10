import { cp, rm, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Assemble the runtime web assets into www/ — the clean directory Capacitor
// bundles into the native apps. The repo root stays the GitHub Pages source.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "www");
const ASSETS = ["index.html", "privacy.html", "manifest.webmanifest", "sw.js", "src", "assets", "data"];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const entry of ASSETS) {
  await cp(resolve(root, entry), resolve(out, entry), { recursive: true });
}

console.log(`Built web bundle → www/ (${ASSETS.length} entries)`);
