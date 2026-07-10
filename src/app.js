import {
  buildComparisonRows,
  filterGyms,
  getBestFlexiblePrice,
  getGymOpenStatus,
  hasCoordinates,
  paginateItems,
  rankGyms,
  toggleSavedId,
  validateReport
} from "./findgym-core.js";

const PAGE_SIZE = 10;
import { buildDatasetStatus } from "./gym-data-validation.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, isBackendConfigured } from "./backend-config.js";
import { createBackendClient } from "./backend-client.js";
import { mergeSavedIds } from "./saved-store.js";

const backend = isBackendConfigured()
  ? createBackendClient({
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      fetchImpl: (...args) => globalThis.fetch(...args),
      storage: globalThis.localStorage
    })
  : null;

const elements = {
  dataStatus: document.querySelector("#dataStatus"),
  filterForm: document.querySelector("#filterForm"),
  gymList: document.querySelector("#gymList"),
  mapCanvas: document.querySelector("#mapCanvas"),
  mapNotice: document.querySelector("#mapNotice"),
  resultCount: document.querySelector("#resultCount"),
  detailPanel: document.querySelector("#detailPanel"),
  comparePanel: document.querySelector("#comparePanel"),
  savedPanel: document.querySelector("#savedPanel"),
  reportPanel: document.querySelector("#reportPanel"),
  locateButton: document.querySelector("#locateButton"),
  backToTop: document.querySelector("#backToTop")
};

// Gyms the user un-saved during this session. Tracked so an in-flight cloud
// listSaved() merge cannot resurrect a just-removed save.
const removedSavedIds = new Set();

const NEIGHBORHOOD_ZOOM = 14;
const mapView = {
  map: null,
  markerLayer: null,
  framedCity: null
};

const state = {
  gyms: [],
  dataStatus: null,
  filteredGyms: [],
  page: 1,
  selectedGymId: null,
  reportGymId: null,
  compareIds: [],
  compareOpen: false,
  savedIds: [],
  savedOpen: false,
  reportMessage: "",
  userLocation: { latitude: 25.0478, longitude: 121.517 },
  filters: {
    query: "",
    city: "",
    openNow: false,
    singleEntry: true,
    hourly: false,
    noContract: false,
    is24Hours: false,
    squatRack: false,
    shower: false,
    parking: false
  }
};

init();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

