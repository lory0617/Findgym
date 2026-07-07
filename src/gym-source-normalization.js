const ALLOWED_SOURCE_TYPES = new Set([
  "government_open_data",
  "open_knowledge_base",
  "official_venue",
  "venue_submission",
  "licensed_partner",
  "manual_research"
]);
const BLOCKED_SOURCE_TYPES = new Set(["google_maps", "google_places", "third_party_directory", "competitor_directory"]);
const ALWAYS_BLOCKED_SOURCE_TERMS = ["google maps", "google places", "maps.google", "google.com/maps"];
const AUTHORIZABLE_SOURCE_TERMS = ["gymnomad", "gymnomadtw.com"];
const REQUIRED_SOURCE_STRINGS = ["sourceId", "sourceName", "sourceType", "sourceUrl", "sourceLicense", "fetchedAt"];
const ACCESS_DEFAULTS = {
  supportsSingleEntry: false,
  supportsNoContractMonthly: false,
  supportsTrial: false,
  requiresMembershipCard: false,
  requiresReservation: false,
  contractNote: "來源未提供彈性入場資訊，需人工查證。"
};
const FACILITY_DEFAULTS = {
  hasFreeWeights: false,
  hasSquatRack: false,
  hasPowerRack: false,
  hasBenchPress: false,
  hasDeadliftPlatform: false,
  hasCableMachine: false,
  hasCardio: false,
  hasGroupClasses: false,
  hasPersonalTraining: false,
  hasShower: false,
  hasLocker: false,
  hasParking: false,
  is24Hours: false
};
const CITY_CODES = {
  台北市: "taipei",
  臺北市: "taipei",
  新北市: "newtaipei",
  桃園市: "taoyuan",
  台中市: "taichung",
  臺中市: "taichung",
  台南市: "tainan",
  臺南市: "tainan",
  高雄市: "kaohsiung",
  基隆市: "keelung",
  新竹市: "hsinchu",
  嘉義市: "chiayi",
  新竹縣: "hsinchucounty",
  苗栗縣: "miaoli",
  彰化縣: "changhua",
  南投縣: "nantou",
  雲林縣: "yunlin",
  嘉義縣: "chiayicounty",
  屏東縣: "pingtung",
  宜蘭縣: "yilan",
  花蓮縣: "hualien",
  台東縣: "taitung",
  臺東縣: "taitung",
  澎湖縣: "penghu",
  金門縣: "kinmen",
  連江縣: "lienchiang"
};

export function isLargeChainName(name, patterns = []) {
  const text = normalizeText(name);
  const compact = compactText(name);

  if (!text) {
    return false;
  }

  return patterns.some((pattern) => {
    const terms = Array.isArray(pattern?.terms) ? pattern.terms : [];
    return terms.some((term) => {
      const normalizedTerm = normalizeText(term);
      const compactTerm = compactText(term);
      return normalizedTerm && (text.includes(normalizedTerm) || compact.includes(compactTerm));
    });
  });
}

