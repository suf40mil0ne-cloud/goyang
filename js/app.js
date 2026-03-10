import { filterByStatus, getNearbyNotices, sortForCards } from "./filters.js";
import { createNoticeMap } from "./map.js";
import { getStatusCounts, loadGuides, loadNotices, loadRegions } from "./notices.js";
import { loadSavedAreas, removeArea, saveArea } from "./storage.js";

const state = {
  notices: [],
  regions: [],
  guides: null,
  activeFilter: "active",
  activeType: "all",
  lastSearch: null,
};

const statusCopy = {
  active: "진행 중 우선",
  "closing-soon": "마감 임박 우선",
  recent: "최근 공고 우선",
  ended: "종료 공고 포함",
};

function setCurrentYear() {
  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
}

function setUpdatedTime() {
  const element = document.getElementById("updated-at");
  if (!element) return;
  const nowText = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date());
  element.textContent = `마지막 확인 시각: ${nowText}`;
}

function pickStatusSummary(counts) {
  return [
    `진행 중 ${counts.active + counts.closingSoon}건`,
    `마감 임박 ${counts.closingSoon}건`,
    `최근 공고 ${counts.recent}건`,
    `종료 공고 ${counts.ended}건`,
  ];
}

function buildNoticeCard(notice) {
  return `
    <article class="notice-card">
      <div class="resource-meta">
        <span class="status-badge ${notice.statusKey}">${notice.statusLabel}</span>
        <span class="badge">${notice.sido}</span>
        <span class="badge">${notice.projectType}</span>
      </div>
      <h4><a href="notice.html?id=${encodeURIComponent(notice.id)}">${notice.title}</a></h4>
      <p>${notice.shortSummary}</p>
      <ul class="notice-meta-list">
        <li>지역: ${notice.sigungu} ${notice.legalDong}</li>
        <li>공고일: ${notice.postedDate}</li>
        <li>열람 마감일: ${notice.hearingEndDate}</li>
      </ul>
      <a class="resource-link" href="notice.html?id=${encodeURIComponent(notice.id)}">상세 보기</a>
    </article>
  `;
}

function renderSection(containerId, notices, fallbackText) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!notices.length) {
    container.innerHTML = `<div class="empty-state">${fallbackText}</div>`;
    return;
  }
  container.innerHTML = notices.map(buildNoticeCard).join("");
}

function renderStatusSummary() {
  const element = document.getElementById("status-summary");
  if (!element) return;
  const counts = getStatusCounts(state.notices);
  element.innerHTML = pickStatusSummary(counts).map((text) => `<span>${text}</span>`).join("");
}

function renderRecentSections() {
  const closingSoon = sortForCards(state.notices)
    .filter((notice) => notice.statusKey === "closing-soon")
    .slice(0, 6);
  const recent = [...state.notices]
    .sort((a, b) => new Date(b.postedDate) - new Date(a.postedDate))
    .slice(0, 9);

  renderSection("closing-notices", closingSoon, "현재 마감 임박 공고가 없습니다.");
  renderSection("recent-notices", recent, "표시할 최근 공고가 없습니다.");
}

function renderTypeTabs() {
  const container = document.getElementById("type-tab-grid");
  if (!container) return;
  const filtered = state.activeType === "all"
    ? sortForCards(filterByStatus(state.notices, state.activeFilter))
    : sortForCards(filterByStatus(state.notices, state.activeFilter).filter((notice) => notice.projectType === state.activeType));
  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state">선택한 조건의 공고가 없습니다.</div>';
    return;
  }
  container.innerHTML = filtered.slice(0, 6).map(buildNoticeCard).join("");
}

function updateMap(notices, center, radiusKm = 0) {
  const mapNotices = notices.length ? notices : state.notices.filter((notice) => notice.statusKey !== "ended").slice(0, 12);
  createNoticeMap({
    elementId: "home-map",
    notices: mapNotices,
    center,
    zoom: radiusKm >= 3 ? 11 : 12,
    radiusKm,
  });
}

