import { filterByStatus, getDistrictNotices, sortForCards } from './filters.js';
import { buildDistrictIndex, findDistrictByName, getCurrentPosition, reverseGeocodeDistrict } from './location.js';
import { createNoticeMap } from './map.js';
import { loadNotices, loadRegions } from './notices.js';
import { getNationMeta } from './regions.js';
import { loadPreferredRegion, savePreferredRegion } from './storage.js';
import { getPreferredNoticeActionLink } from './links.js';

function setCurrentYear() {
  document.querySelectorAll('[data-current-year]').forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
}

function buildRow(notice) {
  const actionLink = getPreferredNoticeActionLink(notice);
  return `
    <article class="mini-card">
      <strong>${notice.title}</strong>
      <p>${notice.sido} ${notice.sigungu} ${notice.legalDong || ''} · ${notice.statusLabel}</p>
      <p>${notice.easySummary}</p>
      <p>${notice.onlineSubmissionMeta.label}</p>
      <div class="button-row compact-actions">
        <a class="text-link" href="notice.html?id=${encodeURIComponent(notice.id)}">상세 보기</a>
        ${actionLink ? `<a class="text-link" href="${actionLink.url}" target="_blank" rel="noopener noreferrer">${actionLink.label}</a>` : ''}
      </div>
    </article>
  `;
}

function renderMapFallback(message, detail = '') {
  const element = document.getElementById('overview-map');
  if (!element) return;
  const previewNote = window.self !== window.top
    ? '<p class="small-note">Firebase Studio 미리보기에서는 외부 지도 스크립트가 차단될 수 있습니다. 새 탭에서 다시 확인해 보세요.</p>'
    : '';
  const detailMarkup = detail ? `<p class="small-note">${detail}</p>` : '';
  element.innerHTML = `<div class="error-state map-error-state"><p>${message}</p>${detailMarkup}${previewNote}</div>`;
}

