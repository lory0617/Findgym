import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { validateSourcePackage } from "../src/gym-source-normalization.js";
import { buildSagovGymSourcePackage, parseCsv } from "../src/sagov-gym-source.js";

const execFileAsync = promisify(execFile);

const csvHeader =
  "縣市,行政區,場館名稱,場館分類,場館隸屬機關,場館實際管理人姓名,場館實際管理人電話,場館官方網站,場館隸屬機關屬性,地址,緯度,經度,設施項目,開放情形,開放時間,租借資訊,開放及休館時間補充說明,停車場種類,運動場館介紹,舉辦賽事經歷,賽事經歷說明,場館啟用年,總運動空間面積_平方公尺";

const sampleCsv = `﻿${csvHeader}
63000,中正區,臺北市中正運動中心,健身房(含重量訓練室),臺北市政府體育局,王小明,02-23456789,https://example.org/zhongzheng,國民運動中心（名稱具有運動中心）,[100]臺北市中正區信義路一段1號,25.0375,121.5199,健身房(含重量訓練室),付費對外開放使用,一二三四五六日,付費對外場地租借,NULL,平面停車場,介紹文字,未曾在本場地舉辦運動賽事,NULL,107,1000
10002,宜蘭市,宜蘭鐵人健身房,健身房(含重量訓練室),民營場館填報帳號,李店長,03-9876543,NULL,綜合功能型運動場館（非前三項運動場館型態，且運動場館內含兩種以上運動設施）,[260]宜蘭縣宜蘭市中山路100號,24.7570,121.7530,健身房(含重量訓練室),付費對外開放使用,一二三四五六,付費對外場地租借,"備註,含逗號",無停車場,NULL,未曾在本場地舉辦運動賽事,NULL,105,200
10014,臺東市,臺東大學體適能中心,體適能中心,國立臺東大學,張老師,089-318855,http://www.nttu.edu.tw/,單一功能型運動場館（非前三項運動場館型態，且運動場館 僅含一項運動設施）,[950]臺東縣臺東市大學路二段369號,22.7480,121.1280,體適能中心,免費對外開放使用,一二三四五,不開放對外場地租借,NULL,無停車場,NULL,未曾在本場地舉辦運動賽事,NULL,100,150
63000,中山區,大倉久和大飯店附設健身房,健身房(含重量訓練室),大倉久和大飯店,陳經理,02-25231111,https://example.org/okura,單一功能型運動場館（非前三項運動場館型態，且運動場館 僅含一項運動設施）,[104]臺北市中山區南京東路一段9號,25.0520,121.5230,健身房(含重量訓練室),付費對外開放使用,一二三四五六日,付費對外場地租借,NULL,無停車場,NULL,未曾在本場地舉辦運動賽事,NULL,101,120
63000,士林區,某高中重訓室,健身房(含重量訓練室),某高中,趙主任,02-11112222,NULL,單一功能型運動場館（非前三項運動場館型態，且運動場館 僅含一項運動設施）,[111]臺北市士林區測試路9號,25.1000,121.5200,健身房(含重量訓練室),不對外開放使用,一二三四五,不開放對外場地租借,NULL,無停車場,NULL,未曾在本場地舉辦運動賽事,NULL,99,80
63000,大安區,某大學籃球館,籃球場,某大學,錢組長,02-33334444,NULL,單一功能型運動場館（非前三項運動場館型態，且運動場館 僅含一項運動設施）,[106]臺北市大安區測試路1號,25.0260,121.5430,籃球場,付費對外開放使用,一二三四五六日,付費對外場地租借,NULL,無停車場,NULL,未曾在本場地舉辦運動賽事,NULL,98,900
10002,宜蘭市,宜蘭鐵人健身房,健身房(含重量訓練室),民營場館填報帳號,李店長,03-9876543,NULL,綜合功能型運動場館（非前三項運動場館型態，且運動場館內含兩種以上運動設施）,[260]宜蘭縣宜蘭市中山路100號,24.7570,121.7530,健身房(含重量訓練室),付費對外開放使用,一二三四五六,付費對外場地租借,NULL,無停車場,NULL,未曾在本場地舉辦運動賽事,NULL,105,200
`;

test("parseCsv parses BOM, quoted commas, and quoted newlines", () => {
  const rows = parseCsv('﻿a,b,c\n1,"x,y","line1\nline2"\n2,plain,last\n');

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { a: "1", b: "x,y", c: "line1\nline2" });
  assert.deepEqual(rows[1], { a: "2", b: "plain", c: "last" });
});

