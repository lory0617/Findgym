import {
  buildComparisonRows,
  filterGyms,
  getBestFlexiblePrice,
  isGymOpenNow,
  rankGyms,
  validateReport
} from "./findgym-core.js";
import { buildDatasetStatus } from "./gym-data-validation.js";

const elements = {
  dataStatus: document.querySelector("#dataStatus"),
  filterForm: document.querySelector("#filterForm"),
  gymList: document.querySelector("#gymList"),
  mapCanvas: document.querySelector("#mapCanvas"),
  resultCount: document.querySelector("#resultCount"),
  detailPanel: document.querySelector("#detailPanel"),
  comparePanel: document.querySelector("#comparePanel"),
  reportPanel: document.querySelector("#reportPanel"),
  locateButton: document.querySelector("#locateButton")
};

const state = {
  gyms: [],
  dataStatus: null,
  filteredGyms: [],
  selectedGymId: null,
  reportGymId: null,
  compareIds: [],
  reportMessage: "",
  userLocation: { latitude: 25.0478, longitude: 121.517 },
  filters: {
    query: "",
    openNow: false,
    singleEntry: true,
    noContract: false,
    squatRack: false,
    shower: false,
    parking: false
  }
};

init();

async function init() {
  bindEvents();

  try {
    const response = await fetch("./data/gyms.json");

    if (!response.ok) {
      throw new Error(`Failed to load gyms: ${response.status}`);
    }

    state.gyms = await response.json();
    state.dataStatus = buildDatasetStatus(state.gyms);
    updateFilteredGyms();
  } catch (error) {
    renderLoadError(error);
  }
}

function bindEvents() {
  elements.filterForm?.addEventListener("input", handleFilterChange);
  elements.filterForm?.addEventListener("change", handleFilterChange);
  elements.locateButton?.addEventListener("click", handleLocate);
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("submit", handleSubmit);
}

function handleFilterChange() {
  const formData = new FormData(elements.filterForm);
  state.filters = {
    query: String(formData.get("query") ?? ""),
    openNow: formData.has("openNow"),
    singleEntry: formData.has("singleEntry"),
    noContract: formData.has("noContract"),
    squatRack: formData.has("squatRack"),
    shower: formData.has("shower"),
    parking: formData.has("parking")
  };
  updateFilteredGyms();
}

function handleLocate() {
  if (!navigator.geolocation) {
    state.reportMessage = "此瀏覽器不支援定位，先使用台北車站作為預設位置。";
    renderApp();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.userLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      updateFilteredGyms();
    },
    () => {
      state.reportMessage = "無法取得目前位置，先使用台北車站作為預設位置。";
      renderApp();
    },
    { enableHighAccuracy: true, timeout: 6000 }
  );
}

function handleDocumentClick(event) {
  if (!(event.target instanceof Element)) {
    return;
  }

  const actionButton = event.target.closest("[data-action]");

  if (!actionButton) {
    return;
  }

  const { action, gymId } = actionButton.dataset;

  if (action === "open-detail") {
    state.selectedGymId = gymId;
    renderApp();
  }

  if (action === "close-detail") {
    state.selectedGymId = null;
    renderApp();
  }

  if (action === "toggle-compare") {
    toggleCompare(gymId);
    renderApp();
  }

  if (action === "clear-compare") {
    state.compareIds = [];
    renderApp();
  }

  if (action === "open-report") {
    state.reportGymId = gymId ?? state.selectedGymId;
    state.reportMessage = "";
    renderApp();
  }

  if (action === "close-report") {
    state.reportGymId = null;
    state.reportMessage = "";
    renderApp();
  }
}

