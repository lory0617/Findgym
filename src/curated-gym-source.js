import { parseCsv } from "./sagov-gym-source.js";

const SOURCE_ID = "curated-single-entry-gyms";
const SOURCE_NAME = "Owner-curated single-entry gym research";
const SOURCE_URL = "data/research/taiwan_single_or_minute_gyms_no_big_chains_v3_2026-07-07.csv";
const SOURCE_LICENSE =
  "Owner-verified manual research compiled on 2026-07-07; per-record source URLs recorded; pricing and status require re-verification via official channels before launch";

const CHINESE_NUMERALS = { 一: "1", 二: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9", 十: "10" };

export function buildCuratedGymSourcePackage(csvText, options = {}) {
  const fetchedAt = options.fetchedAt;
  const existingGyms = Array.isArray(options.existingGyms) ? options.existingGyms : [];
  const existingKeys = new Set();

  existingGyms.forEach((gym) => {
    const name = normalizeVenueText(gym?.name);
    const address = normalizeVenueText(gym?.address);

    if (name) {
      existingKeys.add(`name:${name}`);
    }

    if (address) {
      existingKeys.add(`address:${address}`);
    }
  });

  const records = [];
  const skipped = [];
  const seenRowKeys = new Set();

  parseCsv(csvText).forEach((row, index) => {
    const brand = String(row["品牌/系統"] ?? "").trim();
    const branch = String(row["場館/分店"] ?? "").trim();
    const name = composeName(brand, branch);
    const address = String(row["地址"] ?? "").trim();
    const status = String(row["可用狀態"] ?? "").trim();

    if (status !== "營運中") {
      skipped.push({ index, name, reason: "not_operating" });
      return;
    }

    const rowKey = `${normalizeVenueText(name)}|${normalizeVenueText(address)}`;

    if (seenRowKeys.has(rowKey)) {
      skipped.push({ index, name, reason: "duplicate_source_row" });
      return;
    }

    seenRowKeys.add(rowKey);

    const matchesExisting = [`name:${normalizeVenueText(name)}`, `name:${normalizeVenueText(branch)}`, `address:${normalizeVenueText(address)}`].some(
      (key) => existingKeys.has(key)
    );

    if (matchesExisting) {
      skipped.push({ index, name, reason: "already_in_dataset" });
      return;
    }

    records.push(buildRecord(row, { name, brand, branch, address, fetchedAt }));
  });

  return {
    sourcePackage: {
      sourceId: SOURCE_ID,
      sourceName: SOURCE_NAME,
      sourceType: "manual_research",
      sourceUrl: SOURCE_URL,
      sourceLicense: SOURCE_LICENSE,
      fetchedAt,
      records
    },
    skipped
  };
}

function buildRecord(row, { name, brand, branch, address, fetchedAt }) {
  const feeText = String(row["收費方式"] ?? "").trim();
  const noContract = String(row["免綁約"] ?? "").trim() === "是";
  const verifiedAt = String(row["資料查核日"] ?? "").trim() || fetchedAt;

  return {
    name,
    brandName: brand,
    branchName: branch === brand || branch === name ? "" : branch,
    city: String(row["縣市"] ?? "").trim().replaceAll("臺", "台"),
    district: String(row["行政區"] ?? "").trim(),
    address,
    latitude: null,
    longitude: null,
    status: "open",
    phone: "",
    website: "",
    sourceRecordUrl: firstUrl(row["來源網址"]),
    access: {
      supportsSingleEntry: noContract,
      contractNote: feeText || "人工查核清單；入場方式需複核。"
    },
    pricing: parsePricingFromFeeText(feeText, verifiedAt),
    facilities: {
      hasFreeWeights: true
    },
    rating: {
      externalRating: null,
      externalRatingCount: 0,
      externalSource: "none",
      summaryTags: ["人工查核", noContract ? "免綁約" : "入場方式待複核", "出發前複核"]
    }
  };
}

function composeName(brand, branch) {
  if (!branch || branch === brand) {
    return brand;
  }

  const normalizedBrand = normalizeVenueText(brand);
  const normalizedBranch = normalizeVenueText(branch);

  if (normalizedBranch.includes(normalizedBrand) || /(運動中心|運動館|健身房|健身中心|體適能中心)$/.test(branch)) {
    return branch;
  }

  if (normalizedBrand.includes(normalizedBranch)) {
    return brand;
  }

  return `${brand} ${branch}`;
}

export function parsePricingFromFeeText(feeText, verifiedAt) {
  const text = String(feeText ?? "").trim();
  const prices = [];
  const basePrice = {
    timeLimitMinutes: null,
    sourceNote: text || "人工查核清單；價格需複核。",
    lastVerifiedAt: verifiedAt
  };

  const single = /單次[^0-9；;，,。]{0,10}?(\d{2,4})\s*元(?!\s*\/\s*(?:小時|時|hr))/i.exec(text);

  if (single) {
    prices.push({ type: "single_entry", amountTwd: Number(single[1]), unit: "per_entry", ...basePrice });
  }

  const hourly = /(\d{2,3})\s*元\s*\/\s*小時/.exec(text) || /每小時\s*(\d{2,3})\s*元/.exec(text);

  if (hourly) {
    prices.push({ type: "hourly", amountTwd: Number(hourly[1]), unit: "per_hour", ...basePrice });
  }

  const daily = /(?:單日|一日|日票)[^0-9]{0,6}(\d{2,4})\s*元/.exec(text);

  if (daily) {
    prices.push({ type: "daily", amountTwd: Number(daily[1]), unit: "per_day", ...basePrice });
  }

  const monthly = /(?:月費|月訂閱|每月)[^0-9]{0,6}(\d{3,5})\s*元/.exec(text) || /(\d{3,5})\s*元\s*\/\s*月/.exec(text);

  if (monthly) {
    prices.push({ type: "monthly_no_contract", amountTwd: Number(monthly[1]), unit: "per_month", ...basePrice });
  }

  if (prices.length === 0) {
    prices.push({ type: "other", amountTwd: null, unit: "custom", ...basePrice });
  }

  return prices;
}

export function enrichGymsFromCurated(gyms, csvText, options = {}) {
  const fetchedAt = options.fetchedAt;
  const nameIndex = new Map();
  const addressIndex = new Map();
  const shortAddressIndex = new Map();

  gyms.forEach((gym) => {
    pushIndex(nameIndex, normalizeVenueText(gym.name), gym);
    pushIndex(addressIndex, normalizeMatchAddress(gym.address), gym);
    pushIndex(shortAddressIndex, truncateAtNumberMarker(normalizeMatchAddress(gym.address)), gym);
  });

  const enriched = [];
  const unmatched = [];

  parseCsv(csvText).forEach((row) => {
    if (String(row["可用狀態"] ?? "").trim() !== "營運中") {
      return;
    }

    const brand = String(row["品牌/系統"] ?? "").trim();
    const branch = String(row["場館/分店"] ?? "").trim();
    const name = composeName(brand, branch);
    const address = String(row["地址"] ?? "").trim();
    const gym = findMatch({ name, brand, branch, address }, { nameIndex, addressIndex, shortAddressIndex });

    if (!gym) {
      unmatched.push({ name, address });
      return;
    }

    const feeText = String(row["收費方式"] ?? "").trim();
    const verifiedAt = String(row["資料查核日"] ?? "").trim() || fetchedAt;

    gym.pricing = parsePricingFromFeeText(feeText, verifiedAt);
    gym.access = {
      ...gym.access,
      supportsSingleEntry: String(row["免綁約"] ?? "").trim() === "是" ? true : gym.access?.supportsSingleEntry ?? false,
      contractNote: feeText || gym.access?.contractNote || ""
    };
    enriched.push({ id: gym.id, name: gym.name });
  });

  return { gyms, enriched, unmatched };
}

function findMatch(row, { nameIndex, addressIndex, shortAddressIndex }) {
  const nameKeys = [row.name, row.branch, `${row.brand}${row.branch}`].map(normalizeVenueText).filter(Boolean);

  for (const key of nameKeys) {
    const matches = nameIndex.get(key);

    if (matches?.length === 1) {
      return matches[0];
    }
  }

  const fullAddress = normalizeMatchAddress(row.address);
  const fullMatches = addressIndex.get(fullAddress);

  if (fullMatches?.length === 1) {
    return fullMatches[0];
  }

  const shortMatches = shortAddressIndex.get(truncateAtNumberMarker(fullAddress));

  if (shortMatches?.length === 1) {
    return shortMatches[0];
  }

  return null;
}

function pushIndex(index, key, gym) {
  if (!key) {
    return;
  }

  const bucket = index.get(key) ?? [];
  bucket.push(gym);
  index.set(key, bucket);
}

function normalizeMatchAddress(value) {
  return normalizeVenueText(String(value ?? "").replace(/（[^）]*）|\([^)]*\)/g, ""));
}

function truncateAtNumberMarker(value) {
  const match = /^[^號]*號/.exec(value);
  return match ? match[0] : value;
}

function firstUrl(value) {
  const match = /https?:\/\/[^\s;，,]+/.exec(String(value ?? ""));
  return match ? match[0] : "";
}

function normalizeVenueText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("臺", "台")
    .replaceAll("之", "-")
    .replace(/\s+/g, "")
    .replace(/^\[\d+\]/, "")
    .replace(/^\d{3,6}(?=\D)/, "")
    .replace(/[一二三四五六七八九十]/g, (numeral) => CHINESE_NUMERALS[numeral]);
}
