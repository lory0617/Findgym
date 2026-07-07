import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  buildDatasetStatus,
  summarizeGymDataset,
  validateGymDataset,
  validateGymRecord
} from "../src/gym-data-validation.js";

const execFileAsync = promisify(execFile);

const validGym = {
  id: "taipei-test-gym",
  name: "台北測試健身房",
  brandName: "Test",
  branchName: "台北",
  city: "台北市",
  district: "中正區",
  address: "台北市中正區測試路1號",
  latitude: 25.03,
  longitude: 121.52,
  status: "open",
  isLargeContractFirstChain: false,
  isHiddenByDefault: false,
  access: {
    supportsSingleEntry: true,
    supportsNoContractMonthly: false,
    supportsTrial: true,
    requiresMembershipCard: false,
    requiresReservation: false,
    contractNote: "測試資料"
  },
  pricing: [
    {
      type: "single_entry",
      amountTwd: 150,
      unit: "per_entry",
      timeLimitMinutes: 120,
      sourceNote: "測試資料",
      lastVerifiedAt: "2026-07-06"
    }
  ],
  facilities: {
    hasFreeWeights: true,
    hasSquatRack: true,
    hasPowerRack: false,
    hasBenchPress: true,
    hasDeadliftPlatform: false,
    hasCableMachine: true,
    hasCardio: true,
    hasGroupClasses: false,
    hasPersonalTraining: true,
    hasShower: true,
    hasLocker: true,
    hasParking: false,
    is24Hours: false
  },
  openingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    opensAt: "06:00",
    closesAt: "22:00",
    isClosed: false
  })),
  rating: {
    externalRating: 4.5,
    externalRatingCount: 10,
    externalSource: "manual",
    summaryTags: ["測試"]
  },
  verification: {
    confidenceLevel: "verified",
    verificationSource: "manual_research",
    verifiedAt: "2026-07-06"
  },
  contact: {
    phone: "",
    website: "",
    mapUrl: "https://maps.google.com/?q=台北測試健身房"
  }
};

test("validateGymRecord accepts a complete flexible-access gym", () => {
  const result = validateGymRecord(validGym, 0);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("validateGymDataset rejects duplicate ids and invalid Taiwan coordinates", () => {
  const invalid = {
    ...validGym,
    latitude: 41,
    longitude: -73
  };
  const result = validateGymDataset([validGym, invalid]);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((issue) => issue.message.includes("duplicate id")), true);
  assert.equal(result.errors.some((issue) => issue.path === "[1].latitude"), true);
  assert.equal(result.errors.some((issue) => issue.path === "[1].longitude"), true);
});

test("validateGymDataset warns for unverified records without blocking the dataset", () => {
  const unverified = {
    ...validGym,
    id: "taipei-unverified-gym",
    verification: {
      ...validGym.verification,
      confidenceLevel: "unverified"
    }
  };
  const result = validateGymDataset([unverified]);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.some((issue) => issue.message.includes("unverified")), true);
});

test("summarizeGymDataset counts access, city, and confidence coverage", () => {
  const summary = summarizeGymDataset([
    validGym,
    {
      ...validGym,
      id: "newtaipei-test-gym",
      city: "新北市",
      access: {
        ...validGym.access,
        supportsNoContractMonthly: true
      },
      verification: {
        ...validGym.verification,
        confidenceLevel: "likely"
      }
    }
  ]);
  assert.deepEqual(summary.byCity, { 台北市: 1, 新北市: 1 });
  assert.equal(summary.total, 2);
  assert.equal(summary.singleEntryCount, 2);
  assert.equal(summary.noContractCount, 1);
  assert.deepEqual(summary.byConfidence, { verified: 1, likely: 1 });
});

test("buildDatasetStatus warns when records are unverified", () => {
  const status = buildDatasetStatus([
    {
      ...validGym,
      verification: {
        ...validGym.verification,
        confidenceLevel: "unverified"
      }
    }
  ]);
  assert.equal(status.level, "warning");
  assert.equal(status.total, 1);
  assert.equal(status.headline.includes("1 間"), true);
  assert.equal(status.detail.includes("尚未驗證"), true);
});

test("current data/gyms.json is structurally valid", async () => {
  const raw = await readFile(new URL("../data/gyms.json", import.meta.url), "utf8");
  const gyms = JSON.parse(raw);
  const result = validateGymDataset(gyms);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validation CLI prints a summary for the current dataset", async () => {
  const { stdout } = await execFileAsync("node", ["scripts/validate-data.mjs", "data/gyms.json"]);
  assert.equal(stdout.includes("Findgym data validation"), true);
  assert.equal(stdout.includes("Total gyms: 6"), true);
  assert.equal(stdout.includes("Blocking errors: 0"), true);
});
