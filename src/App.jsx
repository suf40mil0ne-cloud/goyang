import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarRange,
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Radar,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { getNationalMockNotices } from './lib/national-notices';
import { formatRegionLabel, getDistrictsForSido, getRegions, matchRegionFromAddress } from './lib/region-utils';
import { fetchSeoulUrbanPlanningNotices } from './lib/seoul-api';

const regions = getRegions();
const initialSido = regions[0]?.name || '';

function getInitialRegion() {
  const firstDistrict = getDistrictsForSido(initialSido)[0];
  return firstDistrict ? { sido: initialSido, sigungu: firstDistrict.sigungu } : null;
}

async function reverseGeocode(coords) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(coords.lat));
  url.searchParams.set('lon', String(coords.lng));
  url.searchParams.set('accept-language', 'ko');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('reverse-geocode-failed');
  }

  const payload = await response.json();
  return payload.address || {};
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('unsupported-geolocation'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      reject,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  });
}

function NoticeCard({ notice }) {
  return (
    <article className="group rounded-[28px] border border-white/12 bg-white/6 p-5 shadow-[0_24px_70px_rgba(3,10,30,0.45)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/50 hover:bg-white/8">
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-cyan-200/80">
        <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1">
          {notice.sourceLabel}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
          {notice.type}
        </span>
        {notice.isMock ? (
          <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-400/10 px-3 py-1 text-fuchsia-100">
            Mock
          </span>
        ) : null}
      </div>

      <h3 className="mt-4 text-lg font-semibold leading-snug text-white">
        {notice.title}
      </h3>

      <div className="mt-4 grid gap-3 text-sm text-slate-200/80 sm:grid-cols-2">
        <div className="glass-fact">
          <CalendarRange className="h-4 w-4 text-cyan-300" />
          <span>{notice.period}</span>
        </div>
        <div className="glass-fact">
          <MapPin className="h-4 w-4 text-cyan-300" />
          <span>{notice.regionLabel}</span>
        </div>
        <div className="glass-fact">
          <Building2 className="h-4 w-4 text-cyan-300" />
          <span>{notice.department}</span>
        </div>
        <div className="glass-fact">
          <Sparkles className="h-4 w-4 text-cyan-300" />
          <span>{notice.place}</span>
        </div>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-300/88">
        {notice.excerpt}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <a
          href={notice.link}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-400/12 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/18"
        >
          원문 링크
          <ExternalLink className="h-4 w-4" />
        </a>
        {notice.attachments?.length > 1 ? (
          <span className="text-xs text-slate-400">
            첨부 {notice.attachments.length}건
          </span>
        ) : null}
      </div>
    </article>
  );
}

