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
  assert.equal(html.includes("入場與設施篩選"), true);
  assert.equal(html.includes("服務項目"), false);
  assert.equal(html.includes('name="hourly"'), true);
  assert.equal(html.includes("計時收費"), true);
  assert.equal(html.includes("以時計費"), false);
  assert.equal(html.includes('name="noContract"'), false);
  assert.equal(html.includes("免綁月繳"), false);
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

test("gym list paginates ten cards per page with pager controls", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.equal(app.includes("PAGE_SIZE = 10"), true);
  assert.equal(app.includes("paginateItems"), true);
  assert.equal(app.includes('data-action="set-page"'), true);
  assert.equal(app.includes("上一頁"), true);
  assert.equal(app.includes("下一頁"), true);
});

test("gym cards show the verified fee text from the access contract note", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.equal(app.includes("price-note"), true);
  assert.equal(app.includes("access?.contractNote"), true);
});

test("source badges explain unverified records without implying user review work", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.equal(app.includes("待官方查證"), true);
  assert.equal(app.includes("尚未以官方來源確認"), true);
  assert.equal(app.includes("sourceHelpText"), true);
});

test("app uses clear timed-pricing labels in visible gym summaries", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.equal(app.includes("計時收費"), true);
  assert.equal(app.includes("小時計費"), false);
});
