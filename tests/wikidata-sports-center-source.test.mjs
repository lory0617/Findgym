import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { validateSourcePackage } from "../src/gym-source-normalization.js";
import { buildWikidataSportsCenterSourcePackage } from "../src/wikidata-sports-center-source.js";

const execFileAsync = promisify(execFile);

const sparqlResult = {
  results: {
    bindings: [
      {
        item: { value: "http://www.wikidata.org/entity/Q1" },
        itemLabel: { value: "中山運動中心" },
        coord: { value: "Point(121.52138889 25.05488889)" },
        address: { value: "台北市中山區中山北路二段44巷2號" },
        adminLabel: { value: "中山區" },
        website: { value: "https://cssc.cyc.org.tw/" }
      },
      {
        item: { value: "http://www.wikidata.org/entity/Q2" },
        itemLabel: { value: "缺座標運動中心" },
        address: { value: "台北市信義區松勤街100號" }
      },
      {
        item: { value: "http://www.wikidata.org/entity/Q3" },
        itemLabel: { value: "缺地址運動中心" },
        coord: { value: "Point(121.5668 25.0317)" }
      }
    ]
  }
};

test("buildWikidataSportsCenterSourcePackage keeps complete rows and skips incomplete rows", () => {
  const result = buildWikidataSportsCenterSourcePackage(sparqlResult, {
    fetchedAt: "2026-07-07"
  });

  assert.equal(result.sourcePackage.sourceId, "wikidata-taiwan-sports-centers");
  assert.equal(result.sourcePackage.sourceType, "open_knowledge_base");
  assert.equal(result.sourcePackage.records.length, 1);
  assert.equal(result.skipped.length, 2);
  assert.equal(result.sourcePackage.records[0].name, "中山運動中心");
  assert.equal(result.sourcePackage.records[0].city, "台北市");
  assert.equal(result.sourcePackage.records[0].district, "中山區");
  assert.equal(result.sourcePackage.records[0].latitude, 25.05488889);
  assert.equal(result.sourcePackage.records[0].longitude, 121.52138889);
  assert.equal(result.sourcePackage.records[0].access.supportsSingleEntry, true);
  assert.equal(result.sourcePackage.records[0].pricing[0].type, "hourly");
  assert.equal(result.sourcePackage.records[0].pricing[0].amountTwd, null);
  assert.equal(result.sourcePackage.records[0].sourceRecordUrl, "https://www.wikidata.org/wiki/Q1");
  assert.equal(validateSourcePackage(result.sourcePackage).valid, true);
});

test("wikidata sports center CLI writes a source package", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "findgym-wikidata-"));
  const inputPath = join(tempDir, "wikidata.json");
  const outputPath = join(tempDir, "source-package.json");

  await writeFile(inputPath, `${JSON.stringify(sparqlResult, null, 2)}\n`);

  const { stdout } = await execFileAsync("node", [
    "scripts/build-wikidata-sports-centers.mjs",
    inputPath,
    "--output",
    outputPath
  ]);
  const sourcePackage = JSON.parse(await readFile(outputPath, "utf8"));

  assert.equal(stdout.includes("Findgym Wikidata sports center source build"), true);
  assert.equal(stdout.includes("Source records: 1"), true);
  assert.equal(stdout.includes("Skipped: 2"), true);
  assert.equal(sourcePackage.records.length, 1);
  assert.equal(sourcePackage.records[0].name, "中山運動中心");
});
