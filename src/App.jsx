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
  Map as MapIcon,
  Megaphone,
  Radar,
  RotateCcw,
  UserRound,
} from 'lucide-react';
import regionAdjacency from '../data/region-adjacency.json';
import { findHearingRegionFieldsByText, findSigunguCodeByRegion, getRegionHierarchyByRegion, getRegionHierarchyBySigunguCode, getRegionLabelBySigunguCode } from '../shared/region-codes';
import { fetchHearings, filterAndSortHearings } from './lib/hearings-client';
import { formatRegionLabel, getDistrictsForSido, getRegions, matchRegionFromAddress } from './lib/region-utils';

const regions = getRegions();
const initialSido = regions[0]?.name || '';

function getInitialRegion() {
  const firstDistrict = getDistrictsForSido(initialSido)[0];
  if (!firstDistrict) {
    return null;
  }

  return getRegionHierarchyByRegion(initialSido, firstDistrict.sigungu) || {
    sido: initialSido,
    sigungu: firstDistrict.sigungu,
  };
}

async function reverseGeocode(coords) {
  const latitude = coords?.lat ?? coords?.latitude;
  const longitude = coords?.lon ?? coords?.lng ?? coords?.longitude;
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('accept-language', 'ko');

  // Debug only: log the exact reverse-geocode request params to verify lat/lng ordering.
  console.info('[location-debug] reverse geocode request params', {
    latitude,
    longitude,
    latParam: url.searchParams.get('lat'),
    lonParam: url.searchParams.get('lon'),
    x: coords?.x ?? null,
    y: coords?.y ?? null,
    latLngOrder: 'lat=latitude, lon=longitude',
  });

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('reverse-geocode-failed');
  }

  const payload = await response.json();
  console.info('[location-debug] reverse geocode raw response', payload);

  const address = payload.address || {};

  return {
    ...address,
    state: address.state || address.region || address.province || '',
    city: address.city || address.town || address.municipality || address.village || '',
    county: address.county || '',
    suburb: address.suburb || address.borough || '',
    city_district: address.city_district || address.district || '',
  };
}