export async function initMapPage() {
  setCurrentYear();
  const [notices, regions] = await Promise.all([loadNotices(), loadRegions()]);
  const districts = buildDistrictIndex(regions, notices);
  const nationMeta = getNationMeta();
  const areaSelect = document.getElementById('map-area');
  const districtSelect = document.getElementById('map-district');
  const statusSelect = document.getElementById('map-status');
  const hybridToggle = document.getElementById('map-hybrid');
  const detectButton = document.getElementById('map-detect-location');
  const applyExtentButton = document.getElementById('map-apply-extent');
  const resetRegionButton = document.getElementById('map-reset-region');
  const modeLabel = document.getElementById('map-mode-label');
  const modeSummary = document.getElementById('map-mode-summary');
  const helper = document.getElementById('map-location-helper');
  const list = document.getElementById('map-notice-list');
  const summary = document.getElementById('map-results-summary');
  const state = {
    selectedArea: 'all',
    selectedDistrict: '',
    currentPosition: null,
    listMode: 'region',
    baseScoped: [],
    currentExtent: null,
    appliedExtent: null,
    extentDirty: false,
    mapProjection: '',
    mapReady: false,
  };

  if (areaSelect) {
    areaSelect.innerHTML = [
      '<option value="all">전국 전체</option>',
      ...regions.map((region) => `<option value="${region.area}">${region.name}</option>`),
    ].join('');
  }

  function populateDistricts(area, selectedDistrict = '') {
    if (!districtSelect) return;
    const scopedDistricts = area === 'all'
      ? districts
      : districts.filter((district) => district.area === area);

    districtSelect.innerHTML = [
      '<option value="">전체 시군구</option>',
      ...scopedDistricts.map((district) => `<option value="${district.fullName}">${district.fullName}</option>`),
    ].join('');
    districtSelect.value = selectedDistrict;
  }

  function getBaseScopedNotices() {
    const area = areaSelect?.value || 'all';
    const status = statusSelect?.value || 'active';
    const districtValue = districtSelect?.value || '';
    const selectedDistrict = districtValue
      ? districts.find((district) => district.fullName === districtValue) || null
      : null;
    const region = regions.find((item) => item.area === area) || nationMeta;
    const scoped = selectedDistrict
      ? getDistrictNotices(notices, selectedDistrict, status)
      : sortForCards(filterByStatus(area === 'all' ? notices : notices.filter((notice) => notice.sido === region.name), status));
    return { area, selectedDistrict, region, scoped };
  }

  function getNoticesInMapExtent() {
    if (!state.appliedExtent || !window.ol?.extent?.containsCoordinate || !state.mapProjection) return [];
    return sortForCards(
      state.baseScoped.filter((notice) => {
        if (!Number.isFinite(notice.latitude) || !Number.isFinite(notice.longitude)) return false;
        const point = window.ol.proj.transform([notice.longitude, notice.latitude], 'EPSG:4326', state.mapProjection);
        return window.ol.extent.containsCoordinate(state.appliedExtent, point);
      })
    );
  }

  function updateListUi(selectedDistrict, region, scoped) {
    const isExtentMode = state.listMode === 'map-extent';
    const visibleNotices = isExtentMode ? getNoticesInMapExtent() : scoped;

    if (modeLabel) modeLabel.textContent = isExtentMode ? '지도 범위 기준' : '내 지역 기준';
    if (modeSummary) {
      modeSummary.textContent = isExtentMode
        ? state.extentDirty
          ? '지도를 다시 움직였습니다. 현재 화면을 기준으로 다시 보려면 범위 적용 버튼을 한 번 더 눌러 주세요.'
          : '현재 화면에 보이는 지도 범위 안의 공고만 리스트에 표시합니다.'
        : '선택한 시도 또는 시군구 기준으로 공고 리스트를 보여줍니다.';
    }

    if (summary) {
      summary.textContent = isExtentMode
        ? `현재 지도 범위 공고 ${visibleNotices.length}건`
        : selectedDistrict
          ? `${selectedDistrict.fullName} 기준 공고 ${visibleNotices.length}건`
          : region.area === 'all'
            ? `전국 공고 ${visibleNotices.length}건`
            : `${region.name} 공고 ${visibleNotices.length}건`;
    }

    if (list) {
      list.innerHTML = visibleNotices.length
        ? visibleNotices.slice(0, 12).map(buildRow).join('')
        : isExtentMode
          ? '<div class="empty-state">현재 지도 범위에서 확인된 공고가 없습니다. 지도를 이동하거나 내 지역 기준으로 돌아가세요.</div>'
          : '<div class="empty-state">선택한 조건의 공고가 없습니다.</div>';
    }

    if (applyExtentButton) applyExtentButton.disabled = !state.mapReady || !state.currentExtent;
    if (resetRegionButton) resetRegionButton.disabled = state.listMode === 'region';
  }

  async function render() {
    const { area, selectedDistrict, region, scoped } = getBaseScopedNotices();
    state.baseScoped = scoped;
    const center = state.currentPosition || selectedDistrict?.center || region.center;
    const zoom = selectedDistrict ? 12 : area === 'all' ? nationMeta.defaultZoom : region.defaultZoom;
    updateListUi(selectedDistrict, region, scoped);

    try {
      const mapHandle = await createNoticeMap({
        elementId: 'overview-map',
        notices: scoped,
        center,
        zoom,
        currentPosition: state.currentPosition,
        hybrid: Boolean(hybridToggle?.checked),
      });
      state.mapReady = Boolean(mapHandle?.supportsExtent);
      if (mapHandle?.baseReady && helper && !mapHandle.supportsExtent) {
        helper.textContent = '기본 지도는 표시되지만, 현재 환경에서는 지도 범위 기반 보기와 핀 표시가 제한될 수 있습니다.';
      }
      if (mapHandle?.supportsExtent) {
        state.mapProjection = mapHandle.getProjection() || 'EPSG:5179';
        state.currentExtent = mapHandle.getCurrentExtent();
        if (state.listMode === 'map-extent') {
          state.appliedExtent = state.currentExtent;
          state.extentDirty = false;
        }
        let ignoreInitialMove = true;
        mapHandle.on('moveend', () => {
          state.currentExtent = mapHandle.getCurrentExtent();
          if (ignoreInitialMove) {
            ignoreInitialMove = false;
            updateListUi(selectedDistrict, region, scoped);
            return;
          }
          state.extentDirty = true;
          updateListUi(selectedDistrict, region, scoped);
        });
      } else {
        state.mapProjection = '';
        state.currentExtent = null;
        state.appliedExtent = null;
        state.extentDirty = false;
      }
      updateListUi(selectedDistrict, region, scoped);
    } catch (error) {
      console.error('[map-page] Failed to render map.', error);
      const isPreview = window.self !== window.top;
      const detail = isPreview
        ? '미리보기 iframe에서 NGII 외부 스크립트가 차단되면 지도가 비어 보일 수 있습니다.'
        : 'NGII 스크립트 또는 OpenLayers 초기화에 실패했습니다.';
      renderMapFallback('지도를 불러오지 못했습니다. 잠시 후 다시 시도하거나 새로고침해 주세요.', detail);
      if (helper) helper.textContent = '지도 로딩에 실패했습니다. 기본 리스트는 계속 볼 수 있습니다.';
      state.listMode = 'region';
      state.mapReady = false;
      state.currentExtent = null;
      state.appliedExtent = null;
      state.extentDirty = false;
      updateListUi(selectedDistrict, region, scoped);
    }
  }

  areaSelect?.addEventListener('change', async () => {
    state.selectedArea = areaSelect.value;
    state.selectedDistrict = '';
    state.listMode = 'region';
    populateDistricts(state.selectedArea);
    await render();
  });

  districtSelect?.addEventListener('change', async () => {
    state.selectedDistrict = districtSelect.value;
    state.listMode = 'region';
    await render();
  });

  statusSelect?.addEventListener('change', () => {
    state.listMode = 'region';
    render();
  });
  hybridToggle?.addEventListener('change', render);

  applyExtentButton?.addEventListener('click', () => {
    if (!state.mapReady || !state.currentExtent) return;
    state.listMode = 'map-extent';
    state.appliedExtent = state.currentExtent;
    state.extentDirty = false;
    const { selectedDistrict, region, scoped } = getBaseScopedNotices();
    state.baseScoped = scoped;
    updateListUi(selectedDistrict, region, scoped);
  });

  resetRegionButton?.addEventListener('click', () => {
    state.listMode = 'region';
    state.appliedExtent = null;
    state.extentDirty = false;
    const { selectedDistrict, region, scoped } = getBaseScopedNotices();
    state.baseScoped = scoped;
    updateListUi(selectedDistrict, region, scoped);
  });

  detectButton?.addEventListener('click', async () => {
    if (helper) helper.textContent = '현재 위치를 확인하는 중입니다.';
    try {
      const position = await getCurrentPosition();
      state.currentPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      const matched = await reverseGeocodeDistrict(state.currentPosition, districts);
      if (matched?.region) {
        const matchedArea = matched.region.area || regions.find((region) => region.name === matched.region.sido)?.area || 'all';
        state.selectedArea = matchedArea;
        state.selectedDistrict = matched.region.fullName || `${matched.region.sido} ${matched.region.sigungu}`;
        if (areaSelect) areaSelect.value = state.selectedArea;
        populateDistricts(state.selectedArea, state.selectedDistrict);
        savePreferredRegion(matched.region);
        if (helper) {
          helper.textContent = matched.legalDong
            ? `현재 위치: ${matched.region.sido} ${matched.region.sigungu} ${matched.legalDong}`
            : `현재 위치: ${matched.region.sido} ${matched.region.sigungu}`;
        }
      } else if (helper) {
        helper.textContent = '현재 위치를 행정구역으로 변환하지 못했습니다.';
      }
      state.listMode = 'region';
      await render();
    } catch (error) {
      if (helper) helper.textContent = '현재 위치를 확인하지 못했습니다.';
    }
  });

  const savedRegion = loadPreferredRegion();
  const initialRegion = savedRegion ? findDistrictByName(districts, savedRegion.sido, savedRegion.sigungu) : null;
  state.selectedArea = initialRegion?.area || 'all';
  state.selectedDistrict = initialRegion?.fullName || '';
  if (areaSelect) areaSelect.value = state.selectedArea;
  populateDistricts(state.selectedArea, state.selectedDistrict);
  if (helper && initialRegion) helper.textContent = `최근 본 지역: ${initialRegion.fullName}`;
  await render();
}
