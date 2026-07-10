import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { patchManifest } from "../scripts/patch-android.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appSource = await readFile(resolve(root, "src/app.js"), "utf8");
const patchSource = await readFile(resolve(root, "scripts/patch-android.mjs"), "utf8");

test("app.js routes geolocation through the Capacitor-aware compat helper", () => {
  assert.ok(
    appSource.includes("getCurrentPositionCompat"),
    "getCurrentPositionCompat helper must exist"
  );
  assert.ok(
    appSource.includes("Capacitor?.Plugins?.Geolocation"),
    "must access the native Geolocation plugin proxy"
  );
  assert.ok(
    appSource.includes("isNativePlatform"),
    "must gate on isNativePlatform"
  );
});

test("navigator.geolocation.getCurrentPosition appears exactly once (only in the compat helper)", () => {
  const occurrences = appSource.split("navigator.geolocation.getCurrentPosition").length - 1;
  assert.equal(
    occurrences,
    1,
    "call sites must be routed through getCurrentPositionCompat, leaving one raw call"
  );
});

test("patch-android.mjs references both permissions and the closing manifest tag", () => {
  assert.ok(patchSource.includes("ACCESS_COARSE_LOCATION"));
  assert.ok(patchSource.includes("ACCESS_FINE_LOCATION"));
  assert.ok(patchSource.includes("</manifest>"));
});

test("patchManifest is idempotent: adds 2 then 0, keeping one </manifest>", async () => {
  const dir = await mkdtemp(join(tmpdir(), "findgym-manifest-"));
  const fakeManifest =
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n' +
    '    <uses-permission android:name="android.permission.INTERNET" />\n' +
    "</manifest>";
  const manifestPath = join(dir, "AndroidManifest.xml");
  await writeFile(manifestPath, fakeManifest);

  const first = patchManifest(await readFile(manifestPath, "utf8"));
  assert.equal(first.added, 2, "first patch adds both location permissions");
  await writeFile(manifestPath, first.content);
  assert.ok(first.content.includes("ACCESS_COARSE_LOCATION"));
  assert.ok(first.content.includes("ACCESS_FINE_LOCATION"));

  const second = patchManifest(await readFile(manifestPath, "utf8"));
  assert.equal(second.added, 0, "second patch is a no-op");

  const closingTags = second.content.split("</manifest>").length - 1;
  assert.equal(closingTags, 1, "must keep exactly one closing manifest tag");
});
