import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { validateSourcePackage } from "../src/gym-source-normalization.js";
import { buildWikipediaSportsCenterSourcePackage } from "../src/wikipedia-sports-center-source.js";

const execFileAsync = promisify(execFile);

const pageHtml = `
  <h3><span class="mw-headline" id="臺北市">臺北市</span></h3>
  <table class="wikitable">
    <tbody>
      <tr>
        <th>運動中心</th><th>行政區</th><th>地址</th><th>狀態</th><th>啟用日期</th><th>設施</th><th>營運</th><th>備註</th>
      </tr>
      <tr>
        <td><a href="/wiki/%E5%8C%97%E6%8A%95">北投運動中心</a></td>
        <td>北投區</td>
        <td>臺北市北投區石牌路一段39巷100號</td>
        <td>營運中</td>
        <td>2004年7月5日</td>
        <td>體適能中心</td>
        <td>建中工程</td>
        <td></td>
      </tr>
      <tr>
        <td>未來運動中心</td>
        <td>北投區</td>
        <td>臺北市北投區測試路1號</td>
        <td>興建中</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    </tbody>
  </table>
  <h2><span class="mw-headline" id="縣市運動中心">縣市運動中心</span></h2>
  <table class="wikitable">
    <tbody>
      <tr>
        <th>縣／市</th><th>運動中心</th><th>地址</th><th>狀態</th><th>啟用日期</th><th>設施</th><th>營運</th><th>備註</th>
      </tr>
      <tr>
        <td rowspan="2">宜蘭縣</td>
        <td>宜蘭國民運動中心</td>
        <td>宜蘭縣宜蘭市公園路66號</td>
        <td>試營運</td>
        <td>2018年11月1日</td>
        <td></td>
        <td>世順國際</td>
        <td></td>
      </tr>
      <tr>
        <td>羅東全民運動館</td>
        <td>宜蘭縣羅東鎮測試路88號</td>
        <td>營運中</td>
        <td>2026年1月1日</td>
        <td>健身房</td>
        <td>測試營運商</td>
        <td></td>
      </tr>
    </tbody>
  </table>
`;

test("buildWikipediaSportsCenterSourcePackage imports operating sports centers from Wikipedia tables", () => {
  const result = buildWikipediaSportsCenterSourcePackage(pageHtml, {
    fetchedAt: "2026-07-07"
  });

  assert.equal(result.sourcePackage.sourceId, "wikipedia-taiwan-sports-centers");
  assert.equal(result.sourcePackage.sourceType, "open_knowledge_base");
  assert.equal(result.sourcePackage.records.length, 3);
  assert.equal(result.skipped.length, 1);
  assert.deepEqual(
    result.sourcePackage.records.map((record) => record.name),
    ["北投運動中心", "宜蘭國民運動中心", "羅東全民運動館"]
  );
  assert.equal(result.sourcePackage.records[0].city, "台北市");
  assert.equal(result.sourcePackage.records[0].district, "北投區");
  assert.equal(result.sourcePackage.records[0].latitude, null);
  assert.equal(result.sourcePackage.records[0].longitude, null);
  assert.equal(result.sourcePackage.records[0].access.supportsSingleEntry, true);
  assert.equal(result.sourcePackage.records[0].pricing[0].amountTwd, null);
  assert.equal(result.sourcePackage.records[0].sourceRecordUrl, "https://zh.wikipedia.org/wiki/%E5%8C%97%E6%8A%95");
  assert.equal(result.sourcePackage.records[1].city, "宜蘭縣");
  assert.equal(result.sourcePackage.records[1].district, "宜蘭市");
  assert.equal(result.sourcePackage.records[2].city, "宜蘭縣");
  assert.equal(result.sourcePackage.records[2].district, "羅東鎮");
  assert.equal(validateSourcePackage(result.sourcePackage).valid, true);
});

test("wikipedia sports center CLI writes a source package", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "findgym-wikipedia-"));
  const inputPath = join(tempDir, "page.html");
  const outputPath = join(tempDir, "source-package.json");

  await writeFile(inputPath, pageHtml);

  const { stdout } = await execFileAsync("node", [
    "scripts/build-wikipedia-sports-centers.mjs",
    inputPath,
    "--output",
    outputPath
  ]);
  const sourcePackage = JSON.parse(await readFile(outputPath, "utf8"));

  assert.equal(stdout.includes("Findgym Wikipedia sports center source build"), true);
  assert.equal(stdout.includes("Source records: 3"), true);
  assert.equal(stdout.includes("Skipped: 1"), true);
  assert.equal(sourcePackage.records.length, 3);
  assert.equal(sourcePackage.records[0].name, "北投運動中心");
});
