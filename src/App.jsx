import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarRange,
  ChevronDown,
  Compass,
  FileText,
  Info,
  LoaderCircle,
  LocateFixed,
  Map,
  Megaphone,
  Radar,
  RotateCcw,
  UserRound,
} from 'lucide-react';
import regionAdjacency from '../data/region-adjacency.json';
import { findSigunguCodeByRegion, getRegionLabelBySigunguCode } from '../shared/region-codes';
import { fetchHearings, filterAndSortHearings } from './lib/hearings-client';
import { formatRegionLabel, getDistrictsForSido, getRegions, matchRegionFromAddress } from './lib/region-utils';

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

function describeLocationError(error) {
  const code = typeof error?.code === 'number' ? error.code : null;
  const message = String(error?.message || '');

  if (message === 'unsupported-geolocation') {
    return {
      stage: 'geolocation',
      resolution: '브라우저 위치 기능 미지원',
      message: '이 브라우저에서는 위치 기능을 지원하지 않습니다. 지역 직접 선택을 사용해주세요.',
    };
  }

  if (message === 'reverse-geocode-failed') {
    return {
      stage: 'reverse-geocode',
      resolution: '주소 변환 실패',
      message: '좌표는 확인했지만 주소 변환에 실패했습니다. 잠시 후 다시 시도하거나 지역을 직접 선택해주세요.',
    };
  }

  if (message === 'region-match-failed') {
    return {
      stage: 'region-match',
      resolution: '시군구 매칭 실패',
      message: '현재 위치 주소를 찾았지만 서비스 지역과 정확히 연결하지 못했습니다. 지역 직접 선택을 사용해주세요.',
    };
  }

  if (code === 1) {
    return {
      stage: 'geolocation',
      resolution: '위치 권한 거부',
      message: '브라우저 위치 권한이 거부되었습니다. 권한을 허용하거나 지역을 직접 선택해주세요.',
    };
  }

  if (code === 2) {
    return {
      stage: 'geolocation',
      resolution: '위치 정보 확인 실패',
      message: '기기에서 현재 위치 좌표를 가져오지 못했습니다. GPS 또는 네트워크 상태를 확인해주세요.',
    };
  }

  if (code === 3) {
    return {
      stage: 'geolocation',
      resolution: '위치 확인 시간 초과',
      message: '현재 위치 확인 시간이 초과되었습니다. 잠시 후 다시 시도하거나 지역을 직접 선택해주세요.',
    };
  }

  return {
    stage: 'unknown',
    resolution: '위치 자동 확인 실패',
    message: '현재 위치를 확인하지 못했습니다. 잠시 후 다시 시도하거나 지역을 직접 선택해주세요.',
  };
}

function getStatusMeta(status) {
  switch (status) {
    case 'open':
      return { label: '공개중', classes: 'bg-[#c1e0ff] text-[#004b73]' };
    case 'unknown':
      return { label: '확인필요', classes: 'bg-[#ffdcc0] text-[#6b3b00]' };
    default:
      return { label: '종료', classes: 'bg-[#e0e3e5] text-[#3f4850]' };
  }
}

function formatPeriod(notice) {
  const start = notice.hearingStartDate || '';
  const end = notice.hearingEndDate || '';

  if (start || end) {
    return `${start || '-'} ~ ${end || '-'}`;
  }

  return notice.publishedAt || '-';
}

function buildNoticeSummary(notice) {
  const summary = String(notice.summary || '').replace(/\s+/g, ' ').trim();
  const body = String(notice.body || '').replace(/\s+/g, ' ').trim();
  const title = String(notice.title || '').trim();

  if (summary) {
    return summary.length > 120 ? `${summary.slice(0, 120).trim()}...` : summary;
  }

  if (!body) {
    return title ? `${title} 관련 공고입니다.` : '공고 요약 정보가 제공되지 않았습니다.';
  }

  const firstSentence = body.split(/[.!?。]\s|[\n\r]/).find(Boolean)?.trim() || body;
  const cleaned = firstSentence.startsWith(title)
    ? firstSentence.replace(title, '').trim()
    : firstSentence;
  const resolved = cleaned || firstSentence;

  return resolved.length > 120 ? `${resolved.slice(0, 120).trim()}...` : resolved;
}

