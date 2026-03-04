const goyang = {
  lat: 37.6584,
  lon: 126.8320,
};

const STORAGE_KEY = "goyang_custom_resources_v1";

const baseResources = [
  {
    title: "고양시청 대표 포털",
    category: "notice",
    org: "고양시",
    type: "행정포털",
    year: "2026",
    docType: "공고/공지",
    project: "시정 일반",
    url: "https://www.goyang.go.kr/www/index.do",
    summary: "도시계획 관련 고시·공고, 보도자료, 행정 안내를 확인하는 기본 진입점입니다.",
  },
  {
    title: "고양시 도시정보/빅데이터 플랫폼",
    category: "map",
    org: "고양시",
    type: "공간정보",
    year: "2026",
    docType: "공간데이터",
    project: "도시현황 분석",
    url: "https://www.bigdata-goyang.kr/",
    summary: "지도 기반 인구·상권·이동 데이터와 지역 현황을 시각적으로 검토할 수 있습니다.",
  },
  {
    title: "토지이음",
    category: "management-plan",
    org: "국토교통부",
    type: "계획확인",
    year: "2026",
    docType: "법정계획 열람",
    project: "토지이용규제",
    url: "https://www.eum.go.kr/",
    summary: "토지이용계획확인서, 용도지역·지구 지정 현황 등 법정 계획 정보를 열람합니다.",
  },
  {
    title: "국토교통부",
    category: "master-plan",
    org: "중앙부처",
    type: "정책원문",
    year: "2026",
    docType: "정책발표",
    project: "국토·도시정책",
    url: "https://www.molit.go.kr/",
    summary: "국토·도시 정책 방향과 법령 개정 동향, 주요 계획 발표 자료를 확인합니다.",
  },
  {
    title: "경기도청",
    category: "notice",
    org: "경기도",
    type: "광역행정",
    year: "2026",
    docType: "고시/공고",
    project: "광역정책",
    url: "https://www.gg.go.kr/",
    summary: "광역 차원의 도시·교통·산업 정책 및 고시 정보를 함께 검토할 때 활용합니다.",
  },
  {
    title: "KOSIS 국가통계포털",
    category: "stats",
    org: "통계청",
    type: "통계",
    year: "2026",
    docType: "통계표",
    project: "도시기초통계",
    url: "https://kosis.kr/",
    summary: "인구, 주택, 산업, 교통 등 도시기초통계를 비교·다운로드할 수 있습니다.",
  },
  {
    title: "공공데이터포털",
    category: "stats",
    org: "행정안전부",
    type: "데이터API",
    year: "2026",
    docType: "API/CSV",
    project: "데이터 수집",
    url: "https://www.data.go.kr/",
    summary: "고양시/경기도 관련 API와 데이터셋을 확보해 자체 분석에 연결할 수 있습니다.",
  },
  {
    title: "국가공간정보포털",
    category: "map",
    org: "국토정보",
    type: "공간데이터",
    year: "2026",
    docType: "지도서비스",
    project: "공간정보 연계",
    url: "https://www.nsdi.go.kr/",
    summary: "공간데이터 목록, 연계 서비스, 표준 정보 확인에 유용합니다.",
  },
  {
    title: "국가법령정보센터",
    category: "management-plan",
    org: "법제처",
    type: "법령",
    year: "2026",
    docType: "법령원문",
    project: "법제 검토",
    url: "https://www.law.go.kr/",
    summary: "국토계획법, 도시개발법 등 도시계획 관련 법령과 시행령·시행규칙 원문을 확인합니다.",
  },
  {
    title: "서울도시공간포털",
    category: "master-plan",
    org: "서울시",
    type: "벤치마크",
    year: "2026",
    docType: "포털사례",
    project: "포털 벤치마크",
    url: "https://urban.seoul.go.kr/view/new/main.html",
    summary: "도시계획 정보 제공 방식과 메뉴 구조를 벤치마킹하기 위한 참고 포털입니다.",
  },
];

const state = {
  customResources: [],
};

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function formatCategory(category) {
  const map = {
    "master-plan": "도시기본계획",
    "management-plan": "도시관리·지구단위",
    notice: "고시·공고",
    map: "지도·공간정보",
    stats: "통계·데이터",
    project: "핵심 개발사업",
  };
  return map[category] || category;
}

function getAllResources() {
  return [...state.customResources, ...baseResources];
}

function buildResourceCard(item) {
  return `
    <article class="resource-card">
      <div class="resource-meta">
        <span class="badge">${formatCategory(item.category)}</span>
        <span class="badge">${item.year || "연도미상"}</span>
        <span class="badge">${item.docType || "문서유형"}</span>
        <span class="badge">${item.project || "사업"}</span>
      </div>
      <h4>${item.title}</h4>
      <p>${item.summary}</p>
      <a class="resource-link" href="${item.url}" target="_blank" rel="noopener noreferrer">원문 바로가기</a>
    </article>
  `;
}

function uniqueValues(resources, key) {
  const vals = resources
    .map((item) => (item[key] || "").toString().trim())
    .filter((v) => v.length > 0);
  return [...new Set(vals)].sort((a, b) => a.localeCompare(b, "ko"));
}

function populateTagSelect(id, values) {
  const el = document.getElementById(id);
  if (!el) return;

  const currentValue = el.value || "all";
  el.innerHTML = '<option value="all">전체</option>' + values.map((v) => `<option value="${v}">${v}</option>`).join("");
  el.value = values.includes(currentValue) ? currentValue : "all";
}

function refreshTagFilters() {
  const resources = getAllResources();
  populateTagSelect("tag-year", uniqueValues(resources, "year"));
  populateTagSelect("tag-type", uniqueValues(resources, "docType"));
  populateTagSelect("tag-project", uniqueValues(resources, "project"));
}