function handleSubmit(event) {
  if (event.target.id !== "reportForm") {
    return;
  }

  event.preventDefault();
  const formData = new FormData(event.target);
  const report = {
    id: crypto.randomUUID(),
    gymId: String(formData.get("gymId") ?? ""),
    reportType: String(formData.get("reportType") ?? ""),
    submittedValue: String(formData.get("submittedValue") ?? ""),
    evidenceUrl: String(formData.get("evidenceUrl") ?? ""),
    status: "pending",
    createdAt: new Date().toISOString()
  };
  const validation = validateReport(report);

  if (!validation.valid) {
    state.reportMessage = validation.errors.join(" ");
    renderApp();
    return;
  }

  const reports = getStoredReports();
  reports.push(report);
  localStorage.setItem("findgymReports", JSON.stringify(reports));
  state.reportMessage = "已儲存回報。原型階段會先保存在此瀏覽器。";
  renderApp();
}

function updateFilteredGyms() {
  const now = new Date();
  const filtered = filterGyms(state.gyms, state.filters, now);
  state.filteredGyms = rankGyms(filtered, state.userLocation, now);

  if (state.selectedGymId && !state.filteredGyms.some((gym) => gym.id === state.selectedGymId)) {
    state.selectedGymId = null;
  }

  state.compareIds = state.compareIds.filter((id) => state.gyms.some((gym) => gym.id === id));
  renderApp();
}

function renderApp() {
  renderDataStatus();
  renderMap();
  renderList();
  renderDetail();
  renderCompare();
  renderReport();
  renderStatus();
}

function renderDataStatus() {
  if (!elements.dataStatus || !state.dataStatus) {
    return;
  }

  const statusClass = state.dataStatus.level === "warning" ? "is-warning" : "is-ready";
  elements.dataStatus.className = `data-status ${statusClass}`;
  elements.dataStatus.innerHTML = `
    <div>
      <p class="eyebrow">資料狀態</p>
      <strong>${escapeHtml(state.dataStatus.headline)}</strong>
    </div>
    <p>${escapeHtml(state.dataStatus.detail)}</p>
  `;
}

function renderMap() {
  if (!elements.mapCanvas) {
    return;
  }

  if (state.filteredGyms.length === 0) {
    elements.mapCanvas.innerHTML = '<p class="map-empty">沒有符合條件的健身房</p>';
    return;
  }

  const bounds = getBounds(state.filteredGyms);
  const markers = state.filteredGyms
    .map((gym) => {
      const point = projectGym(gym, bounds);
      const price = getBestFlexiblePrice(gym);
      const label = price ? `NT$${price.amountTwd}` : "查看";
      return `
        <button
          class="map-marker ${gym.id === state.selectedGymId ? "is-selected" : ""}"
          type="button"
          style="left:${point.x}%;top:${point.y}%"
          data-action="open-detail"
          data-gym-id="${escapeHtml(gym.id)}"
          aria-label="查看 ${escapeHtml(gym.name)}"
          title="${escapeHtml(gym.name)}"
        >${escapeHtml(label)}</button>
      `;
    })
    .join("");

  elements.mapCanvas.innerHTML = `
    <div class="map-compass">台北 / 新北示範資料</div>
    ${markers}
  `;
}

function renderList() {
  if (!elements.gymList || !elements.resultCount) {
    return;
  }

  elements.resultCount.textContent = `${state.filteredGyms.length} 間`;

  if (state.filteredGyms.length === 0) {
    elements.gymList.innerHTML = '<p class="empty-state">調整篩選條件，或回報你知道的免綁約健身房。</p>';
    return;
  }

  elements.gymList.innerHTML = state.filteredGyms.map(renderGymCard).join("");
}

