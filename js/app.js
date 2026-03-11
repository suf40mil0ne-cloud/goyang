import { getDistrictNotices, haversineKm, normalizeRegionText } from './filters.js';
import { buildDistrictIndex, findDistrictByName, getCurrentPosition, reverseGeocodeDistrict } from './location.js';
import { loadNotices, loadRegions } from './notices.js';
import { loadPreferredRegion, savePreferredRegion } from './storage.js';

const INITIAL_VISIBLE_COUNT = 5;

const state = {
  notices: [],
  regions: [],
  districts: [],
  selectedRegion: null,
  selectedLegalDong: '',
  visibleCount: INITIAL_VISIBLE_COUNT,
};

function setCurrentYear() {
  document.querySelectorAll('[data-current-year]').forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
}

function setUpdatedTime() {
  const element = document.getElementById('updated-at');
  if (!element || !state.notices.length) return;
  const latestNotice = [...state.notices].sort((a, b) => new Date(b.lastVerifiedAt) - new Date(a.lastVerifiedAt))[0];
  element.textContent = `마지막 확인: ${latestNotice.lastVerifiedAtText}`;
}

function getRegionLabel(region) {
  return region ? `${region.sido} ${region.sigungu}` : '선택된 지역 없음';
}

function setLocationFeedback({
  helper,
  status,
  resolution,
  selectedLabel,
}) {
  const helperElement = document.getElementById('location-helper');
  const statusElement = document.getElementById('current-region-status');
  const resolutionElement = document.getElementById('location-resolution');
  const selectedElement = document.getElementById('selected-region-label');

  if (helperElement) helperElement.textContent = helper;
  if (statusElement) statusElement.textContent = status;
  if (resolutionElement) resolutionElement.textContent = resolution;
  if (selectedElement) selectedElement.textContent = selectedLabel;
}

function populateSidoOptions() {
  const select = document.getElementById('sido-select');
  if (!select) return;

  select.innerHTML = state.regions
    .map((region) => `<option value="${region.name}">${region.name}</option>`)
    .join('');
}

function populateSigunguOptions(sido) {
  const select = document.getElementById('sigungu-select');
  if (!select) return;

  const region = state.regions.find((item) => item.name === sido) || state.regions[0];
  const options = (region?.districts || []).map((district) => district.sigungu);

  select.innerHTML = options.length
    ? options.map((sigungu) => `<option value="${sigungu}">${sigungu}</option>`).join('')
    : '<option value="">선택 가능한 지역이 없습니다.</option>';
}

function syncSelectorWithRegion(region) {
  const sidoSelect = document.getElementById('sido-select');
  const sigunguSelect = document.getElementById('sigungu-select');
  if (!sidoSelect || !sigunguSelect || !region) return;

  sidoSelect.value = region.sido;
  populateSigunguOptions(region.sido);
  sigunguSelect.value = region.sigungu;
}

function buildNoticeCard(notice) {
  const officialLabel = notice.hearingType === '인터넷 주민의견청취' ? '공식 제출처' : '원문 공고';
  const signalMarkup = (notice.signalBadges || [])
    .slice(0, 4)
    .map((badge) => `<span class="signal-badge ${badge.tone}">${badge.label}</span>`)
    .join('');

  return `
    <article class="notice-card notice-card-rich">
      <div class="notice-card-head">
        <div class="resource-meta">
          <span class="status-badge ${notice.statusKey}">${notice.statusBadgeText}</span>
          <span class="badge">${notice.sigungu}</span>
        </div>
        <span class="subtle-label">${notice.matchingConfidenceMeta.label}</span>
      </div>
      ${signalMarkup ? `<div class="signal-row">${signalMarkup}</div>` : ''}
      <h4><a href="notice.html?id=${encodeURIComponent(notice.id)}">${notice.title}</a></h4>
      <p class="notice-summary">${notice.easySummary}</p>
      <dl class="notice-facts">
        <div><dt>지역</dt><dd>${notice.sido} ${notice.sigungu} ${notice.legalDong}</dd></div>
        <div><dt>공고기관</dt><dd>${notice.organization}</dd></div>
        <div><dt>열람기간</dt><dd>${notice.hearingStartDateText} - ${notice.hearingEndDateText}</dd></div>
        <div><dt>의견 제출</dt><dd>${notice.submissionMethod}</dd></div>
      </dl>
      <div class="notice-card-footer button-row compact-actions">
        <a class="resource-link" href="notice.html?id=${encodeURIComponent(notice.id)}">상세보기</a>
        <a class="resource-link" href="${notice.sourceUrl}" target="_blank" rel="noopener noreferrer">${officialLabel}</a>
      </div>
    </article>
  `;
}

