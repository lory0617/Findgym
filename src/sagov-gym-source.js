const SOURCE_ID = "sagov-national-sports-facilities";
const SOURCE_NAME = "體育署全國運動場館資訊";
const SOURCE_URL = "https://data.gov.tw/dataset/22849";
const SOURCE_LICENSE =
  "政府資料開放授權條款-第1版（Open Government Data License, version 1.0）; attribution required; price, hours, and access still require official-source verification";

const GYM_CATEGORIES = new Set(["健身房(含重量訓練室)", "體適能中心"]);
const COUNTY_CODES = {
  63000: "台北市",
  65000: "新北市",
  68000: "桃園市",
  66000: "台中市",
  67000: "台南市",
  64000: "高雄市",
  10017: "基隆市",
  10018: "新竹市",
  10020: "嘉義市",
  10002: "宜蘭縣",
  10004: "新竹縣",
  10005: "苗栗縣",
  10007: "彰化縣",
  10008: "南投縣",
  10009: "雲林縣",
  10010: "嘉義縣",
  10013: "屏東縣",
  10014: "台東縣",
  10015: "花蓮縣",
  10016: "澎湖縣",
  9020: "金門縣",
  9007: "連江縣"
};

export function parseCsv(text) {
  const source = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inQuotes) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      field = "";
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((value) => value !== "")) {
      rows.push(row);
    }
  }

  const [header, ...records] = rows;

  if (!header) {
    return [];
  }

  return records.map((values) =>
    Object.fromEntries(header.map((key, columnIndex) => [key.trim(), values[columnIndex] ?? ""]))
  );
}

export function buildSagovGymSourcePackage(rows, options = {}) {
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

  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const name = String(row["場館名稱"] ?? "").trim();
    const category = String(row["場館分類"] ?? "").trim();
    const openness = String(row["開放情形"] ?? "").trim();

    if (!GYM_CATEGORIES.has(category)) {
      skipped.push({ index, name, reason: "not_gym_category" });
      return;
    }

    if (!openness.includes("對外開放使用") || openness.includes("不對外開放")) {
      skipped.push({ index, name, reason: "not_public_open" });
      return;
    }

    const city = COUNTY_CODES[Number(row["縣市"])];

    if (!city) {
      skipped.push({ index, name, reason: "unknown_county_code" });
      return;
    }

    const address = String(row["地址"] ?? "").trim().replace(/^\[\d+\]/, "");
    const rowKey = `${normalizeVenueText(name)}|${normalizeVenueText(address)}`;

    if (seenRowKeys.has(rowKey)) {
      skipped.push({ index, name, reason: "duplicate_source_row" });
      return;
    }

    seenRowKeys.add(rowKey);

    if (existingKeys.has(`name:${normalizeVenueText(name)}`) || existingKeys.has(`address:${normalizeVenueText(address)}`)) {
      skipped.push({ index, name, reason: "already_in_dataset" });
      return;
    }

    records.push(buildRecord(row, { name, category, openness, city, address, fetchedAt }));
  });

  return {
    sourcePackage: {
      sourceId: SOURCE_ID,
      sourceName: SOURCE_NAME,
      sourceType: "government_open_data",
      sourceUrl: SOURCE_URL,
      sourceLicense: SOURCE_LICENSE,
      fetchedAt,
      records
    },
    skipped
  };
}

function buildRecord(row, { name, category, openness, city, address, fetchedAt }) {
  const isFree = openness.includes("免費");
  const hasParking = !!String(row["停車場種類"] ?? "").trim() && !String(row["停車場種類"]).includes("無停車場");

  return {
    name,
    brandName: "",
    branchName: "",
    city,
    district: String(row["行政區"] ?? "").trim(),
    address,
    latitude: toCoordinate(row["緯度"]),
    longitude: toCoordinate(row["經度"]),
    status: "open",
    phone: cleanValue(row["場館實際管理人電話"]),
    website: cleanValue(row["場館官方網站"]),
    sourceRecordUrl: SOURCE_URL,
    access: {
      supportsSingleEntry: true,
      contractNote: isFree
        ? "政府運動設施普查標示免費對外開放；開放對象與時段需以官方管道複查。"
        : "政府運動設施普查標示付費對外開放；單次入場方式與價格需以官方管道複查。"
    },
    pricing: [
      {
        type: isFree ? "other" : "single_entry",
        amountTwd: isFree ? 0 : null,
        unit: isFree ? "custom" : "per_entry",
        timeLimitMinutes: null,
        sourceNote: "體育署全國運動場館資訊普查資料；價格需以官方管道查證。",
        lastVerifiedAt: fetchedAt
      }
    ],
    facilities: {
      ...(category === "體適能中心" ? { hasCardio: true } : { hasFreeWeights: true }),
      hasParking
    },
    rating: {
      externalRating: null,
      externalRatingCount: 0,
      externalSource: "none",
      summaryTags: ["政府開放資料", isFree ? "免費開放" : "付費開放", "待查證"]
    }
  };
}

function toCoordinate(value) {
  const numericValue = Number(String(value ?? "").trim());
  return Number.isFinite(numericValue) && numericValue !== 0 ? numericValue : null;
}

function cleanValue(value) {
  const text = String(value ?? "").trim();
  return text && text.toUpperCase() !== "NULL" ? text : "";
}

const CHINESE_NUMERALS = { 一: "1", 二: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9", 十: "10" };

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
