const CITY_NAMES = [
  "台北市",
  "臺北市",
  "新北市",
  "桃園市",
  "台中市",
  "臺中市",
  "台南市",
  "臺南市",
  "高雄市",
  "基隆市",
  "新竹市",
  "嘉義市",
  "新竹縣",
  "苗栗縣",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義縣",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "台東縣",
  "臺東縣",
  "澎湖縣",
  "金門縣",
  "連江縣"
];

export function buildWikidataSportsCenterSourcePackage(sparqlResult, options = {}) {
  const fetchedAt = options.fetchedAt || new Date().toISOString().slice(0, 10);
  const rows = Array.isArray(sparqlResult?.results?.bindings) ? sparqlResult.results.bindings : [];
  const records = [];
  const skipped = [];

  rows.forEach((row, index) => {
    const parsed = parseWikidataRow(row);

    if (!parsed.valid) {
      skipped.push({
        index,
        name: parsed.name,
        reason: parsed.reason
      });
      return;
    }

    records.push(toSourceRecord(parsed, fetchedAt));
  });

  return {
    sourcePackage: {
      sourceId: "wikidata-taiwan-sports-centers",
      sourceName: "Wikidata Taiwan sports center seed",
      sourceType: "open_knowledge_base",
      sourceUrl: "https://query.wikidata.org/",
      sourceLicense: "Wikidata CC0 1.0; candidate rows require official-source verification before launch",
      fetchedAt,
      records
    },
    skipped
  };
}

function parseWikidataRow(row) {
  const name = stringValue(row?.itemLabel);
  const address = normalizeTaiwanText(stringValue(row?.address));
  const coord = parsePoint(stringValue(row?.coord));
  const entityUrl = toWikidataEntityUrl(stringValue(row?.item));

  if (!name) {
    return { valid: false, name: "", reason: "missing_name" };
  }

  if (!address) {
    return { valid: false, name, reason: "missing_address" };
  }

  if (!coord) {
    return { valid: false, name, reason: "missing_coordinate" };
  }

  const location = parseTaiwanLocation(address, stringValue(row?.adminLabel));

  if (!location.city || !location.district) {
    return { valid: false, name, reason: "missing_city_or_district" };
  }

  return {
    valid: true,
    name,
    address,
    latitude: coord.latitude,
    longitude: coord.longitude,
    city: location.city,
    district: location.district,
    website: stringValue(row?.website),
    sourceRecordUrl: entityUrl
  };
}

function toSourceRecord(parsed, fetchedAt) {
  const branchName = parsed.name.replace(/(國民|市民)?運動中心$/u, "") || parsed.district.replace(/區$|市$|鎮$|鄉$/u, "");

  return {
    name: parsed.name,
    brandName: parsed.name.includes("國民運動中心") ? `${parsed.city}國民運動中心` : `${parsed.city}運動中心`,
    branchName,
    city: parsed.city,
    district: parsed.district,
    address: parsed.address,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    website: parsed.website,
    sourceRecordUrl: parsed.sourceRecordUrl,
    access: {
      supportsSingleEntry: true,
      contractNote: "公立運動中心候選資料；體適能中心單次或計時入場需以官方頁面複查。"
    },
    pricing: [
      {
        type: "hourly",
        amountTwd: null,
        unit: "per_hour",
        timeLimitMinutes: null,
        sourceNote: "Wikidata seed identifies the venue; price requires official-source verification.",
        lastVerifiedAt: fetchedAt
      }
    ],
    facilities: {
      hasCardio: true
    },
    rating: {
      externalRating: null,
      externalRatingCount: 0,
      externalSource: "none",
      summaryTags: ["公立運動中心", "計時候選", "待查證"]
    }
  };
}

function parsePoint(value) {
  const match = /^Point\(([-0-9.]+) ([-0-9.]+)\)$/.exec(String(value ?? "").trim());

  if (!match) {
    return null;
  }

  return {
    longitude: Number(match[1]),
    latitude: Number(match[2])
  };
}

function parseTaiwanLocation(address, adminLabel) {
  const normalizedAddress = normalizeTaiwanText(address);
  const city = CITY_NAMES.find((name) => normalizedAddress.includes(normalizeTaiwanText(name))) || "";
  const districtFromAddress = /(?:台北市|新北市|桃園市|台中市|台南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|澎湖縣|金門縣|連江縣)([^0-9\s]+?(?:區|鄉|鎮|市))/u.exec(normalizedAddress)?.[1];
  const district = districtFromAddress || normalizeTaiwanText(adminLabel);

  return {
    city: normalizeTaiwanText(city),
    district
  };
}

function toWikidataEntityUrl(value) {
  const id = /\/entity\/([^/]+)$/.exec(value)?.[1];
  return id ? `https://www.wikidata.org/wiki/${id}` : value;
}

function stringValue(binding) {
  return typeof binding?.value === "string" ? binding.value.trim() : "";
}

function normalizeTaiwanText(value) {
  return String(value ?? "").trim().replaceAll("臺", "台");
}
