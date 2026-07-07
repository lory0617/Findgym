import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

test("app shell loads the vendored Leaflet assets before the app module", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const leafletScriptIndex = html.indexOf('src="./assets/vendor/leaflet/leaflet.js"');

  assert.equal(html.includes('href="./assets/vendor/leaflet/leaflet.css"'), true);
  assert.equal(leafletScriptIndex >= 0, true);
  assert.equal(leafletScriptIndex < html.indexOf('src="./src/app.js"'), true);
});

test("leaflet library and marker images are vendored locally", async () => {
  const files = [
    "../assets/vendor/leaflet/leaflet.js",
    "../assets/vendor/leaflet/leaflet.css",
    "../assets/vendor/leaflet/images/marker-icon.png",
    "../assets/vendor/leaflet/images/marker-icon-2x.png",
    "../assets/vendor/leaflet/images/marker-shadow.png"
  ];

  for (const file of files) {
    const stats = await stat(new URL(file, import.meta.url));
    assert.equal(stats.size > 0, true, `${file} should not be empty`);
  }
});

test("map uses OpenStreetMap tiles with the required attribution", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.equal(app.includes("https://tile.openstreetmap.org/{z}/{x}/{y}.png"), true);
  assert.equal(app.includes("https://www.openstreetmap.org/copyright"), true);
  assert.equal(app.includes("OpenStreetMap"), true);
  assert.equal(app.includes("contributors"), true);
});

test("map markers open the gym detail and reuse one Leaflet map instance", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.equal(app.includes("L.map("), true);
  assert.equal(app.includes("fitBounds"), true);
  assert.equal(/marker\.on\("click"/.test(app), true);
});

test("map notice is positioned away from Leaflet zoom controls", async () => {
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const mapNoticeRule = /\.map-notice\s*\{(?<body>[^}]+)\}/.exec(styles)?.groups?.body ?? "";

  assert.equal(mapNoticeRule.includes("right: var(--space-3);"), true);
  assert.equal(mapNoticeRule.includes("left: auto;"), true);
  assert.equal(mapNoticeRule.includes("max-width: calc(100% - 92px);"), true);
});
