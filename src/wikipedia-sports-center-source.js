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
const OPEN_STATUSES = new Set(["營運中", "試營運"]);

export function buildWikipediaSportsCenterSourcePackage(pageHtml, options = {}) {
  const fetchedAt = options.fetchedAt || new Date().toISOString().slice(0, 10);
  const tableRows = extractSportsCenterRows(pageHtml);
  const records = [];
  const skipped = [];

  tableRows.forEach((row, index) => {
    const parsed = parseWikipediaRow(row);

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
      sourceId: "wikipedia-taiwan-sports-centers",
      sourceName: "Wikipedia Taiwan sports center list seed",
      sourceType: "open_knowledge_base",
      sourceUrl: "https://zh.wikipedia.org/wiki/臺灣國民運動中心列表",
      sourceLicense:
        "Wikipedia table content under Creative Commons Attribution-ShareAlike; attribution and official-source verification required before launch",
      fetchedAt,
      records
    },
    skipped
  };
}

function extractSportsCenterRows(pageHtml) {
  const rows = [];
  const blockPattern = /<h([23])\b[^>]*>[\s\S]*?<\/h\1>|<table\b(?=[^>]*\bwikitable\b)[\s\S]*?<\/table>/giu;
  let currentHeading = "";
  let match;

  while ((match = blockPattern.exec(String(pageHtml ?? "")))) {
    const block = match[0];

    if (/^<h[23]\b/iu.test(block)) {
      currentHeading = cleanHtml(block);
      continue;
    }

    parseTable(block, currentHeading).forEach((row) => rows.push(row));
  }

  return rows;
}

function parseTable(tableHtml, currentHeading) {
  const rawRows = [...String(tableHtml ?? "").matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/giu)];
  let headers = [];
  const rows = [];
  const activeRowspans = [];

  rawRows.forEach((rawRow) => {
    const cells = expandRowspanCells(parseCells(rawRow[0]), activeRowspans);

    if (cells.length === 0) {
      return;
    }

    const hasHeaderCells = cells.some((cell) => cell.tag === "th");

    if (hasHeaderCells) {
      headers = cells.map((cell) => normalizeHeader(cell.text));
      return;
    }

    if (!headers.some((header) => header.includes("運動中心")) || !headers.includes("地址")) {
      return;
    }

    const row = { heading: currentHeading, cells: {}, cellHtml: {} };
    headers.forEach((header, index) => {
      row.cells[header] = cells[index]?.text ?? "";
      row.cellHtml[header] = cells[index]?.html ?? "";
    });
    rows.push(row);
  });

  return rows;
}

function parseCells(rowHtml) {
  return [...String(rowHtml ?? "").matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/giu)].map((match) => ({
    tag: match[1].toLowerCase(),
    text: cleanHtml(match[3]),
    html: match[3],
    rowspan: parseRowspan(match[2])
  }));
}

function expandRowspanCells(rawCells, activeRowspans) {
  const cells = [];
  let rawIndex = 0;
  let columnIndex = 0;

  while (rawIndex < rawCells.length || activeRowspans[columnIndex]) {
    const active = activeRowspans[columnIndex];

    if (active) {
      cells.push({ tag: active.tag, text: active.text, html: active.html, rowspan: 1 });
      active.remaining -= 1;

      if (active.remaining <= 0) {
        activeRowspans[columnIndex] = null;
      }

      columnIndex += 1;
      continue;
    }

    const cell = rawCells[rawIndex];
    rawIndex += 1;
    cells.push(cell);

    if (cell.rowspan > 1) {
      activeRowspans[columnIndex] = {
        tag: cell.tag,
        text: cell.text,
        html: cell.html,
        remaining: cell.rowspan - 1
      };
    }

    columnIndex += 1;
  }

  return cells;
}