async function init() {
  bindEvents();

  try {
    const response = await fetch("./data/gyms.json");

    if (!response.ok) {
      throw new Error(`Failed to load gyms: ${response.status}`);
    }

    state.gyms = await response.json();
    state.dataStatus = buildDatasetStatus(state.gyms);
    state.savedIds = getStoredSaved().filter((id) => state.gyms.some((gym) => gym.id === id));

    if (backend) {
      backend?.listSaved().then((cloudIds) => {
        const valid = mergeSavedIds(state.savedIds, cloudIds, [...removedSavedIds]).filter((id) =>
          state.gyms.some((gym) => gym.id === id)
        );
        if (valid.length !== state.savedIds.length) {
          state.savedIds = valid;
          localStorage.setItem("findgymSaved", JSON.stringify(state.savedIds));
          renderApp();
        }
      });
    }

    updateFilteredGyms();
    autoLocateOnLoad();
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
  window.addEventListener("scroll", toggleBackToTop, { passive: true });
  toggleBackToTop();
  bindNativeBackButton();
}

function bindNativeBackButton() {
  const appPlugin = globalThis.Capacitor?.isNativePlatform?.() ? globalThis.Capacitor?.Plugins?.App : null;
  if (!appPlugin?.addListener) {
    return;
  }
  appPlugin.addListener("backButton", () => {
    if (closeTopDrawer()) {
      return;
    }
    appPlugin.exitApp();
  });
}

function closeTopDrawer() {
  if (state.reportGymId || state.reportMessage) {
    state.reportGymId = null;
    state.reportMessage = "";
    renderApp();
    return true;
  }
  if (state.savedOpen) {
    state.savedOpen = false;
    renderApp();
    return true;
  }
  if (state.compareOpen) {
    state.compareOpen = false;
    renderApp();
    return true;
  }
  if (state.selectedGymId) {
    state.selectedGymId = null;
    renderApp();
    return true;
  }
  return false;
}

function toggleBackToTop() {
  if (elements.backToTop) {
    elements.backToTop.hidden = window.scrollY < 400;
  }
}

function handleFilterChange() {
  const formData = new FormData(elements.filterForm);
  state.filters = {
    query: String(formData.get("query") ?? ""),
    city: String(formData.get("city") ?? ""),
    openNow: formData.has("openNow"),
    singleEntry: formData.has("singleEntry"),
    hourly: formData.has("hourly"),
    noContract: formData.has("noContract"),
    is24Hours: formData.has("is24Hours"),
    squatRack: formData.has("squatRack"),
    shower: formData.has("shower"),
    parking: formData.has("parking")
  };
  updateFilteredGyms();
}

function getCurrentPositionCompat(onSuccess, onError, options) {
  const native = globalThis.Capacitor?.isNativePlatform?.()
    ? globalThis.Capacitor?.Plugins?.Geolocation
    : null;

  if (native) {
    native
      .getCurrentPosition({ enableHighAccuracy: options?.enableHighAccuracy ?? false, timeout: options?.timeout ?? 6000 })
      .then((position) => onSuccess(position))
      .catch((error) => onError?.(error));
    return;
  }

  if (!navigator.geolocation) {
    onError?.(new Error("geolocation unavailable"));
    return;
  }

  navigator.geolocation.getCurrentPosition(onSuccess, (error) => onError?.(error), options);
}

function handleLocate() {
  if (!navigator.geolocation && !(globalThis.Capacitor?.isNativePlatform?.() && globalThis.Capacitor?.Plugins?.Geolocation)) {
    state.reportMessage = "此瀏覽器不支援定位，先使用台北車站作為預設位置。";
    renderApp();
    return;
  }

  getCurrentPositionCompat(
    (position) => {
      state.userLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      recenterMapOnUser();
      updateFilteredGyms();
    },
    () => {
      state.reportMessage = "無法取得目前位置，先使用台北車站作為預設位置。";
      renderApp();
    },
    { enableHighAccuracy: true, timeout: 6000 }
  );
}

function openGymDetail(gymId) {
  state.selectedGymId = gymId;
  renderApp();
  elements.detailPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function recenterMapOnUser() {
  if (mapView.map) {
    mapView.map.setView([state.userLocation.latitude, state.userLocation.longitude], NEIGHBORHOOD_ZOOM);
  }
}

function autoLocateOnLoad() {
  if (!navigator.geolocation) {
    return;
  }

  getCurrentPositionCompat(
    (position) => {
      state.userLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      recenterMapOnUser();
      updateFilteredGyms();
    },
    () => {},
    { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
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

  if (action === "scroll-top") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (action === "set-page") {
    state.page = Number(actionButton.dataset.page);
    renderList();
    elements.gymList?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (action === "open-detail") {
    openGymDetail(gymId);
  }

  if (action === "close-detail") {
    state.selectedGymId = null;
    renderApp();
  }

  if (action === "toggle-compare") {
    toggleCompare(gymId);
    state.compareOpen = true;
    renderApp();
  }

  if (action === "open-compare") {
    state.compareOpen = true;
    renderApp();
    elements.comparePanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (action === "clear-compare") {
    state.compareIds = [];
    renderApp();
  }

  if (action === "close-compare") {
    state.compareOpen = false;
    renderApp();
  }

  if (action === "toggle-saved") {
    toggleSaved(gymId);
    renderApp();
  }

  if (action === "open-saved") {
    state.savedOpen = true;
    renderApp();
    elements.savedPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (action === "close-saved") {
    state.savedOpen = false;
    renderApp();
  }

  if (action === "open-report") {
    state.reportGymId = gymId ?? state.selectedGymId ?? "missing_gym";
    state.reportMessage = "";
    renderApp();
    elements.reportPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  state.reportMessage = "已送出回報，謝謝你的協助。";
  renderApp();

  backend?.insertReport(report).then((ok) => {
    // Only surface the failure if the report context is still open. If the user
    // closed the panel (close-report clears both fields) the failure is dropped
    // silently — the report is already saved in localStorage.
    if (!ok && (state.reportGymId || state.reportMessage)) {
      state.reportMessage = "已在此裝置保存回報；目前無法連上伺服器，請稍後再送出一次。";
      renderApp();
    }
  });
}

function updateFilteredGyms() {
  const now = new Date();
  const filtered = filterGyms(state.gyms, state.filters, now);
  state.filteredGyms = rankGyms(filtered, state.userLocation, now);
  state.page = 1;

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
  renderSaved();
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
  if (!elements.mapCanvas || typeof L === "undefined") {
    return;
  }

  if (!mapView.map) {
    mapView.map = L.map(elements.mapCanvas).setView(
      [state.userLocation.latitude, state.userLocation.longitude],
      NEIGHBORHOOD_ZOOM
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
    }).addTo(mapView.map);
    mapView.markerLayer = L.layerGroup().addTo(mapView.map);
  }

  const mappableGyms = state.filteredGyms.filter(hasCoordinates);

  renderMapNotice(mappableGyms.length, state.filteredGyms.length);
  mapView.markerLayer.clearLayers();

  if (mappableGyms.length === 0) {
    return;
  }

  mappableGyms.forEach((gym) => {
    const price = getBestFlexiblePrice(gym);
    const priceLabel = price ? formatPrice(price) : "價格需複核";
    const marker = L.marker([gym.latitude, gym.longitude], {
      icon: buildMapIcon(gym),
      title: gym.name
    });

    marker.bindPopup(`
      <strong>${escapeHtml(gym.name)}</strong><br />
      ${escapeHtml(gym.district)}・${escapeHtml(priceLabel)}<br />
      <button class="map-popup-button" type="button" data-action="open-detail" data-gym-id="${escapeHtml(gym.id)}">詳情</button>
    `);
    // Leaflet's popup calls disableClickPropagation, so a click on the popup
    // button never bubbles to the document listener — wire it directly instead.
    marker.on("popupopen", (event) => {
      const button = event.popup.getElement()?.querySelector('[data-action="open-detail"]');
      button?.addEventListener("click", () => openGymDetail(gym.id), { once: true });
    });
    marker.addTo(mapView.markerLayer);
  });

  // Default view stays centered on the user; only reframe when the city filter
  // changes, so a user browsing their neighbourhood keeps their own pan/zoom.
  const city = state.filters.city;

  if (city && city !== mapView.framedCity) {
    const bounds = L.latLngBounds(mappableGyms.map((gym) => [gym.latitude, gym.longitude]));
    mapView.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
  }

  mapView.framedCity = city || null;
}

function renderMapNotice(mappableCount, totalCount) {
  if (!elements.mapNotice) {
    return;
  }

  if (totalCount === 0) {
    elements.mapNotice.textContent = "沒有符合條件的健身房";
  } else if (mappableCount === 0) {
    elements.mapNotice.textContent = "符合條件的據點尚待補座標";
  } else {
    elements.mapNotice.textContent = `可定位據點 ${mappableCount} / ${totalCount}`;
  }

  elements.mapNotice.hidden = false;
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

  const { page, totalPages, pageItems } = paginateItems(state.filteredGyms, state.page, PAGE_SIZE);
  state.page = page;

  elements.gymList.innerHTML = `
    ${pageItems.map(renderGymCard).join("")}
    ${renderPagination(page, totalPages)}
  `;
}

function renderPagination(page, totalPages) {
  if (totalPages <= 1) {
    return "";
  }

  const windowSize = 5;
  const windowStart = Math.max(1, Math.min(page - Math.floor(windowSize / 2), totalPages - windowSize + 1));
  const pageNumbers = Array.from({ length: Math.min(windowSize, totalPages) }, (_, index) => windowStart + index);

  return `
    <nav class="pagination" aria-label="搜尋結果分頁">
      <button class="page-button" type="button" data-action="set-page" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>上一頁</button>
      ${pageNumbers
        .map(
          (pageNumber) => `
            <button
              class="page-button ${pageNumber === page ? "is-current" : ""}"
              type="button"
              data-action="set-page"
              data-page="${pageNumber}"
              ${pageNumber === page ? 'aria-current="page"' : ""}
            >${pageNumber}</button>
          `
        )
        .join("")}
      <button class="page-button" type="button" data-action="set-page" data-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>下一頁</button>
      <span class="page-status">第 ${page} / ${totalPages} 頁</span>
    </nav>
  `;
}

function renderGymCard(gym) {
  const price = getBestFlexiblePrice(gym);
  const priceLabel = price ? formatPrice(price) : "價格需複核";
  const compared = state.compareIds.includes(gym.id);
  const saved = state.savedIds.includes(gym.id);
  const distance = formatDistance(distanceKm(state.userLocation, gym));

  return `
    <article class="gym-card ${state.selectedGymId === gym.id ? "is-selected" : ""}">
      <div class="gym-thumb" aria-hidden="true">
        <img src="./assets/icon.svg" alt="" />
      </div>
      <div class="gym-card-body">
        <div class="gym-card-header">
          <div>
            <h3>${escapeHtml(gym.name)}</h3>
            <p class="meta">${escapeHtml(gym.city)}${escapeHtml(gym.district)} · ${escapeHtml(gym.address)}</p>
          </div>
          <span class="distance-badge">${escapeHtml(distance)}</span>
        </div>
        <div class="status-row">
          ${renderOpenStatusChip(gym)}
          ${renderSourceChip(gym)}
        </div>
        <div class="price-row">
          <span>最低彈性價格</span>
          <strong>${escapeHtml(priceLabel)}</strong>
        </div>
        <div class="service-tags">
          ${renderServiceTags(gym)}
        </div>
        <p class="source-line">營業時間：${escapeHtml(formatTodayHours(gym))} · 最後確認 ${escapeHtml(gym.verification?.verifiedAt ?? "待更新")}</p>
        ${gym.access?.contractNote ? `<p class="price-note">${escapeHtml(gym.access.contractNote)}</p>` : ""}
        <div class="card-actions">
          <button class="primary-button" type="button" data-action="open-detail" data-gym-id="${escapeHtml(gym.id)}">詳情</button>
          <button class="secondary-button ${saved ? "is-active" : ""}" type="button" data-action="toggle-saved" data-gym-id="${escapeHtml(gym.id)}" aria-pressed="${saved}">
            ${saved ? "★ 已收藏" : "☆ 收藏"}
          </button>
          <button class="secondary-button" type="button" data-action="toggle-compare" data-gym-id="${escapeHtml(gym.id)}">
            ${compared ? "移出比較" : "加入比較"}
          </button>
          <button class="text-button" type="button" data-action="open-report" data-gym-id="${escapeHtml(gym.id)}">回報</button>
        </div>
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
  const priceLabel = price ? formatPrice(price) : "價格需複核";
  const compared = state.compareIds.includes(gym.id);
  const saved = state.savedIds.includes(gym.id);
  const mapUrl = safeExternalUrl(gym.contact?.mapUrl ?? "");
  const websiteUrl = safeExternalUrl(gym.contact?.website ?? "");
  const telHref = (gym.contact?.phone ?? "").replace(/[^0-9+#*()-]/g, "");

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
            ${renderOpenStatusChip(gym, { includeCurrently: true })}
            ${renderSourceChip(gym)}
          </div>
          <p class="detail-address">${escapeHtml(gym.address)}</p>
          <div class="price-card">
            <span>收費</span>
            <strong>${escapeHtml(priceLabel)}</strong>
            <small>${price?.sourceNote ? escapeHtml(price.sourceNote) : "價格需複核，出發前建議查看官方資訊。"}</small>
          </div>
          <div class="detail-summary-grid">
            <div>
              <span>入場方式</span>
              <strong>${escapeHtml(summarizeEntryTypes(gym))}</strong>
            </div>
            <div>
              <span>免綁約</span>
              <strong>${gym.access?.supportsNoContractMonthly || gym.access?.supportsSingleEntry ? "是" : "需複核"}</strong>
            </div>
            <div>
              <span>營業時間</span>
              <strong>${escapeHtml(formatTodayHours(gym))}</strong>
            </div>
            <div>
              <span>資料狀態</span>
              <strong>${escapeHtml(sourceLabel(gym))}</strong>
            </div>
          </div>
          <div class="drawer-actions detail-cta">
            ${mapUrl ? `<a class="primary-button" href="${escapeAttribute(mapUrl)}" target="_blank" rel="noreferrer">導航</a>` : ""}
            ${telHref ? `<a class="secondary-button" href="tel:${escapeAttribute(telHref)}">電話</a>` : ""}
            ${websiteUrl ? `<a class="secondary-button" href="${escapeAttribute(websiteUrl)}" target="_blank" rel="noreferrer">網站</a>` : ""}
            <button class="secondary-button ${saved ? "is-active" : ""}" type="button" data-action="toggle-saved" data-gym-id="${escapeHtml(gym.id)}" aria-pressed="${saved}">
              ${saved ? "★ 已收藏" : "☆ 收藏"}
            </button>
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

  if (gyms.length === 0 && !state.compareOpen) {
    elements.comparePanel.classList.remove("is-open");
    elements.comparePanel.innerHTML = "";
    return;
  }

  elements.comparePanel.classList.add("is-open");

  if (gyms.length === 0) {
    elements.comparePanel.innerHTML = `
      <div class="drawer-title-row">
        <div>
          <p class="eyebrow">最多比較 3 間</p>
          <h2>比較清單</h2>
        </div>
        <button class="text-button" type="button" data-action="close-compare">關閉</button>
      </div>
      <p class="empty-state">還沒有加入比較的健身房。在卡片上點「加入比較」，最多挑 3 間並排比較。</p>
    `;
    return;
  }

  const rows = buildComparisonRows(gyms);
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
  const isMissingGymReport = state.reportGymId === "missing_gym";

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
          <option value="missing_gym" ${isMissingGymReport ? "selected" : ""}>新增健身房</option>
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

  if (elements.mapNotice) {
    elements.mapNotice.textContent = "無法載入地圖資料";
    elements.mapNotice.hidden = false;
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

function toggleSaved(gymId) {
  if (!gymId) {
    return;
  }

  const willSave = !state.savedIds.includes(gymId);
  state.savedIds = toggleSavedId(state.savedIds, gymId);
  localStorage.setItem("findgymSaved", JSON.stringify(state.savedIds));

  if (willSave) {
    removedSavedIds.delete(gymId);
    backend?.addSaved(gymId);
  } else {
    removedSavedIds.add(gymId);
    backend?.removeSaved(gymId);
  }
}

function getStoredSaved() {
  try {
    const stored = JSON.parse(localStorage.getItem("findgymSaved") ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function renderSaved() {
  if (!elements.savedPanel) {
    return;
  }

  if (!state.savedOpen) {
    elements.savedPanel.classList.remove("is-open");
    elements.savedPanel.innerHTML = "";
    return;
  }

  const gyms = state.savedIds
    .map((id) => state.gyms.find((gym) => gym.id === id))
    .filter(Boolean);

  elements.savedPanel.classList.add("is-open");
  elements.savedPanel.innerHTML = `
    <div class="drawer-title-row">
      <div>
        <p class="eyebrow">收藏清單</p>
        <h2>已收藏 ${gyms.length} 間</h2>
      </div>
      <button class="text-button" type="button" data-action="close-saved">關閉</button>
    </div>
    ${
      gyms.length === 0
        ? '<p class="empty-state">還沒有收藏。在健身房卡片上點「☆ 收藏」把備用據點存起來。</p>'
        : `<div class="saved-list">${gyms.map(renderSavedRow).join("")}</div>`
    }
  `;
}

function renderSavedRow(gym) {
  const price = getBestFlexiblePrice(gym);
  const priceLabel = price ? formatPrice(price) : "價格需複核";

  return `
    <div class="saved-row">
      <div class="saved-row-body">
        <strong>${escapeHtml(gym.name)}</strong>
        <p class="meta">${escapeHtml(gym.city)}${escapeHtml(gym.district)} · ${escapeHtml(priceLabel)}</p>
      </div>
      <div class="saved-row-actions">
        <button class="secondary-button compact-button" type="button" data-action="open-detail" data-gym-id="${escapeHtml(gym.id)}">詳情</button>
        <button class="text-button" type="button" data-action="toggle-saved" data-gym-id="${escapeHtml(gym.id)}">移除</button>
      </div>
    </div>
  `;
}

function buildMapIcon(gym) {
  const status = getGymOpenStatus(gym);
  const level = gym.verification?.confidenceLevel;
  const statusClass =
    {
      open: "is-open",
      closed: "is-closed",
      unknown: "is-unknown"
    }[status] ?? "is-unknown";
  const verifiedClass = level === "verified" ? "is-verified" : "";

  return L.divIcon({
    className: `gym-map-pin ${statusClass} ${verifiedClass}`.trim(),
    html: "<span></span>",
    iconAnchor: [10, 20],
    iconSize: [20, 20],
    popupAnchor: [0, -18]
  });
}

function renderAccessChips(gym) {
  const chips = [];

  if (gym.access?.supportsSingleEntry) {
    chips.push('<span class="chip chip-strong">單次入場</span>');
  }

  if (gym.access?.supportsNoContractMonthly) {
    chips.push('<span class="chip chip-strong">不用綁約</span>');
  }

  if (gym.access?.supportsTrial) {
    chips.push('<span class="chip">可體驗</span>');
  }

  return chips.length ? chips.join("") : '<span class="chip chip-warn">彈性入場待確認</span>';
}

function renderServiceTags(gym) {
  const tags = [];

  if (gym.access?.supportsSingleEntry) tags.push("單次入場");
  if (gym.pricing?.some((price) => price.type === "hourly")) tags.push("計時收費");
  if (gym.pricing?.some((price) => price.type === "daily")) tags.push("日票");
  if (gym.access?.supportsNoContractMonthly) tags.push("不用綁約");
  if (gym.facilities?.is24Hours) tags.push("24小時");
  if (gym.facilities?.hasSquatRack) tags.push("深蹲架");
  if (gym.facilities?.hasShower) tags.push("淋浴");
  if (gym.facilities?.hasParking) tags.push("停車");

  return tags.length
    ? tags.map((tag) => `<span class="tag tag-active">${escapeHtml(tag)}</span>`).join("")
    : '<span class="tag tag-warning">入場方式需複核</span>';
}

function formatTodayHours(gym) {
  if (getGymOpenStatus(gym) === "unknown") {
    return "營業時間待查";
  }

  const today = gym.openingHours?.find((entry) => Number(entry.weekday) === new Date().getDay());

  if (!today || today.isClosed) {
    return "今日未營業";
  }

  return `${today.opensAt} - ${today.closesAt}`;
}

function renderOpenStatusChip(gym, options = {}) {
  const status = getGymOpenStatus(gym);
  const includeCurrently = options.includeCurrently === true;

  if (status === "open") {
    return `<span class="tag tag-success">${includeCurrently ? "目前營業中" : "營業中"}</span>`;
  }

  if (status === "closed") {
    return `<span class="tag">${includeCurrently ? "目前未營業" : "未營業"}</span>`;
  }

  return '<span class="tag tag-warning">營業時間待查</span>';
}

function renderSourceChip(gym) {
  const level = gym.verification?.confidenceLevel;
  const className =
    {
      verified: "tag tag-success",
      likely: "tag",
      unverified: "tag tag-warning",
      stale: "tag"
    }[level] ?? "tag tag-warning";

  return `<span class="${className}" title="${escapeAttribute(sourceHelpText(gym))}">${escapeHtml(sourceLabel(gym))}</span>`;
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

function summarizeEntryTypes(gym) {
  const labels = [];

  if (gym.access?.supportsSingleEntry) labels.push("單次入場");
  if (gym.pricing?.some((price) => price.type === "hourly")) labels.push("計時收費");
  if (gym.pricing?.some((price) => price.type === "daily")) labels.push("日票");
  if (gym.access?.supportsNoContractMonthly) labels.push("不用綁約");
  if (gym.access?.requiresReservation) labels.push("需預約");

  return labels.length ? labels.join(" / ") : "入場方式需複核";
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
    return "價格需複核";
  }

  if (price.amountTwd === null || price.amountTwd === undefined) {
    return "價格待查證";
  }

  const unit =
    {
      per_entry: "次",
      per_hour: "小時",
      per_day: "日",
      per_month: "月",
      per_minute: "分鐘"
    }[price.unit] ?? "方案";

  return `$${price.amountTwd} / ${unit}`;
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

function sourceLabel(gym) {
  const level = gym.verification?.confidenceLevel;
  const sourceName = gym.source?.sourceName ?? "";

  if (level === "verified") {
    return "官方明確";
  }

  if (sourceName.toLowerCase().includes("gymnomad")) {
    return "GymNomad";
  }

  if (level === "likely") {
    return "資料已整理";
  }

  if (level === "stale") {
    return "待更新";
  }

  return "待官方查證";
}

function sourceHelpText(gym) {
  const level = gym.verification?.confidenceLevel;
  const sourceName = gym.source?.sourceName ?? "";

  if (level === "verified") {
    return "已用官方或明確來源核對主要資訊。";
  }

  if (sourceName.toLowerCase().includes("gymnomad")) {
    return "聚合資料，正式使用前仍應以官方公告確認。";
  }

  if (level === "likely") {
    return "已有整理來源，但價格、營業時間或入場條件仍可能變動。";
  }

  if (level === "stale") {
    return "資料可能過期，需要重新查證。";
  }

  return "場館可能存在，但單次入場、價格、營業時間或條件尚未以官方來源確認。";
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

// Only allow http(s) URLs through to href attributes — blocks javascript:,
// data:, and other schemes that would otherwise become stored XSS via a link.
function safeExternalUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : "";
}