function renderGymCard(gym) {
  const price = getBestFlexiblePrice(gym);
  const open = isGymOpenNow(gym);
  const compared = state.compareIds.includes(gym.id);
  const distance = formatDistance(distanceKm(state.userLocation, gym));

  return `
    <article class="gym-card">
      <div class="gym-card-header">
        <div>
          <h3>${escapeHtml(gym.name)}</h3>
          <p class="meta">${escapeHtml(gym.city)}${escapeHtml(gym.district)} · ${distance}</p>
        </div>
        <span class="chip ${open ? "chip-strong" : "chip-warn"}">${open ? "營業中" : "未營業"}</span>
      </div>
      <div class="chip-row">
        ${renderAccessChips(gym)}
        ${price ? `<span class="chip chip-strong">${escapeHtml(formatPrice(price))}</span>` : '<span class="chip chip-warn">價格待查</span>'}
        ${gym.facilities?.is24Hours ? '<span class="chip">24 小時</span>' : ""}
        ${gym.facilities?.hasSquatRack ? '<span class="chip">深蹲架</span>' : ""}
        ${gym.facilities?.hasShower ? '<span class="chip">淋浴</span>' : ""}
      </div>
      <p class="meta">${escapeHtml(gym.address)}</p>
      <div class="card-actions">
        <button class="primary-button" type="button" data-action="open-detail" data-gym-id="${escapeHtml(gym.id)}">詳情</button>
        <button class="secondary-button" type="button" data-action="toggle-compare" data-gym-id="${escapeHtml(gym.id)}">
          ${compared ? "移出比較" : "加入比較"}
        </button>
        <button class="text-button" type="button" data-action="open-report" data-gym-id="${escapeHtml(gym.id)}">回報</button>
      </div>
    </article>
  `;
}

function renderDetail() {
  if (!elements.detailPanel) {
    return;
  }

  const gym = state.gyms.find((item) => item.id === state.selectedGymId);

  if (!gym) {
    elements.detailPanel.classList.remove("is-open");
    elements.detailPanel.innerHTML = "";
    return;
  }

  const price = getBestFlexiblePrice(gym);
  const compared = state.compareIds.includes(gym.id);

  elements.detailPanel.classList.add("is-open");
  elements.detailPanel.innerHTML = `
    <div class="drawer-grid">
      <div class="drawer-title-row">
        <div>
          <p class="eyebrow">${escapeHtml(gym.city)}${escapeHtml(gym.district)}</p>
          <h2>${escapeHtml(gym.name)}</h2>
        </div>
        <button class="icon-button icon-button-light" type="button" data-action="close-detail" aria-label="關閉詳情">×</button>
      </div>
      <div class="detail-grid">
        <div>
          <div class="chip-row">
            ${renderAccessChips(gym)}
            <span class="chip ${isGymOpenNow(gym) ? "chip-strong" : "chip-warn"}">${isGymOpenNow(gym) ? "目前營業中" : "目前未營業"}</span>
            <span class="chip">${escapeHtml(confidenceLabel(gym.verification?.confidenceLevel))}</span>
          </div>
          <p class="detail-address">${escapeHtml(gym.address)}</p>
          <div class="price-card">
            <span>最低彈性價格</span>
            <strong>${price ? escapeHtml(formatPrice(price)) : "尚未提供"}</strong>
            <small>${price?.sourceNote ? escapeHtml(price.sourceNote) : "價格資料待補"}</small>
          </div>
          <div class="drawer-actions">
            ${gym.contact?.mapUrl ? `<a class="primary-button" href="${escapeAttribute(gym.contact.mapUrl)}" target="_blank" rel="noreferrer">導航</a>` : ""}
            ${gym.contact?.phone ? `<a class="secondary-button" href="tel:${escapeAttribute(gym.contact.phone)}">電話</a>` : ""}
            ${gym.contact?.website ? `<a class="secondary-button" href="${escapeAttribute(gym.contact.website)}" target="_blank" rel="noreferrer">網站</a>` : ""}
            <button class="secondary-button" type="button" data-action="toggle-compare" data-gym-id="${escapeHtml(gym.id)}">
              ${compared ? "移出比較" : "加入比較"}
            </button>
            <button class="text-button" type="button" data-action="open-report" data-gym-id="${escapeHtml(gym.id)}">回報資料</button>
          </div>
        </div>
        <div class="fact-list">
          ${renderFact("合約政策", gym.access?.contractNote ?? "待補")}
          ${renderFact("設施", summarizeFacilities(gym))}
          ${renderFact("評價", formatRating(gym))}
          ${renderFact("最後確認", gym.verification?.verifiedAt ?? "尚未確認")}
        </div>
      </div>
    </div>
  `;
}