function parseRowspan(attributes) {
  const match = /rowspan\s*=\s*["']?(\d+)/iu.exec(String(attributes ?? ""));
  return match ? Number(match[1]) : 1;
}

function parseWikipediaRow(row) {
  const cells = row.cells;
  const name = normalizeVenueName(cellValue(cells, ["運動中心"]));
  const address = normalizeTaiwanText(cellValue(cells, ["地址"]));
  const status = cleanText(cellValue(cells, ["狀態"]));
  const sourceRecordUrl = extractFirstWikiUrl(cellValue(row.cellHtml, ["運動中心"])) || "";

  if (!name) {
    return { valid: false, name: "", reason: "missing_name" };
  }

  if (!OPEN_STATUSES.has(status)) {
    return { valid: false, name, reason: `not_open_status:${status || "unknown"}` };
  }

  if (!address) {
    return { valid: false, name, reason: "missing_address" };
  }

  const location = parseTaiwanLocation({
    address,
    heading: row.heading,
    cityCell: cellValue(cells, ["縣市"]),
    districtCell: cellValue(cells, ["行政區"])
  });

  if (!location.city || !location.district) {
    return { valid: false, name, reason: "missing_city_or_district" };
  }

  return {
    valid: true,
    name,
    city: location.city,
    district: location.district,
    address,
    status,
    sourceRecordUrl
  };
}

function toSourceRecord(parsed, fetchedAt) {
  const branchName = parsed.name.replace(/(國民|市民|全民)?運動(中心|館)$/u, "") || parsed.district.replace(/區$|市$|鎮$|鄉$/u, "");

  return {
    name: parsed.name,
    brandName: parsed.name.includes("國民運動中心") ? `${parsed.city}國民運動中心` : `${parsed.city}運動中心`,
    branchName,
    city: parsed.city,
    district: parsed.district,
    address: parsed.address,
    latitude: null,
    longitude: null,
    sourceRecordUrl: parsed.sourceRecordUrl || "https://zh.wikipedia.org/wiki/臺灣國民運動中心列表",
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
        sourceNote: "Wikipedia list identifies the public sports center; price requires official-source verification.",
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

function parseTaiwanLocation({ address, heading, cityCell, districtCell }) {
  const normalizedAddress = normalizeTaiwanText(address);
  const city =
    normalizeTaiwanText(cityCell) ||
    parseCity(normalizeTaiwanText(heading)) ||
    CITY_NAMES.map(normalizeTaiwanText).find((name) => normalizedAddress.includes(name)) ||
    "";
  const district =
    normalizeTaiwanText(districtCell) ||
    parseDistrictFromAddress(normalizedAddress) ||
    normalizedAddress.replace(city, "").match(/^([^0-9\s]+?(?:區|鄉|鎮|市))/u)?.[1] ||
    "";

  return {
    city,
    district
  };
}

function parseCity(text) {
  const normalized = normalizeTaiwanText(text);
  return CITY_NAMES.map(normalizeTaiwanText).find((city) => normalized.includes(city)) || "";
}

function parseDistrictFromAddress(address) {
  const cityPattern = CITY_NAMES.map((city) => escapeRegExp(normalizeTaiwanText(city))).join("|");
  const match = new RegExp(`(?:${cityPattern})([^0-9\\s()（）]+?(?:區|鄉|鎮|市))`, "u").exec(address);
  return match?.[1] ?? "";
}

function cellValue(cells, keys) {
  for (const key of keys) {
    const value = cells[normalizeHeader(key)];

    if (value) {
      return value;
    }
  }

  return "";
}

function normalizeHeader(value) {
  return cleanText(value).replace(/[／/]/gu, "");
}

function normalizeVenueName(value) {
  return cleanText(value)
    .replace(/^臺灣國民運動中心列表$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function cleanHtml(value) {
  return decodeHtmlEntities(
    String(value ?? "")
      .replace(/<sup\b[\s\S]*?<\/sup>/giu, "")
      .replace(/<script\b[\s\S]*?<\/script>/giu, "")
      .replace(/<style\b[\s\S]*?<\/style>/giu, "")
      .replace(/<br\s*\/?>/giu, " ")
      .replace(/<!--[\s\S]*?-->/gu, "")
      .replace(/<[^>]+>/gu, "")
  )
    .replace(/\[[^\]]*編輯[^\]]*\]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function normalizeTaiwanText(value) {
  return cleanText(value).replaceAll("臺", "台");
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#039;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">");
}

function extractFirstWikiUrl(value) {
  const match = /href="([^"]+)"/u.exec(String(value ?? ""));

  if (!match) {
    return "";
  }

  if (match[1].startsWith("/wiki/")) {
    return `https://zh.wikipedia.org${match[1]}`;
  }

  return match[1];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
