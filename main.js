const goyang = {
  lat: 37.6584,
  lon: 126.8320,
};

const STORAGE_KEY = "goyang_custom_resources_v1";

const baseResources = [
  {
    title: "창릉 3기 신도시 관련 정보",
    category: "project",
    org: "LH",
    type: "사업정보",
    year: "2026",
    docType: "사업개요",
    project: "창릉 3기 신도시",
    url: "https://www.lh.or.kr/",
    summary: "창릉지구 사업 개요, 보상·공급·지구계획 관련 공지 확인에 활용합니다.",
  },
  {
    title: "고양시청 도시계획/고시공고",
    category: "notice",
    org: "고양시",
    type: "행정문서",
    year: "2026",
    docType: "고시·공고",
    project: "창릉 3기 신도시",
    url: "https://www.goyang.go.kr/www/index.do",
    summary: "고양시 고시/공고 게시판에서 개발사업 관련 행정 절차 문서를 확인합니다.",
  },
  {
    title: "일산테크노밸리 사업 안내",
    category: "project",
    org: "경기도/고양시",
    type: "사업정보",
    year: "2026",
    docType: "사업개요",
    project: "일산테크노밸리",
    url: "https://www.gg.go.kr/",
    summary: "산업단지 조성, 기업유치, 연계 인프라 구축 동향을 추적할 수 있습니다.",
  },
  {
    title: "킨텍스 일원 개발 관련 소식",
    category: "project",
    org: "고양시",
    type: "사업동향",
    year: "2026",
    docType: "사업동향",
    project: "킨텍스 일원 복합개발",
    url: "https://www.goyang.go.kr/www/index.do",
    summary: "전시·상업·업무 복합개발과 교통연계 계획 문서 탐색의 시작점으로 활용합니다.",
  },
  {
    title: "원당 재정비/도시재생 관련 정보",
    category: "project",
    org: "고양시",
    type: "사업동향",
    year: "2026",
    docType: "사업동향",
    project: "원당 재정비",
    url: "https://www.goyang.go.kr/www/index.do",
    summary: "도시재생 및 정비사업의 계획 수립/공람/결정 단계를 추적합니다.",
  },
  {
    title: "토지이음",
    category: "management-plan",
    org: "국토교통부",
    type: "계획확인",
    year: "2026",
    docType: "법정계획 열람",
    project: "창릉 3기 신도시",
    url: "https://www.eum.go.kr/",
    summary: "개발사업 대상지의 용도지역/지구/구역과 행위제한을 법정지도 기준으로 점검합니다.",
  },
  {
    title: "국가법령정보센터",
    category: "management-plan",
    org: "법제처",
    type: "법령",
    year: "2026",
    docType: "법령원문",
    project: "공통 법제 검토",
    url: "https://www.law.go.kr/",
    summary: "국토계획법, 도시개발법 등 개발사업 검토의 법적 기준 원문을 확인합니다.",
  },
  {
    title: "고양시 도시정보/빅데이터 플랫폼",
    category: "map",
    org: "고양시",
    type: "공간정보",
    year: "2026",
    docType: "공간데이터",
    project: "일산테크노밸리",
    url: "https://www.bigdata-goyang.kr/",
    summary: "사업지 주변 인구·상권·이동 데이터를 지도 기반으로 검토할 수 있습니다.",
  },
  {
    title: "국가공간정보포털",
    category: "map",
    org: "국토정보",
    type: "공간데이터",
    year: "2026",
    docType: "지도서비스",
    project: "킨텍스 일원 복합개발",
    url: "https://www.nsdi.go.kr/",
    summary: "공간데이터 연계와 표준 좌표 기반 분석 자료 확인에 활용합니다.",
  },
  {
    title: "KOSIS 국가통계포털",
    category: "stats",
    org: "통계청",
    type: "통계",
    year: "2026",
    docType: "통계표",
    project: "원당 재정비",
    url: "https://kosis.kr/",
    summary: "사업권역의 인구/주택/산업 기초통계 시계열 비교에 사용합니다.",
  },
  {
    title: "공공데이터포털",
    category: "stats",
    org: "행정안전부",
    type: "데이터API",
    year: "2026",
    docType: "API/CSV",
    project: "공통 데이터 수집",
    url: "https://www.data.go.kr/",
    summary: "개발사업 분석용 공공 API와 데이터셋 확보에 활용합니다.",
  },
  {
    title: "경기교통정보센터",
    category: "stats",
    org: "경기도",
    type: "교통정보",
    year: "2026",
    docType: "교통운영 데이터",
    project: "창릉 3기 신도시",
    url: "https://gits.gg.go.kr/",
    summary: "교통흐름/CCTV/돌발정보를 통해 주변 교통체계 진단에 활용합니다.",
  },
  {
    title: "경기버스정보시스템",
    category: "stats",
    org: "경기도",
    type: "대중교통",
    year: "2026",
    docType: "대중교통 데이터",
    project: "일산테크노밸리",
    url: "https://www.gbis.go.kr/",
    summary: "노선/정류소 접근성 검토 및 대중교통 연계성 분석에 활용합니다.",
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
  selectedProjectTab: "창릉 3기 신도시",
};

const projectTimelines = {
  "창릉 3기 신도시": [
    "사업 개요 및 지구 지정 관련 공고 확인",
    "광역교통개선대책·기반시설 계획 병행 검토",
    "주요 인허가 및 보상 절차 진행 상황 추적",
    "주택공급·자족기능 도입 단계별 일정 점검",
  ],
  "일산테크노밸리": [
    "산업단지 조성 계획 및 기관 협약 문서 확인",
    "용지 조성·분양·기업유치 추진 단계 점검",
    "주변 교통/정주여건 연계 인프라 계획 검토",
    "일자리 창출 및 지역 파급효과 지표 추적",
  ],
  "킨텍스 일원 복합개발": [
    "복합개발 구상(상업·업무·문화) 기본 자료 확인",
    "도시관리계획 변경 및 지구단위계획 문서 점검",
    "교통영향 및 보행·대중교통 연계 계획 검토",
    "단계별 사업 시행 계획과 공공기여 항목 추적",
  ],
  "원당 재정비": [
    "재정비/도시재생 대상지 현황 및 문제진단 확인",
    "정비계획·주민의견 수렴·공람 절차 문서 점검",
    "생활SOC·주거환경 개선 사업 연계 계획 검토",
    "구도심 활성화 성과지표 및 후속사업 추적",
  ],
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
    renderProjectTabContent();
    return;
  }

  container.innerHTML = filtered.map(buildResourceCard).join("");
  if (counter) counter.textContent = `총 ${filtered.length}건`;
  renderProjectTabContent();
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
  const categoryElement = document.getElementById("resource-category");
  if (categoryElement && !categoryElement.value) {
    categoryElement.value = "project";
  }
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
      const valid = parseUploadedResources(file.name, text);
      if (valid.length === 0) {
        setText("upload-result", "추가 가능한 유효 데이터가 없습니다.");
        return;
      }

      state.customResources = [...valid, ...state.customResources];
      saveCustomResources();
      refreshTagFilters();
      renderResources();
      setText("upload-result", `업로드 완료: ${valid.length}건 추가`);
      input.value = "";
    } catch (err) {
      setText("upload-result", "파일 파싱 실패: CSV/JSON 형식을 확인해 주세요.");
    }
  });
}