test("buildSagovGymSourcePackage keeps public-open gym rows and maps county codes", () => {
  const rows = parseCsv(sampleCsv);
  const result = buildSagovGymSourcePackage(rows, { fetchedAt: "2026-07-07" });

  assert.equal(result.sourcePackage.sourceId, "sagov-national-sports-facilities");
  assert.equal(result.sourcePackage.sourceType, "government_open_data");
  assert.equal(validateSourcePackage(result.sourcePackage).valid, true);

  const names = result.sourcePackage.records.map((record) => record.name);
  assert.deepEqual(names, ["臺北市中正運動中心", "宜蘭鐵人健身房", "臺東大學體適能中心"]);

  const skippedReasons = result.skipped.map((row) => row.reason);
  assert.equal(skippedReasons.includes("not_public_open"), true);
  assert.equal(skippedReasons.includes("not_gym_category"), true);
  assert.equal(skippedReasons.includes("likely_guest_or_member_only"), true);
  assert.equal(skippedReasons.includes("duplicate_source_row"), true);

  const taipei = result.sourcePackage.records[0];
  assert.equal(taipei.city, "台北市");
  assert.equal(taipei.district, "中正區");
  assert.equal(taipei.address, "臺北市中正區信義路一段1號");
  assert.equal(taipei.latitude, 25.0375);
  assert.equal(taipei.longitude, 121.5199);
  assert.equal(taipei.phone, "02-23456789");
  assert.equal(taipei.website, "https://example.org/zhongzheng");
  assert.equal(taipei.facilities.hasFreeWeights, true);
  assert.equal(taipei.facilities.hasParking, true);
  assert.equal(taipei.access.supportsSingleEntry, false);
  assert.equal(taipei.pricing[0].amountTwd, null);
  assert.equal(taipei.pricing[0].type, "other");

  const yilan = result.sourcePackage.records[1];
  assert.equal(yilan.city, "宜蘭縣");
  assert.equal(yilan.website, "");
  assert.equal(yilan.facilities.hasParking, false);

  const taitung = result.sourcePackage.records[2];
  assert.equal(taitung.city, "台東縣");
  assert.equal(taitung.facilities.hasCardio, true);
  assert.equal(taitung.rating.summaryTags.includes("免費開放"), true);
});

test("buildSagovGymSourcePackage matches existing venues across address style variants", () => {
  const variantCsv = `${csvHeader}
63000,士林區,臺北市士林運動中心,健身房(含重量訓練室),臺北市政府體育局,王主任,02-28800000,NULL,國民運動中心（名稱具有運動中心）,臺北市士林區士商路1號,25.0880,121.5230,健身房(含重量訓練室),付費對外開放使用,一二三四五六日,付費對外場地租借,NULL,無停車場,NULL,未曾在本場地舉辦運動賽事,NULL,100,500
66000,南屯區,臺中市南屯國民運動中心,健身房(含重量訓練室),臺中市政府,林主任,04-23800000,NULL,國民運動中心（名稱具有運動中心）,408 臺中市南屯區黎明路一段998號,24.1440,120.6440,健身房(含重量訓練室),付費對外開放使用,一二三四五六日,付費對外場地租借,NULL,平面停車場,NULL,未曾在本場地舉辦運動賽事,NULL,104,800
63000,萬華區,臺北市萬華運動中心,健身房(含重量訓練室),臺北市政府體育局,吳主任,02-23000000,NULL,國民運動中心（名稱具有運動中心）,[108]臺北市萬華區西寧南路6之1號,25.0430,121.5060,健身房(含重量訓練室),付費對外開放使用,一二三四五六日,付費對外場地租借,NULL,無停車場,NULL,未曾在本場地舉辦運動賽事,NULL,99,700
`;
  const existingGyms = [
    { name: "士林運動中心", city: "台北市", district: "士林區", address: "台北市士林區士商路一號" },
    { name: "南屯運動中心", city: "台中市", district: "南屯區", address: "台中市南屯區黎明路一段998號" },
    { name: "萬華運動中心", city: "台北市", district: "萬華區", address: "台北市萬華區西寧南路6-1號" }
  ];
  const result = buildSagovGymSourcePackage(parseCsv(variantCsv), { fetchedAt: "2026-07-07", existingGyms });

  assert.deepEqual(result.sourcePackage.records, []);
  assert.equal(result.skipped.filter((row) => row.reason === "already_in_dataset").length, 3);
});

test("buildSagovGymSourcePackage skips venues already present in the existing dataset", () => {
  const rows = parseCsv(sampleCsv);
  const existingGyms = [
    {
      name: "台北市中正運動中心",
      city: "台北市",
      district: "中正區",
      address: "台北市中正區信義路一段1號"
    }
  ];
  const result = buildSagovGymSourcePackage(rows, { fetchedAt: "2026-07-07", existingGyms });

  const names = result.sourcePackage.records.map((record) => record.name);
  assert.deepEqual(names, ["宜蘭鐵人健身房", "臺東大學體適能中心"]);
  assert.equal(result.skipped.some((row) => row.reason === "already_in_dataset"), true);
});

test("sagov gym CLI writes a source package", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "findgym-sagov-"));
  const inputPath = join(tempDir, "venues.csv");
  const existingPath = join(tempDir, "existing-gyms.json");
  const outputPath = join(tempDir, "source-package.json");

  await writeFile(inputPath, sampleCsv);
  await writeFile(
    existingPath,
    JSON.stringify([
      {
        name: "台北市中正運動中心",
        city: "台北市",
        district: "中正區",
        address: "台北市中正區信義路一段1號"
      }
    ])
  );

  const { stdout } = await execFileAsync("node", [
    "scripts/build-sagov-gyms.mjs",
    inputPath,
    "--output",
    outputPath,
    "--existing",
    existingPath
  ]);
  const sourcePackage = JSON.parse(await readFile(outputPath, "utf8"));

  assert.equal(stdout.includes("Findgym sa.gov sports facility source build"), true);
  assert.equal(sourcePackage.sourceType, "government_open_data");
  assert.deepEqual(
    sourcePackage.records.map((record) => record.name),
    ["宜蘭鐵人健身房", "臺東大學體適能中心"]
  );
  assert.equal(validateSourcePackage(sourcePackage).valid, true);
});
