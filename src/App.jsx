import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bell,
  CalendarRange,
  ChevronDown,
  Compass,
  ExternalLink,
  FileText,
  Info,
  LoaderCircle,
  LocateFixed,
  Map,
  MapPin,
  Megaphone,
  Radar,
  RotateCcw,
  ShieldAlert,
  UserRound,
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

function getSourceBadgeClasses(notice) {
  if (notice.isMock) {
    return 'bg-[#ffdcc0] text-[#6b3b00]';
  }

  if (notice.source === 'seoul-open-api') {
    return 'bg-[#c1e0ff] text-[#004b73]';
  }

  return 'bg-[#e0e3e5] text-[#3f4850]';
}

function NoticeCard({ notice }) {
  return (
    <article className="feed-card group">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${getSourceBadgeClasses(notice)}`}>
            {notice.sourceLabel}
          </span>
          <span className="rounded-full bg-[#f2f4f6] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#43617c]">
            {notice.type}
          </span>
        </div>
        <MapPin className="h-4 w-4 text-[#006194]" />
      </div>

      <h3 className="mt-4 text-lg font-bold leading-tight text-[#191c1e]">
        {notice.title}
      </h3>

      <div className="mt-5 grid gap-3 text-sm text-[#3f4850] sm:grid-cols-2">
        <div className="rounded-xl bg-[#f7f9fb] px-4 py-3">
          <div className="flex items-center gap-2 text-[#006194]">
            <CalendarRange className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]">기간</span>
          </div>
          <p className="mt-2 leading-6">{notice.period}</p>
        </div>
        <div className="rounded-xl bg-[#f7f9fb] px-4 py-3">
          <div className="flex items-center gap-2 text-[#006194]">
            <Map className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]">지역</span>
          </div>
          <p className="mt-2 leading-6">{notice.regionLabel}</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-7 text-[#3f4850]">
        {notice.excerpt}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-[#f2f4f6] px-3 py-2 font-medium text-[#3f4850]">
          {notice.department}
        </span>
        <a
          href={notice.link}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-2 font-bold text-[#006194] transition group-hover:gap-3"
        >
          원문 링크
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </article>
  );
}

function FeaturedNotice({ notice }) {
  if (!notice) {
    return (
      <article className="rounded-[24px] bg-white p-8 shadow-sm">
        <div className="space-y-4">
          <span className="section-pill">데이터 없음</span>
          <h2 className="text-2xl font-extrabold leading-tight text-[#191c1e]">
            표시할 공고가 아직 없습니다.
          </h2>
          <p className="text-sm leading-7 text-[#3f4850]">
            위치를 감지하거나 지역을 선택하면 해당 시군구 기준으로 공고를 정리해 보여줍니다.
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-[24px] bg-white p-8 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#006194]">
            {notice.sourceLabel}
          </span>
          <h2 className="max-w-2xl text-2xl font-extrabold leading-tight text-[#191c1e]">
            {notice.title}
          </h2>
        </div>
        <span className={`rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${getSourceBadgeClasses(notice)}`}>
          {notice.isMock ? 'Mock Data' : 'Live Feed'}
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-wrap items-center gap-5 text-[#3f4850]">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]">기간</span>
            <span className="mt-1 text-sm font-medium">{notice.period}</span>
          </div>
          <div className="h-8 w-px bg-[#dfe4ea]" />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]">지역</span>
            <span className="mt-1 text-sm font-medium">{notice.regionLabel}</span>
          </div>
        </div>

        <a
          href={notice.link}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-2 font-bold text-[#006194] transition hover:gap-3"
        >
          View Details
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </article>
  );
}

function MetricCard({ icon: Icon, label, value, accent = 'bg-[#ffffff]' }) {
  return (
    <div className={`rounded-[20px] p-6 shadow-sm ${accent}`}>
      <div className="flex items-center gap-3 text-[#006194]">
        <Icon className="h-5 w-5" />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="mt-4 text-2xl font-extrabold text-[#191c1e]">{value}</p>
    </div>
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

  const featuredNotice = filteredNotices[0] || null;
  const spotlightNotices = filteredNotices.slice(1, 4);
  const seoulNoticeCount = notices.filter((notice) => notice.source === 'seoul-open-api').length;
  const mockNoticeCount = notices.filter((notice) => notice.isMock).length;

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
    <div className="min-h-screen bg-[#f7f9fb] text-[#191c1e]">
      <nav className="top-app-bar">
        <div className="mx-auto flex h-20 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-8">
          <div className="flex items-center gap-8">
            <button
              type="button"
              onClick={handleReset}
              className="brand-button"
              aria-label="공람콕 홈으로 초기화"
            >
              <span className="brand-symbol">
                <Radar className="h-5 w-5" />
              </span>
              <span className="text-left">
                <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-[#006194]">
                  Your Civic Feed
                </span>
                <span className="block text-2xl font-extrabold tracking-tight text-[#191c1e]">공람콕</span>
              </span>
            </button>

            <div className="hidden items-center gap-6 md:flex">
              <a className="nav-tab nav-tab-active" href="#notice-list">Map Explorer</a>
              <a className="nav-tab" href="#notice-list">Local Notices</a>
              <a className="nav-tab" href="#overview-grid">Regional Alerts</a>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" className="icon-shell" aria-label="알림">
              <Bell className="h-5 w-5" />
            </button>
            <button type="button" className="icon-shell" onClick={handleDetectLocation} aria-label="현재 위치 감지">
              {isDetecting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
            </button>
            <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-[#c1e0ff] text-[#45647f] sm:flex">
              <UserRound className="h-4 w-4" />
            </div>
          </div>
        </div>
      </nav>

      <aside className="left-rail">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-[#006194]">Your Civic Feed</p>
          <p className="mt-1 text-xs text-[#3f4850]">
            {selectedRegion ? formatRegionLabel(selectedRegion) : 'Based on Current Location'}
          </p>
        </div>

        <nav className="flex flex-col gap-1">
          <a className="rail-link rail-link-active" href="#hero">
            <Map className="h-4 w-4" />
            <span>Map Explorer</span>
          </a>
          <a className="rail-link" href="#notice-list">
            <FileText className="h-4 w-4" />
            <span>Local Notices</span>
          </a>
          <a className="rail-link" href="#overview-grid">
            <Megaphone className="h-4 w-4" />
            <span>Regional Alerts</span>
          </a>
          <button
            id="toggle-region-picker"
            type="button"
            className="rail-link text-left"
            onClick={() => setIsPickerOpen((value) => !value)}
            aria-expanded={isPickerOpen}
            aria-controls="region-picker"
          >
            <Info className="h-4 w-4" />
            <span>Filters</span>
            <ChevronDown className={`ml-auto h-4 w-4 transition ${isPickerOpen ? 'rotate-180' : ''}`} />
          </button>
        </nav>

        <button
          type="button"
          onClick={handleDetectLocation}
          className="hero-button mt-auto w-full justify-center"
          id="detect-location"
        >
          {isDetecting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          Update Location
        </button>
      </aside>

      <main className="pb-28 pt-24 lg:ml-72 lg:pb-12">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-8">
          <section id="hero" className="relative overflow-hidden rounded-[28px] bg-[#e8f3ff] shadow-sm">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(0,97,148,0.18),_transparent_32%),linear-gradient(135deg,_rgba(0,97,148,0.92),_rgba(0,123,185,0.72))]" />
            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.22)_1px,transparent_1px)] [background-size:36px_36px]" />

            <div className="relative flex min-h-[420px] items-center justify-center px-4 py-10 sm:px-10">
              <div className="max-w-xl rounded-[28px] bg-white/90 p-8 text-center shadow-2xl backdrop-blur-xl sm:p-10">
                <span className="inline-flex rounded-full bg-[#c1e0ff] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#004b73]">
                  Live Discovery
                </span>
                <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-[#191c1e] sm:text-5xl">
                  내 주변 공람과 공고를 한 번에 찾습니다.
                </h1>
                <p className="mt-4 text-lg leading-8 text-[#3f4850]">
                  서울시 실데이터와 전국 토지이음 흐름을 현재 위치 또는 직접 선택한 시군구 기준으로 정리합니다.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <button type="button" onClick={handleDetectLocation} className="hero-button">
                    {isDetecting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Compass className="h-5 w-5" />}
                    Detect My Location
                  </button>
                  <button type="button" onClick={handleReset} className="hero-button-secondary">
                    <RotateCcw className="h-4 w-4" />
                    Reset Feed
                  </button>
                </div>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <span className="status-chip">{selectedRegion ? formatRegionLabel(selectedRegion) : '메인 홈 화면'}</span>
                  <span className="status-chip">{updatedAt ? `업데이트 ${updatedAt}` : '업데이트 대기 중'}</span>
                </div>
              </div>
            </div>
          </section>

          <section id="overview-grid" className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <div className="md:col-span-8">
              <FeaturedNotice notice={featuredNotice} />
            </div>

            <article className="md:col-span-4 rounded-[24px] bg-[#894d00] p-8 text-white shadow-sm">
              <div className="space-y-4">
                <ShieldAlert className="h-8 w-8 text-[#ffdcc0]" />
                <h3 className="text-xl font-bold leading-tight">
                  {error ? '지역 확인이 필요합니다.' : selectedRegion ? '선택 지역 기준으로 필터 적용 중' : '위치 감지 또는 지역 선택 필요'}
                </h3>
              </div>
              <div className="pt-6">
                <p className="mb-4 text-sm leading-7 text-[#ffdcc0]">
                  {error || locationMessage}
                </p>
                <button type="button" onClick={() => setIsPickerOpen((value) => !value)} className="text-sm font-bold underline underline-offset-4">
                  필터 열기
                </button>
              </div>
            </article>

            <aside className="md:col-span-4 rounded-[24px] bg-[#e6e8ea] p-6 text-center shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#3f4850]">Live Sources</span>
              <div className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
                <Radar className="h-7 w-7 text-[#006194]" />
              </div>
              <h4 className="mt-4 text-sm font-bold text-[#191c1e]">서울 실데이터 + 전국 목업</h4>
              <p className="mt-2 text-xs leading-6 text-[#3f4850]">
                서울은 Open API, 전국은 토지이음 수집 구조와 목업 데이터로 이어집니다.
              </p>
              <button type="button" onClick={handleReset} className="mt-5 rounded-xl border border-[#006194]/20 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#006194] transition hover:bg-[#006194]/5">
                Home Reset
              </button>
            </aside>

            <article className="md:col-span-4 rounded-[24px] bg-white p-8 shadow-sm">
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#3f4850]">지역 상태</span>
                <h2 className="text-xl font-bold leading-tight text-[#191c1e]">
                  {selectedRegion ? formatRegionLabel(selectedRegion) : '위치를 확인해 지역 피드를 활성화하세요'}
                </h2>
              </div>
              <p className="mt-4 text-sm leading-7 text-[#3f4850]">{locationResolution}</p>
              <div className="mt-8 border-t border-[#e0e3e5] pt-6">
                <button type="button" onClick={handleDetectLocation} className="inline-flex items-center gap-2 text-sm font-bold text-[#006194]">
                  위치 다시 확인
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </article>

            <section
              id="region-picker"
              className={`md:col-span-4 rounded-[24px] bg-white p-8 shadow-sm ${isPickerOpen ? 'block' : 'hidden md:block'}`}
            >
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#3f4850]">Filters</span>
                <h2 className="text-xl font-bold leading-tight text-[#191c1e]">시도와 시군구를 직접 선택</h2>
              </div>
              <form onSubmit={handleRegionSubmit} className="mt-5 space-y-4">
                <label className="block text-sm font-medium text-[#3f4850]">
                  <span className="mb-2 block">시도</span>
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

                <label className="block text-sm font-medium text-[#3f4850]">
                  <span className="mb-2 block">시군구</span>
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

                <button type="submit" className="hero-button w-full justify-center">
                  선택 지역 적용
                </button>
              </form>
            </section>

            <article className="md:col-span-4 rounded-[24px] bg-white p-8 shadow-sm">
              <div className="space-y-4">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#3f4850]">Feed Metrics</span>
                <MetricCard icon={Map} label="서울 실데이터" value={`${seoulNoticeCount}건`} accent="bg-[#f7f9fb]" />
                <MetricCard icon={Megaphone} label="전국 목업" value={`${mockNoticeCount}건`} accent="bg-[#f7f9fb]" />
              </div>
            </article>
          </section>

          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-[#006194]">Spotlight</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#191c1e]">상단 주요 공고</h2>
              </div>
              <div className="rounded-full bg-white px-4 py-2 text-sm font-medium text-[#3f4850] shadow-sm">
                총 {filteredNotices.length}건
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {spotlightNotices.length ? (
                spotlightNotices.map((notice) => <NoticeCard key={`spotlight-${notice.id}`} notice={notice} />)
              ) : (
                <div className="md:col-span-3 rounded-[24px] bg-white p-8 text-sm leading-7 text-[#3f4850] shadow-sm">
                  선택한 지역에 표시할 추가 공고가 없습니다.
                </div>
              )}
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-[#006194]">Local Notices</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#191c1e]">전체 공고 목록</h2>
                <p className="mt-2 text-sm leading-7 text-[#3f4850]">
                  {selectedRegion
                    ? `${formatRegionLabel(selectedRegion)} 기준 공고 목록입니다.`
                    : '홈 화면에서는 서울 최신 공고와 전국 목업 샘플을 함께 보여줍니다.'}
                </p>
              </div>
            </div>

            {error ? (
              <div className="rounded-[20px] bg-[#ffdad6] px-5 py-4 text-sm text-[#93000a] shadow-sm">
                {error}
              </div>
            ) : null}

            <div id="notice-list" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {isLoading ? (
                <div className="lg:col-span-2 rounded-[24px] bg-white px-6 py-16 text-center shadow-sm">
                  <div className="inline-flex items-center gap-3 text-[#3f4850]">
                    <LoaderCircle className="h-5 w-5 animate-spin text-[#006194]" />
                    데이터를 불러오는 중입니다.
                  </div>
                </div>
              ) : filteredNotices.length ? (
                filteredNotices.map((notice) => <NoticeCard key={notice.id} notice={notice} />)
              ) : (
                <div className="lg:col-span-2 rounded-[24px] bg-white px-6 py-16 text-center text-[#3f4850] shadow-sm">
                  선택한 지역에 연결된 공고가 없습니다. 로고를 눌러 홈으로 돌아가거나 다른 시군구를 선택하세요.
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="mt-auto border-t border-[#e0e3e5] bg-[#f2f4f6] px-6 py-10 md:px-8 lg:ml-72">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex flex-col gap-2">
            <span className="font-bold text-[#191c1e]">공람콕</span>
            <p className="text-xs text-[#3f4850]">© 2026 공람콕. 서울 Open API와 토지이음 흐름을 정리하는 로컬 피드.</p>
          </div>
          <div className="flex flex-wrap gap-6 text-xs text-[#3f4850]">
            <a href="#hero" className="transition hover:text-[#006194]">홈</a>
            <a href="#notice-list" className="transition hover:text-[#006194]">공고</a>
            <a href="#region-picker" className="transition hover:text-[#006194]">필터</a>
            <a href="#overview-grid" className="transition hover:text-[#006194]">정보</a>
          </div>
        </div>
      </footer>

      <nav className="mobile-nav md:hidden">
        <a href="#hero" className="mobile-nav-item mobile-nav-item-active">
          <Map className="h-5 w-5" />
          <span>Explore</span>
        </a>
        <a href="#notice-list" className="mobile-nav-item">
          <FileText className="h-5 w-5" />
          <span>Notices</span>
        </a>
        <button type="button" className="mobile-nav-center" onClick={handleDetectLocation}>
          {isDetecting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
        </button>
        <a href="#overview-grid" className="mobile-nav-item">
          <Megaphone className="h-5 w-5" />
          <span>Alerts</span>
        </a>
        <button type="button" className="mobile-nav-item" onClick={handleReset}>
          <RotateCcw className="h-5 w-5" />
          <span>Reset</span>
        </button>
      </nav>
    </div>
  );
}