export function validateSourcePackage(input) {
  const errors = [];

  if (!isObject(input)) {
    return {
      valid: false,
      errors: [issue("$", "source package must be an object")]
    };
  }

  REQUIRED_SOURCE_STRINGS.forEach((key) => {
    if (typeof input[key] !== "string" || !input[key].trim()) {
      errors.push(issue(`$.${key}`, `${key} is required`));
    }
  });

  if (typeof input.sourceType === "string" && !ALLOWED_SOURCE_TYPES.has(input.sourceType)) {
    errors.push(issue("$.sourceType", `sourceType "${input.sourceType}" is not importable`));
  }

  if (input.sourceType === "licensed_partner" && !hasWrittenAuthorization(input)) {
    errors.push(issue("$.authorizationDocument", "licensed_partner sources require a written authorization document reference"));
  }

  if (isBlockedAggregationSource(input)) {
    errors.push(issue("$.sourceUrl", "blocked aggregation source cannot be imported without written authorization"));
  }

  if (typeof input.fetchedAt === "string" && !isDateString(input.fetchedAt)) {
    errors.push(issue("$.fetchedAt", "fetchedAt must use YYYY-MM-DD"));
  }

  if (!Array.isArray(input.records) || input.records.length === 0) {
    errors.push(issue("$.records", "records must be a non-empty array"));
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function normalizeSourcePackage(input, options = {}) {
  const sourceValidation = validateSourcePackage(input);

  if (!sourceValidation.valid) {
    return {
      candidates: [],
      rejected: [],
      errors: sourceValidation.errors
    };
  }

  const importedAt = options.importedAt || input.fetchedAt;
  const chainPatterns = Array.isArray(options.chainPatterns) ? options.chainPatterns : [];
  const candidates = [];
  const rejected = [];
  const errors = [];

  input.records.forEach((record, index) => {
    if (!isObject(record)) {
      errors.push(issue(`$.records[${index}]`, "record must be an object"));
      return;
    }

    const chainName = [record.name, record.brandName].filter(Boolean).join(" ");

    if (isLargeChainName(chainName, chainPatterns)) {
      rejected.push({
        index,
        name: String(record.name ?? ""),
        reason: "large_contract_first_chain"
      });
      return;
    }

    candidates.push(normalizeRecord(record, input, importedAt));
  });

  return {
    candidates,
    rejected,
    errors
  };
}

function normalizeRecord(record, source, importedAt) {
  const fetchedAt = source.fetchedAt;

  return {
    id: record.id || buildStableGymId(record),
    name: String(record.name ?? "").trim(),
    brandName: String(record.brandName ?? "").trim(),
    branchName: String(record.branchName ?? "").trim(),
    city: String(record.city ?? "").trim(),
    district: String(record.district ?? "").trim(),
    address: String(record.address ?? "").trim(),
    latitude: Number(record.latitude),
    longitude: Number(record.longitude),
    status: record.status || "unknown",
    isLargeContractFirstChain: false,
    isHiddenByDefault: false,
    access: {
      ...ACCESS_DEFAULTS,
      ...(isObject(record.access) ? record.access : {})
    },
    pricing: normalizePricing(record.pricing, fetchedAt),
    facilities: {
      ...FACILITY_DEFAULTS,
      ...(isObject(record.facilities) ? record.facilities : {})
    },
    openingHours: normalizeOpeningHours(record.openingHours),
    rating: {
      externalRating: Number.isFinite(record.rating?.externalRating) ? record.rating.externalRating : null,
      externalRatingCount: Number.isInteger(record.rating?.externalRatingCount) ? record.rating.externalRatingCount : 0,
      externalSource: record.rating?.externalSource || "source_import",
      summaryTags: Array.isArray(record.rating?.summaryTags) ? record.rating.summaryTags : []
    },
    verification: {
      confidenceLevel: "unverified",
      verificationSource: source.sourceType,
      verifiedAt: fetchedAt
    },
    contact: {
      phone: String(record.phone ?? record.contact?.phone ?? ""),
      website: String(record.website ?? record.contact?.website ?? ""),
      mapUrl: String(record.mapUrl ?? record.contact?.mapUrl ?? "")
    },
    source: {
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      sourceType: source.sourceType,
      sourceUrl: source.sourceUrl,
      sourceRecordUrl: String(record.sourceRecordUrl ?? source.sourceUrl),
      sourceLicense: source.sourceLicense,
      importedAt
    }
  };
}

function normalizePricing(pricing, fetchedAt) {
  if (!Array.isArray(pricing) || pricing.length === 0) {
    return [
      {
        type: "other",
        amountTwd: 0,
        unit: "custom",
        timeLimitMinutes: null,
        sourceNote: "來源未提供價格，需人工查證。",
        lastVerifiedAt: fetchedAt
      }
    ];
  }

  return pricing.map((price) => ({
    type: price.type || "other",
    amountTwd: price.amountTwd === null ? null : Number.isFinite(price.amountTwd) ? price.amountTwd : 0,
    unit: price.unit || "custom",
    timeLimitMinutes: price.timeLimitMinutes ?? null,
    sourceNote: price.sourceNote || "來源資料匯入，需人工查證。",
    lastVerifiedAt: price.lastVerifiedAt || fetchedAt
  }));
}

function normalizeOpeningHours(openingHours) {
  if (Array.isArray(openingHours) && openingHours.length === 7) {
    return openingHours;
  }

  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    opensAt: "00:00",
    closesAt: "00:00",
    isClosed: true
  }));
}

function buildStableGymId(record) {
  const cityCode = CITY_CODES[record.city] || "tw";
  return `${cityCode}-gym-${stableHash([record.city, record.district, record.name, record.address].join("|"))}`;
}

function stableHash(value) {
  let hash = 5381;
  const text = String(value ?? "");

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

function isBlockedAggregationSource(input) {
  const type = String(input.sourceType ?? "");

  if (BLOCKED_SOURCE_TYPES.has(type)) {
    return true;
  }

  const text = normalizeText([input.sourceName, input.sourceUrl].filter(Boolean).join(" "));

  if (ALWAYS_BLOCKED_SOURCE_TERMS.some((term) => text.includes(normalizeText(term)))) {
    return true;
  }

  if (AUTHORIZABLE_SOURCE_TERMS.some((term) => text.includes(normalizeText(term)))) {
    return !hasWrittenAuthorization(input);
  }

  return false;
}

function hasWrittenAuthorization(input) {
  return input.sourceType === "licensed_partner" && typeof input.authorizationDocument === "string" && input.authorizationDocument.trim();
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("臺", "台")
    .replace(/\s+/g, " ");
}

function compactText(value) {
  return normalizeText(value).replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function issue(path, message) {
  return { path, message };
}
