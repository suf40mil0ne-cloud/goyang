const goyang = {
  lat: 37.6584,
  lon: 126.832,
};

const weatherCodeMap = {
  0: "맑음",
  1: "대체로 맑음",
  2: "부분적으로 흐림",
  3: "흐림",
  45: "안개",
  48: "착빙 안개",
  51: "이슬비",
  53: "약한 비",
  55: "강한 이슬비",
  61: "약한 비",
  63: "비",
  65: "강한 비",
  71: "약한 눈",
  73: "눈",
  75: "강한 눈",
  80: "소나기",
  81: "강한 소나기",
  82: "매우 강한 소나기",
  95: "뇌우",
};

const sourceData = [
  {
    name: "고양시청 대표 포털",
    desc: "시정 소식, 조직, 생활 민원",
    url: "https://www.goyang.go.kr/www/index.do",
  },
  {
    name: "고양시 빅데이터 플랫폼",
    desc: "지도 기반 도시지표, 인구/상권/이동",
    url: "https://www.bigdata-goyang.kr/",
  },
  {
    name: "경기버스정보(GBIS)",
    desc: "버스 노선·정류소·도착정보",
    url: "https://www.gbis.go.kr/",
  },
  {
    name: "경기도 교통정보센터",
    desc: "도로 소통, CCTV, 돌발정보",
    url: "https://gits.gg.go.kr/",
  },
  {
    name: "KOSIS 지역통계",
    desc: "공식 통계 원문 확인",
    url: "https://kosis.kr/statHtml/statHtml.do?orgId=404&tblId=DT_404",
  },
  {
    name: "고양 관광 포털",
    desc: "문화·행사·관광지 정보",
    url: "https://www.goyang.go.kr/visitgoyang/index.do",
  },
];

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function renderSources() {
  const list = document.getElementById("source-list");
  if (!list) return;

  list.innerHTML = sourceData
    .map(
      (item) => `
      <li class="source-item">
        <a href="${item.url}" target="_blank" rel="noopener noreferrer">
          <strong>${item.name}</strong>
          <span>${item.desc}</span>
        </a>
      </li>
    `
    )
    .join("");
}

async function fetchWeatherAndAir() {
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${goyang.lat}&longitude=${goyang.lon}&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m&hourly=precipitation_probability,uv_index,temperature_2m&forecast_days=2&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=Asia%2FSeoul`;
  const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${goyang.lat}&longitude=${goyang.lon}&current=pm2_5,pm10,european_aqi&timezone=Asia%2FSeoul`;

  try {
    const [weatherRes, airRes] = await Promise.all([fetch(weatherUrl), fetch(airUrl)]);
    if (!weatherRes.ok || !airRes.ok) throw new Error("API request failed");

    const weather = await weatherRes.json();
    const air = await airRes.json();

    const temp = weather?.current?.temperature_2m;
    const weatherCode = weather?.current?.weather_code;
    const humidity = weather?.current?.relative_humidity_2m;
    const windSpeed = weather?.current?.wind_speed_10m;
    const tempMax = weather?.daily?.temperature_2m_max?.[0];
    const tempMin = weather?.daily?.temperature_2m_min?.[0];
    const sunrise = weather?.daily?.sunrise?.[0]?.slice(11, 16);
    const sunset = weather?.daily?.sunset?.[0]?.slice(11, 16);
    const hourlyTimes = weather?.hourly?.time || [];
    const hourlyTemp = weather?.hourly?.temperature_2m || [];
    const hourlyPrecip = weather?.hourly?.precipitation_probability || [];
    const hourlyUv = weather?.hourly?.uv_index || [];

    const pm25 = air?.current?.pm2_5;
    const pm10 = air?.current?.pm10;
    const aqi = air?.current?.european_aqi;

    if (typeof temp === "number") setText("temp-now", `${temp.toFixed(1)}°C`);
    setText("weather-desc", weatherCodeMap[weatherCode] || `코드 ${weatherCode}`);

    if (typeof tempMax === "number" && typeof tempMin === "number") {
      setText("temp-range", `${tempMin.toFixed(1)}° ~ ${tempMax.toFixed(1)}°`);
    }

    if (sunrise && sunset) {
      setText("sun-info", `일출 ${sunrise} · 일몰 ${sunset}`);
    }

    if (typeof pm25 === "number") {
      setText("pm25-now", `${pm25.toFixed(1)} µg/m³`);
    }
    if (typeof humidity === "number") {
      setText("humidity-now", `${humidity.toFixed(0)}%`);
    }
    if (typeof windSpeed === "number") {
      setText("wind-now", `${windSpeed.toFixed(1)} m/s`);
    }

    setText("aqi-level", `PM10 ${pm10?.toFixed(1) ?? "-"} · AQI ${aqi ?? "-"}`);
    setText("updated-at", `업데이트: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);
    renderHourlyForecast(hourlyTimes, hourlyTemp, hourlyPrecip, hourlyUv);
  } catch (error) {
    setText("weather-desc", "실시간 연동 실패");
    setText("aqi-level", "네트워크/출처 확인 필요");
    setText("updated-at", "업데이트 실패");
  }
}

function renderHourlyForecast(times, temps, precip, uv) {
  const container = document.getElementById("hourly-forecast");
  if (!container) return;

  const now = new Date();
  const result = [];
  for (let i = 0; i < times.length && result.length < 6; i += 1) {
    const t = new Date(times[i]);
    if (t < now) continue;

    const hourLabel = t.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    });
    result.push({
      hourLabel,
      temp: typeof temps[i] === "number" ? `${temps[i].toFixed(1)}°C` : "-",
      precip: typeof precip[i] === "number" ? `${precip[i].toFixed(0)}%` : "-",
      uv: typeof uv[i] === "number" ? uv[i].toFixed(1) : "-",
    });
  }

  if (result.length === 0) {
    container.innerHTML = "<p>예보 데이터를 불러오지 못했습니다.</p>";
    return;
  }

  container.innerHTML = result
    .map(
      (item) => `
      <article class="hourly-item">
        <strong>${item.hourLabel}</strong>
        <span>기온 ${item.temp}</span>
        <span>강수 ${item.precip}</span>
        <span>UV ${item.uv}</span>
      </article>
    `
    )
    .join("");
}

function initMap() {
  const mapElement = document.getElementById("city-map");
  if (!mapElement || !window.L) return;

  const map = L.map(mapElement, {
    zoomControl: false,
    attributionControl: true,
  }).setView([goyang.lat, goyang.lon], 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const points = [
    { name: "고양시청", lat: 37.6584, lon: 126.832 },
    { name: "덕양구", lat: 37.6396, lon: 126.8322 },
    { name: "일산동구", lat: 37.6583, lon: 126.7799 },
    { name: "일산서구", lat: 37.6776, lon: 126.7452 },
  ];

  points.forEach((point) => {
    L.marker([point.lat, point.lon]).addTo(map).bindPopup(point.name);
  });
}

renderSources();
fetchWeatherAndAir();
initMap();
