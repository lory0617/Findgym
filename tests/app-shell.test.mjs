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

test("app fetches gym data without forcing no-store so HTTP revalidation works", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.equal(app.includes('fetch("./data/gyms.json")'), true);
  assert.equal(app.includes('cache: "no-store"'), false);
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

  // a separate entry whose purpose includes "maskable"
  assert.equal(manifest.icons.some((icon) => String(icon.purpose).includes("maskable")), true);

  // raster PNG "any" icons at the sizes Android/Lighthouse expect
  const png = (size) =>
    manifest.icons.some(
      (icon) =>
        icon.type === "image/png" &&
        String(icon.sizes) === size &&
        String(icon.purpose).includes("any")
    );
  assert.equal(png("192x192"), true);
  assert.equal(png("512x512"), true);

  // the maskable entry is its own PNG, not the combined "any maskable" anti-pattern
  const maskable = manifest.icons.find((icon) => String(icon.purpose).includes("maskable"));
  assert.equal(maskable.type, "image/png");
  assert.equal(maskable.purpose, "maskable");

  // iOS "Add to Home Screen" needs a raster apple-touch-icon link
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(/<link[^>]+rel=["']apple-touch-icon["'][^>]*>/.test(html), true);
  assert.equal(html.includes("./assets/icons/apple-touch-icon.png"), true);
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

test("service worker only caches ok responses", async () => {
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");

  // both cacheFirst and networkFirst must gate cache.put on response.ok
  assert.equal((sw.match(/response\.ok/g) ?? []).length >= 2, true);
  assert.equal(sw.includes("findgym-v3"), true);
});

test("app shell has a back-to-top button that scrolls to the top", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(html.includes('id="backToTop"'), true);
  assert.equal(html.includes("回上方"), true);

  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.equal(app.includes('action === "scroll-top"'), true);
  assert.equal(app.includes("scrollTo"), true);
  assert.equal(app.includes("backToTop"), true);
});

test("report submit sends to the backend when configured, keeps local fallback", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.equal(app.includes("createBackendClient"), true);
  assert.equal(app.includes("isBackendConfigured"), true);
  assert.equal(app.includes("backend?.insertReport"), true);
  // local fallback write remains
  assert.equal(app.includes('localStorage.setItem("findgymReports"'), true);
});

test("saved toggle syncs to the backend and load merges cloud saves", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.equal(app.includes("mergeSavedIds"), true);
  assert.equal(app.includes("backend?.addSaved"), true);
  assert.equal(app.includes("backend?.removeSaved"), true);
  assert.equal(app.includes("backend?.listSaved"), true);
  // local persistence remains the source of truth for instant UI
  assert.equal(app.includes('localStorage.setItem("findgymSaved"'), true);
  // session removals are tracked so an in-flight cloud merge cannot resurrect them
  assert.equal(app.includes("removedSavedIds"), true);
});

test("detail-panel external links are sanitized against non-http(s) URL schemes", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.equal(app.includes("safeExternalUrl"), true);
});

test("privacy policy page exists and is linked", async () => {
  const privacy = await readFile(new URL("../privacy.html", import.meta.url), "utf8");
  assert.equal(privacy.includes("隱私權政策"), true);
  assert.equal(privacy.includes("Supabase"), true);
  assert.equal(privacy.includes("OpenStreetMap"), true);

  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(html.includes('href="./privacy.html"'), true);

  const build = await readFile(new URL("../scripts/build-web.mjs", import.meta.url), "utf8");
  assert.equal(build.includes("privacy.html"), true);
});

test("native back button closes drawers before exiting", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.equal(app.includes("backButton"), true);
  assert.equal(app.includes("closeTopDrawer"), true);
  assert.equal(app.includes("exitApp"), true);
});

test("viewport and fixed chrome respect iOS safe areas", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(html.includes("viewport-fit=cover"), true);

  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.equal((styles.match(/env\(safe-area-inset/g) ?? []).length >= 2, true);
});