export default function App() {
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedSido, setSelectedSido] = useState(initialSido);
  const [selectedSigungu, setSelectedSigungu] = useState(getInitialRegion()?.sigungu || '');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [locationMessage, setLocationMessage] = useState('현재 위치를 확인하지 못했습니다. 위치를 허용하거나 지역을 선택해주세요.');
  const [locationResolution, setLocationResolution] = useState('위치 확인 대기 중');
  const [notices, setNotices] = useState([]);
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    let ignore = false;

    async function loadNotices() {
      setIsLoading(true);
      setError('');

      try {
        const [seoulNotices, nationalNotices] = await Promise.all([
          fetchSeoulUrbanPlanningNotices(),
          Promise.resolve(getNationalMockNotices()),
        ]);

        if (ignore) return;

        const merged = [...seoulNotices, ...nationalNotices].sort((a, b) =>
          String(b.period).localeCompare(String(a.period), 'ko')
        );

        setNotices(merged);
        setUpdatedAt(new Date().toLocaleString('ko-KR'));
      } catch (loadError) {
        if (ignore) return;
        setError('서울시 Open API 호출에 실패했습니다. 잠시 후 다시 시도해주세요.');
        setNotices(getNationalMockNotices());
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadNotices();
    return () => {
      ignore = true;
    };
  }, [selectedRegion?.sido, selectedRegion?.sigungu]);

  const filteredNotices = useMemo(() => {
    if (!selectedRegion) {
      return notices.slice(0, 8);
    }

    return notices.filter((notice) =>
      notice.sido === selectedRegion.sido && notice.sigungu === selectedRegion.sigungu
    );
  }, [notices, selectedRegion]);

  const districtOptions = useMemo(
    () => getDistrictsForSido(selectedSido),
    [selectedSido]
  );

  function applyRegion(region, resolutionText) {
    setSelectedRegion(region);
    setSelectedSido(region.sido);
    setSelectedSigungu(region.sigungu);
    setLocationResolution(resolutionText);
    setLocationMessage(`${formatRegionLabel(region)} 기준으로 공고를 필터링했습니다.`);
  }

  function handleReset() {
    setSelectedRegion(null);
    setSelectedSido(initialSido);
    setSelectedSigungu(getInitialRegion()?.sigungu || '');
    setIsPickerOpen(false);
    setLocationResolution('위치 확인 대기 중');
    setLocationMessage('현재 위치를 확인하지 못했습니다. 위치를 허용하거나 지역을 선택해주세요.');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDetectLocation() {
    setIsDetecting(true);
    setError('');

    try {
      const coords = await getCurrentPosition();
      const address = await reverseGeocode({ lat: coords.latitude, lon: coords.longitude });
      const region = matchRegionFromAddress(address);

      if (!region) {
        throw new Error('region-match-failed');
      }

      applyRegion(region, 'GPS + 역지오코딩으로 시군구 확인');
    } catch (detectError) {
      setError('현재 위치에서 시군구를 판별하지 못했습니다. 지역 직접 선택을 사용해주세요.');
    } finally {
      setIsDetecting(false);
    }
  }

  function handleRegionSubmit(event) {
    event.preventDefault();
    applyRegion(
      {
        sido: selectedSido,
        sigungu: selectedSigungu,
      },
      '지역 직접 선택으로 시군구 확인'
    );
  }

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.2),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(99,102,241,0.16),_transparent_26%),radial-gradient(circle_at_bottom,_rgba(34,211,238,0.08),_transparent_38%)]" />
        <div className="absolute left-1/2 top-24 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-400/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <header className="topbar">
          <button
            type="button"
            onClick={handleReset}
            className="brand-link"
            aria-label="공람콕 홈으로 초기화"
          >
            <span className="brand-mark">
              <Radar className="h-6 w-6 text-cyan-200" />
            </span>
            <span>
              <span className="brand-sub">SEOUL OPEN API + EUM</span>
              <span className="brand-title">공람콕</span>
            </span>
          </button>

          <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-200/80">
            <a className="nav-pill" href="#notice-list">공고 리스트</a>
            <a className="nav-pill" href="#region-picker">지역 선택</a>
            <button type="button" className="nav-pill" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
              초기화
            </button>
          </nav>
        </header>

        <main className="mt-6 grid gap-6">
          <section className="glass-panel overflow-hidden rounded-[36px] p-6 sm:p-8">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
              <div className="space-y-6">
                <p className="kicker">위치 기반 도시계획 공고 탐색</p>
                <div className="space-y-4">
                  <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.03em] text-white sm:text-5xl">
                    서울시 최신 도시계획 공고와 전국 토지이음 흐름을 한 화면에서 확인합니다.
                  </h1>
                  <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                    서울 지역은 실제 서울시 Open API XML 응답을 브라우저에서 JSON으로 변환해 카드로 렌더링하고,
                    전국 지역은 토지이음 수집 구조와 목업 데이터를 함께 제공하는 데모입니다.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    id="detect-location"
                    type="button"
                    onClick={handleDetectLocation}
                    className="primary-cta"
                    disabled={isDetecting}
                  >
                    {isDetecting ? (
                      <LoaderCircle className="h-5 w-5 animate-spin" />
                    ) : (
                      <LocateFixed className="h-5 w-5" />
                    )}
                    detect-location
                  </button>
                  <button
                    id="toggle-region-picker"
                    type="button"
                    className="secondary-cta"
                    onClick={() => setIsPickerOpen((value) => !value)}
                    aria-expanded={isPickerOpen}
                    aria-controls="region-picker"
                  >
                    지역 직접 선택
                    <ChevronDown className={`h-4 w-4 transition ${isPickerOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 text-sm text-slate-300/80">
                  <span className="info-chip">React 19</span>
                  <span className="info-chip">Vite</span>
                  <span className="info-chip">Tailwind CSS 4</span>
                  <span className="info-chip">Lucide-react</span>
                </div>
              </div>

              <aside className="glass-panel rounded-[30px] border border-cyan-300/20 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-cyan-200/75">위치 확인 결과</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">
                      {selectedRegion ? formatRegionLabel(selectedRegion) : '메인 홈 화면'}
                    </h2>
                  </div>
                  <span className="rounded-full border border-cyan-300/25 bg-cyan-400/12 px-3 py-1 text-xs text-cyan-100">
                    {selectedRegion ? '필터 적용됨' : '대기 중'}
                  </span>
                </div>

                <div className="mt-5 space-y-4 text-sm leading-6 text-slate-300">
                  <div className="glass-fact">
                    <MapPin className="h-4 w-4 text-cyan-300" />
                    <span>{locationMessage}</span>
                  </div>
                  <div className="glass-fact">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                    <span>{locationResolution}</span>
                  </div>
                  <div className="glass-fact">
                    <CalendarRange className="h-4 w-4 text-cyan-300" />
                    <span>{updatedAt ? `마지막 동기화: ${updatedAt}` : '마지막 동기화 대기 중'}</span>
                  </div>
                </div>

                <div className="mt-6 rounded-[24px] border border-fuchsia-300/18 bg-fuchsia-400/8 p-4 text-sm leading-6 text-slate-200/88">
                  서울 데이터는 서울시 Open API 실응답을 파싱합니다. 서울 외 지역은 토지이음 실수집 전 단계라서
                  현재는 목업 데이터와 수집기 구조를 함께 제공합니다.
                </div>
              </aside>
            </div>
          </section>

          <section
            id="region-picker"
            className={`glass-panel rounded-[32px] p-6 transition ${isPickerOpen ? 'block' : 'hidden'}`}
          >
            <div className="flex flex-col gap-2">
              <p className="kicker">지역 직접 선택</p>
              <h2 className="text-2xl font-semibold text-white">시도와 시군구를 선택해 즉시 필터링</h2>
              <p className="text-sm leading-6 text-slate-300">
                앱 실행 시와 지역이 바뀔 때마다 서울시 Open API를 재호출하고, 선택한 시군구 기준으로 `#notice-list`를 갱신합니다.
              </p>
            </div>

            <form onSubmit={handleRegionSubmit} className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
              <label className="space-y-2 text-sm text-slate-200">
                <span>시도</span>
                <select
                  value={selectedSido}
                  onChange={(event) => {
                    const nextSido = event.target.value;
                    const nextDistrict = getDistrictsForSido(nextSido)[0]?.sigungu || '';
                    setSelectedSido(nextSido);
                    setSelectedSigungu(nextDistrict);
                  }}
                  className="form-select"
                >
                  {regions.map((region) => (
                    <option key={region.name} value={region.name}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm text-slate-200">
                <span>시군구</span>
                <select
                  value={selectedSigungu}
                  onChange={(event) => setSelectedSigungu(event.target.value)}
                  className="form-select"
                >
                  {districtOptions.map((district) => (
                    <option key={district.sigungu} value={district.sigungu}>
                      {district.sigungu}
                    </option>
                  ))}
                </select>
              </label>

              <button type="submit" className="primary-cta self-end md:min-w-40">
                선택 지역 적용
              </button>
            </form>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_340px]">
            <div className="glass-panel rounded-[32px] p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="kicker">Notice Feed</p>
                  <h2 className="text-2xl font-semibold text-white">내 지역 진행 중 공고</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {selectedRegion
                      ? `${formatRegionLabel(selectedRegion)} 기준으로 필터링된 공고입니다.`
                      : '메인 홈 화면에서는 최신 서울 공고와 전국 목업 샘플을 함께 보여줍니다.'}
                  </p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
                  총 {filteredNotices.length}건
                </div>
              </div>

              {error ? (
                <div className="mt-5 rounded-[24px] border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">
                  {error}
                </div>
              ) : null}

              <div id="notice-list" className="mt-6 grid gap-4 md:grid-cols-2">
                {isLoading ? (
                  <div className="col-span-full flex min-h-60 items-center justify-center rounded-[28px] border border-white/10 bg-white/5">
                    <div className="flex items-center gap-3 text-slate-300">
                      <LoaderCircle className="h-5 w-5 animate-spin text-cyan-300" />
                      데이터를 불러오는 중입니다.
                    </div>
                  </div>
                ) : filteredNotices.length ? (
                  filteredNotices.map((notice) => <NoticeCard key={notice.id} notice={notice} />)
                ) : (
                  <div className="col-span-full rounded-[28px] border border-white/10 bg-white/5 p-8 text-center text-slate-300">
                    선택한 지역에 연결된 공고가 없습니다. 로고를 클릭해 홈으로 초기화하거나 다른 시군구를 선택하세요.
                  </div>
                )}
              </div>
            </div>

            <aside className="grid gap-6">
              <section className="glass-panel rounded-[32px] p-6">
                <p className="kicker">Data Sources</p>
                <h2 className="text-2xl font-semibold text-white">연동 상태</h2>
                <div className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
                  <div className="rounded-[24px] border border-cyan-300/20 bg-cyan-400/10 p-4">
                    <p className="font-medium text-cyan-100">서울시 Open API</p>
                    <p className="mt-2">`TbWcmBoardB0414` XML 응답을 브라우저에서 JSON 객체로 변환해 카드 목록에 반영합니다.</p>
                  </div>
                  <div className="rounded-[24px] border border-fuchsia-300/20 bg-fuchsia-400/10 p-4">
                    <p className="font-medium text-fuchsia-100">토지이음 전국 데이터</p>
                    <p className="mt-2">실데이터가 없을 때는 목업을 쓰고, 백엔드 수집 스크립트 구조는 `scripts/collect-eum-notices.mjs`에 분리합니다.</p>
                  </div>
                </div>
              </section>

              <section className="glass-panel rounded-[32px] p-6">
                <p className="kicker">UX Rules</p>
                <h2 className="text-2xl font-semibold text-white">필수 동작</h2>
                <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
                  <li>상단 공람콕 로고 클릭 시 검색 결과, 선택 지역, 상태 메시지를 모두 초기화합니다.</li>
                  <li>`detect-location` 버튼은 GPS와 역지오코딩으로 시군구를 추론합니다.</li>
                  <li>반응형 카드 레이아웃으로 모바일에서도 1열, 데스크톱에서는 2열 이상으로 확장됩니다.</li>
                </ul>
              </section>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}
