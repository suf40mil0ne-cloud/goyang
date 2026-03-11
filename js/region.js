import { filterByStatus, getDistrictNotices, sortForCards } from './filters.js';
import { loadNotices, loadRegions } from './notices.js';
import {
  findDistrictByRegion,
  findRegionBySido,
  getNationMeta,
  getRegionDisplayName,
  getRegionHref,
  parseRegionQuery,
} from './regions.js';
import { getPreferredNoticeActionLink } from './links.js';

function setCurrentYear() {
  document.querySelectorAll('[data-current-year]').forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
}

function buildNoticeCard(notice) {
  const actionLink = getPreferredNoticeActionLink(notice);
  return `
    <article class="notice-card notice-card-rich">
      <div class="notice-card-head">
        <div class="resource-meta">
          <span class="status-badge ${notice.statusKey}">${notice.statusBadgeText}</span>
          <span class="badge">${notice.sigungu}</span>
        </div>
        <span class="subtle-label">${notice.onlineSubmissionMeta.label}</span>
      </div>
      <h4><a href="notice.html?id=${encodeURIComponent(notice.id)}">${notice.title}</a></h4>
      <p class="notice-summary">${notice.easySummary}</p>
      <dl class="notice-facts">
        <div><dt>기관</dt><dd>${notice.organization}</dd></div>
        <div><dt>기간</dt><dd>${notice.hearingStartDateText} - ${notice.hearingEndDateText}</dd></div>
      </dl>
      <div class="button-row compact-actions">
        <a class="resource-link" href="notice.html?id=${encodeURIComponent(notice.id)}">상세보기</a>
        ${actionLink ? `<a class="resource-link" href="${actionLink.url}" target="_blank" rel="noopener noreferrer">${actionLink.label || '원문 공고'}</a>` : ''}
      </div>
    </article>
  `;
}

function buildRegionLinkCard(title, description, href, metric) {
  return `
    <a class="region-link-card" href="${href}">
      <strong>${title}</strong>
      <p>${description}</p>
      <span>${metric}</span>
    </a>
  `;
}

function renderStats(notices) {
  const stats = document.getElementById('region-stats');
  if (!stats) return;
  const active = filterByStatus(notices, 'active').length;
  const closingSoon = filterByStatus(notices, 'closing-soon').length;
  const ended = filterByStatus(notices, 'ended').length;
  const online = notices.filter((notice) => notice.onlineSubmissionMeta.available).length;

  stats.innerHTML = `
    <article class="stat-card"><h4>진행 중</h4><span class="stat-value">${active}</span><p>현재 확인해야 할 공고</p></article>
    <article class="stat-card"><h4>마감 임박</h4><span class="stat-value">${closingSoon}</span><p>지금 확인이 필요한 공고</p></article>
    <article class="stat-card"><h4>최근 종료</h4><span class="stat-value">${ended}</span><p>후속 고시 추적용</p></article>
    <article class="stat-card"><h4>온라인 제출</h4><span class="stat-value">${online}</span><p>원문 기준 별도 확인</p></article>
  `;
}

function renderBreadcrumbs(query) {
  const container = document.getElementById('region-breadcrumbs');
  if (!container) return;

  const items = [
    `<a href="index.html">홈</a>`,
    `<span>/</span>`,
    `<a href="${getRegionHref({ scope: 'nation' })}">전국</a>`,
  ];

  if (query.scope === 'sido' || query.scope === 'sigungu') {
    items.push('<span>/</span>');
    items.push(`<a href="${getRegionHref({ scope: 'sido', sido: query.sido })}">${query.sido}</a>`);
  }

  if (query.scope === 'sigungu') {
    items.push('<span>/</span>');
    items.push(`<span>${query.sigungu}</span>`);
  }

  container.innerHTML = items.join('');
}

function renderScopeLinks(query) {
  const container = document.getElementById('region-scope-links');
  if (!container) return;

  const links = [
    { label: '전국 허브', href: getRegionHref({ scope: 'nation' }), active: query.scope === 'nation' },
  ];

  if (query.sido) {
    links.push({ label: query.sido, href: getRegionHref({ scope: 'sido', sido: query.sido }), active: query.scope === 'sido' });
  }

  if (query.sido && query.sigungu) {
    links.push({ label: query.sigungu, href: getRegionHref({ scope: 'sigungu', sido: query.sido, sigungu: query.sigungu }), active: query.scope === 'sigungu' });
  }

  container.innerHTML = links
    .map((item) => `<a class="tag-button${item.active ? ' is-active' : ''}" href="${item.href}">${item.label}</a>`)
    .join('');
}