function getNoticeRegionText(notice) {
  return [notice.region, notice.agency, notice.department, notice.title, notice.summary, notice.body]
    .filter(Boolean)
    .join(' ');
}

function matchesRegion(notice, region, sigunguCode) {
  if (!region) {
    return false;
  }

  if (sigunguCode) {
    return notice.sigunguCode === sigunguCode;
  }

  return getNoticeRegionText(notice).includes(region.sigungu);
}

function matchesSido(notice, sido, sigunguCode) {
  if (!sido) {
    return false;
  }

  if (sigunguCode && notice.sigunguCode?.startsWith(sigunguCode.slice(0, 2))) {
    return true;
  }

  return getNoticeRegionText(notice).includes(sido);
}

function NoticeSummaryCard({ notice, emphasized = false }) {
  const statusMeta = getStatusMeta(notice.status);
  const summary = buildNoticeSummary(notice);
  const attachmentLabel = notice.attachments?.length
    ? notice.attachments.length === 1
      ? notice.attachments[0].name
      : `첨부 ${notice.attachments.length}건`
    : notice.agency || notice.sourceLabel;
  const regionLabel = notice.region || notice.agency || notice.sigunguCode || '지역 정보 없음';

  return (
    <article className={`feed-card ${emphasized ? 'border border-[#c1e0ff]' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#f2f4f6] px-3 py-1 text-[11px] font-bold text-[#43617c]">
            {regionLabel}
          </span>
          <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${statusMeta.classes}`}>
            {statusMeta.label}
          </span>
        </div>
        <span className="text-xs text-[#3f4850]">{notice.publishedAt || formatPeriod(notice)}</span>
      </div>

      <h3 className="mt-4 text-lg font-bold leading-tight text-[#191c1e]">
        {notice.title || '공고 제목 없음'}
      </h3>

      <p className="mt-3 text-sm leading-7 text-[#3f4850]">
        {summary}
      </p>

      <div className="mt-5 grid gap-3 text-sm text-[#3f4850] sm:grid-cols-2">
        <div className="rounded-xl bg-[#f7f9fb] px-4 py-3">
          <div className="flex items-center gap-2 text-[#006194]">
            <CalendarRange className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]">공고일/기간</span>
          </div>
          <p className="mt-2 leading-6">{formatPeriod(notice)}</p>
        </div>
        <div className="rounded-xl bg-[#f7f9fb] px-4 py-3">
          <div className="flex items-center gap-2 text-[#006194]">
            <FileText className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]">공고번호</span>
          </div>
          <p className="mt-2 leading-6">{notice.noticeNumber || notice.seq || '공고번호 없음'}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#3f4850]">
          <span className="rounded-full bg-[#f2f4f6] px-3 py-2">출처: {notice.sourceLabel}</span>
          <span className="rounded-full bg-[#f2f4f6] px-3 py-2">{attachmentLabel}</span>
        </div>
        {notice.link ? (
          <a
            href={notice.link}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-[#bfc7d2] px-4 py-2 text-sm font-semibold text-[#3f4850] transition hover:border-[#006194] hover:text-[#006194]"
          >
            원문 보기
          </a>
        ) : (
          <button
            type="button"
            className="rounded-xl border border-[#bfc7d2] px-4 py-2 text-sm font-semibold text-[#3f4850] opacity-70"
            disabled
            title="원문 링크 정보가 제공되지 않았습니다."
          >
            원문 보기
          </button>
        )}
      </div>
    </article>
  );
}

function MetricCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-[20px] bg-[#f7f9fb] p-6 shadow-sm">
      <div className="flex items-center gap-3 text-[#006194]">
        <Icon className="h-5 w-5" />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="mt-4 text-2xl font-extrabold text-[#191c1e]">{value}</p>
    </div>
  );
}

