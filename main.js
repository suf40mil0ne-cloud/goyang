const goyang = {
  lat: 37.6584,
  lon: 126.8320,
};

const planningResources = [
  {
    title: "고양시청 대표 포털",
    category: "notice",
    org: "고양시",
    type: "행정포털",
    url: "https://www.goyang.go.kr/www/index.do",
    summary: "도시계획 관련 고시·공고, 보도자료, 행정 안내를 확인하는 기본 진입점입니다.",
  },
  {
    title: "고양시 도시정보/빅데이터 플랫폼",
    category: "map",
    org: "고양시",
    type: "공간정보",
    url: "https://www.bigdata-goyang.kr/",
    summary: "지도 기반 인구·상권·이동 데이터와 지역 현황을 시각적으로 검토할 수 있습니다.",
  },
  {
    title: "토지이음",
    category: "management-plan",
    org: "국토교통부",
    type: "계획확인",
    url: "https://www.eum.go.kr/",
    summary: "토지이용계획확인서, 용도지역·지구 지정 현황 등 법정 계획 정보를 열람합니다.",
  },
  {
    title: "국토교통부",
    category: "master-plan",
    org: "중앙부처",
    type: "정책원문",
    url: "https://www.molit.go.kr/",
    summary: "국토·도시 정책 방향과 법령 개정 동향, 주요 계획 발표 자료를 확인합니다.",
  },
  {
    title: "경기도청",
    category: "notice",
    org: "경기도",
    type: "광역행정",
    url: "https://www.gg.go.kr/",
    summary: "광역 차원의 도시·교통·산업 정책 및 고시 정보를 함께 검토할 때 활용합니다.",
  },
  {
    title: "KOSIS 국가통계포털",
    category: "stats",
    org: "통계청",
    type: "통계",
    url: "https://kosis.kr/",
    summary: "인구, 주택, 산업, 교통 등 도시기초통계를 비교·다운로드할 수 있습니다.",
  },
  {
    title: "공공데이터포털",
    category: "stats",
    org: "행정안전부",
    type: "데이터API",
    url: "https://www.data.go.kr/",
    summary: "고양시/경기도 관련 API와 데이터셋을 확보해 자체 분석에 연결할 수 있습니다.",
  },
  {
    title: "국가공간정보포털",
    category: "map",
    org: "국토정보",
    type: "공간데이터",
    url: "https://www.nsdi.go.kr/",
    summary: "공간데이터 목록, 연계 서비스, 표준 정보 확인에 유용합니다.",
  },
  {
    title: "국토교통 통계누리",
    category: "stats",
    org: "국토교통부",
    type: "정책통계",
    url: "https://stat.molit.go.kr/",
    summary: "주택·토지·도시·교통 분야 정책 통계를 주제별로 조회할 수 있습니다.",
  },
  {
    title: "국가법령정보센터",
    category: "management-plan",
    org: "법제처",
    type: "법령",
    url: "https://www.law.go.kr/",
    summary: "국토계획법, 도시개발법 등 도시계획 관련 법령과 시행령·시행규칙 원문을 확인합니다.",
  },
  {
    title: "고양도시관리공사",
    category: "project",
    org: "고양시 산하기관",
    type: "사업운영",
    url: "https://www.gys.or.kr/",
    summary: "공공시설 운영 현황과 도시 인프라 관련 사업 정보를 확인할 수 있습니다.",
  },
  {
    title: "경기교통정보센터",
    category: "map",
    org: "경기도",
    type: "교통지도",
    url: "https://gits.gg.go.kr/",
    summary: "도로 소통, CCTV, 돌발 상황을 확인해 교통영향 검토의 참고 자료로 활용합니다.",
  },
  {
    title: "경기버스정보시스템",
    category: "stats",
    org: "경기도",
    type: "대중교통",
    url: "https://www.gbis.go.kr/",
    summary: "버스 노선·정류소·운행 정보를 조회해 대중교통 접근성 검토에 활용합니다.",
  },
  {
    title: "국가교통DB센터",
    category: "stats",
    org: "국토교통부",
    type: "교통DB",
    url: "https://www.ktdb.go.kr/",
    summary: "OD 자료, 교통량, 통행특성 등 교통계획에 필요한 기초 DB를 확인합니다.",
  },
  {
    title: "고양 관광/문화 포털",
    category: "project",
    org: "고양시",
    type: "문화거점",
    url: "https://www.goyang.go.kr/visitgoyang/index.do",
    summary: "관광·문화 거점 정보를 통해 도심 활성화 및 보행권 계획 검토에 참고합니다.",
  },
  {
    title: "서울도시공간포털",
    category: "master-plan",
    org: "서울시",
    type: "벤치마크",
    url: "https://urban.seoul.go.kr/view/new/main.html",
    summary: "도시계획 정보 제공 방식과 메뉴 구조를 벤치마킹하기 위한 참고 포털입니다.",
  },
];

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

function buildResourceCard(item) {
  return `
    <article class="resource-card">
      <div class="resource-meta">
        <span class="badge">${formatCategory(item.category)}</span>
        <span class="badge">${item.org}</span>
        <span class="badge">${item.type}</span>
      </div>
      <h4>${item.title}</h4>
      <p>${item.summary}</p>
      <a class="resource-link" href="${item.url}" target="_blank" rel="noopener noreferrer">원문 바로가기</a>
    </article>
  `;
}

function renderResources() {
  const container = document.getElementById("resource-list");
  const counter = document.getElementById("resource-count");
  const keyword = (document.getElementById("resource-search")?.value || "").trim().toLowerCase();
  const category = document.getElementById("resource-category")?.value || "all";
  if (!container) return;

  const filtered = planningResources.filter((item) => {
    const categoryMatch = category === "all" || item.category === category;
    const keywordMatch =
      !keyword ||
      item.title.toLowerCase().includes(keyword) ||
      item.summary.toLowerCase().includes(keyword) ||
      item.org.toLowerCase().includes(keyword) ||
      formatCategory(item.category).toLowerCase().includes(keyword);

    return categoryMatch && keywordMatch;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">검색 결과가 없습니다. 분류를 전체로 바꾸거나 다른 키워드로 검색해보세요.</div>';
    if (counter) counter.textContent = "총 0건";
    return;
  }

  container.innerHTML = filtered.map(buildResourceCard).join("");
  if (counter) counter.textContent = `총 ${filtered.length}건`;
}

function initResourceFilter() {
  const searchInput = document.getElementById("resource-search");
  const categoryInput = document.getElementById("resource-category");

  if (searchInput) {
    searchInput.addEventListener("input", renderResources);
  }

  if (categoryInput) {
    categoryInput.addEventListener("change", renderResources);
  }

  renderResources();
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

initUpdatedAt();
initResourceFilter();
initMap();
