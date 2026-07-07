import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { validateGymDataset } from "../src/gym-data-validation.js";
import {
  isLargeChainName,
  normalizeSourcePackage,
  validateSourcePackage
} from "../src/gym-source-normalization.js";

const execFileAsync = promisify(execFile);

const chainPatterns = [
  {
    label: "World Gym",
    terms: ["world gym", "worldgym", "世界健身"]
  },
  {
    label: "Fitness Factory",
    terms: ["fitness factory", "健身工廠"]
  }
];

const sourcePackage = {
  sourceId: "taipei-official-sports-center",
  sourceName: "Taipei official sports center list",
  sourceType: "official_venue",
  sourceUrl: "https://example.gov.tw/sports-centers",
  sourceLicense: "Official public webpage; manual verification required",
  fetchedAt: "2026-07-07",
  records: [
    {
      name: "臺北市測試運動中心",
      brandName: "臺北市運動中心",
      branchName: "測試",
      city: "台北市",
      district: "中正區",
      address: "台北市中正區測試路1號",
      latitude: 25.03,
      longitude: 121.52,
      phone: "02-1234-5678",
      website: "https://example.gov.tw/sports-centers/test",
      sourceRecordUrl: "https://example.gov.tw/sports-centers/test",
      access: {
        supportsSingleEntry: true
      },
      pricing: [
        {
          type: "hourly",
          amountTwd: 50,
          unit: "per_hour",
          timeLimitMinutes: 60,
          sourceNote: "Official source package",
          lastVerifiedAt: "2026-07-07"
        }
      ],
      facilities: {
        hasFreeWeights: true,
        hasSquatRack: true,
        hasShower: true
      },
      openingHours: [
        { weekday: 1, opensAt: "06:00", closesAt: "22:00", isClosed: false },
        { weekday: 2, opensAt: "06:00", closesAt: "22:00", isClosed: false },
        { weekday: 3, opensAt: "06:00", closesAt: "22:00", isClosed: false },
        { weekday: 4, opensAt: "06:00", closesAt: "22:00", isClosed: false },
        { weekday: 5, opensAt: "06:00", closesAt: "22:00", isClosed: false },
        { weekday: 6, opensAt: "06:00", closesAt: "22:00", isClosed: false },
        { weekday: 0, opensAt: "06:00", closesAt: "22:00", isClosed: false }
      ]
    },
    {
      name: "World Gym 測試店",
      brandName: "World Gym",
      branchName: "測試",
      city: "台北市",
      district: "信義區",
      address: "台北市信義區測試路99號",
      latitude: 25.04,
      longitude: 121.56,
      sourceRecordUrl: "https://example.gov.tw/sports-centers/world-gym-test"
    }
  ]
};

test("isLargeChainName matches maintainable chain terms", () => {
  assert.equal(isLargeChainName("World Gym 台北站前", chainPatterns), true);
  assert.equal(isLargeChainName("World-Gym 台北站前", chainPatterns), true);
  assert.equal(isLargeChainName("健身工廠 中壢廠", chainPatterns), true);
  assert.equal(isLargeChainName("巷口自由重量工作室", chainPatterns), false);
});

test("validateSourcePackage rejects Gymnomad and Google aggregation sources", () => {
  const gymnomad = validateSourcePackage({
    ...sourcePackage,
    sourceName: "Gymnomad Taiwan",
    sourceType: "third_party_directory",
    sourceUrl: "https://www.gymnomadtw.com/search"
  });
  const google = validateSourcePackage({
    ...sourcePackage,
    sourceName: "Google Maps",
    sourceType: "google_maps",
    sourceUrl: "https://maps.google.com"
  });

  assert.equal(gymnomad.valid, false);
  assert.equal(google.valid, false);
  assert.equal(gymnomad.errors.some((issue) => issue.message.includes("blocked aggregation source")), true);
  assert.equal(google.errors.some((issue) => issue.message.includes("blocked aggregation source")), true);
});

test("validateSourcePackage allows licensed partner data only with written authorization", () => {
  const result = validateSourcePackage({
    ...sourcePackage,
    sourceName: "Gymnomad Taiwan licensed feed",
    sourceType: "licensed_partner",
    sourceUrl: "https://www.gymnomadtw.com/search",
    sourceLicense: "Written partner agreement",
    authorizationDocument: "contract-2026-07-gymnomad"
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("normalizeSourcePackage builds schema-valid candidates and rejects large chains", () => {
  const result = normalizeSourcePackage(sourcePackage, {
    chainPatterns,
    importedAt: "2026-07-07"
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].reason, "large_contract_first_chain");
  assert.match(result.candidates[0].id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.equal(result.candidates[0].name, "臺北市測試運動中心");
  assert.equal(result.candidates[0].isLargeContractFirstChain, false);
  assert.equal(result.candidates[0].source.sourceId, "taipei-official-sports-center");
  assert.equal(result.candidates[0].verification.confidenceLevel, "unverified");
  assert.equal(validateGymDataset(result.candidates).valid, true);
});

test("import CLI writes candidates without large chain rows", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "findgym-import-"));
  const sourcePath = join(tempDir, "source.json");
  const outputPath = join(tempDir, "candidates.json");

  await writeFile(sourcePath, `${JSON.stringify(sourcePackage, null, 2)}\n`);

  const { stdout } = await execFileAsync("node", ["scripts/import-public-gyms.mjs", sourcePath, "--output", outputPath]);
  const candidates = JSON.parse(await readFile(outputPath, "utf8"));

  assert.equal(stdout.includes("Findgym public gym import"), true);
  assert.equal(stdout.includes("Candidates: 1"), true);
  assert.equal(stdout.includes("Rejected: 1"), true);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "臺北市測試運動中心");
});
