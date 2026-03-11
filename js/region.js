import { filterByStatus } from './filters.js';
import { createNoticeMap } from './map.js';
import { loadNotices, loadRegions } from './notices.js';

function setCurrentYear() {
  document.querySelectorAll('[data-current-year]').forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
}

function getAreaParam() {
  return new URLSearchParams(window.location.search).get('area') || 'seoul';
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
      <div class="button-row compact-actions">
        <a class="resource-link" href="notice.html?id=${encodeURIComponent(notice.id)}">상세 보기</a>
        <a class="resource-link" href="timeline.html?key=${encodeURIComponent(notice.timelineKey)}">후속 추적</a>
      </div>
    </article>
  `;
}

export async function initRegionPage() {
  setCurrentYear();
  const area = getAreaParam();
  const [regions, notices] = await Promise.all([loadRegions(), loadNotices()]);
  const region = regions.find((item) => item.area === area) || regions[0];
  const areaNotices = notices.filter((notice) => notice.areaKey === region.area);

  document.title = `${region.name} 지역 허브 | 주민공람 레이더`;
  const heading = document.getElementById('region-title');
  const summary = document.getElementById('region-summary');
  const count = document.getElementById('region-count');
  const list = document.getElementById('region-notices');
  const stats = document.getElementById('region-stats');
  const tabs = document.getElementById('region-links');
  const regionFaq = document.getElementById('region-faq');
  const regionTypes = document.getElementById('region-types');

  if (heading) heading.textContent = `${region.name} 지역 허브`;
  if (summary) summary.textContent = region.description;
  if (count) count.textContent = `현재 등록 공고 ${areaNotices.length}건`;

  if (stats) {
    const active = filterByStatus(areaNotices, 'active').length;
    const closingSoon = filterByStatus(areaNotices, 'closing-soon').length;
    const ended = filterByStatus(areaNotices, 'ended').length;
    stats.innerHTML = `
      <article class="stat-card"><h4>진행 중</h4><span class="stat-value">${active}</span><p>${region.focus}</p></article>
      <article class="stat-card"><h4>마감 임박</h4><span class="stat-value">${closingSoon}</span><p>지금 확인이 필요한 공고</p></article>
      <article class="stat-card"><h4>종료 공고</h4><span class="stat-value">${ended}</span><p>후속 결정고시 추적용</p></article>
    `;
  }

  if (tabs) {
    tabs.innerHTML = regions.map((item) => `<a class="tab-link" href="region.html?area=${item.area}" ${item.area === region.area ? 'aria-current="page"' : ''}>${item.shortName}</a>`).join('');
  }

  if (regionFaq) {
    regionFaq.innerHTML = `
      <article class="faq-item"><h4>이 지역에서 먼저 볼 것은?</h4><p>마감 임박 공고와 생활권 가까운 공고를 먼저 확인하세요.</p></article>
      <article class="faq-item"><h4>자주 나오는 유형은?</h4><p>${region.focus} 성격의 공고가 반복해서 나타납니다.</p></article>
      <article class="faq-item"><h4>무엇을 원문에서 다시 봐야 하나요?</h4><p>제출처, 마감 시각, 첨부도서, 위치 경계는 원문 기준 최종 확인이 필요합니다.</p></article>
    `;
  }

  if (regionTypes) {
    const byType = new Map();
    areaNotices.forEach((notice) => byType.set(notice.projectType, (byType.get(notice.projectType) || 0) + 1));
    regionTypes.innerHTML = [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([type, total]) => `<article class="summary-card"><h4>${type}</h4><p>${region.name}에서 ${total}건이 연결돼 있습니다.</p></article>`)
      .join('');
  }

  if (list) list.innerHTML = areaNotices.map(buildCard).join('');

  await createNoticeMap({
    elementId: 'region-map',
    notices: areaNotices,
    center: region.center,
    zoom: region.defaultZoom,
  });
}