function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    console.info('[location-debug] geolocation start', {
      api: 'navigator.geolocation.getCurrentPosition',
      watchPositionUsed: false,
      hasNavigatorGeolocation: Boolean(navigator.geolocation),
    });

    if (!navigator.geolocation) {
      console.error('[location-debug] geolocation error', {
        code: null,
        message: 'unsupported-geolocation',
      });
      reject(new Error('unsupported-geolocation'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.info('[location-debug] geolocation success', {
          latitude: position.coords?.latitude ?? null,
          longitude: position.coords?.longitude ?? null,
          accuracy: position.coords?.accuracy ?? null,
          x: position.coords?.x ?? null,
          y: position.coords?.y ?? null,
          latLngOrder: 'latitude -> lat, longitude -> lon',
        });
        resolve(position.coords);
      },
      (error) => {
        console.error('[location-debug] geolocation error', {
          code: typeof error?.code === 'number' ? error.code : null,
          message: String(error?.message || ''),
        });
        reject(error);
      },
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

function normalizeString(value) {
  return String(value ?? '').trim();
}

function normalizeInlineText(value) {
  return normalizeString(value).replace(/\s+/g, ' ').trim();
}

function normalizeComparableText(value) {
  return normalizeInlineText(value)
    .toLowerCase()
    .replace(/[\s()\[\]{}.,·ㆍ:;!?"'`~\-_/\\|]/g, '');
}

function normalizeRegionName(value) {
  const text = normalizeInlineText(value).replace(/\([^)]*\)/g, ' ');
  const tokens = text.match(/[가-힣]+(?:특별자치도|특별자치시|특별시|광역시|자치도|자치시|시|군|구)/g) || [];

  if (!tokens.length) {
    return text.replace(/\s+/g, ' ').trim();
  }

  if (tokens.length === 1) {
    return tokens[0];
  }

  return `${tokens[0]} ${tokens[tokens.length - 1]}`.replace(/\s+/g, ' ').trim();
}

function extractDistrictToken(value) {
  const text = normalizeInlineText(value);
  const tokens = text.match(/[가-힣]+(?:시|군|구)/g) || [];
  return tokens[tokens.length - 1] || normalizeRegionName(text);
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function isDetailedLink(link) {
  const normalized = normalizeInlineText(link).toLowerCase();
  if (!normalized) {
    return false;
  }

  return /det\.jsp|detail|view|seq=|gosino=|opinion/i.test(normalized);
}

function canonicalizeEumDetailUrl(link) {
  const rawUrl = normalizeInlineText(link);
  const fallbackBaseUrl = 'https://www.eum.go.kr/web/cp/hr/';
  const canonicalBaseUrl = 'https://www.eum.go.kr/web/cp/hr/hrPeopleHearDet.jsp';

  if (!rawUrl) {
    return '';
  }

  try {
    const resolvedUrl = /^https?:\/\//i.test(rawUrl)
      ? new URL(rawUrl)
      : new URL(rawUrl, fallbackBaseUrl);

    if (/hrPeopleHearDet\.jsp$/i.test(resolvedUrl.pathname)) {
      const canonicalUrl = new URL(canonicalBaseUrl);
      resolvedUrl.searchParams.forEach((value, key) => {
        canonicalUrl.searchParams.append(key, value);
      });
      return canonicalUrl.toString();
    }

    return resolvedUrl.toString();
  } catch {
    return rawUrl;
  }
}

function normalizeRegionMatchType(value) {
  const normalized = normalizeInlineText(value);
  if (normalized === 'district-exact' || normalized === 'city-only' || normalized === 'text-fallback' || normalized === 'unmatched') {
    return normalized;
  }
  return 'unmatched';
}

function choosePreferredRegionMatchType(left, right) {
  const score = {
    'district-exact': 4,
    'text-fallback': 3,
    'city-only': 2,
    unmatched: 1,
    '': 0,
  };

  return (score[right || ''] || 0) >= (score[left || ''] || 0) ? right || left : left || right;
}

function resolveNoticeRegionMetadata(notice) {
  const providedMeta = {
    cityLevelRegionName: normalizeInlineText(notice.cityLevelRegionName),
    cityLevelRegionKey: normalizeInlineText(notice.cityLevelRegionKey),
    districtLevelRegionName: normalizeInlineText(notice.districtLevelRegionName),
    districtLevelRegionKey: normalizeInlineText(notice.districtLevelRegionKey),
    matchedCity: normalizeInlineText(notice.matchedCity),
    matchedDistrict: normalizeInlineText(notice.matchedDistrict),
    regionMatchType: normalizeRegionMatchType(notice.regionMatchType),
  };

  const fallbackText = [
    notice.region,
    notice.agency,
    notice.department,
    notice.location,
    notice.title,
    notice.summary,
    notice.body,
  ].filter(Boolean).join(' ');

  const derivedMeta = !providedMeta.cityLevelRegionKey
    ? getRegionHierarchyBySigunguCode(notice.sigunguCode)
      || findHearingRegionFieldsByText(fallbackText, 'text-fallback')
    : null;

  const resolvedMeta = {
    cityLevelRegionName: providedMeta.cityLevelRegionName || normalizeInlineText(derivedMeta?.cityLevelRegionName),
    cityLevelRegionKey: providedMeta.cityLevelRegionKey || normalizeInlineText(derivedMeta?.cityLevelRegionKey),
    districtLevelRegionName: providedMeta.districtLevelRegionName || normalizeInlineText(derivedMeta?.districtLevelRegionName),
    districtLevelRegionKey: providedMeta.districtLevelRegionKey || normalizeInlineText(derivedMeta?.districtLevelRegionKey),
    matchedCity: providedMeta.matchedCity || normalizeInlineText(derivedMeta?.matchedCity),
    matchedDistrict: providedMeta.matchedDistrict || normalizeInlineText(derivedMeta?.matchedDistrict),
    regionMatchType: providedMeta.cityLevelRegionKey
      ? providedMeta.regionMatchType
      : normalizeRegionMatchType(derivedMeta?.regionMatchType || 'unmatched'),
  };

  console.info('[region-debug] parsed notice location fields', {
    noticeId: normalizeInlineText(notice.id),
    title: normalizeInlineText(notice.title),
    region: normalizeInlineText(notice.region),
    location: normalizeInlineText(notice.location),
    agency: normalizeInlineText(notice.agency),
    department: normalizeInlineText(notice.department),
    matchedCity: resolvedMeta.matchedCity || '',
    matchedDistrict: resolvedMeta.matchedDistrict || null,
    regionMatchType: resolvedMeta.regionMatchType,
  });

  return {
    cityLevelRegionName: resolvedMeta.cityLevelRegionName || undefined,
    cityLevelRegionKey: resolvedMeta.cityLevelRegionKey || undefined,
    districtLevelRegionName: resolvedMeta.districtLevelRegionName || undefined,
    districtLevelRegionKey: resolvedMeta.districtLevelRegionKey || undefined,
    matchedCity: resolvedMeta.matchedCity || undefined,
    matchedDistrict: resolvedMeta.matchedDistrict || undefined,
    regionMatchType: resolvedMeta.cityLevelRegionKey ? resolvedMeta.regionMatchType : 'unmatched',
  };
}

function isNoticeInSelectedCity(notice, selectedRegion) {
  if (!selectedRegion) {
    return false;
  }

  if (selectedRegion.cityLevelRegionKey && notice.cityLevelRegionKey) {
    return notice.cityLevelRegionKey === selectedRegion.cityLevelRegionKey;
  }

  const selectedCity = normalizeInlineText(selectedRegion.matchedCity || selectedRegion.sigungu);
  const noticeCity = normalizeInlineText(notice.matchedCity || '');
  return Boolean(selectedCity && noticeCity && selectedCity === noticeCity);
}

function isNoticeInSelectedDistrict(notice, selectedRegion, currentSigunguCode) {
  if (!selectedRegion) {
    return false;
  }

  if (selectedRegion.districtLevelRegionKey && notice.districtLevelRegionKey) {
    return notice.districtLevelRegionKey === selectedRegion.districtLevelRegionKey;
  }

  if (currentSigunguCode && notice.sigunguCode === currentSigunguCode) {
    return true;
  }

  const currentRegionLabel = normalizeRegionName(formatRegionLabel(selectedRegion));
  const currentDistrict = extractDistrictToken(selectedRegion.sigungu);

  return getNoticeRegionCandidates(notice).some((candidate) => {
    const normalizedCandidate = normalizeRegionName(candidate);
    return normalizedCandidate === currentRegionLabel || extractDistrictToken(candidate) === currentDistrict;
  });
}

function getNoticeLocationPriority(notice, selectedRegion, adjacentCodes) {
  if (!selectedRegion) {
    return { rank: 4, reason: 'other-region' };
  }

  if (isNoticeInSelectedDistrict(notice, selectedRegion, '')) {
    return { rank: 0, reason: 'district-level-match' };
  }

  if (isNoticeInSelectedCity(notice, selectedRegion) && !notice.districtLevelRegionKey) {
    return { rank: 1, reason: 'city-level-match' };
  }

  if (isNoticeInSelectedCity(notice, selectedRegion)) {
    return { rank: 2, reason: 'same-city-other-district' };
  }

  if (selectedRegion.districtLevelRegionKey && notice.sigunguCode && adjacentCodes.includes(notice.sigunguCode)) {
    return { rank: 3, reason: 'adjacent-district-match' };
  }

  return { rank: 4, reason: 'other-region' };
}

function sortHearingsForSelectedRegion(items, selectedRegion, adjacentCodes, contextKey) {
  const baseline = filterAndSortHearings(items, '');
  if (!selectedRegion) {
    return baseline;
  }

  const baselineIndex = new Map(baseline.map((notice, index) => [notice.id, index]));
  const sorted = [...baseline].sort((left, right) => {
    const leftPriority = getNoticeLocationPriority(left, selectedRegion, adjacentCodes);
    const rightPriority = getNoticeLocationPriority(right, selectedRegion, adjacentCodes);
    if (leftPriority.rank !== rightPriority.rank) {
      return leftPriority.rank - rightPriority.rank;
    }

    return (baselineIndex.get(left.id) || 0) - (baselineIndex.get(right.id) || 0);
  });

  console.info('[location-debug] final sorted order reason', {
    context: contextKey,
    currentUserCity: selectedRegion.matchedCity || '',
    currentUserDistrict: selectedRegion.matchedDistrict || null,
    items: sorted.map((notice) => ({
      id: notice.id,
      title: notice.title,
      cityLevelRegionName: notice.cityLevelRegionName || '',
      districtLevelRegionName: notice.districtLevelRegionName || null,
      reason: getNoticeLocationPriority(notice, selectedRegion, adjacentCodes).reason,
    })),
  });

  return sorted;
}

function normalizeNotice(notice) {
  const sourceLabels = uniqueStrings([...(notice.sourceLabels || []), notice.sourceLabel].map(normalizeInlineText));
  const sources = uniqueStrings([...(notice.sources || []), notice.source]);
  const attachments = new globalThis.Map();
  const regionMeta = resolveNoticeRegionMetadata(notice);
  const rawLink = normalizeInlineText(notice.link);
  const normalizedLink = notice.source === 'eum_public_hearing' || /hrPeopleHearDet\.jsp/i.test(rawLink)
    ? canonicalizeEumDetailUrl(rawLink)
    : rawLink;

  (notice.attachments || []).forEach((attachment) => {
    const name = normalizeInlineText(attachment?.name);
    const url = normalizeInlineText(attachment?.url);
    const key = `${name}::${url}`;
    if (!key || key === '::') {
      return;
    }
    if (!attachments.has(key)) {
      attachments.set(key, { name, url });
    }
  });

  return {
    ...notice,
    id: normalizeInlineText(notice.id),
    sourceLabel: sourceLabels.join(' · ') || normalizeInlineText(notice.sourceLabel),
    sourceLabels,
    sources,
    seq: normalizeInlineText(notice.seq) || undefined,
    noticeNumber: normalizeInlineText(notice.noticeNumber) || undefined,
    title: normalizeInlineText(notice.title) || '공고 제목 없음',
    region: normalizeInlineText(notice.region) || undefined,
    sigunguCode: normalizeInlineText(notice.sigunguCode) || undefined,
    cityLevelRegionName: regionMeta.cityLevelRegionName,
    cityLevelRegionKey: regionMeta.cityLevelRegionKey,
    districtLevelRegionName: regionMeta.districtLevelRegionName || undefined,
    districtLevelRegionKey: regionMeta.districtLevelRegionKey || undefined,
    matchedCity: regionMeta.matchedCity,
    matchedDistrict: regionMeta.matchedDistrict || undefined,
    regionMatchType: regionMeta.regionMatchType,
    agency: normalizeInlineText(notice.agency) || undefined,
    department: normalizeInlineText(notice.department) || undefined,
    publishedAt: normalizeInlineText(notice.publishedAt) || undefined,
    hearingStartDate: normalizeInlineText(notice.hearingStartDate) || undefined,
    hearingEndDate: normalizeInlineText(notice.hearingEndDate) || undefined,
    location: normalizeInlineText(notice.location) || undefined,
    contact: normalizeInlineText(notice.contact) || undefined,
    summary: normalizeInlineText(notice.summary) || undefined,
    body: normalizeInlineText(notice.body) || undefined,
    attachments: [...attachments.values()],
    link: normalizedLink,
  };
}

function buildAttachmentSignature(notice) {
  return (notice.attachments || [])
    .map((attachment) => `${normalizeComparableText(attachment.name)}::${normalizeComparableText(attachment.url)}`)
    .filter(Boolean)
    .sort()
    .join('|');
}

function buildAttachmentNameSignature(notice) {
  return (notice.attachments || [])
    .map((attachment) => normalizeComparableText(attachment.name))
    .filter(Boolean)
    .sort()
    .join('|');
}

function buildNoticeComposite(notice) {
  const noticeNumber = normalizeComparableText(notice.noticeNumber);
  const publishedAt = normalizeInlineText(notice.publishedAt);
  const agency = normalizeComparableText(notice.agency);
  return noticeNumber && publishedAt && agency ? [noticeNumber, publishedAt, agency].join('::') : '';
}

function buildTitleComposite(notice) {
  const title = normalizeComparableText(notice.title);
  const publishedAt = normalizeInlineText(notice.publishedAt);
  const agency = normalizeComparableText(notice.agency);
  return title && publishedAt && agency ? [title, publishedAt, agency].join('::') : '';
}

function getNoticeDataScore(notice) {
  return [
    notice.body ? 5 : 0,
    notice.summary ? 2 : 0,
    notice.attachments?.length ? 3 : 0,
    notice.hearingStartDate ? 2 : 0,
    notice.hearingEndDate ? 2 : 0,
    notice.location ? 2 : 0,
    notice.contact ? 1 : 0,
    notice.noticeNumber ? 2 : 0,
    notice.seq ? 2 : 0,
    isDetailedLink(notice.link) ? 2 : notice.link ? 1 : 0,
    Math.max(0, (notice.sourceLabels?.length || 1) - 1),
  ].reduce((sum, value) => sum + value, 0);
}

function choosePreferredText(left, right) {
  const normalizedLeft = normalizeInlineText(left);
  const normalizedRight = normalizeInlineText(right);
  if (!normalizedLeft) return normalizedRight || undefined;
  if (!normalizedRight) return normalizedLeft || undefined;
  return normalizedRight.length > normalizedLeft.length ? normalizedRight : normalizedLeft;
}

function areSameNotice(left, right) {
  if (left.seq && right.seq && left.seq === right.seq) {
    return true;
  }

  const leftNoticeComposite = buildNoticeComposite(left);
  const rightNoticeComposite = buildNoticeComposite(right);
  if (leftNoticeComposite && rightNoticeComposite && leftNoticeComposite === rightNoticeComposite) {
    return true;
  }

  const leftTitleComposite = buildTitleComposite(left);
  const rightTitleComposite = buildTitleComposite(right);
  if (leftTitleComposite && rightTitleComposite && leftTitleComposite === rightTitleComposite) {
    return true;
  }

  const leftLink = normalizeComparableText(left.link);
  const rightLink = normalizeComparableText(right.link);
  if (leftLink && rightLink && leftLink === rightLink) {
    return true;
  }

  const leftAttachmentSignature = buildAttachmentSignature(left);
  const rightAttachmentSignature = buildAttachmentSignature(right);
  if (leftAttachmentSignature && rightAttachmentSignature && leftAttachmentSignature === rightAttachmentSignature) {
    return true;
  }

  const leftAttachmentNames = buildAttachmentNameSignature(left);
  const rightAttachmentNames = buildAttachmentNameSignature(right);
  return Boolean(leftAttachmentNames && rightAttachmentNames && leftAttachmentNames === rightAttachmentNames);
}

function mergeNotices(left, right) {
  const preferred = getNoticeDataScore(right) > getNoticeDataScore(left) ? right : left;
  const secondary = preferred === left ? right : left;
  const sourceLabels = uniqueStrings([
    ...(preferred.sourceLabels || []),
    ...(secondary.sourceLabels || []),
    preferred.sourceLabel,
    secondary.sourceLabel,
  ].map(normalizeInlineText));
  const sources = uniqueStrings([...(preferred.sources || []), ...(secondary.sources || []), preferred.source, secondary.source]);
  const attachments = new globalThis.Map();

  [...(preferred.attachments || []), ...(secondary.attachments || [])].forEach((attachment) => {
    const name = normalizeInlineText(attachment?.name);
    const url = normalizeInlineText(attachment?.url);
    const key = `${name}::${url}`;
    if (!key || key === '::') {
      return;
    }
    if (!attachments.has(key)) {
      attachments.set(key, { name, url });
    }
  });

  return normalizeNotice({
    ...secondary,
    ...preferred,
    source: preferred.source || secondary.source,
    sourceLabel: sourceLabels.join(' · ') || preferred.sourceLabel || secondary.sourceLabel,
    sourceLabels,
    sources,
    id: preferred.id || secondary.id,
    seq: preferred.seq || secondary.seq,
    noticeNumber: choosePreferredText(preferred.noticeNumber, secondary.noticeNumber),
    title: choosePreferredText(preferred.title, secondary.title) || preferred.title || secondary.title,
    region: choosePreferredText(preferred.region, secondary.region),
    sigunguCode: choosePreferredText(preferred.sigunguCode, secondary.sigunguCode),
    cityLevelRegionName: choosePreferredText(preferred.cityLevelRegionName, secondary.cityLevelRegionName),
    cityLevelRegionKey: choosePreferredText(preferred.cityLevelRegionKey, secondary.cityLevelRegionKey),
    districtLevelRegionName: choosePreferredText(preferred.districtLevelRegionName || '', secondary.districtLevelRegionName || '') || undefined,
    districtLevelRegionKey: choosePreferredText(preferred.districtLevelRegionKey || '', secondary.districtLevelRegionKey || '') || undefined,
    matchedCity: choosePreferredText(preferred.matchedCity, secondary.matchedCity),
    matchedDistrict: choosePreferredText(preferred.matchedDistrict || '', secondary.matchedDistrict || '') || undefined,
    regionMatchType: choosePreferredRegionMatchType(preferred.regionMatchType, secondary.regionMatchType),
    agency: choosePreferredText(preferred.agency, secondary.agency),
    department: choosePreferredText(preferred.department, secondary.department),
    publishedAt: choosePreferredText(preferred.publishedAt, secondary.publishedAt),
    hearingStartDate: choosePreferredText(preferred.hearingStartDate, secondary.hearingStartDate),
    hearingEndDate: choosePreferredText(preferred.hearingEndDate, secondary.hearingEndDate),
    location: choosePreferredText(preferred.location, secondary.location),
    contact: choosePreferredText(preferred.contact, secondary.contact),
    status: preferred.status || secondary.status,
    summary: choosePreferredText(preferred.summary, secondary.summary),
    body: choosePreferredText(preferred.body, secondary.body),
    attachments: [...attachments.values()],
    link: isDetailedLink(preferred.link) ? preferred.link : preferred.link || secondary.link,
    rawSource: preferred.rawSource || secondary.rawSource,
  });
}

function dedupeNotices(items) {
  const deduped = [];

  items.map((item) => normalizeNotice(item)).forEach((item) => {
    const existingIndex = deduped.findIndex((candidate) => areSameNotice(candidate, item));
    if (existingIndex === -1) {
      deduped.push(item);
      return;
    }

    deduped[existingIndex] = mergeNotices(deduped[existingIndex], item);
  });

  return deduped;
}

function getNoticeRegionCandidates(notice) {
  return uniqueStrings([
    notice.region,
    notice.cityLevelRegionName,
    notice.districtLevelRegionName,
    notice.matchedCity,
    notice.matchedDistrict,
    notice.sigunguCode ? getRegionLabelBySigunguCode(notice.sigunguCode) : '',
    notice.agency,
    notice.department,
    notice.location,
    notice.title,
    notice.summary,
    notice.body,
  ].map(normalizeInlineText));
}

function isCurrentDistrictNotice(notice, selectedRegion, currentSigunguCode) {
  return isNoticeInSelectedDistrict(notice, selectedRegion, currentSigunguCode);
}

function isAdjacentDistrictNotice(notice, selectedRegion, currentSigunguCode, adjacentCodes) {
  if (!selectedRegion || !adjacentCodes.length || !selectedRegion.districtLevelRegionKey) {
    return false;
  }

  if (isCurrentDistrictNotice(notice, selectedRegion, currentSigunguCode)) {
    return false;
  }

  if (isNoticeInSelectedCity(notice, selectedRegion)) {
    return false;
  }

  const adjacentCodeSet = new Set(adjacentCodes);
  if (notice.sigunguCode && adjacentCodeSet.has(notice.sigunguCode)) {
    return true;
  }

  const adjacentRegionLabels = adjacentCodes
    .map((code) => getRegionLabelBySigunguCode(code))
    .filter(Boolean)
    .map((label) => normalizeRegionName(label));
  const adjacentDistrictTokens = adjacentCodes
    .map((code) => getRegionLabelBySigunguCode(code))
    .filter(Boolean)
    .map((label) => extractDistrictToken(label));

  return getNoticeRegionCandidates(notice).some((candidate) => {
    const normalizedCandidate = normalizeRegionName(candidate);
    const districtToken = extractDistrictToken(candidate);
    return adjacentRegionLabels.includes(normalizedCandidate) || adjacentDistrictTokens.includes(districtToken);
  });
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

function CommentsSection({ noticeId }) {
  const containerRef = useRef(null);
  useEffect(() => {
    if (containerRef.current && typeof window.initComments === 'function') {
      window.initComments(noticeId, containerRef.current);
    }
  }, [noticeId]);
  return <div ref={containerRef} />;
}

function NoticeSummaryCard({ notice, emphasized = false }) {
  const statusMeta = getStatusMeta(notice.status);
  const summary = buildNoticeSummary(notice);
  const finalNoticeHref = notice.link;
  if (notice.source === 'eum_public_hearing' && finalNoticeHref) {
    console.info('[eum-url-debug] render final href', {
      seq: notice.seq || '',
      href: finalNoticeHref,
    });
  }
  const attachmentLabel = notice.attachments?.length
    ? notice.attachments.length === 1
      ? notice.attachments[0].name
      : `첨부 ${notice.attachments.length}건`
    : notice.agency || notice.sourceLabel;
  const regionLabel = notice.region || (notice.sigunguCode ? getRegionLabelBySigunguCode(notice.sigunguCode) : '') || notice.agency || '지역 정보 없음';
  const sourceLabel = notice.sourceLabels?.length ? notice.sourceLabels.join(' · ') : notice.sourceLabel;
  const cityBadgeLabel = notice.cityLevelRegionName || regionLabel;
  const districtBadgeLabel = notice.cityLevelRegionName
    ? (notice.districtLevelRegionName || '세부 구 미확정')
    : '';

  return (
    <article className={`feed-card ${emphasized ? 'border border-[#c1e0ff]' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#f2f4f6] px-3 py-1 text-[11px] font-bold text-[#43617c]">
            {cityBadgeLabel}
          </span>
          {districtBadgeLabel ? (
            <span className="rounded-full bg-[#eef6ff] px-3 py-1 text-[11px] font-bold text-[#006194]">
              {districtBadgeLabel}
            </span>
          ) : null}
          <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${statusMeta.classes}`}>
            {statusMeta.label}
          </span>
        </div>
        <span className="text-xs text-[#3f4850]">{notice.publishedAt || formatPeriod(notice)}</span>
      </div>

      <h3 className="mt-4 text-lg font-bold leading-tight text-[#191c1e]">
        {notice.title || '공고 제목 없음'}
      </h3>

      <p className="mt-3 text-sm leading-7 text-[#3f4850]">{summary}</p>

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
          <span className="rounded-full bg-[#f2f4f6] px-3 py-2">출처: {sourceLabel}</span>
          <span className="rounded-full bg-[#f2f4f6] px-3 py-2">{attachmentLabel}</span>
        </div>
        {finalNoticeHref ? (
          <a
            href={finalNoticeHref}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              if (notice.source === 'eum_public_hearing') {
                console.info('[eum-url-debug] click open url', {
                  seq: notice.seq || '',
                  href: finalNoticeHref,
                });
              }
            }}
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
      <CommentsSection noticeId={notice.id} />
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
  const [selectedRegionFilterKey, setSelectedRegionFilterKey] = useState(getInitialRegion()?.cityLevelRegionKey || '');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isNearbyExpanded, setIsNearbyExpanded] = useState(false);
  const [showAdjacentSections, setShowAdjacentSections] = useState(false);
  const [selectedAdjacentCodes, setSelectedAdjacentCodes] = useState([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [locationMessage, setLocationMessage] = useState('현재 위치를 확인하지 못했습니다. 위치를 허용하거나 지역을 선택해주세요.');
  const [locationResolution, setLocationResolution] = useState('위치 확인 대기 중');
  const [rawHearings, setRawHearings] = useState([]);
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

        const rawItems = Array.isArray(payload.items) ? payload.items : [];
        const eumApiUrlLogs = rawItems
          .filter((item) => item?.source === 'eum_public_hearing')
          .map((item) => ({
            seq: normalizeInlineText(item?.seq),
            originalUrl: normalizeInlineText(item?.originalUrl),
            detailUrl: normalizeInlineText(item?.detailUrl),
            sourceUrl: normalizeInlineText(item?.sourceUrl),
            link: normalizeInlineText(item?.link),
            hasOriginalUrlField: Object.prototype.hasOwnProperty.call(item || {}, 'originalUrl'),
            hasDetailUrlField: Object.prototype.hasOwnProperty.call(item || {}, 'detailUrl'),
            hasSourceUrlField: Object.prototype.hasOwnProperty.call(item || {}, 'sourceUrl'),
          }));
        if (eumApiUrlLogs.length) {
          console.info('[eum-url-debug] api response item urls', eumApiUrlLogs);
        }
        const dedupedItems = dedupeNotices(rawItems);

        setRawHearings(rawItems);
        setHearings(dedupedItems);
        setUpdatedAt(payload.fetchedAt || new Date().toISOString());
        setSourceWarning(
          payload.failedSources?.length
            ? '일부 데이터 소스를 불러오지 못했지만, 수집에 성공한 공고는 계속 표시합니다.'
            : ''
        );
      } catch {
        if (ignore) {
          return;
        }

        setError('통합 공고 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        setRawHearings([]);
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
    console.info('[location-debug] initial geolocation effect', {
      hasRequestedInitialLocation: hasRequestedInitialLocation.current,
      selectedRegion,
      selectedSido,
      selectedSigungu,
      note: 'This effect only starts geolocation once and does not restore any stored district.',
    });

    if (hasRequestedInitialLocation.current) {
      console.info('[location-debug] initial geolocation effect skipped', {
        reason: 'already-requested',
      });
      return;
    }

    hasRequestedInitialLocation.current = true;
    handleDetectLocation();
  }, []);

  useEffect(() => {
    console.info('[location-debug] currentSigunguCode effect', {
      currentSigunguCode,
      selectedRegion,
      note: 'This effect resets adjacent UI state only; it does not overwrite the selected district.',
    });
    setSelectedAdjacentCodes([]);
    setShowAdjacentSections(false);
  }, [currentSigunguCode]);

  const currentCityRegionKey = selectedRegion?.cityLevelRegionKey || '';
  const currentDistrictRegionKey = selectedRegion?.districtLevelRegionKey || '';

  const districtOptions = useMemo(
    () => getDistrictsForSido(selectedSido),
    [selectedSido]
  );

  const cityFilterOptions = useMemo(() => {
    if (!selectedRegion?.sido || !selectedRegion?.cityLevelRegionKey) {
      return [];
    }

    return getDistrictsForSido(selectedRegion.sido)
      .map((district) => getRegionHierarchyByRegion(selectedRegion.sido, district.sigungu))
      .filter((option) => option?.cityLevelRegionKey === selectedRegion.cityLevelRegionKey && option?.districtLevelRegionKey)
      .map((option) => ({
        key: option.districtLevelRegionKey,
        label: option.districtLevelRegionName || option.sigungu,
        sigungu: option.sigungu,
      }));
  }, [selectedRegion]);

  const activeRegionFilterKey = selectedRegionFilterKey || currentCityRegionKey;
  const activeDistrictFilter = cityFilterOptions.find((option) => option.key === activeRegionFilterKey) || null;

  const recentHearings = useMemo(
    () => filterAndSortHearings(hearings, ''),
    [hearings]
  );

  const adjacentCodes = useMemo(
    () => (currentSigunguCode ? regionAdjacency[currentSigunguCode] || [] : []),
    [currentSigunguCode]
  );

  const cityLevelHearings = useMemo(() => {
    if (!selectedRegion) {
      return recentHearings;
    }

    return sortHearingsForSelectedRegion(
      recentHearings.filter((notice) => isNoticeInSelectedCity(notice, selectedRegion)),
      selectedRegion,
      adjacentCodes,
      'city-level-match'
    );
  }, [adjacentCodes, recentHearings, selectedRegion]);

  const districtLevelMatchedHearings = useMemo(() => {
    if (!selectedRegion || !currentDistrictRegionKey) {
      return [];
    }

    return cityLevelHearings.filter((notice) => isNoticeInSelectedDistrict(notice, selectedRegion, currentSigunguCode));
  }, [cityLevelHearings, currentDistrictRegionKey, currentSigunguCode, selectedRegion]);

  const cityOnlyMatchedHearings = useMemo(() => (
    selectedRegion
      ? cityLevelHearings.filter((notice) => isNoticeInSelectedCity(notice, selectedRegion) && !notice.districtLevelRegionKey)
      : []
  ), [cityLevelHearings, selectedRegion]);

  const otherCityDistrictHearings = useMemo(() => {
    if (!selectedRegion) {
      return [];
    }

    return cityLevelHearings.filter((notice) =>
      isNoticeInSelectedCity(notice, selectedRegion)
      && notice.districtLevelRegionKey
      && notice.districtLevelRegionKey !== currentDistrictRegionKey
    );
  }, [cityLevelHearings, currentDistrictRegionKey, selectedRegion]);

  const currentDistrictHearings = useMemo(() => {
    if (!selectedRegion) {
      return recentHearings;
    }

    if (activeDistrictFilter) {
      return sortHearingsForSelectedRegion(
        cityLevelHearings.filter((notice) => notice.districtLevelRegionKey === activeDistrictFilter.key),
        selectedRegion,
        adjacentCodes,
        'district-level-filter'
      );
    }

    return cityLevelHearings;
  }, [activeDistrictFilter, adjacentCodes, cityLevelHearings, recentHearings, selectedRegion]);

  const adjacentDistrictHearings = useMemo(() => {
    if (!selectedRegion) {
      return [];
    }

    return sortHearingsForSelectedRegion(
      recentHearings.filter((notice) => isAdjacentDistrictNotice(notice, selectedRegion, currentSigunguCode, adjacentCodes)),
      selectedRegion,
      adjacentCodes,
      'adjacent-district-match'
    );
  }, [adjacentCodes, currentSigunguCode, recentHearings, selectedRegion]);

  const visibleAdjacentHearings = useMemo(() => {
    if (!selectedAdjacentCodes.length) {
      return adjacentDistrictHearings;
    }

    const selectedSet = new Set(selectedAdjacentCodes);
    return sortHearingsForSelectedRegion(
      adjacentDistrictHearings.filter((notice) => notice.sigunguCode && selectedSet.has(notice.sigunguCode)),
      selectedRegion,
      adjacentCodes,
      'adjacent-filtered'
    );
  }, [adjacentCodes, adjacentDistrictHearings, selectedAdjacentCodes, selectedRegion]);

  const summaryHearings = useMemo(() => {
    if (!selectedRegion) {
      return recentHearings;
    }

    return sortHearingsForSelectedRegion(
      dedupeNotices([...currentDistrictHearings, ...visibleAdjacentHearings]),
      selectedRegion,
      adjacentCodes,
      'summary-hearings'
    );
  }, [adjacentCodes, currentDistrictHearings, recentHearings, selectedRegion, visibleAdjacentHearings]);

  const currentSectionTitle = selectedRegion
    ? activeDistrictFilter
      ? activeDistrictFilter.label + ' 공고'
      : (selectedRegion.cityLevelRegionName || selectedRegion.matchedCity || selectedRegion.sigungu) + ' 공고'
    : '전체 최신 공고';
  const currentSectionDescription = selectedRegion
    ? activeDistrictFilter
      ? activeDistrictFilter.label + '에 정확히 매칭된 공고만 보여줍니다.'
      : [
          selectedRegion.matchedDistrict ? selectedRegion.matchedDistrict + ' 공고를 먼저 보여주고' : '',
          (selectedRegion.cityLevelRegionName || selectedRegion.matchedCity || selectedRegion.sigungu) + '를 함께 보여줍니다.',
        ].filter(Boolean).join(' ')
    : '지역이 선택되지 않아 최신 공고 전체를 보여줍니다.';
  const adjacentSectionDescription = selectedRegion
    ? currentDistrictRegionKey
      ? '현재 구를 제외한 인접 구 공고를 보조 순위로 분리해 보여줍니다. 같은 시의 다른 구 공고는 위 섹션에 포함됩니다.'
      : '현재 구가 정확히 확인되지 않아 인접 구 공고는 아직 분리하지 않습니다.'
    : '위치가 확인되면 현재 구를 제외한 인접 구 공고를 여기에 분리해 보여줍니다.';
  const summaryDescription = selectedRegion
    ? activeDistrictFilter
      ? activeDistrictFilter.label + ' 공고와 인접 구 공고를 중복 없이 합쳐 보여줍니다.'
      : (selectedRegion.cityLevelRegionName || selectedRegion.matchedCity || selectedRegion.sigungu) + ' 공고를 기본으로, 현재 구와 인접 구 공고를 우선순위에 맞게 합쳐 보여줍니다.'
    : '지역을 선택하면 현재 시 전체와 인접 구 공고를 중복 없이 묶어 보여줍니다.';

  const currentHearings = currentDistrictHearings;
  const currentOpenHearings = currentHearings.filter((notice) => notice.status === 'open');
  const currentUnknownHearings = currentHearings.filter((notice) => notice.status === 'unknown');
  const currentClosedHearings = currentHearings.filter((notice) => notice.status === 'closed');

  const effectiveSummaryMessage = useMemo(() => {
    if (fallbackMessage) {
      return fallbackMessage;
    }

    if (!selectedRegion) {
      return '선택 지역이 없어서 최신 공고 전체를 먼저 보여줍니다.';
    }

    if (currentDistrictHearings.length && visibleAdjacentHearings.length) {
      return activeDistrictFilter
        ? activeDistrictFilter.label + ' 공고와 인접 구 공고를 함께 보여줍니다.'
        : (selectedRegion.cityLevelRegionName || selectedRegion.matchedCity || selectedRegion.sigungu) + ' 공고와 인접 구 공고를 함께 보여줍니다.';
    }

    if (currentDistrictHearings.length && !visibleAdjacentHearings.length) {
      return activeDistrictFilter
        ? activeDistrictFilter.label + ' 공고만 표시합니다.'
        : (selectedRegion.cityLevelRegionName || selectedRegion.matchedCity || selectedRegion.sigungu) + ' 공고만 표시합니다.';
    }

    if (!currentDistrictHearings.length && visibleAdjacentHearings.length) {
      return '현재 시/구 공고가 없어 인접 구 공고만 표시합니다.';
    }

    return '';
  }, [activeDistrictFilter, currentDistrictHearings.length, fallbackMessage, selectedRegion, visibleAdjacentHearings.length]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    console.info('[notices] dedupe summary', {
      rawTotalCount: rawHearings.length,
      dedupedTotalCount: hearings.length,
      currentDistrictCount: selectedRegion ? currentDistrictHearings.length : 0,
      cityLevelCount: selectedRegion ? cityLevelHearings.length : 0,
      districtLevelCount: districtLevelMatchedHearings.length,
      cityOnlyCount: cityOnlyMatchedHearings.length,
      otherCityDistrictCount: otherCityDistrictHearings.length,
      adjacentDistrictCount: selectedRegion ? adjacentDistrictHearings.length : 0,
      mergedSummaryCount: summaryHearings.length,
      duplicatesRemovedCount: Math.max(0, rawHearings.length - hearings.length),
      selectedRegion,
      currentSigunguCode,
    });
  }, [adjacentDistrictHearings.length, cityLevelHearings.length, cityOnlyMatchedHearings.length, currentDistrictHearings.length, currentSigunguCode, districtLevelMatchedHearings.length, hearings.length, otherCityDistrictHearings.length, rawHearings.length, selectedRegion, summaryHearings.length]);

  useEffect(() => {
    if (!selectedRegion) {
      return;
    }

    console.info('[location-debug] current user city', {
      city: selectedRegion.matchedCity || '',
      cityLevelRegionName: selectedRegion.cityLevelRegionName || '',
      cityLevelRegionKey: selectedRegion.cityLevelRegionKey || '',
    });
    console.info('[location-debug] current user district', {
      district: selectedRegion.matchedDistrict || null,
      districtLevelRegionName: selectedRegion.districtLevelRegionName || null,
      districtLevelRegionKey: selectedRegion.districtLevelRegionKey || null,
    });
    console.info('[location-debug] notices included by city-level match', cityLevelHearings.map((notice) => ({
      id: notice.id,
      title: notice.title,
      cityLevelRegionName: notice.cityLevelRegionName || '',
      districtLevelRegionName: notice.districtLevelRegionName || null,
    })));
    console.info('[location-debug] notices included by district-level match', districtLevelMatchedHearings.map((notice) => ({
      id: notice.id,
      title: notice.title,
      cityLevelRegionName: notice.cityLevelRegionName || '',
      districtLevelRegionName: notice.districtLevelRegionName || null,
    })));
  }, [cityLevelHearings, districtLevelMatchedHearings, selectedRegion]);

  function applyRegion(region, resolutionText) {
    console.info('[location-debug] parsed region/district', {
      resolutionText,
      region,
      district: region?.sigungu || '',
      fallbackUsed: false,
      fallbackReason: '',
    });

    const nextPickerSigungu = region.districtLevelRegionKey
      ? region.sigungu
      : getDistrictsForSido(region.sido)[0]?.sigungu || '';

    setSelectedRegion(region);
    setSelectedSido(region.sido);
    setSelectedSigungu(nextPickerSigungu);
    setSelectedRegionFilterKey(region.cityLevelRegionKey || region.districtLevelRegionKey || '');
    setIsNearbyExpanded(false);
    setShowAdjacentSections(false);
    setLocationResolution(resolutionText);
    setLocationMessage([
      region.matchedDistrict ? region.matchedDistrict + ' 공고를 먼저 보여주고,' : '',
      (region.cityLevelRegionName || formatRegionLabel(region)) + '를 함께 보여줍니다.',
    ].filter(Boolean).join(' '));
  }

  function handleReset() {
    setSelectedRegion(null);
    setSelectedSido(initialSido);
    setSelectedSigungu(getInitialRegion()?.sigungu || '');
    setSelectedRegionFilterKey(getInitialRegion()?.cityLevelRegionKey || '');
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
        accuracy: Number(coords.accuracy?.toFixed?.(2) || coords.accuracy || 0),
      });
      const address = await reverseGeocode({ lat: coords.latitude, lon: coords.longitude });
      console.info('[location] reverse-geocode:success', {
        city: address.city || address.state || '',
        borough: address.borough || address.suburb || address.city_district || '',
      });
      const region = matchRegionFromAddress(address);

      console.info('[location-debug] fallback used', {
        fallbackUsed: false,
        reason: 'geolocation-and-reverse-geocode-succeeded',
      });

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
      console.info('[location-debug] fallback used', {
        fallbackUsed: false,
        reason: details.resolution,
        note: 'No hardcoded district fallback is applied; the UI only shows an error message.',
      });
      setLocationResolution(details.resolution);
      setLocationMessage(details.message);
    } finally {
      setIsDetecting(false);
    }
  }

  function handleRegionSubmit(event) {
    event.preventDefault();
    const region = getRegionHierarchyByRegion(selectedSido, selectedSigungu) || {
      sido: selectedSido,
      sigungu: selectedSigungu,
    };
    applyRegion(region, '지역 직접 선택으로 시군구 확인');
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

  useEffect(() => {
    // Debug only: confirm there is no storage-based district restore path in the current app flow.
    console.info('[location-debug] localStorage restored value', {
      restoredValue: null,
      implemented: false,
      reason: 'No localStorage/sessionStorage restore logic exists in App.jsx.',
      localStorageAvailable: typeof window !== 'undefined' && 'localStorage' in window,
      sessionStorageAvailable: typeof window !== 'undefined' && 'sessionStorage' in window,
      watchPositionCallPresent: false,
      defaultState: {
        initialSido,
        initialRegion: getInitialRegion(),
      },
      hardcodedBusanSeoguDetected: initialSido === '부산광역시' || getInitialRegion()?.sido === '부산광역시',
    });
  }, []);

  useEffect(() => {
    console.info('[location-debug] final district applied to screen', {
      selectedRegion,
      selectedSido,
      selectedSigungu,
      renderedDistrict: selectedRegion?.sigungu || '',
      currentSigunguCode,
    });
  }, [currentSigunguCode, selectedRegion, selectedSido, selectedSigungu]);

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
            <MapIcon className="h-4 w-4" />
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
                  토지이음 주민의견청취 공람과 국토부 인터넷 주민의견청취를 통합해 현재 자치구와 인접 자치구 공고를 분리해 보여줍니다.
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
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-[#006194]">내 시 전체 + 현재 구 우선</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#191c1e]">
                  {currentSectionTitle}
                </h2>
                <p className="mt-2 text-sm leading-7 text-[#3f4850]">
                  {currentSectionDescription}
                </p>
              </div>
            </div>

            {selectedRegion ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRegionFilterKey(currentCityRegionKey)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${activeDistrictFilter ? 'border-[#dfe4ea] bg-white text-[#3f4850]' : 'border-[#006194] bg-[#c1e0ff] text-[#004b73]'}`}
                >
                  {selectedRegion.cityLevelRegionName || selectedRegion.matchedCity || selectedRegion.sigungu}
                </button>
                {cityFilterOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSelectedRegionFilterKey(option.key)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${activeRegionFilterKey === option.key ? 'border-[#006194] bg-[#eef6ff] text-[#004b73]' : 'border-[#dfe4ea] bg-white text-[#3f4850]'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}

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
                {selectedRegion
                  ? `${activeDistrictFilter ? activeDistrictFilter.label : (selectedRegion.cityLevelRegionName || selectedRegion.matchedCity || selectedRegion.sigungu)} 공고가 없습니다.`
                  : '현재 수집된 최신 공고가 없습니다.'}
              </div>
            )}

            {selectedRegion ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowAdjacentSections((value) => !value)}
                  aria-expanded={showAdjacentSections}
                  aria-controls="adjacent-districts selected-region-list"
                  className="hero-button-secondary justify-center"
                >
                  <ChevronDown className={`h-4 w-4 transition ${showAdjacentSections ? 'rotate-180' : ''}`} />
                  {showAdjacentSections ? '인접 지역 숨기기' : '인접 지역도 보기'}
                </button>
              </div>
            ) : null}
          </section>

          <section id="adjacent-districts" className="space-y-6" hidden={selectedRegion ? !showAdjacentSections : false}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-[#006194]">인접 지역 함께 보기</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#191c1e]">인접 자치구 확장 보기</h2>
                <p className="mt-2 text-sm leading-7 text-[#3f4850]">{adjacentSectionDescription}</p>
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
                위치가 확인되면 현재 자치구를 제외한 인접 자치구 공고가 여기에 표시됩니다.
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

                {visibleAdjacentHearings.length ? (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {visibleAdjacentHearings.slice(0, isNearbyExpanded ? 8 : 4).map((notice) => (
                      <NoticeSummaryCard key={`adjacent-${notice.id}`} notice={notice} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[24px] bg-white p-8 text-sm leading-7 text-[#3f4850] shadow-sm">
                    인접 자치구 공고가 없습니다. 현재 자치구 공고를 이 섹션에 다시 넣지 않습니다.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-[24px] bg-white p-8 text-sm leading-7 text-[#3f4850] shadow-sm">
                현재 자치구의 인접 지역 정보가 아직 준비되지 않았습니다.
              </div>
            )}
          </section>

          <section
            id="selected-region-list"
            className="space-y-6"
            hidden={selectedRegion ? !showAdjacentSections : false}
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-[#006194]">선택한 지역의 공고 요약</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#191c1e]">내 구와 인접 구 공고 요약 리스트</h2>
                <p className="mt-2 text-sm leading-7 text-[#3f4850]">
                  {summaryDescription}
                </p>
              </div>
            </div>

            {sourceWarning ? (
              <div className="rounded-[20px] bg-[#eef6ff] px-5 py-4 text-sm text-[#004b73] shadow-sm">
                {sourceWarning}
              </div>
            ) : null}

            {effectiveSummaryMessage ? (
              <div className="rounded-[20px] bg-[#fff4e5] px-5 py-4 text-sm text-[#6b3b00] shadow-sm">
                {effectiveSummaryMessage}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-[20px] bg-[#ffdad6] px-5 py-4 text-sm text-[#93000a] shadow-sm">
                {error}
              </div>
            ) : null}

            {summaryHearings.length ? (
              <div id="notice-list" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {summaryHearings.map((notice) => (
                  <NoticeSummaryCard key={`summary-${notice.id}`} notice={notice} />
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] bg-white p-8 text-sm leading-7 text-[#3f4850] shadow-sm">
                {selectedRegion
                  ? '현재 자치구와 인접 자치구에 맞는 공고가 없습니다.'
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
                <MetricCard icon={MapIcon} label="공개중" value={`${currentOpenHearings.length}건`} />
                <MetricCard icon={Megaphone} label="확인필요" value={`${currentUnknownHearings.length}건`} />
                <MetricCard icon={FileText} label="종료" value={`${currentClosedHearings.length}건`} />
              </div>
            </article>
          </section>
        </div>
      </main>

      <footer className="mt-auto border-t border-[#e0e3e5] bg-[#f2f4f6] px-6 py-10 md:px-8 lg:ml-72 pb-28 md:pb-10">
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
          <MapIcon className="h-5 w-5" />
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