function renderCompare() {
  if (!elements.comparePanel) {
    return;
  }

  const gyms = state.compareIds.map((id) => state.gyms.find((gym) => gym.id === id)).filter(Boolean);

  if (gyms.length === 0) {
    elements.comparePanel.classList.remove("is-open");
    elements.comparePanel.innerHTML = "";
    return;
  }

  const rows = buildComparisonRows(gyms);
  elements.comparePanel.classList.add("is-open");
  elements.comparePanel.innerHTML = `
    <div class="drawer-title-row">
      <div>
        <p class="eyebrow">最多比較 3 間</p>
        <h2>比較清單</h2>
      </div>
      <button class="secondary-button" type="button" data-action="clear-compare">清空</button>
    </div>
    <div class="comparison-table" style="grid-template-columns:minmax(108px, 0.9fr) repeat(${gyms.length}, minmax(116px, 1fr))">
      <div class="comparison-cell comparison-heading">項目</div>
      ${gyms.map((gym) => `<div class="comparison-cell comparison-heading">${escapeHtml(gym.branchName || gym.name)}</div>`).join("")}
      ${rows
        .map(
          (row) => `
            <div class="comparison-cell row-label">${escapeHtml(row.label)}</div>
            ${row.values.map((value) => `<div class="comparison-cell">${escapeHtml(value)}</div>`).join("")}
          `
        )
        .join("")}
    </div>
  `;
}

function renderReport() {
  if (!elements.reportPanel) {
    return;
  }

  const gym = state.gyms.find((item) => item.id === state.reportGymId);

  if (!state.reportGymId && !state.reportMessage) {
    elements.reportPanel.classList.remove("is-open");
    elements.reportPanel.innerHTML = "";
    return;
  }

  elements.reportPanel.classList.add("is-open");
  elements.reportPanel.innerHTML = `
    <div class="drawer-title-row">
      <div>
        <p class="eyebrow">資料回報</p>
        <h2>${gym ? escapeHtml(gym.name) : "新增健身房"}</h2>
      </div>
      <button class="icon-button icon-button-light" type="button" data-action="close-report" aria-label="關閉回報">×</button>
    </div>
    ${state.reportMessage ? `<p class="notice">${escapeHtml(state.reportMessage)}</p>` : ""}
    <form id="reportForm" class="report-form">
      <input type="hidden" name="gymId" value="${escapeAttribute(gym?.id ?? "")}" />
      <label>
        <span>回報類型</span>
        <select name="reportType" required>
          <option value="">請選擇</option>
          <option value="wrong_price">價格錯誤</option>
          <option value="wrong_hours">營業時間錯誤</option>
          <option value="wrong_location">地點錯誤</option>
          <option value="closed">已歇業</option>
          <option value="facility_update">設施補充</option>
          <option value="missing_gym">新增健身房</option>
          <option value="other">其他</option>
        </select>
      </label>
      <label>
        <span>內容</span>
        <textarea name="submittedValue" placeholder="例如：單次入場為 NT$150，限 2 小時" required></textarea>
      </label>
      <label>
        <span>佐證連結</span>
        <input name="evidenceUrl" type="url" placeholder="官方網站、社群貼文或地圖連結" />
      </label>
      <button class="primary-button" type="submit">送出回報</button>
    </form>
  `;
}

function renderStatus() {
  if (state.reportMessage && !state.reportGymId && elements.reportPanel) {
    elements.reportPanel.classList.add("is-open");
    elements.reportPanel.innerHTML = `<p class="notice">${escapeHtml(state.reportMessage)}</p>`;
  }
}