function renderNearbyResults(items, contextLabel, radiusKm) {
  const summary = document.getElementById("nearby-summary");
  const container = document.getElementById("nearby-results");
  if (!summary || !container) return;

  if (!items.length) {
    summary.textContent = `${contextLabel} 반경 ${radiusKm}km 안에서 조건에 맞는 공고를 찾지 못했습니다.`;
    container.innerHTML = '<div class="empty-state">반경을 넓히거나 다른 지역명을 입력해 보세요.</div>';
    return;
  }

  summary.textContent = `${contextLabel} 반경 ${radiusKm}km 안에서 ${items.length}건을 찾았습니다.`;
  container.innerHTML = items
    .slice(0, 5)
    .map(
      (notice) => `
        <article class="mini-card">
          <strong>${notice.title}</strong>
          <p>${notice.sigungu} ${notice.legalDong} · ${notice.distanceKm.toFixed(2)}km · ${notice.statusLabel}</p>
          <a class="text-link" href="notice.html?id=${encodeURIComponent(notice.id)}">공고 상세 보기</a>
        </article>
      `
    )
    .join("");
}

function findSearchTarget(query) {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const coords = trimmed.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
  if (coords) {
    return {
      label: `${coords[1]}, ${coords[2]}`,
      lat: Number(coords[1]),
      lng: Number(coords[2]),
    };
  }

  const region = state.regions.find((item) => item.aliases.some((alias) => trimmed.includes(alias)));
  if (region) {
    return {
      label: region.name,
      lat: region.center.lat,
      lng: region.center.lng,
    };
  }

  const notice = state.notices.find((item) => `${item.sigungu} ${item.legalDong} ${item.locationText}`.includes(trimmed));
  if (notice) {
    return {
      label: `${notice.sigungu} ${notice.legalDong}`,
      lat: notice.latitude,
      lng: notice.longitude,
    };
  }

  return null;
}

function feedback(text) {
  const element = document.getElementById("search-feedback");
  if (element) element.textContent = text;
}

function runSearch(target, radiusKm, statusFilter) {
  const nearby = getNearbyNotices(state.notices, { lat: target.lat, lng: target.lng }, radiusKm, statusFilter);
  state.lastSearch = { ...target, radiusKm, statusFilter };
  renderNearbyResults(nearby, target.label, radiusKm);
  updateMap(nearby, { lat: target.lat, lng: target.lng }, radiusKm);
}

function renderSavedAreas() {
  const container = document.getElementById("saved-areas");
  if (!container) return;
  const saved = loadSavedAreas();
  if (!saved.length) {
    container.innerHTML = '<div class="empty-state">아직 저장한 관심지역이 없습니다.</div>';
    return;
  }

  container.innerHTML = saved
    .map(
      (item) => `
        <article class="mini-card">
          <strong>${item.label}</strong>
          <p>반경 ${item.radiusKm}km · 기본 필터 ${statusCopy[item.statusFilter] || item.statusFilter}</p>
          <div class="button-row compact-actions">
            <button type="button" class="ghost-button" data-saved-apply="${item.label}">다시 보기</button>
            <button type="button" class="ghost-button" data-saved-remove="${item.label}">삭제</button>
          </div>
        </article>
      `
    )
    .join("");
}

function bindSavedAreaEvents() {
  const container = document.getElementById("saved-areas");
  if (!container) return;
  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const applyLabel = target.getAttribute("data-saved-apply");
    if (applyLabel) {
      const selected = loadSavedAreas().find((item) => item.label === applyLabel);
      if (!selected) return;
      runSearch(selected, selected.radiusKm, selected.statusFilter);
      feedback(`저장한 관심지역 ${selected.label} 기준으로 다시 탐색했습니다.`);
      return;
    }

    const removeLabel = target.getAttribute("data-saved-remove");
    if (removeLabel) {
      removeArea(removeLabel);
      renderSavedAreas();
      feedback(`관심지역 ${removeLabel} 저장을 삭제했습니다.`);
    }
  });
}

