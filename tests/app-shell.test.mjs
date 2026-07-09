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

test("opening a gym detail scrolls the detail panel into view", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.equal(app.includes("function openGymDetail"), true);
  assert.equal(/detailPanel\?\.scrollIntoView/.test(app), true);
});

test("app registers a service worker so the PWA is installable and works offline", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.equal(app.includes("serviceWorker"), true);
  assert.equal(/register\((["'])\.\/sw\.js\1\)/.test(app), true);
});

test("service worker precaches the app shell, map assets, and gym data", async () => {
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");

  assert.equal(/addEventListener\((["'])install\1/.test(sw), true);
  assert.equal(/addEventListener\((["'])fetch\1/.test(sw), true);
  assert.equal(sw.includes("data/gyms.json"), true);
  assert.equal(sw.includes("leaflet.js"), true);
});

test("manifest declares an installable maskable icon", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));

  assert.equal(manifest.icons.some((icon) => String(icon.purpose).includes("maskable")), true);
});

test("app shell has a saved-gyms panel and nav entry", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(html.includes('id="savedPanel"'), true);
  assert.equal(html.includes("找收藏"), true);
});

test("app supports saving gyms with localStorage persistence", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.equal(app.includes("toggleSavedId"), true);
  assert.equal(app.includes("findgymSaved"), true);
  assert.equal(app.includes('data-action="toggle-saved"'), true);
  assert.equal(app.includes('action === "open-saved"'), true);
  assert.equal(app.includes("function renderSaved"), true);
});

test("compare and report nav entries open their panels via actions, not bare anchors", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(html.includes('data-action="open-compare"'), true);
  // the report nav entry triggers the report action instead of only anchoring
  assert.equal(/找比較/.test(html) && /資料回報/.test(html), true);

  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.equal(app.includes('action === "open-compare"'), true);
  assert.equal(app.includes("state.compareOpen"), true);
  // opening a panel from the nav scrolls it into view
  assert.equal(/comparePanel\?\.scrollIntoView/.test(app), true);
  assert.equal(/reportPanel\?\.scrollIntoView/.test(app), true);
});

test("service worker serves the app shell network-first so code updates reach users", async () => {
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");

  assert.equal(sw.includes("function networkFirst"), true);
  // vendored map assets stay cache-first; everything else is network-first
  assert.equal(sw.includes("/assets/vendor/"), true);
  assert.equal(/CACHE = "findgym-v[2-9]"/.test(sw), true);
});
