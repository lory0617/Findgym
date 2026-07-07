const STATUS_VALUES = new Set(["open", "temporarily_closed", "closed", "unknown"]);
const PRICE_TYPES = new Set(["single_entry", "hourly", "daily", "monthly_no_contract", "trial", "other"]);
const PRICE_UNITS = new Set(["per_entry", "per_hour", "per_day", "per_month", "custom"]);
const CONFIDENCE_VALUES = new Set(["verified", "likely", "unverified", "stale"]);
const REQUIRED_ACCESS_BOOLEANS = [
  "supportsSingleEntry",
  "supportsNoContractMonthly",
  "supportsTrial",
  "requiresMembershipCard",
  "requiresReservation"
];
const REQUIRED_FACILITY_BOOLEANS = [
  "hasFreeWeights",
  "hasSquatRack",
  "hasPowerRack",
  "hasBenchPress",
  "hasDeadliftPlatform",
  "hasCableMachine",
  "hasCardio",
  "hasGroupClasses",
  "hasPersonalTraining",
  "hasShower",
  "hasLocker",
  "hasParking",
  "is24Hours"
];

export function validateGymRecord(gym, index = 0) {
  const basePath = `[${index}]`;
  const errors = [];
  const warnings = [];

  if (!isObject(gym)) {
    errors.push(issue(basePath, "gym record must be an object"));
    return { errors, warnings };
  }

  requireString(gym, "id", basePath, errors);
  requireString(gym, "name", basePath, errors);
  requireString(gym, "city", basePath, errors);
  requireString(gym, "district", basePath, errors);
  requireString(gym, "address", basePath, errors);

  if (typeof gym.id === "string" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(gym.id)) {
    errors.push(issue(`${basePath}.id`, "id must use lowercase kebab-case"));
  }

  validateEnum(gym.status, STATUS_VALUES, `${basePath}.status`, "status", errors);
  validateBoolean(gym.isLargeContractFirstChain, `${basePath}.isLargeContractFirstChain`, errors);
  validateBoolean(gym.isHiddenByDefault, `${basePath}.isHiddenByDefault`, errors);
  validateCoordinate(gym.latitude, `${basePath}.latitude`, 21, 26.5, "latitude", errors);
  validateCoordinate(gym.longitude, `${basePath}.longitude`, 118, 123.5, "longitude", errors);
  validateAccess(gym.access, `${basePath}.access`, errors);
  validatePricing(gym.pricing, `${basePath}.pricing`, errors);
  validateFacilities(gym.facilities, `${basePath}.facilities`, errors);
  validateOpeningHours(gym.openingHours, `${basePath}.openingHours`, errors);
  validateRating(gym.rating, `${basePath}.rating`, errors);
  validateVerification(gym.verification, `${basePath}.verification`, errors, warnings);
  validateContact(gym.contact, `${basePath}.contact`, errors);

  return { errors, warnings };
}

