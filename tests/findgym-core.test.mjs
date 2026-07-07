import test from "node:test";
import assert from "node:assert/strict";
import {
  buildComparisonRows,
  filterGyms,
  getBestFlexiblePrice,
  isGymOpenNow,
  normalizeQuery,
  rankGyms,
  validateReport
} from "../src/findgym-core.js";

const gyms = [
  {
    id: "a",
    name: "Alpha Gym",
    city: "台北市",
    district: "中正區",
    latitude: 25.03,
    longitude: 121.52,
    isHiddenByDefault: false,
    access: { supportsSingleEntry: true, supportsNoContractMonthly: false },
    pricing: [{ type: "single_entry", amountTwd: 120, unit: "per_entry", lastVerifiedAt: "2026-07-06" }],
    facilities: { hasSquatRack: true, hasShower: true, hasParking: false, is24Hours: false },
    openingHours: [{ weekday: 1, opensAt: "06:00", closesAt: "22:00", isClosed: false }],
    rating: { externalRating: 4.5, externalRatingCount: 20 },
    verification: { confidenceLevel: "verified", verifiedAt: "2026-07-06" }
  },
  {
    id: "b",
    name: "Beta Fitness",
    city: "新北市",
    district: "板橋區",
    latitude: 25.01,
    longitude: 121.46,
    isHiddenByDefault: true,
    access: { supportsSingleEntry: false, supportsNoContractMonthly: true },
    pricing: [{ type: "monthly_no_contract", amountTwd: 1200, unit: "per_month", lastVerifiedAt: "2026-07-06" }],
    facilities: { hasSquatRack: false, hasShower: true, hasParking: true, is24Hours: true },
    openingHours: [{ weekday: 1, opensAt: "00:00", closesAt: "23:59", isClosed: false }],
    rating: { externalRating: 4.0, externalRatingCount: 100 },
    verification: { confidenceLevel: "likely", verifiedAt: "2026-06-01" }
  }
];

test("normalizeQuery trims and lowercases text", () => {
  assert.equal(normalizeQuery("  Alpha GYM "), "alpha gym");
});

test("isGymOpenNow checks weekday hours", () => {
  assert.equal(isGymOpenNow(gyms[0], new Date("2026-07-06T12:00:00+08:00")), true);
  assert.equal(isGymOpenNow(gyms[0], new Date("2026-07-06T23:00:00+08:00")), false);
});

test("getBestFlexiblePrice prefers single entry before monthly", () => {
  assert.deepEqual(getBestFlexiblePrice(gyms[0]), gyms[0].pricing[0]);
});

test("filterGyms applies query, default hidden exclusion, and facility filters", () => {
  const result = filterGyms(
    gyms,
    { query: "中正", singleEntry: true, squatRack: true },
    new Date("2026-07-06T12:00:00+08:00")
  );
  assert.deepEqual(result.map((gym) => gym.id), ["a"]);
});

test("filterGyms applies city, hourly pricing, and 24-hour service filters", () => {
  const result = filterGyms(
    [
      gyms[0],
      {
        ...gyms[1],
        pricing: [...gyms[1].pricing, { type: "hourly", amountTwd: 1, unit: "per_hour", lastVerifiedAt: "2026-07-06" }]
      }
    ],
    { city: "新北市", hourly: true, is24Hours: true, includeHidden: true },
    new Date("2026-07-06T12:00:00+08:00")
  );
  assert.deepEqual(result.map((gym) => gym.id), ["b"]);
});

test("rankGyms puts nearby verified flexible gyms first", () => {
  const result = rankGyms(gyms, { latitude: 25.03, longitude: 121.52 }, new Date("2026-07-06T12:00:00+08:00"));
  assert.equal(result[0].id, "a");
});

test("buildComparisonRows exposes decision fields", () => {
  const rows = buildComparisonRows([gyms[0], gyms[1]]);
  assert.equal(rows[0].label, "彈性入場");
  assert.equal(rows.some((row) => row.label === "資料可信度"), true);
});

test("validateReport requires type and submitted value", () => {
  assert.deepEqual(validateReport({ gymId: "a", reportType: "wrong_price", submittedValue: "單次 100" }), {
    valid: true,
    errors: []
  });
  assert.equal(validateReport({ gymId: "a" }).valid, false);
});