function renderLoadError(error) {
  const message = escapeHtml(error.message);

  if (elements.gymList) {
    elements.gymList.innerHTML = `<p class="empty-state">資料載入失敗：${message}</p>`;
  }

  if (elements.mapCanvas) {
    elements.mapCanvas.innerHTML = '<p class="map-empty">無法載入地圖資料</p>';
  }
}

function toggleCompare(gymId) {
  if (!gymId) {
    return;
  }

  if (state.compareIds.includes(gymId)) {
    state.compareIds = state.compareIds.filter((id) => id !== gymId);
    return;
  }

  if (state.compareIds.length >= 3) {
    state.compareIds = [...state.compareIds.slice(1), gymId];
    return;
  }

  state.compareIds = [...state.compareIds, gymId];
}

function renderAccessChips(gym) {
  const chips = [];

  if (gym.access?.supportsSingleEntry) {
    chips.push('<span class="chip chip-strong">單次</span>');
  }

  if (gym.access?.supportsNoContractMonthly) {
    chips.push('<span class="chip chip-strong">免綁月繳</span>');
  }

  if (gym.access?.supportsTrial) {
    chips.push('<span class="chip">可體驗</span>');
  }

  return chips.length ? chips.join("") : '<span class="chip chip-warn">彈性入場待確認</span>';
}

function renderFact(label, value) {
  return `
    <div class="fact">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function summarizeFacilities(gym) {
  const labels = [];

  if (gym.facilities?.hasFreeWeights) labels.push("自由重量");
  if (gym.facilities?.hasSquatRack) labels.push("深蹲架");
  if (gym.facilities?.hasDeadliftPlatform) labels.push("硬舉平台");
  if (gym.facilities?.hasShower) labels.push("淋浴");
  if (gym.facilities?.hasParking) labels.push("停車");
  if (gym.facilities?.is24Hours) labels.push("24 小時");

  return labels.length ? labels.join("、") : "設施待補";
}

function formatRating(gym) {
  const rating = gym.rating?.externalRating;

  if (!rating) {
    return "尚無評價資料";
  }

  return `${rating.toFixed(1)} / ${gym.rating?.externalRatingCount ?? 0} 則`;
}

function formatPrice(price) {
  if (!price) {
    return "價格待查";
  }

  const unit =
    {
      per_entry: "次",
      per_hour: "小時",
      per_day: "日",
      per_month: "月"
    }[price.unit] ?? "方案";

  return `NT$${price.amountTwd}/${unit}`;
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

function getBounds(gyms) {
  const latitudes = gyms.map((gym) => gym.latitude).filter(Number.isFinite);
  const longitudes = gyms.map((gym) => gym.longitude).filter(Number.isFinite);

  return {
    minLat: Math.min(...latitudes),
    maxLat: Math.max(...latitudes),
    minLng: Math.min(...longitudes),
    maxLng: Math.max(...longitudes)
  };
}

function projectGym(gym, bounds) {
  const latSpan = bounds.maxLat - bounds.minLat || 0.01;
  const lngSpan = bounds.maxLng - bounds.minLng || 0.01;
  const x = 8 + ((gym.longitude - bounds.minLng) / lngSpan) * 84;
  const y = 8 + ((bounds.maxLat - gym.latitude) / latSpan) * 84;

  return {
    x: clamp(x, 8, 92),
    y: clamp(y, 8, 92)
  };
}

function distanceKm(from, to) {
  if (!from || !Number.isFinite(to.latitude) || !Number.isFinite(to.longitude)) {
    return null;
  }

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

function formatDistance(value) {
  if (value === null) {
    return "距離未知";
  }

  if (value < 1) {
    return `${Math.round(value * 1000)} m`;
  }

  return `${value.toFixed(1)} km`;
}

function getStoredReports() {
  try {
    return JSON.parse(localStorage.getItem("findgymReports") ?? "[]");
  } catch {
    return [];
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