export function validateGymDataset(input) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(input)) {
    return {
      valid: false,
      errors: [issue("$", "dataset must be an array")],
      warnings
    };
  }

  const seenIds = new Map();

  input.forEach((gym, index) => {
    const result = validateGymRecord(gym, index);
    errors.push(...result.errors);
    warnings.push(...result.warnings);

    if (typeof gym?.id === "string" && gym.id.trim()) {
      if (seenIds.has(gym.id)) {
        errors.push(issue(`[${index}].id`, `duplicate id "${gym.id}" also appears at [${seenIds.get(gym.id)}].id`));
      } else {
        seenIds.set(gym.id, index);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function summarizeGymDataset(gyms) {
  const rows = Array.isArray(gyms) ? gyms : [];
  const summary = {
    total: rows.length,
    byCity: {},
    byConfidence: {},
    singleEntryCount: 0,
    noContractCount: 0,
    flexibleAccessCount: 0,
    hiddenByDefaultCount: 0,
    staleOrUnverifiedCount: 0
  };

  rows.forEach((gym) => {
    increment(summary.byCity, gym.city || "unknown");
    increment(summary.byConfidence, gym.verification?.confidenceLevel || "unknown");

    if (gym.access?.supportsSingleEntry) {
      summary.singleEntryCount += 1;
    }

    if (gym.access?.supportsNoContractMonthly) {
      summary.noContractCount += 1;
    }

    if (gym.access?.supportsSingleEntry || gym.access?.supportsNoContractMonthly || gym.access?.supportsTrial) {
      summary.flexibleAccessCount += 1;
    }

    if (gym.isHiddenByDefault) {
      summary.hiddenByDefaultCount += 1;
    }

    if (["stale", "unverified"].includes(gym.verification?.confidenceLevel)) {
      summary.staleOrUnverifiedCount += 1;
    }
  });

  return summary;
}

function validateAccess(access, path, errors) {
  if (!isObject(access)) {
    errors.push(issue(path, "access must be an object"));
    return;
  }

  REQUIRED_ACCESS_BOOLEANS.forEach((key) => validateBoolean(access[key], `${path}.${key}`, errors));
}

function validatePricing(pricing, path, errors) {
  if (!Array.isArray(pricing) || pricing.length === 0) {
    errors.push(issue(path, "pricing must include at least one price row"));
    return;
  }

  pricing.forEach((price, index) => {
    const pricePath = `${path}[${index}]`;

    if (!isObject(price)) {
      errors.push(issue(pricePath, "price row must be an object"));
      return;
    }

    validateEnum(price.type, PRICE_TYPES, `${pricePath}.type`, "price type", errors);
    validateEnum(price.unit, PRICE_UNITS, `${pricePath}.unit`, "price unit", errors);

    if (!Number.isFinite(price.amountTwd) || price.amountTwd < 0) {
      errors.push(issue(`${pricePath}.amountTwd`, "amountTwd must be a non-negative number"));
    }

    if (
      price.timeLimitMinutes !== null &&
      price.timeLimitMinutes !== undefined &&
      (!Number.isInteger(price.timeLimitMinutes) || price.timeLimitMinutes < 0)
    ) {
      errors.push(issue(`${pricePath}.timeLimitMinutes`, "timeLimitMinutes must be a non-negative integer or null"));
    }

    if (!isDateString(price.lastVerifiedAt)) {
      errors.push(issue(`${pricePath}.lastVerifiedAt`, "lastVerifiedAt must use YYYY-MM-DD"));
    }
  });
}

function validateFacilities(facilities, path, errors) {
  if (!isObject(facilities)) {
    errors.push(issue(path, "facilities must be an object"));
    return;
  }

  REQUIRED_FACILITY_BOOLEANS.forEach((key) => validateBoolean(facilities[key], `${path}.${key}`, errors));
}

function validateOpeningHours(openingHours, path, errors) {
  if (!Array.isArray(openingHours) || openingHours.length !== 7) {
    errors.push(issue(path, "openingHours must include exactly seven weekday rows"));
    return;
  }

  const weekdays = new Set();

  openingHours.forEach((row, index) => {
    const rowPath = `${path}[${index}]`;

    if (!isObject(row)) {
      errors.push(issue(rowPath, "opening hour row must be an object"));
      return;
    }

    if (!Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6) {
      errors.push(issue(`${rowPath}.weekday`, "weekday must be an integer from 0 to 6"));
    } else if (weekdays.has(row.weekday)) {
      errors.push(issue(`${rowPath}.weekday`, `weekday ${row.weekday} appears more than once`));
    } else {
      weekdays.add(row.weekday);
    }

    validateBoolean(row.isClosed, `${rowPath}.isClosed`, errors);

    if (!row.isClosed) {
      if (!isTimeString(row.opensAt)) {
        errors.push(issue(`${rowPath}.opensAt`, "opensAt must use HH:MM"));
      }

      if (!isTimeString(row.closesAt)) {
        errors.push(issue(`${rowPath}.closesAt`, "closesAt must use HH:MM"));
      }
    }
  });

  [0, 1, 2, 3, 4, 5, 6].forEach((weekday) => {
    if (!weekdays.has(weekday)) {
      errors.push(issue(path, `openingHours missing weekday ${weekday}`));
    }
  });
}

function validateRating(rating, path, errors) {
  if (!isObject(rating)) {
    errors.push(issue(path, "rating must be an object"));
    return;
  }

  if (rating.externalRating !== null && rating.externalRating !== undefined) {
    if (!Number.isFinite(rating.externalRating) || rating.externalRating < 0 || rating.externalRating > 5) {
      errors.push(issue(`${path}.externalRating`, "externalRating must be between 0 and 5"));
    }
  }

  if (!Number.isInteger(rating.externalRatingCount) || rating.externalRatingCount < 0) {
    errors.push(issue(`${path}.externalRatingCount`, "externalRatingCount must be a non-negative integer"));
  }

  if (!Array.isArray(rating.summaryTags)) {
    errors.push(issue(`${path}.summaryTags`, "summaryTags must be an array"));
  }
}

function validateVerification(verification, path, errors, warnings) {
  if (!isObject(verification)) {
    errors.push(issue(path, "verification must be an object"));
    return;
  }

  validateEnum(verification.confidenceLevel, CONFIDENCE_VALUES, `${path}.confidenceLevel`, "confidence level", errors);

  if (!isDateString(verification.verifiedAt)) {
    errors.push(issue(`${path}.verifiedAt`, "verifiedAt must use YYYY-MM-DD"));
  }

  if (verification.confidenceLevel === "unverified") {
    warnings.push(issue(`${path}.confidenceLevel`, "record is unverified and needs review before launch"));
  }

  if (verification.confidenceLevel === "stale") {
    warnings.push(issue(`${path}.confidenceLevel`, "record is stale and needs re-verification"));
  }
}

function validateContact(contact, path, errors) {
  if (!isObject(contact)) {
    errors.push(issue(path, "contact must be an object"));
    return;
  }

  ["phone", "website", "mapUrl"].forEach((key) => {
    if (typeof contact[key] !== "string") {
      errors.push(issue(`${path}.${key}`, `${key} must be a string`));
    }
  });
}

function requireString(record, key, basePath, errors) {
  if (typeof record[key] !== "string" || !record[key].trim()) {
    errors.push(issue(`${basePath}.${key}`, `${key} is required`));
  }
}

function validateBoolean(value, path, errors) {
  if (typeof value !== "boolean") {
    errors.push(issue(path, "must be a boolean"));
  }
}

function validateCoordinate(value, path, min, max, label, errors) {
  if (!Number.isFinite(value) || value < min || value > max) {
    errors.push(issue(path, `${label} must be within Taiwan bounds`));
  }
}

function validateEnum(value, allowedValues, path, label, errors) {
  if (!allowedValues.has(value)) {
    errors.push(issue(path, `${label} is invalid`));
  }
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

function isTimeString(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));

  if (!match) {
    return false;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function issue(path, message) {
  return { path, message };
}
