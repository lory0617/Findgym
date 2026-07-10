import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Idempotently inject the Android location permissions the app's geolocation
// needs into the generated (git-ignored) Android project. Run after `npx cap
// add android`. Capacitor does NOT auto-merge the geolocation plugin's
// permissions, so this keeps the required native tweak reproducible without
// committing android/.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "android/app/src/main/AndroidManifest.xml");

// Pure, testable core: given the manifest XML, return the patched content and
// how many permissions were added. Idempotent — re-running on its own output
// adds nothing.
export function patchManifest(xmlString) {
  if (xmlString.includes("android.permission.ACCESS_FINE_LOCATION")) {
    return { content: xmlString, added: 0 };
  }

  const block =
    '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />\n' +
    '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n';

  const content = xmlString.replace(/<\/manifest>/, `${block}</manifest>`);
  return { content, added: 2 };
}

// Only run the CLI side-effects when executed directly, not when imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  let manifest;
  try {
    manifest = await readFile(manifestPath, "utf8");
  } catch {
    console.error(
      `Android project not found at ${manifestPath}. Run 'npx cap add android' first.`
    );
    process.exit(1);
  }

  const { content, added } = patchManifest(manifest);

  if (added > 0) {
    await writeFile(manifestPath, content);
  }

  console.log(
    `patch-android: added ${added} location permission${added === 1 ? "" : "s"} (2 required)`
  );
}
