const gymList = document.querySelector("#gymList");
const mapCanvas = document.querySelector("#mapCanvas");
const resultCount = document.querySelector("#resultCount");

if (gymList) {
  gymList.innerHTML = '<p class="empty-state">Findgym 原型啟動中。下一步會載入健身房資料與互動功能。</p>';
}

if (mapCanvas) {
  mapCanvas.innerHTML = '<p class="map-empty">地圖式探索介面準備中</p>';
}

if (resultCount) {
  resultCount.textContent = "Prototype";
}
