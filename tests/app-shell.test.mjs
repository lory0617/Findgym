import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("app shell exposes a global missing-gym report action", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(html.includes('data-action="open-report"'), true);
  assert.equal(html.includes("新增據點"), true);
});

test("app shell includes directory-style navigation and search controls", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(html.includes('class="main-nav"'), true);
  assert.equal(html.includes("找健身房"), true);
  assert.equal(html.includes("找比較"), true);
  assert.equal(html.includes('name="city"'), true);
  assert.equal(html.includes("服務項目"), true);
  assert.equal(html.includes('name="hourly"'), true);
  assert.equal(html.includes('name="is24Hours"'), true);
});

test("app fetches gym data without browser cache during prototype data updates", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.equal(app.includes('fetch("./data/gyms.json", { cache: "no-store" })'), true);
});

test("app card formatter does not render null price amounts", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.equal(app.includes("price.amountTwd === null || price.amountTwd === undefined"), true);
  assert.equal(app.includes('return "價格待查證";'), true);
});
