const PRICE_PRIORITY = ["single_entry", "hourly", "daily", "trial", "monthly_no_contract", "other"];
const CONFIDENCE_SCORE = {
  verified: 3,
  likely: 2,
  unverified: 1,
  stale: 0
};

export function normalizeQuery(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("臺", "台");
}

export function getGymOpenStatus(gym, now = new Date()) {
  const hours = Array.isArray(gym?.openingHours) ? gym.openingHours : [];

  if (hasUnknownOpeningHours(hours)) {
    return "unknown";
  }

  const today = hours.find((entry) => Number(entry.weekday) === now.getDay());

  if (!today) {
    return "unknown";
  }

  if (today.isClosed) {
    return "closed";
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const opensAt = timeToMinutes(today.opensAt);
  const closesAt = timeToMinutes(today.closesAt);

  if (opensAt === null || closesAt === null) {
    return "unknown";
  }

  if (opensAt <= closesAt) {
    return currentMinutes >= opensAt && currentMinutes < closesAt ? "open" : "closed";
  }

  return currentMinutes >= opensAt || currentMinutes < closesAt ? "open" : "closed";
}

export function isGymOpenNow(gym, now = new Date()) {
  return getGymOpenStatus(gym, now) === "open";
}

export function hasUnknownOpeningHours(openingHours) {
  const hours = Array.isArray(openingHours) ? openingHours : [];

  if (hours.length === 0) {
    return true;
  }

  return (
    hours.length === 7 &&
    hours.every((entry) => entry?.isClosed === true && entry?.opensAt === "00:00" && entry?.closesAt === "00:00")
  );
}

export function getBestFlexiblePrice(gym) {
  const pricing = Array.isArray(gym?.pricing) ? gym.pricing : [];
  const flexiblePrices = pricing.filter((price) => PRICE_PRIORITY.includes(price.type));

  if (flexiblePrices.length === 0) {
    return null;
  }

  return [...flexiblePrices].sort((left, right) => {
    const priorityDelta = PRICE_PRIORITY.indexOf(left.type) - PRICE_PRIORITY.indexOf(right.type);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return Number(left.amountTwd ?? Number.POSITIVE_INFINITY) - Number(right.amountTwd ?? Number.POSITIVE_INFINITY);
  })[0];
}

export function hasCoordinates(gym) {
  return Number.isFinite(gym?.latitude) && Number.isFinite(gym?.longitude);
}

export function filterGyms(gyms, filters = {}, now = new Date()) {
  const query = normalizeQuery(filters.query);

  return gyms.filter((gym) => {
    if (gym.isHiddenByDefault && !filters.includeHidden) {
      return false;
    }

    if (query && !searchableText(gym).includes(query)) {
      return false;
    }

    if (filters.city && gym.city !== filters.city) {
      return false;
    }

    if (filters.openNow && !isGymOpenNow(gym, now)) {
      return false;
    }

    if (filters.singleEntry && !gym.access?.supportsSingleEntry) {
      return false;
    }

    if (filters.noContract && !gym.access?.supportsNoContractMonthly) {
      return false;
    }

    if (filters.hourly && !hasPricingType(gym, "hourly")) {
      return false;
    }

    if (filters.is24Hours && !gym.facilities?.is24Hours) {
      return false;
    }

    if (filters.squatRack && !gym.facilities?.hasSquatRack) {
      return false;
    }

    if (filters.shower && !gym.facilities?.hasShower) {
      return false;
    }

    if (filters.parking && !gym.facilities?.hasParking) {
      return false;
    }

    return true;
  });
}

export function rankGyms(gyms, userLocation = null, now = new Date()) {
  return [...gyms].sort((left, right) => scoreGym(right, userLocation, now) - scoreGym(left, userLocation, now));
}

export function buildComparisonRows(gyms) {
  return [
    {
      label: "彈性入場",
      values: gyms.map((gym) => formatAccess(gym))
    },
    {
      label: "最低彈性價格",
      values: gyms.map((gym) => formatPrice(getBestFlexiblePrice(gym)))
    },
    {
      label: "營業狀態",
      values: gyms.map((gym) => formatOpenStatus(gym))
    },
    {
      label: "重訓設備",
      values: gyms.map((gym) => formatStrengthFacilities(gym))
    },
    {
      label: "淋浴/停車",
      values: gyms.map((gym) => {
        const shower = gym.facilities?.hasShower ? "有淋浴" : "無淋浴資料";
        const parking = gym.facilities?.hasParking ? "有停車" : "無停車資料";
        return `${shower}、${parking}`;
      })
    },
    {
      label: "評價",
      values: gyms.map((gym) => {
        const rating = gym.rating?.externalRating;
        const count = gym.rating?.externalRatingCount;
        return rating ? `${rating.toFixed(1)} (${count ?? 0})` : "尚無評價資料";
      })
    },
    {
      label: "資料可信度",
      values: gyms.map((gym) => confidenceLabel(gym.verification?.confidenceLevel))
    }
  ];
}

export function validateReport(input) {
  const errors = [];
  const reportType = String(input?.reportType ?? "").trim();
  const submittedValue = String(input?.submittedValue ?? "").trim();

  if (!reportType) {
    errors.push("請選擇回報類型。");
  }

  if (!submittedValue) {
    errors.push("請填寫要更正或補充的內容。");
  }

  if (reportType !== "missing_gym" && !String(input?.gymId ?? "").trim()) {
    errors.push("缺少健身房識別碼。");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function searchableText(gym) {
  return normalizeQuery([gym.name, gym.brandName, gym.branchName, gym.city, gym.district, gym.address].filter(Boolean).join(" "));
}

function hasPricingType(gym, type) {
  return Array.isArray(gym.pricing) && gym.pricing.some((price) => price.type === type);
}

function scoreGym(gym, userLocation, now) {
  let score = 0;

  if (gym.access?.supportsSingleEntry) {
    score += 40;
  }

  if (gym.access?.supportsNoContractMonthly) {
    score += 18;
  }

  if (isGymOpenNow(gym, now)) {
    score += 10;
  }

  if (getBestFlexiblePrice(gym)) {
    score += 8;
  }

  score += CONFIDENCE_SCORE[gym.verification?.confidenceLevel] ?? 0;
  score += Math.min(Number(gym.rating?.externalRatingCount ?? 0), 500) / 500;
  score += Number(gym.rating?.externalRating ?? 0);

  if (userLocation && hasCoordinates(gym)) {
    const distanceKm = calculateDistanceKm(userLocation, gym);
    score += Math.max(0, 20 - distanceKm);
  }

  return score;
}

function timeToMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function calculateDistanceKm(from, to) {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(to.latitude - from.latitude);
  const lonDelta = toRadians(to.longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lonDelta / 2) * Math.sin(lonDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function formatAccess(gym) {
  const labels = [];

  if (gym.access?.supportsSingleEntry) {
    labels.push("單次");
  }

  if (gym.access?.supportsNoContractMonthly) {
    labels.push("免綁月繳");
  }

  if (gym.access?.supportsTrial) {
    labels.push("可體驗");
  }

  return labels.length ? labels.join(" / ") : "未確認彈性入場";
}

function formatPrice(price) {
  if (!price) {
    return "未提供";
  }

  if (price.amountTwd === null || price.amountTwd === undefined) {
    return "價格待查證";
  }

  const unitLabel =
    {
      per_entry: "次",
      per_hour: "小時",
      per_day: "日",
      per_month: "月",
      per_minute: "分鐘"
    }[price.unit] ?? "方案";

  return `$${price.amountTwd} / ${unitLabel}`;
}

function formatOpenStatus(gym) {
  const status = getGymOpenStatus(gym);

  if (status === "open") {
    return "目前營業中";
  }

  if (status === "closed") {
    return "目前未營業";
  }

  return "營業時間待查";
}

function formatStrengthFacilities(gym) {
  const labels = [];

  if (gym.facilities?.hasSquatRack) {
    labels.push("深蹲架");
  }

  if (gym.facilities?.hasPowerRack) {
    labels.push("Power rack");
  }

  if (gym.facilities?.hasDeadliftPlatform) {
    labels.push("硬舉平台");
  }

  if (gym.facilities?.hasBenchPress) {
    labels.push("臥推");
  }

  return labels.length ? labels.join("、") : "重訓設備未確認";
}

function confidenceLabel(value) {
  return (
    {
      verified: "已驗證",
      likely: "可能正確",
      unverified: "尚未驗證",
      stale: "可能過期"
    }[value] ?? "尚未驗證"
  );
}

export function paginateItems(items, page = 1, pageSize = 10) {
  const list = Array.isArray(items) ? items : [];
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);

  return {
    page: safePage,
    totalPages,
    pageItems: list.slice((safePage - 1) * pageSize, safePage * pageSize)
  };
}
