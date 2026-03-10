import { filterByStatus } from "./filters.js";
import { createNoticeMap } from "./map.js";
import { loadNotices, loadRegions } from "./notices.js";

function setCurrentYear() {
  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
}

function getAreaParam() {
  return new URLSearchParams(window.location.search).get("area") || "seoul";
}

function buildCard(notice) {
  return `
    <article class="notice-card">
      <div class="resource-meta">
        <span class="status-badge ${notice.statusKey}">${notice.statusLabel}</span>
        <span class="badge">${notice.projectType}</span>
      </div>
      <h4><a href="notice.html?id=${encodeURIComponent(notice.id)}">${notice.title}</a></h4>
      <p>${notice.shortSummary}</p>
      <ul class="notice-meta-list">
        <li>${notice.sigungu} ${notice.legalDong}</li>
        <li>공고일 ${notice.postedDate}</li>
        <li>마감일 ${notice.hearingEndDate}</li>
      </ul>
      <a class="resource-link" href="notice.html?id=${encodeURIComponent(notice.id)}">상세 보기</a>
    </article>
  `;
}

export async function initRegionPage() {
  setCurrentYear();
  const area = getAreaParam();
  const [regions, notices] = await Promise.all([loadRegions(), loadNotices()]);
  const region = regions.find((item) => item.area === area) || regions[0];
  const areaNotices = notices.filter((notice) => notice.areaKey === region.area);

  document.title = `${region.name} 주민공람공고 | 주민공람 레이더`;
  const heading = document.getElementById("region-title");
  const summary = document.getElementById("region-summary");
  const count = document.getElementById("region-count");
  const list = document.getElementById("region-notices");
  const stats = document.getElementById("region-stats");
  const tabs = document.getElementById("region-links");

  if (heading) heading.textContent = `${region.name} 주민공람공고 보기`;
  if (summary) summary.textContent = region.description;
  if (count) count.textContent = `현재 등록 공고 ${areaNotices.length}건`;
  if (stats) {
    const active = filterByStatus(areaNotices, "active").length;
    const closingSoon = filterByStatus(areaNotices, "closing-soon").length;
    const ended = filterByStatus(areaNotices, "ended").length;
    stats.innerHTML = `
      <article class="stat-card"><h4>진행 중</h4><span class="stat-value">${active}</span><p>${region.focus}</p></article>
      <article class="stat-card"><h4>마감 임박</h4><span class="stat-value">${closingSoon}</span><p>먼저 검토할 공고</p></article>
      <article class="stat-card"><h4>종료 공고</h4><span class="stat-value">${ended}</span><p>후속 결정 공고 추적용</p></article>
    `;
  }
  if (list) list.innerHTML = areaNotices.map(buildCard).join("");
  if (tabs) {
    tabs.innerHTML = regions
      .map(
        (item) => `<a class="tab-link" href="region.html?area=${item.area}" ${item.area === region.area ? 'aria-current="page"' : ""}>${item.shortName}</a>`
      )
      .join("");
  }

  createNoticeMap({
    elementId: "region-map",
    notices: areaNotices,
    center: region.center,
    zoom: region.defaultZoom,
  });
}