function renderResources() {
  const container = document.getElementById("resource-list");
  const counter = document.getElementById("resource-count");
  const keyword = (document.getElementById("resource-search")?.value || "").trim().toLowerCase();
  const category = document.getElementById("resource-category")?.value || "all";
  const year = document.getElementById("tag-year")?.value || "all";
  const docType = document.getElementById("tag-type")?.value || "all";
  const project = document.getElementById("tag-project")?.value || "all";

  if (!container) return;

  const resources = getAllResources();
  const filtered = resources.filter((item) => {
    const categoryMatch = category === "all" || item.category === category;
    const yearMatch = year === "all" || item.year === year;
    const typeMatch = docType === "all" || item.docType === docType;
    const projectMatch = project === "all" || item.project === project;
    const keywordMatch =
      !keyword ||
      item.title.toLowerCase().includes(keyword) ||
      item.summary.toLowerCase().includes(keyword) ||
      item.org.toLowerCase().includes(keyword) ||
      item.project.toLowerCase().includes(keyword) ||
      formatCategory(item.category).toLowerCase().includes(keyword);

    return categoryMatch && yearMatch && typeMatch && projectMatch && keywordMatch;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">검색 결과가 없습니다. 태그/키워드를 다시 조합해보세요.</div>';
    if (counter) counter.textContent = "총 0건";
    return;
  }

  container.innerHTML = filtered.map(buildResourceCard).join("");
  if (counter) counter.textContent = `총 ${filtered.length}건`;
}

function loadCustomResources() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state.customResources = [];
      return;
    }

    const parsed = JSON.parse(raw);
    state.customResources = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    state.customResources = [];
  }
}

function saveCustomResources() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.customResources));
}

function normalizeResource(item) {
  return {
    title: (item.title || "").trim(),
    category: (item.category || "notice").trim(),
    org: (item.org || "출처 미기재").trim(),
    type: (item.type || "문서").trim(),
    year: (item.year || "").toString().trim(),
    docType: (item.docType || "").trim(),
    project: (item.project || "").trim(),
    url: (item.url || "").trim(),
    summary: (item.summary || "").trim(),
  };
}

function isValidResource(item) {
  if (!item.title || !item.year || !item.docType || !item.project || !item.url || !item.summary) return false;
  if (!/^https?:\/\//.test(item.url)) return false;
  return true;
}

function initResourceFilter() {
  const ids = ["resource-search", "resource-category", "tag-year", "tag-type", "tag-project"];
  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      const event = element.tagName === "SELECT" ? "change" : "input";
      element.addEventListener(event, renderResources);
    }
  });

  refreshTagFilters();
  renderResources();
}

function initResourceForm() {
  const form = document.getElementById("resource-form");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const resource = normalizeResource({
      title: formData.get("title"),
      year: formData.get("year"),
      docType: formData.get("docType"),
      project: formData.get("project"),
      category: formData.get("category"),
      org: formData.get("org"),
      url: formData.get("url"),
      summary: formData.get("summary"),
      type: "사용자추가",
    });

    if (!isValidResource(resource)) {
      setText("upload-result", "필수값 또는 URL 형식을 확인해 주세요.");
      return;
    }

    state.customResources.unshift(resource);
    saveCustomResources();
    refreshTagFilters();
    renderResources();
    form.reset();
    setText("upload-result", "자료 1건이 추가되었습니다.");
  });

  const clearButton = document.getElementById("clear-custom");
  if (clearButton) {
    clearButton.addEventListener("click", () => {
      state.customResources = [];
      saveCustomResources();
      refreshTagFilters();
      renderResources();
      setText("upload-result", "사용자 추가자료를 초기화했습니다.");
    });
  }
}

function initUpload() {
  const input = document.getElementById("resource-upload");
  if (!input) return;

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        setText("upload-result", "JSON 배열 형식만 지원합니다.");
        return;
      }

      const valid = parsed.map(normalizeResource).filter(isValidResource);
      if (valid.length === 0) {
        setText("upload-result", "추가 가능한 유효 데이터가 없습니다.");
        return;
      }

      state.customResources = [...valid, ...state.customResources];
      saveCustomResources();
      refreshTagFilters();
      renderResources();
      setText("upload-result", `JSON 업로드 완료: ${valid.length}건 추가`);
      input.value = "";
    } catch (err) {
      setText("upload-result", "JSON 파싱 실패: 형식을 확인해 주세요.");
    }
  });
}

function initMap() {
  const mapElement = document.getElementById("city-map");
  if (!mapElement || !window.L) return;

  const map = L.map(mapElement, {
    zoomControl: true,
    attributionControl: true,
  }).setView([goyang.lat, goyang.lon], 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const points = [
    { name: "고양시청", lat: 37.6584, lon: 126.8320, note: "행정 중심" },
    { name: "원당권", lat: 37.6625, lon: 126.8359, note: "도시재생·행정축" },
    { name: "일산(킨텍스권)", lat: 37.6686, lon: 126.7450, note: "MICE·복합개발" },
    { name: "창릉신도시권", lat: 37.6415, lon: 126.8696, note: "신도시 개발축" },
  ];

  points.forEach((point) => {
    L.marker([point.lat, point.lon]).addTo(map).bindPopup(`<strong>${point.name}</strong><br>${point.note}`);
  });

  L.circle([37.6584, 126.8320], {
    color: "#0a6df0",
    fillColor: "#0a6df0",
    fillOpacity: 0.08,
    radius: 6500,
  }).addTo(map);
}

function initUpdatedAt() {
  const nowText = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  setText("updated-at", `마지막 갱신: ${nowText}`);
}

loadCustomResources();
initUpdatedAt();
initResourceFilter();
initResourceForm();
initUpload();
initMap();