function renderSecondaryResults(title, summary, items, emptyText) {
  const section = document.getElementById('secondary-results');
  const titleElement = document.getElementById('secondary-results-title');
  const summaryElement = document.getElementById('secondary-results-summary');
  const listElement = document.getElementById('secondary-results-list');

  if (!section || !titleElement || !summaryElement || !listElement) return;

  titleElement.textContent = title;
  summaryElement.textContent = summary;
  listElement.innerHTML = items.length
    ? items.map(buildNoticeCard).join('')
    : `<div class="empty-state">${emptyText}</div>`;
  section.hidden = false;
}

function hideSecondaryResults() {
  const section = document.getElementById('secondary-results');
  if (section) section.hidden = true;
}

function getCurrentRegionNotices(filterKey = 'active') {
  if (!state.selectedRegion) return [];
  return getDistrictNotices(state.notices, state.selectedRegion, filterKey);
}

function getAdjacentRegionNotices() {
  if (!state.selectedRegion) return [];

  const current = state.districts.find((district) =>
    normalizeRegionText(district.sido) === normalizeRegionText(state.selectedRegion.sido) &&
    normalizeRegionText(district.sigungu) === normalizeRegionText(state.selectedRegion.sigungu)
  );

  const nearbyDistricts = state.districts
    .filter((district) =>
      normalizeRegionText(district.sido) === normalizeRegionText(state.selectedRegion.sido) &&
      normalizeRegionText(district.sigungu) !== normalizeRegionText(state.selectedRegion.sigungu)
    )
    .map((district) => ({
      ...district,
      distanceKm: current?.center && district.center ? haversineKm(current.center, district.center) : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm || a.sigungu.localeCompare(b.sigungu, 'ko'));

  return nearbyDistricts
    .flatMap((district) => getDistrictNotices(state.notices, district, 'active').slice(0, 2))
    .slice(0, 6);
}

function renderEmptyState(region) {
  return `
    <div class="empty-state">
      <p>현재 ${region.sigungu}에서 확인된 진행 중 주민공람공고가 없습니다.</p>
      <div class="button-row compact-actions">
        <button class="ghost-button" type="button" data-empty-action="nearby">인접 지역 보기</button>
        <button class="ghost-button" type="button" data-empty-action="ended">최근 종료 공고 보기</button>
        <button class="ghost-button" type="button" data-empty-action="picker">다른 지역 선택</button>
      </div>
    </div>
  `;
}

function renderNoticeList() {
  const container = document.getElementById('notice-list');
  const summary = document.getElementById('notice-section-summary');
  const actions = document.getElementById('notice-list-actions');
  if (!container || !summary || !actions) return;

  hideSecondaryResults();

  if (!state.selectedRegion) {
    summary.textContent = '현재 위치를 확인하거나 지역을 직접 선택하면 해당 자치구의 진행 중 공고를 보여줍니다.';
    container.innerHTML = '<div class="loading-state">위치 확인 또는 지역 선택 후 내 지역 공고를 확인하세요.</div>';
    actions.hidden = true;
    return;
  }

  const notices = getCurrentRegionNotices('active');
  const visible = notices.slice(0, state.visibleCount);
  const regionLabel = getRegionLabel(state.selectedRegion);

  if (!notices.length) {
    summary.textContent = `${regionLabel} 기준으로 현재 진행 중 공고를 찾지 못했습니다.`;
    container.innerHTML = renderEmptyState(state.selectedRegion);
    actions.hidden = true;
    return;
  }

  summary.textContent = `${regionLabel}에서 진행 중 또는 마감 임박 공고 ${notices.length}건을 확인했습니다.`;
  container.innerHTML = visible.map(buildNoticeCard).join('');
  actions.hidden = notices.length <= state.visibleCount;
}

function showRegionPicker(forceOpen = true) {
  const panel = document.getElementById('region-picker');
  const button = document.getElementById('toggle-region-picker');
  if (!panel || !button) return;

  const nextState = forceOpen ? false : !panel.hidden;
  panel.hidden = nextState;
  button.setAttribute('aria-expanded', String(!nextState));
}

function applyRegion(region, sourceLabel, legalDong = '') {
  state.selectedRegion = {
    sido: region.sido,
    sigungu: region.sigungu,
    fullName: region.fullName || `${region.sido} ${region.sigungu}`,
  };
  state.selectedLegalDong = legalDong;
  state.visibleCount = INITIAL_VISIBLE_COUNT;

  savePreferredRegion(state.selectedRegion);
  syncSelectorWithRegion(state.selectedRegion);
  renderNoticeList();

  const helper = sourceLabel.includes('GPS')
    ? (legalDong
      ? `현재 위치: ${state.selectedRegion.sido} ${state.selectedRegion.sigungu} ${legalDong}`
      : `현재 위치: ${state.selectedRegion.sido} ${state.selectedRegion.sigungu}`)
    : `선택 지역: ${state.selectedRegion.sido} ${state.selectedRegion.sigungu}`;

  setLocationFeedback({
    helper,
    status: `${state.selectedRegion.sigungu} 진행 중 공고를 먼저 보여줍니다.`,
    resolution: sourceLabel,
    selectedLabel: `선택 지역: ${getRegionLabel(state.selectedRegion)}`,
  });
}

async function handleDetectLocation() {
  setLocationFeedback({
    helper: '현재 위치를 확인하는 중입니다.',
    status: '브라우저 위치 권한을 허용하면 해당 자치구를 식별합니다.',
    resolution: 'GPS 확인 중',
    selectedLabel: state.selectedRegion ? `선택 지역: ${getRegionLabel(state.selectedRegion)}` : '선택된 지역 없음',
  });

  try {
    const position = await getCurrentPosition();
    const coords = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
    const matched = await reverseGeocodeDistrict(coords, state.districts);

    if (!matched?.region) {
      throw new Error('지역을 식별하지 못했습니다.');
    }

    const sourceLabel = matched.matchSource === 'nearest-district'
      ? 'GPS -> 가까운 행정구역으로 추정'
      : 'GPS -> 행정구역 변환 완료';

    applyRegion(matched.region, sourceLabel, matched.legalDong || '');
  } catch (error) {
    setLocationFeedback({
      helper: '현재 위치를 확인하지 못했습니다. 지역을 직접 선택해주세요.',
      status: '브라우저 위치 권한 또는 네트워크 상태를 확인한 뒤 다시 시도할 수 있습니다.',
      resolution: '위치 확인 실패',
      selectedLabel: state.selectedRegion ? `선택 지역: ${getRegionLabel(state.selectedRegion)}` : '선택된 지역 없음',
    });
    showRegionPicker(true);
  }
}

function bindHeroActions() {
  const detectButton = document.getElementById('detect-location');
  const toggleButton = document.getElementById('toggle-region-picker');
  const loadMoreButton = document.getElementById('load-more-notices');
  const savedButton = document.getElementById('use-saved-region');

  detectButton?.addEventListener('click', handleDetectLocation);

  toggleButton?.addEventListener('click', () => {
    showRegionPicker(false);
  });

  loadMoreButton?.addEventListener('click', () => {
    state.visibleCount += INITIAL_VISIBLE_COUNT;
    renderNoticeList();
  });

  savedButton?.addEventListener('click', () => {
    const saved = loadPreferredRegion();
    if (!saved) {
      setLocationFeedback({
        helper: '최근 본 지역이 아직 없습니다.',
        status: '현재 위치 확인 또는 지역 선택 후 다음부터 바로 다시 볼 수 있습니다.',
        resolution: '최근 지역 없음',
        selectedLabel: state.selectedRegion ? `선택 지역: ${getRegionLabel(state.selectedRegion)}` : '선택된 지역 없음',
      });
      return;
    }

    applyRegion(saved, '최근 본 지역 불러오기');
  });
}

function bindRegionForm() {
  const form = document.getElementById('region-form');
  const sidoSelect = document.getElementById('sido-select');
  const noticeList = document.getElementById('notice-list');

  sidoSelect?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    populateSigunguOptions(target.value);
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const sido = String(formData.get('sido') || '');
    const sigungu = String(formData.get('sigungu') || '');
    const matched = findDistrictByName(state.districts, sido, sigungu) || {
      sido,
      sigungu,
      fullName: `${sido} ${sigungu}`,
    };

    applyRegion(matched, '직접 선택한 지역');
  });

  noticeList?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const action = target.getAttribute('data-empty-action');
    if (!action || !state.selectedRegion) return;

    if (action === 'picker') {
      showRegionPicker(true);
      return;
    }

    if (action === 'ended') {
      const ended = getCurrentRegionNotices('ended').slice(0, 5);
      renderSecondaryResults(
        '최근 종료 공고',
        `${getRegionLabel(state.selectedRegion)}의 최근 종료 공고입니다.`,
        ended,
        '표시할 종료 공고가 없습니다.'
      );
      return;
    }

    if (action === 'nearby') {
      const nearby = getAdjacentRegionNotices();
      renderSecondaryResults(
        '인접 지역 진행 중 공고',
        `${state.selectedRegion.sido} 안에서 가까운 다른 자치구 공고를 보여줍니다.`,
        nearby,
        '표시할 인접 지역 공고가 없습니다.'
      );
    }
  });
}

export async function initHomePage() {
  setCurrentYear();
  const [notices, regions] = await Promise.all([loadNotices(), loadRegions()]);

  state.notices = notices;
  state.regions = regions;
  state.districts = buildDistrictIndex(regions, notices);

  setUpdatedTime();
  populateSidoOptions();
  populateSigunguOptions(regions[0]?.name || '');
  bindHeroActions();
  bindRegionForm();
  renderNoticeList();

  const saved = loadPreferredRegion();
  if (saved) {
    applyRegion(saved, '최근 본 지역 불러오기');
  }
}
