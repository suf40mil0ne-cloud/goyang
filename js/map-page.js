import { filterByStatus, getDistrictNotices } from './filters.js';
import { buildDistrictIndex, findDistrictByName, getCurrentPosition, reverseGeocodeDistrict } from './location.js';
import { createNoticeMap } from './map.js';
import { loadNotices, loadRegions } from './notices.js';
import { loadPreferredRegion, savePreferredRegion } from './storage.js';

function setCurrentYear() {
  document.querySelectorAll('[data-current-year]').forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
}

function buildRow(notice) {
  return `
    <article class="mini-card">
      <strong>${notice.title}</strong>
      <p>${notice.sido} ${notice.sigungu} ${notice.legalDong} · ${notice.statusLabel}</p>
      <p>${notice.easySummary}</p>
      <div class="button-row compact-actions">
        <a class="text-link" href="notice.html?id=${encodeURIComponent(notice.id)}">상세 보기</a>
        <a class="text-link" href="${notice.sourceUrl}" target="_blank" rel="noopener noreferrer">원문 공고</a>
      </div>
    </article>
  `;
}

export async function initMapPage() {
  setCurrentYear();
  const [notices, regions] = await Promise.all([loadNotices(), loadRegions()]);
  const districts = buildDistrictIndex(regions, notices);
  const areaSelect = document.getElementById('map-area');
  const districtSelect = document.getElementById('map-district');
  const statusSelect = document.getElementById('map-status');
  const hybridToggle = document.getElementById('map-hybrid');
  const detectButton = document.getElementById('map-detect-location');
  const helper = document.getElementById('map-location-helper');
  const list = document.getElementById('map-notice-list');
  const summary = document.getElementById('map-results-summary');
  const areaMap = Object.fromEntries(regions.map((region) => [region.area, region]));
  const state = {
    selectedArea: 'all',
    selectedDistrict: '',
    currentPosition: null,
  };

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

  async function render() {
    const area = areaSelect?.value || 'all';
    const status = statusSelect?.value || 'active';
    const districtValue = districtSelect?.value || '';
    const selectedDistrict = districtValue
      ? districts.find((district) => district.fullName === districtValue) || null
      : null;
    const scoped = selectedDistrict
      ? getDistrictNotices(notices, selectedDistrict, status)
      : filterByStatus(area === 'all' ? notices : notices.filter((notice) => notice.areaKey === area), status);
    const region = areaMap[area] || { center: { lat: 37.5665, lng: 126.978 }, defaultZoom: 10 };
    const center = state.currentPosition || selectedDistrict?.center || region.center;
    const zoom = selectedDistrict ? 12 : area === 'all' ? 9 : region.defaultZoom;

    if (summary) {
      summary.textContent = selectedDistrict
        ? `${selectedDistrict.fullName} 기준 공고 ${scoped.length}건`
        : area === 'all'
          ? `수도권 전체 공고 ${scoped.length}건`
          : `${region.name} 공고 ${scoped.length}건`;
    }

    if (list) list.innerHTML = scoped.length ? scoped.map(buildRow).join('') : '<div class="empty-state">선택한 조건의 공고가 없습니다.</div>';
    await createNoticeMap({
      elementId: 'overview-map',
      notices: scoped,
      center,
      zoom,
      currentPosition: state.currentPosition,
      hybrid: Boolean(hybridToggle?.checked),
    });
  }

  areaSelect?.addEventListener('change', async () => {
    state.selectedArea = areaSelect.value;
    state.selectedDistrict = '';
    populateDistricts(state.selectedArea);
    await render();
  });

  districtSelect?.addEventListener('change', async () => {
    state.selectedDistrict = districtSelect.value;
    await render();
  });

  statusSelect?.addEventListener('change', render);
  hybridToggle?.addEventListener('change', render);

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