export default function App() {
  const hasRequestedInitialLocation = useRef(false);
  const regionPickerRef = useRef(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedSido, setSelectedSido] = useState(initialSido);
  const [selectedSigungu, setSelectedSigungu] = useState(getInitialRegion()?.sigungu || '');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isNearbyExpanded, setIsNearbyExpanded] = useState(false);
  const [selectedAdjacentCodes, setSelectedAdjacentCodes] = useState([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [locationMessage, setLocationMessage] = useState('현재 위치를 확인하지 못했습니다. 위치를 허용하거나 지역을 선택해주세요.');
  const [locationResolution, setLocationResolution] = useState('위치 확인 대기 중');
  const [hearings, setHearings] = useState([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [fallbackMessage, setFallbackMessage] = useState('');
  const [sourceWarning, setSourceWarning] = useState('');

  const currentSigunguCode = useMemo(
    () => (selectedRegion ? findSigunguCodeByRegion(selectedRegion.sido, selectedRegion.sigungu) : ''),
    [selectedRegion]
  );

  useEffect(() => {
    let ignore = false;

    async function loadHearings() {
      setIsLoading(true);
      setError('');
      setFallbackMessage('');
      setSourceWarning('');

      try {
        const payload = await fetchHearings({
          page: 1,
          perPage: 200,
        });

        if (ignore) {
          return;
        }

        setHearings(payload.items);
        setUpdatedAt(payload.fetchedAt || new Date().toISOString());
        setSourceWarning(
          payload.failedSources?.length
            ? '일부 데이터 소스를 불러오지 못했지만, 수집에 성공한 공고는 계속 표시합니다.'
            : ''
        );
      } catch (loadError) {
        if (ignore) {
          return;
        }

        setError('통합 공고 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        setHearings([]);
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadHearings();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (hasRequestedInitialLocation.current) {
      return;
    }

    hasRequestedInitialLocation.current = true;
    handleDetectLocation();
  }, []);

  useEffect(() => {
    setSelectedAdjacentCodes([]);
  }, [currentSigunguCode]);

  const districtOptions = useMemo(
    () => getDistrictsForSido(selectedSido),
    [selectedSido]
  );

  const recentHearings = useMemo(
    () => filterAndSortHearings(hearings, ''),
    [hearings]
  );

  const adjacentCodes = useMemo(
    () => (currentSigunguCode ? regionAdjacency[currentSigunguCode] || [] : []),
    [currentSigunguCode]
  );

  const exactHearings = useMemo(() => {
    if (!selectedRegion) {
      return [];
    }

    if (currentSigunguCode) {
      return recentHearings.filter((notice) => notice.sigunguCode === currentSigunguCode);
    }

    return recentHearings.filter((notice) => matchesRegion(notice, selectedRegion, currentSigunguCode));
  }, [currentSigunguCode, recentHearings, selectedRegion]);

  const nearbyFallbackHearings = useMemo(() => {
    if (!selectedRegion) {
      return [];
    }

    const exactIds = new Set(exactHearings.map((notice) => notice.id));
    const adjacentSet = new Set(adjacentCodes);

    const adjacentMatches = recentHearings.filter((notice) =>
      adjacentSet.has(notice.sigunguCode) && !exactIds.has(notice.id)
    );

    const sameSidoMatches = recentHearings.filter((notice) =>
      matchesSido(notice, selectedRegion.sido, currentSigunguCode) &&
      !exactIds.has(notice.id) &&
      !adjacentSet.has(notice.sigunguCode)
    );

    return filterAndSortHearings([...adjacentMatches, ...sameSidoMatches], '');
  }, [adjacentCodes, exactHearings, recentHearings, selectedRegion]);

  const selectedAdjacentHearings = useMemo(() => {
    if (!selectedAdjacentCodes.length) {
      return [];
    }

    const selectedSet = new Set(selectedAdjacentCodes);
    return filterAndSortHearings(
      recentHearings.filter((notice) => selectedSet.has(notice.sigunguCode)),
      ''
    );
  }, [recentHearings, selectedAdjacentCodes]);

  const displayState = useMemo(() => {
    if (!selectedRegion) {
      return {
        current: recentHearings,
        selected: recentHearings,
        fallbackMessage: '선택 지역이 없어서 최신 공고 전체를 먼저 보여줍니다.',
        currentTitle: '전체 최신 공고',
        currentDescription: '토지이음 주민의견청취 공람과 국토부 인터넷 주민의견청취를 최신순으로 보여줍니다.',
        selectedDescription: '지역을 선택하면 해당 지역 공고를 우선하고, 없으면 관련 지역 결과로 fallback 합니다.',
        mode: 'latest',
      };
    }

    if (exactHearings.length) {
      const selectedItems = selectedAdjacentHearings.length
        ? filterAndSortHearings([...exactHearings, ...selectedAdjacentHearings], '')
        : exactHearings;

      return {
        current: exactHearings,
        selected: selectedItems,
        fallbackMessage: selectedAdjacentHearings.length
          ? '인접지역 포함 결과를 함께 보여줍니다.'
          : '',
        currentTitle: `${selectedRegion.sigungu} 공고`,
        currentDescription: `${formatRegionLabel(selectedRegion)} 공고를 우선 보여줍니다.`,
        selectedDescription: selectedAdjacentHearings.length
          ? `${formatRegionLabel(selectedRegion)}와 선택한 인접 지역 결과입니다.`
          : `${formatRegionLabel(selectedRegion)} 공고 목록입니다.`,
        mode: selectedAdjacentHearings.length ? 'exact+adjacent' : 'exact',
      };
    }

    if (nearbyFallbackHearings.length) {
      return {
        current: nearbyFallbackHearings,
        selected: nearbyFallbackHearings,
        fallbackMessage: '정확히 일치하는 공고가 없어 같은 시/도 또는 인접 지역 공고를 보여줍니다.',
        currentTitle: `${selectedRegion.sigungu} 인접/동일 시도 공고`,
        currentDescription: '정확히 일치하는 공고가 없어 인접 지역과 같은 시/도 결과를 우선 보여줍니다.',
        selectedDescription: '정확히 일치하는 공고가 없어 fallback 결과를 보여줍니다.',
        mode: 'nearby-fallback',
      };
    }

    return {
      current: recentHearings,
      selected: recentHearings,
      fallbackMessage: '정확히 일치하는 공고와 인접 지역 공고가 없어 전체 최신 공고를 보여줍니다.',
      currentTitle: '전체 최신 공고',
      currentDescription: '지역 일치 결과가 없어 전체 최신 공고로 fallback 되었습니다.',
      selectedDescription: '전체 최신 공고 목록입니다.',
      mode: 'latest-fallback',
    };
  }, [exactHearings, nearbyFallbackHearings, recentHearings, selectedAdjacentHearings, selectedRegion]);

  const currentHearings = displayState.current;
  const selectedAreaHearings = displayState.selected;
  const visibleSelectedAreaHearings = useMemo(
    () => filterAndSortHearings(selectedAreaHearings, ''),
    [selectedAreaHearings]
  );
  const effectiveFallbackMessage = fallbackMessage || displayState.fallbackMessage;

  useEffect(() => {
    console.info('[notices] display selection', {
      totalCount: hearings.length,
      selectedRegion,
      currentSigunguCode,
      exactCount: exactHearings.length,
      nearbyCount: nearbyFallbackHearings.length,
      selectedCount: visibleSelectedAreaHearings.length,
      mode: displayState.mode,
    });
  }, [currentSigunguCode, displayState.mode, exactHearings.length, hearings.length, nearbyFallbackHearings.length, selectedRegion, visibleSelectedAreaHearings.length]);

  const currentOpenHearings = currentHearings.filter((notice) => notice.status === 'open');
  const currentUnknownHearings = currentHearings.filter((notice) => notice.status === 'unknown');
  const currentClosedHearings = currentHearings.filter((notice) => notice.status === 'closed');

  function applyRegion(region, resolutionText) {
    setSelectedRegion(region);
    setSelectedSido(region.sido);
    setSelectedSigungu(region.sigungu);
    setLocationResolution(resolutionText);
    setLocationMessage(`${formatRegionLabel(region)} 기준으로 내 구 공고를 먼저 보여주고, 인접 자치구는 아래에서 확장해 볼 수 있습니다.`);
  }

  function handleReset() {
    setSelectedRegion(null);
    setSelectedSido(initialSido);
    setSelectedSigungu(getInitialRegion()?.sigungu || '');
    setIsPickerOpen(false);
    setIsNearbyExpanded(false);
    setSelectedAdjacentCodes([]);
    setFallbackMessage('');
    setSourceWarning('');
    setLocationResolution('위치 확인 대기 중');
    setLocationMessage('현재 위치를 확인하지 못했습니다. 위치를 허용하거나 지역을 선택해주세요.');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDetectLocation() {
    setIsDetecting(true);
    setError('');
    setFallbackMessage('');
    setLocationResolution('현재 위치 확인 중');
    setLocationMessage('현재 위치를 기반으로 내 자치구 공고를 확인하고 있습니다. 브라우저 위치 권한을 허용해주세요.');
    console.info('[location] detect:start');

    try {
      const coords = await getCurrentPosition();
      console.info('[location] geolocation:success', {
        latitude: Number(coords.latitude?.toFixed?.(5) || coords.latitude),
        longitude: Number(coords.longitude?.toFixed?.(5) || coords.longitude),
      });
      const address = await reverseGeocode({ lat: coords.latitude, lon: coords.longitude });
      console.info('[location] reverse-geocode:success', {
        city: address.city || address.state || '',
        borough: address.borough || address.suburb || address.city_district || '',
      });
      const region = matchRegionFromAddress(address);

      if (!region) {
        throw new Error('region-match-failed');
      }

      applyRegion(region, 'GPS + 역지오코딩으로 시군구 확인');
    } catch (detectError) {
      const details = describeLocationError(detectError);
      console.error('[location] detect:failed', {
        stage: details.stage,
        code: typeof detectError?.code === 'number' ? detectError.code : null,
        message: String(detectError?.message || ''),
      });
      setLocationResolution(details.resolution);
      setLocationMessage(details.message);
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

  function handleOpenRegionPicker() {
    setIsPickerOpen(true);
    window.requestAnimationFrame(() => {
      regionPickerRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  function toggleAdjacentCode(code) {
    setSelectedAdjacentCodes((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code]
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
                  Public Hearing Feed
                </span>
                <span className="block text-2xl font-extrabold tracking-tight text-[#191c1e]">공람콕</span>
              </span>
            </button>

            <div className="hidden items-center gap-6 md:flex">
              <a className="nav-tab nav-tab-active" href="#hero">내 주변 공고</a>
              <a className="nav-tab" href="#current-district">현재 자치구</a>
              <a className="nav-tab" href="#selected-region-list">선택 지역 요약</a>
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
            {selectedRegion ? formatRegionLabel(selectedRegion) : '전체 최신 공고'}
          </p>
        </div>

        <nav className="flex flex-col gap-1">
          <a className="rail-link rail-link-active" href="#hero">
            <Map className="h-4 w-4" />
            <span>내 주변 공고</span>
          </a>
          <a className="rail-link" href="#current-district">
            <FileText className="h-4 w-4" />
            <span>현재 자치구</span>
          </a>
          <a className="rail-link" href="#selected-region-list">
            <Megaphone className="h-4 w-4" />
            <span>인접 자치구</span>
          </a>
          <button
            id="toggle-region-picker"
            type="button"
            className="rail-link text-left"
            onClick={handleOpenRegionPicker}
            aria-expanded={isPickerOpen}
            aria-controls="region-picker"
          >
            <Info className="h-4 w-4" />
            <span>지역 직접 선택</span>
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
          내 위치로 찾기
        </button>
      </aside>

      <main className="pb-28 pt-24 lg:ml-72 lg:pb-12">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-8">
          <section id="hero" className="relative overflow-hidden rounded-[28px] bg-[#e8f3ff] shadow-sm">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(0,97,148,0.18),_transparent_32%),linear-gradient(135deg,_rgba(0,97,148,0.92),_rgba(0,123,185,0.72))]" />
            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.22)_1px,transparent_1px)] [background-size:36px_36px]" />

            <div className="relative flex min-h-[360px] items-center justify-center px-4 py-10 sm:px-10">
              <div className="max-w-[46rem] rounded-[28px] bg-white/90 px-6 py-8 text-center shadow-2xl backdrop-blur-xl sm:px-10 sm:py-10">
                <span className="inline-flex rounded-full bg-[#c1e0ff] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#004b73]">
                  위치 기반 탐색
                </span>
                <h1 className="hero-title mt-5 text-[#191c1e]">
                  내 주변 도시계획 공고 찾기
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#52606d] sm:text-[1.05rem]">
                  토지이음 주민의견청취 공람과 국토부 인터넷 주민의견청취를 통합해 현재 위치, 같은 시/도, 인접 지역 순서로 보여줍니다.
                </p>
                <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
                  <button type="button" onClick={handleDetectLocation} className="hero-button w-full justify-center sm:w-auto">
                    {isDetecting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Compass className="h-5 w-5" />}
                    내 위치로 찾기
                  </button>
                  <button type="button" onClick={handleOpenRegionPicker} className="hero-button-secondary w-full justify-center sm:w-auto">
                    <ChevronDown className="h-4 w-4" />
                    지역 직접 선택
                  </button>
                </div>
                <div className="mt-7 flex flex-wrap justify-center gap-2.5">
                  <span className="status-chip">{selectedRegion ? formatRegionLabel(selectedRegion) : '최신 공고 전체'}</span>
                  <span className="status-chip">{updatedAt ? `업데이트 ${updatedAt.slice(0, 19).replace('T', ' ')}` : '최근 공고를 불러오는 중입니다.'}</span>
                </div>
                <div className="mt-5 rounded-[20px] border border-[#d8e3ef] bg-[#f7f9fb] px-5 py-4 text-left text-sm leading-6 text-[#3f4850]">
                  <p className="font-semibold text-[#191c1e]">{locationResolution}</p>
                  <p className="mt-1">{locationMessage}</p>
                </div>
              </div>
            </div>
          </section>

          <section id="current-district" className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-[#006194]">현재 자치구 공고</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#191c1e]">
                  {displayState.currentTitle}
                </h2>
                <p className="mt-2 text-sm leading-7 text-[#3f4850]">
                  {displayState.currentDescription}
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="rounded-[24px] bg-white px-6 py-16 text-center shadow-sm">
                <div className="inline-flex items-center gap-3 text-[#3f4850]">
                  <LoaderCircle className="h-5 w-5 animate-spin text-[#006194]" />
                  통합 공고를 불러오는 중입니다...
                </div>
              </div>
            ) : currentHearings.length ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {currentHearings.slice(0, 4).map((notice, index) => (
                  <NoticeSummaryCard key={`current-${notice.id}`} notice={notice} emphasized={index === 0} />
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] bg-white p-8 text-sm leading-7 text-[#3f4850] shadow-sm">
                {selectedRegion ? '현재 표시할 공고가 없습니다.' : '현재 수집된 최신 공고가 없습니다.'}
              </div>
            )}
          </section>

          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-[#006194]">인접 지역 함께 보기</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#191c1e]">인접 자치구 확장 보기</h2>
              </div>
              {adjacentCodes.length ? (
                <button
                  type="button"
                  onClick={() => setIsNearbyExpanded((value) => !value)}
                  className="rounded-full bg-white px-4 py-2 text-sm font-medium text-[#3f4850] shadow-sm"
                >
                  {isNearbyExpanded ? '인접 지역 접기' : '인접 지역 펼치기'}
                </button>
              ) : null}
            </div>

            {!selectedRegion ? (
              <div className="rounded-[24px] bg-white p-8 text-sm leading-7 text-[#3f4850] shadow-sm">
                위치가 확인되면 인접 자치구 선택 칩이 여기에 표시됩니다.
              </div>
            ) : currentSigunguCode && adjacentCodes.length ? (
              <div className="space-y-4">
                {isNearbyExpanded ? (
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {adjacentCodes.map((code) => {
                      const isActive = selectedAdjacentCodes.includes(code);
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => toggleAdjacentCode(code)}
                          className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition ${
                            isActive
                              ? 'border-[#006194] bg-[#c1e0ff] text-[#004b73]'
                              : 'border-[#dfe4ea] bg-white text-[#3f4850]'
                          }`}
                        >
                          {getRegionLabelBySigunguCode(code)}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <p className="text-sm leading-7 text-[#3f4850]">
                  현재 위치 기준 자치구와 함께 비교할 인접 자치구를 선택할 수 있습니다.
                </p>
              </div>
            ) : (
              <div className="rounded-[24px] bg-white p-8 text-sm leading-7 text-[#3f4850] shadow-sm">
                현재 자치구의 인접 지역 정보가 아직 준비되지 않았습니다.
              </div>
            )}
          </section>

          <section id="selected-region-list" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-[#006194]">선택한 지역의 공고 요약</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#191c1e]">내 구와 인접 구 공고 요약 리스트</h2>
                <p className="mt-2 text-sm leading-7 text-[#3f4850]">
                  {displayState.selectedDescription}
                </p>
              </div>
            </div>

            {sourceWarning ? (
              <div className="rounded-[20px] bg-[#eef6ff] px-5 py-4 text-sm text-[#004b73] shadow-sm">
                {sourceWarning}
              </div>
            ) : null}

            {effectiveFallbackMessage ? (
              <div className="rounded-[20px] bg-[#fff4e5] px-5 py-4 text-sm text-[#6b3b00] shadow-sm">
                {effectiveFallbackMessage}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-[20px] bg-[#ffdad6] px-5 py-4 text-sm text-[#93000a] shadow-sm">
                {error}
              </div>
            ) : null}

            {visibleSelectedAreaHearings.length ? (
              <div id="notice-list" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {visibleSelectedAreaHearings.map((notice) => (
                  <NoticeSummaryCard key={notice.id} notice={notice} />
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] bg-white p-8 text-sm leading-7 text-[#3f4850] shadow-sm">
                {selectedRegion
                  ? '현재 조건에 맞는 공고가 없습니다.'
                  : '현재 수집된 최신 공고가 없습니다.'}
              </div>
            )}
          </section>

          <section id="overview-grid" className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <section
              id="region-picker"
              ref={regionPickerRef}
              className={`md:col-span-6 rounded-[24px] bg-white p-8 shadow-sm ${isPickerOpen ? 'block' : 'hidden md:block'}`}
            >
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#3f4850]">지역 직접 선택</span>
                <h2 className="text-xl font-bold leading-tight text-[#191c1e]">현재 위치를 보완하는 선택 수단</h2>
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

            <article className="md:col-span-6 rounded-[24px] bg-white p-8 shadow-sm">
              <div className="space-y-4">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#3f4850]">현재 자치구 상태</span>
                <MetricCard icon={Map} label="공개중" value={`${currentOpenHearings.length}건`} />
                <MetricCard icon={Megaphone} label="확인필요" value={`${currentUnknownHearings.length}건`} />
                <MetricCard icon={FileText} label="종료" value={`${currentClosedHearings.length}건`} />
              </div>
            </article>
          </section>
        </div>
      </main>

      <footer className="mt-auto border-t border-[#e0e3e5] bg-[#f2f4f6] px-6 py-10 md:px-8 lg:ml-72">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex flex-col gap-2">
            <span className="font-bold text-[#191c1e]">공람콕</span>
            <p className="text-xs text-[#3f4850]">© 2026 공람콕. 내 구 공고를 먼저 보여주고 필요할 때 인접 구까지 확장하는 주민의견청취 포털.</p>
          </div>
          <div className="flex flex-wrap gap-6 text-xs text-[#3f4850]">
            <a href="#hero" className="transition hover:text-[#006194]">내 주변 공고</a>
            <a href="#current-district" className="transition hover:text-[#006194]">현재 자치구</a>
            <a href="#selected-region-list" className="transition hover:text-[#006194]">요약 리스트</a>
            <a href="#overview-grid" className="transition hover:text-[#006194]">보조 정보</a>
          </div>
        </div>
      </footer>

      <nav className="mobile-nav md:hidden">
        <a href="#hero" className="mobile-nav-item mobile-nav-item-active">
          <Map className="h-5 w-5" />
          <span>위치</span>
        </a>
        <a href="#current-district" className="mobile-nav-item">
          <FileText className="h-5 w-5" />
          <span>현재 구</span>
        </a>
        <button type="button" className="mobile-nav-center" onClick={handleDetectLocation}>
          {isDetecting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
        </button>
        <a href="#selected-region-list" className="mobile-nav-item">
          <Megaphone className="h-5 w-5" />
          <span>인접 구</span>
        </a>
        <button type="button" className="mobile-nav-item" onClick={handleReset}>
          <RotateCcw className="h-5 w-5" />
          <span>Reset</span>
        </button>
      </nav>
    </div>
  );
}