function bindStatusFilters() {
  const group = document.getElementById("status-filters");
  if (!group) return;
  group.addEventListener("click", (event) => {
    const button = event.target;
    if (!(button instanceof HTMLButtonElement)) return;
    const nextFilter = button.dataset.filter;
    if (!nextFilter) return;
    state.activeFilter = nextFilter;
    group.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.remove("is-active"));
    button.classList.add("is-active");
    renderTypeTabs();
  });
}

function bindTypeTabs() {
  const tabs = document.getElementById("type-tabs");
  if (!tabs) return;
  tabs.addEventListener("click", (event) => {
    const button = event.target;
    if (!(button instanceof HTMLButtonElement)) return;
    const nextType = button.dataset.typeTab;
    if (!nextType) return;
    state.activeType = nextType;
    tabs.querySelectorAll(".project-tab").forEach((tab) => {
      const isActive = tab === button;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    renderTypeTabs();
  });
}

function bindSearch() {
  const form = document.getElementById("location-search-form");
  const currentButton = document.getElementById("use-current-location");
  const saveButton = document.getElementById("save-interest-area");
  if (!form || !(form instanceof HTMLFormElement)) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = new FormData(form).get("query")?.toString() || "";
    const radiusKm = Number(document.getElementById("radius-select")?.value || "0.5");
    const statusFilter = document.getElementById("status-select")?.value || "active";
    const target = findSearchTarget(query);
    if (!target) {
      feedback("검색어를 지역명이나 좌표 형식으로 다시 입력해 주세요.");
      return;
    }
    runSearch(target, radiusKm, statusFilter);
    feedback(`${target.label} 중심으로 공고를 다시 정렬했습니다.`);
  });

  currentButton?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      feedback("현재 브라우저에서는 위치 정보를 사용할 수 없습니다.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const radiusKm = Number(document.getElementById("radius-select")?.value || "0.5");
        const statusFilter = document.getElementById("status-select")?.value || "active";
        const target = {
          label: "현재 위치",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        runSearch(target, radiusKm, statusFilter);
        feedback("현재 위치 기준으로 공고를 탐색했습니다.");
      },
      () => {
        feedback("현재 위치를 읽지 못했습니다. 지역명을 직접 입력해 주세요.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  saveButton?.addEventListener("click", () => {
    if (!state.lastSearch) {
      feedback("먼저 검색이나 현재 위치 버튼으로 기준 지역을 선택해 주세요.");
      return;
    }
    saveArea(state.lastSearch);
    renderSavedAreas();
    feedback(`관심지역 ${state.lastSearch.label}을 저장했습니다.`);
  });
}

function hydrateGuideCopy() {
  if (!state.guides) return;
  const cards = document.getElementById("prelaunch-copy");
  if (cards) {
    cards.innerHTML = state.guides.prelaunchNotices
      .map(
        (item) => `
          <article class="mini-card">
            <strong>출시 전 안내</strong>
            <p>${item}</p>
          </article>
        `
      )
      .join("");
  }
}

function renderRegionCounts() {
  const cards = document.querySelectorAll("#region-cards .region-card");
  cards.forEach((card) => {
    const heading = card.querySelector("h4")?.textContent || "";
    const area = state.regions.find((item) => item.name === heading);
    if (!area) return;
    const count = state.notices.filter((notice) => notice.areaKey === area.area).length;
    const extra = document.createElement("p");
    extra.className = "caption";
    extra.textContent = `현재 표시 중인 공고 ${count}건 · ${area.focus}`;
    card.appendChild(extra);
  });
}

export async function initHomePage() {
  setCurrentYear();
  setUpdatedTime();

  const [notices, regions, guides] = await Promise.all([loadNotices(), loadRegions(), loadGuides()]);
  state.notices = notices;
  state.regions = regions;
  state.guides = guides;

  renderStatusSummary();
  renderRecentSections();
  renderTypeTabs();
  hydrateGuideCopy();
  renderSavedAreas();
  renderRegionCounts();
  bindSavedAreaEvents();
  bindStatusFilters();
  bindTypeTabs();
  bindSearch();

  const defaultCenter = regions.find((item) => item.area === "seoul")?.center || { lat: 37.5665, lng: 126.978 };
  updateMap(state.notices.filter((notice) => notice.statusKey !== "ended"), defaultCenter, 0);
}
