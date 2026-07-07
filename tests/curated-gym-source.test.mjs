import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { validateSourcePackage } from "../src/gym-source-normalization.js";
import { buildCuratedGymSourcePackage } from "../src/curated-gym-source.js";

const execFileAsync = promisify(execFile);

const csvHeader =
  "序號,資料查核日,縣市,行政區,場館類型,品牌/系統,場館/分店,地址,收費方式,免綁約,可用狀態,收費明確度,備註,來源網址,保留原因";

const sampleCsv = `﻿${csvHeader}
1,2026-07-07,臺北市,中山區,民營單次健身房,BEING fit,松江門市,臺北市中山區松江路237號2F,免綁約；單次計費150元,是,營運中,官方明確,備註文字,https://www.beingfit.com.tw/; https://page.line.me/example,保留理由
2,2026-07-07,臺北市,中山區,民營計時/單次健身房,MYWAY Fitness,MYWAY Fitness,臺北市中山區復興南路一段2號B1,單次入場350元；計時1.5元/分,是,營運中,GymNomad 聚合資料，建議出發前複核,取自 GymNomad,https://www.gymnomadtw.com/gym/mywayfitness,保留理由
3,2026-07-07,臺北市,大安區,民營單次健身房,Refine Fitness,Refine Fitness 大安店,台北市大安區測試路1號,平日17:00前150元/次、17:00後350元/次,是,營運中,官方明確,工作室型態,https://example.org/refine,保留理由
4,2026-07-07,臺北市,士林區,公立運動中心,臺北市運動中心,士林運動中心,臺北市士林區士商路1號,50元/小時,是,營運中,官方明確,公立,https://example.org/shilin,保留理由
5,2026-07-07,臺中市,西區,民營單次健身房,重複健身房,重複健身房,台中市西區重複路9號,單次200元,是,營運中,官方明確,重複列,https://example.org/dup,保留理由
6,2026-07-07,臺中市,西區,民營單次健身房,重複健身房,重複健身房,台中市西區重複路9號,單次200元,是,營運中,官方明確,重複列,https://example.org/dup,保留理由
7,2026-07-07,臺北市,信義區,民營健身房,已歇業健身房,已歇業健身房,台北市信義區測試路2號,單次100元,是,已歇業,官方明確,已歇業,https://example.org/closed,保留理由
`;

test("buildCuratedGymSourcePackage builds manual research records from the curated CSV", () => {
  const result = buildCuratedGymSourcePackage(sampleCsv, { fetchedAt: "2026-07-07" });

  assert.equal(result.sourcePackage.sourceId, "curated-single-entry-gyms");
  assert.equal(result.sourcePackage.sourceType, "manual_research");
  assert.equal(validateSourcePackage(result.sourcePackage).valid, true);

  const names = result.sourcePackage.records.map((record) => record.name);
  assert.deepEqual(names, ["BEING fit 松江門市", "MYWAY Fitness", "Refine Fitness 大安店", "士林運動中心", "重複健身房"]);

  const being = result.sourcePackage.records[0];
  assert.equal(being.brandName, "BEING fit");
  assert.equal(being.branchName, "松江門市");
  assert.equal(being.city, "台北市");
  assert.equal(being.district, "中山區");
  assert.equal(being.latitude, null);
  assert.equal(being.access.supportsSingleEntry, true);
  assert.equal(being.pricing[0].type, "single_entry");
  assert.equal(being.pricing[0].amountTwd, 150);
  assert.equal(being.pricing[0].sourceNote, "免綁約；單次計費150元");
  assert.equal(being.sourceRecordUrl, "https://www.beingfit.com.tw/");

  const myway = result.sourcePackage.records[1];
  assert.equal(myway.branchName, "");
  assert.equal(myway.pricing[0].amountTwd, 350);
  assert.equal(myway.sourceRecordUrl, "https://www.gymnomadtw.com/gym/mywayfitness");

  const refine = result.sourcePackage.records[2];
  assert.equal(refine.pricing[0].amountTwd, null);

  const shilin = result.sourcePackage.records[3];
  assert.equal(shilin.name, "士林運動中心");
  assert.equal(shilin.brandName, "臺北市運動中心");

  const reasons = result.skipped.map((row) => row.reason);
  assert.equal(reasons.includes("duplicate_source_row"), true);
  assert.equal(reasons.includes("not_operating"), true);
});

test("buildCuratedGymSourcePackage skips venues already present in the existing dataset", () => {
  const existingGyms = [
    { name: "臺北市士林運動中心", city: "台北市", district: "士林區", address: "台北市士林區士商路一號" },
    { name: "MYWAY Fitness", city: "台北市", district: "中山區", address: "台北市中山區復興南路1段2號b1" }
  ];
  const result = buildCuratedGymSourcePackage(sampleCsv, { fetchedAt: "2026-07-07", existingGyms });

  const names = result.sourcePackage.records.map((record) => record.name);
  assert.deepEqual(names, ["BEING fit 松江門市", "Refine Fitness 大安店", "重複健身房"]);
  assert.equal(result.skipped.filter((row) => row.reason === "already_in_dataset").length, 2);
});

test("curated gym CLI writes a source package", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "findgym-curated-"));
  const inputPath = join(tempDir, "curated.csv");
  const existingPath = join(tempDir, "existing-gyms.json");
  const outputPath = join(tempDir, "source-package.json");

  await writeFile(inputPath, sampleCsv);
  await writeFile(existingPath, JSON.stringify([]));

  const { stdout } = await execFileAsync("node", [
    "scripts/build-curated-gyms.mjs",
    inputPath,
    "--output",
    outputPath,
    "--existing",
    existingPath,
    "--fetched-at",
    "2026-07-07"
  ]);
  const sourcePackage = JSON.parse(await readFile(outputPath, "utf8"));

  assert.equal(stdout.includes("Findgym curated gym source build"), true);
  assert.equal(sourcePackage.sourceType, "manual_research");
  assert.equal(sourcePackage.records.length, 5);
  assert.equal(validateSourcePackage(sourcePackage).valid, true);
});