function renderGuidance(query, notices) {
  const container = document.getElementById('region-body-copy');
  if (!container) return;

  const onlineCount = notices.filter((notice) => notice.onlineSubmissionMeta.available).length;
  const label = getRegionDisplayName(query);

  container.innerHTML = `
    <article class="mini-card">
      <strong>${label}에서는 무엇을 먼저 볼까</strong>
      <p>진행 중 공고와 마감 임박 공고를 먼저 보고, 생활권과 가까운 공고를 상세에서 확인하는 방식이 가장 빠릅니다.</p>
    </article>
    <article class="mini-card">
      <strong>온라인 제출 가능 여부는 별도입니다</strong>
      <p>${label} 범위에서 현재 온라인 제출 가능으로 표시된 공고는 ${onlineCount}건입니다. 공고 열람 가능 여부와 실제 온라인 제출 가능 여부는 원문 공고에서 다시 확인해야 합니다.</p>
    </article>
    <article class="mini-card">
      <strong>공식 원문 우선</strong>
      <p>토지이음 원문과 지자체 고시공고를 1차 기준으로 보고, 관련 기사와 보도자료는 맥락 확인용으로만 활용해야 합니다.</p>
    </article>
  `;
}

export async function initRegionPage() {
  setCurrentYear();

  const query = parseRegionQuery();
  const [regions, notices] = await Promise.all([loadRegions(), loadNotices()]);
  const nationMeta = getNationMeta();
  const regionMeta = query.sido ? findRegionBySido(regions, query.sido) : null;
  const districtMeta = query.sido && query.sigungu ? findDistrictByRegion(regions, query.sido, query.sigungu) : null;

  const scopedNotices = sortForCards(
    notices.filter((notice) => {
      if (query.scope === 'sigungu') return notice.sido === query.sido && notice.sigungu === query.sigungu;
      if (query.scope === 'sido') return notice.sido === query.sido;
      return true;
    })
  );

  const title = document.getElementById('region-title');
  const summary = document.getElementById('region-summary');
  const count = document.getElementById('region-count');
  const submeta = document.getElementById('region-submeta');
  const guideCopy = document.getElementById('region-guide-copy');
  const entryTitle = document.getElementById('region-entry-title');
  const entrySummary = document.getElementById('region-entry-summary');
  const entryList = document.getElementById('region-entry-list');
  const activeTitle = document.getElementById('active-list-title');
  const activeSummary = document.getElementById('active-list-summary');
  const activeList = document.getElementById('region-active-notices');
  const endedSummary = document.getElementById('ended-list-summary');
  const endedList = document.getElementById('region-ended-notices');

  renderBreadcrumbs(query);
  renderScopeLinks(query);
  renderStats(scopedNotices);
  renderGuidance(query, scopedNotices);

  if (query.scope === 'nation') {
    document.title = '전국 지역 허브 | 주민공람 레이더';
    if (title) title.textContent = '전국 지역 허브';
    if (summary) summary.textContent = '전국 시도 기준으로 현재 진행 중인 주민공람공고와 마감 임박 공고를 빠르게 찾을 수 있습니다.';
    if (count) count.textContent = `전국 등록 공고 ${scopedNotices.length}건`;
    if (submeta) submeta.textContent = '17개 시도 · 시군구 기반 정리';
    if (guideCopy) guideCopy.textContent = '먼저 시도를 고른 뒤, 해당 시군구 허브로 들어가면 더 좁은 범위로 볼 수 있습니다.';
    if (entryTitle) entryTitle.textContent = '시도별 허브 진입';
    if (entrySummary) entrySummary.textContent = '각 시도의 현재 공고 수와 마감 임박 수를 함께 보여줍니다.';
    if (entryList) {
      entryList.innerHTML = regions.map((region) => {
        const regionNotices = notices.filter((notice) => notice.sido === region.name);
        const closingSoon = filterByStatus(regionNotices, 'closing-soon').length;
        return buildRegionLinkCard(
          region.name,
          region.description,
          getRegionHref({ scope: 'sido', sido: region.name }),
          `공고 ${regionNotices.length}건 · 마감 임박 ${closingSoon}건`
        );
      }).join('');
    }
  } else if (query.scope === 'sido' && regionMeta) {
    document.title = `${regionMeta.name} 지역 허브 | 주민공람 레이더`;
    if (title) title.textContent = `${regionMeta.name} 지역 허브`;
    if (summary) summary.textContent = `${regionMeta.name} 시군구 기준으로 진행 중 공고를 정리합니다. 먼저 시군구를 고르면 내 지역 공고만 더 좁혀서 볼 수 있습니다.`;
    if (count) count.textContent = `${regionMeta.name} 등록 공고 ${scopedNotices.length}건`;
    if (submeta) submeta.textContent = `${regionMeta.districts.length}개 시군구 연결`;
    if (guideCopy) guideCopy.textContent = `${regionMeta.name}에서는 시군구 단위로 생활권이 다르므로 내 지역 허브로 한 단계 더 들어가는 것이 좋습니다.`;
    if (entryTitle) entryTitle.textContent = '시군구 허브 진입';
    if (entrySummary) entrySummary.textContent = `${regionMeta.name} 안에서 현재 연결된 시군구 허브를 보여줍니다.`;
    if (entryList) {
      entryList.innerHTML = regionMeta.districts.map((district) => {
        const districtNotices = getDistrictNotices(notices, { sido: regionMeta.name, sigungu: district.sigungu }, 'all');
        return buildRegionLinkCard(
          district.sigungu,
          `${district.sigungu} 기준 진행 중 공고와 최근 종료 공고를 볼 수 있습니다.`,
          getRegionHref({ scope: 'sigungu', sido: regionMeta.name, sigungu: district.sigungu }),
          `공고 ${districtNotices.length}건`
        );
      }).join('');
    }
  } else if (query.scope === 'sigungu' && districtMeta) {
    document.title = `${districtMeta.fullName} 공고 허브 | 주민공람 레이더`;
    if (title) title.textContent = `${districtMeta.fullName} 공고 허브`;
    if (summary) summary.textContent = `${districtMeta.fullName} 기준으로 진행 중 공고와 최근 종료 공고를 한눈에 정리합니다.`;
    if (count) count.textContent = `${districtMeta.fullName} 등록 공고 ${scopedNotices.length}건`;
    if (submeta) submeta.textContent = `행정코드 ${districtMeta.adminCode || '미기재'}`;
    if (guideCopy) guideCopy.textContent = '마감 임박 공고와 온라인 제출 가능 여부를 먼저 확인한 뒤, 상세 페이지에서 원문과 제출처를 다시 보세요.';
    if (entryTitle) entryTitle.textContent = '관련 이동';
    if (entrySummary) entrySummary.textContent = '시도 허브와 지도 보기로 바로 이동할 수 있습니다.';
    if (entryList) {
      entryList.innerHTML = [
        buildRegionLinkCard(districtMeta.sido, `${districtMeta.sido} 전체 허브로 돌아갑니다.`, getRegionHref({ scope: 'sido', sido: districtMeta.sido }), '시도 전체 보기'),
        buildRegionLinkCard('지도 보기', `${districtMeta.fullName} 주변 공고를 NGII 지도에서 보조적으로 확인합니다.`, 'map.html', '지도 페이지 이동'),
      ].join('');
    }
  }

  if (activeTitle) activeTitle.textContent = `${getRegionDisplayName(query)} 진행 중 공고`;
  if (activeSummary) activeSummary.textContent = `${getRegionDisplayName(query)}에서 진행 중 또는 마감 임박 공고를 최대 8건까지 먼저 보여줍니다.`;
  if (activeList) {
    const activeNotices = filterByStatus(scopedNotices, 'active').slice(0, 8);
    activeList.innerHTML = activeNotices.length
      ? activeNotices.map(buildNoticeCard).join('')
      : '<div class="empty-state">현재 이 범위에서 확인된 진행 중 주민공람공고가 없습니다.</div>';
  }

  if (endedSummary) endedSummary.textContent = `${getRegionDisplayName(query)} 범위의 최근 종료 공고입니다.`;
  if (endedList) {
    const endedNotices = filterByStatus(scopedNotices, 'ended').slice(0, 6);
    endedList.innerHTML = endedNotices.length
      ? endedNotices.map(buildNoticeCard).join('')
      : '<div class="empty-state">최근 종료 공고가 아직 없습니다.</div>';
  }
}