function parseUploadedResources(filename, text) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".json")) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeResource).filter(isValidResource);
  }

  if (lower.endsWith(".csv")) {
    return parseCsv(text).map(normalizeResource).filter(isValidResource);
  }

  return [];
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const out = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = (cols[idx] || "").trim();
    });
    out.push(row);
  }
  return out;
}

function splitCsvLine(line) {
  const cols = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cols.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}

function initDownload() {
  const button = document.getElementById("download-json");
  if (!button) return;

  button.addEventListener("click", () => {
    const data = JSON.stringify(state.customResources, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "goyang-custom-resources.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setText("upload-result", "사용자 추가자료를 JSON 파일로 다운로드했습니다.");
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

function renderProjectTabContent() {
  const listElement = document.getElementById("project-tab-list");
  const timelineElement = document.getElementById("project-timeline");
  if (!listElement || !timelineElement) return;

  const allResources = getAllResources();
  const projectResources = allResources
    .filter((item) => item.project === state.selectedProjectTab)
    .slice(0, 6);

  if (projectResources.length === 0) {
    listElement.innerHTML = '<div class="empty-state">선택한 사업에 연결된 문서가 없습니다.</div>';
  } else {
    listElement.innerHTML = projectResources.map(buildResourceCard).join("");
  }

  const timelineItems = projectTimelines[state.selectedProjectTab] || ["사업 단계 정보를 준비 중입니다."];
  timelineElement.innerHTML = timelineItems.map((item) => `<li>${item}</li>`).join("");
}

function initProjectTabs() {
  const buttons = Array.from(document.querySelectorAll(".project-tab"));
  if (buttons.length === 0) return;

  const setActive = (projectName) => {
    state.selectedProjectTab = projectName;
    buttons.forEach((btn) => {
      const isActive = btn.dataset.projectTab === projectName;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    renderProjectTabContent();
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const projectName = button.dataset.projectTab || "";
      setActive(projectName);
    });
  });

  setActive(state.selectedProjectTab);
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
initDownload();
initMap();
initProjectTabs();
