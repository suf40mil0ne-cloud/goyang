import { createNoticeMap } from "./map.js";
import { filterByStatus } from "./filters.js";
import { loadNotices, loadRegions } from "./notices.js";

function setCurrentYear() {
  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
}

function buildRow(notice) {
  return `
    <article class="mini-card">
      <strong>${notice.title}</strong>
      <p>${notice.sido} ${notice.sigungu} ${notice.legalDong} · ${notice.statusLabel}</p>
      <a class="text-link" href="notice.html?id=${encodeURIComponent(notice.id)}">상세 보기</a>
    </article>
  `;
}

export async function initMapPage() {
  setCurrentYear();
  const [notices, regions] = await Promise.all([loadNotices(), loadRegions()]);
  const areaSelect = document.getElementById("map-area");
  const statusSelect = document.getElementById("map-status");
  const list = document.getElementById("map-notice-list");
  const areaMap = Object.fromEntries(regions.map((region) => [region.area, region]));

  function render() {
    const area = areaSelect?.value || "all";
    const status = statusSelect?.value || "active";
    const scoped = area === "all" ? notices : notices.filter((notice) => notice.areaKey === area);
    const filtered = filterByStatus(scoped, status);
    const region = areaMap[area] || { center: { lat: 37.5665, lng: 126.978 }, defaultZoom: 10 };
    if (list) {
      list.innerHTML = filtered.length ? filtered.map(buildRow).join("") : '<div class="empty-state">선택한 조건의 공고가 없습니다.</div>';
    }
    createNoticeMap({
      elementId: "overview-map",
      notices: filtered,
      center: region.center,
      zoom: area === "all" ? 9 : region.defaultZoom,
    });
  }

  areaSelect?.addEventListener("change", render);
  statusSelect?.addEventListener("change", render);
  render();
}
