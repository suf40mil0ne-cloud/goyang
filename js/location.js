import { haversineKm, normalizeRegionText } from './filters.js';

const sidoAliases = [
  ['서울', '서울특별시'],
  ['부산', '부산광역시'],
  ['대구', '대구광역시'],
  ['인천', '인천광역시'],
  ['광주', '광주광역시'],
  ['대전', '대전광역시'],
  ['울산', '울산광역시'],
  ['세종', '세종특별자치시'],
  ['경기', '경기도'],
  ['강원', '강원특별자치도'],
  ['충북', '충청북도'],
  ['충남', '충청남도'],
  ['전북', '전북특별자치도'],
  ['전남', '전라남도'],
  ['경북', '경상북도'],
  ['경남', '경상남도'],
  ['제주', '제주특별자치도'],
];

function averageCenter(items) {
  if (!items.length) return null;
  const total = items.reduce(
    (acc, item) => ({
      lat: acc.lat + item.latitude,
      lng: acc.lng + item.longitude,
    }),
    { lat: 0, lng: 0 }
  );
  return {
    lat: total.lat / items.length,
    lng: total.lng / items.length,
  };
}

function buildNoticeCenters(notices) {
  const grouped = new Map();
  notices.forEach((notice) => {
    if (!Number.isFinite(notice.latitude) || !Number.isFinite(notice.longitude)) return;
    const key = `${normalizeRegionText(notice.sido)}::${normalizeRegionText(notice.sigungu)}`;
    const bucket = grouped.get(key) || [];
    bucket.push(notice);
    grouped.set(key, bucket);
  });

  return new Map(
    [...grouped.entries()].map(([key, items]) => [key, averageCenter(items)])
  );
}

function parseSido(address = {}) {
  const stateText = [address.state, address.region, address.province, address.city]
    .find(Boolean) || '';
  const matched = sidoAliases.find(([alias]) => stateText.includes(alias));
  return matched ? matched[1] : stateText;
}

function parseSigungu(address = {}, sido = '') {
  const districtLike = [address.city_district, address.borough, address.district]
    .find((value) => /구$/.test(value || '')) || '';
  const cityLike = [address.city, address.municipality, address.county]
    .find((value) => /(시|군)$/.test(value || '')) || '';
  const countyLike = address.county || '';
  const municipalityLike = address.municipality || '';

  if (sido === '세종특별자치시') return '세종특별자치시';

  if (/(특별시|광역시)$/.test(sido)) {
    return districtLike || countyLike || '';
  }

  if (/(도)$/.test(sido)) {
    if (cityLike && districtLike) return `${cityLike} ${districtLike}`;
    return cityLike || countyLike || municipalityLike || districtLike || '';
  }

  return districtLike || cityLike || countyLike || municipalityLike || '';
}

function parseLegalDong(address = {}) {
  return [address.suburb, address.neighbourhood, address.quarter, address.village]
    .find(Boolean) || '';
}

function addVariant(set, value) {
  const normalized = normalizeRegionText(value);
  if (normalized) {
    set.add(normalized);
  }
}

function stripSidoPrefix(text, sido) {
  const rawText = String(text || '').trim();
  const rawSido = String(sido || '').trim();
  if (!rawText || !rawSido) return rawText;
  if (rawText === rawSido) return '';
  if (rawText.startsWith(`${rawSido} `)) {
    return rawText.slice(rawSido.length + 1).trim();
  }
  return rawText;
}

function stripCityPrefix(text) {
  const rawText = String(text || '').trim();
  if (!rawText.includes(' ')) return rawText;

  const parts = rawText.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return rawText;

  if (/(시|군)$/.test(parts[0])) {
    return parts.slice(1).join(' ').trim();
  }

  return rawText;
}

export function normalizeSigunguVariants(text, sido = '') {
  const rawText = String(text || '').trim();
  if (!rawText) return [];

  const variants = new Set();
  const queue = [rawText, stripSidoPrefix(rawText, sido)].filter(Boolean);

  while (queue.length) {
    const current = queue.shift();
    const normalizedCurrent = normalizeRegionText(current);
    if (!normalizedCurrent || variants.has(normalizedCurrent)) continue;

    variants.add(normalizedCurrent);

    const withoutSido = stripSidoPrefix(current, sido);
    const withoutCity = stripCityPrefix(current);

    if (withoutSido && normalizeRegionText(withoutSido) !== normalizedCurrent) {
      queue.push(withoutSido);
    }

    if (withoutCity && normalizeRegionText(withoutCity) !== normalizedCurrent) {
      queue.push(withoutCity);
    }
  }

  return [...variants];
}

function getDistrictVariants(district) {
  const variants = new Set();
  const sourceValues = [
    district?.sigungu,
    district?.fullName,
    ...(Array.isArray(district?.aliases) ? district.aliases : []),
  ];

  sourceValues.forEach((value) => {
    const rawValue = String(value || '').trim();
    if (!rawValue) return;

    addVariant(variants, rawValue);
    addVariant(variants, stripSidoPrefix(rawValue, district?.sido || ''));
    addVariant(variants, stripCityPrefix(rawValue));
    addVariant(variants, stripCityPrefix(stripSidoPrefix(rawValue, district?.sido || '')));
  });

  return variants;
}

export function buildDistrictIndex(regions, notices = []) {
  const centerMap = buildNoticeCenters(notices);

  return regions.flatMap((region) =>
    (region.districts || []).map((district) => {
      const key = `${normalizeRegionText(region.name)}::${normalizeRegionText(district.sigungu)}`;
      return {
        area: region.area,
        sido: region.name,
        sigungu: district.sigungu,
        fullName: district.sigungu === region.name ? region.name : `${region.name} ${district.sigungu}`,
        adminCode: district.adminCode || '',
        aliases: district.aliases || [],
        center: district.center || centerMap.get(key) || null,
      };
    })
  );
}

export function findDistrictByName(districts, sido, sigungu) {
  const normalizedSido = normalizeRegionText(sido);
  const candidateVariants = normalizeSigunguVariants(sigungu, sido);

  if (!normalizedSido || !candidateVariants.length) {
    return null;
  }

  return districts.find((district) => {
    if (normalizeRegionText(district.sido) !== normalizedSido) {
      return false;
    }

    const districtVariants = getDistrictVariants(district);
    return candidateVariants.some((candidate) => districtVariants.has(candidate));
  }) || null;
}

export function findNearestDistrict(coords, districts, maxDistanceKm = 25) {
  const ranked = districts
    .filter((district) => district.center)
    .map((district) => ({
      ...district,
      distanceKm: haversineKm(coords, district.center),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  if (!ranked.length || ranked[0].distanceKm > maxDistanceKm) return null;
  return ranked[0];
}

export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('이 브라우저는 위치 확인을 지원하지 않습니다.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000,
      ...options,
    });
  });
}

export async function reverseGeocodeDistrict(coords, districts) {
  console.info('[geo] browser coords', {
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? coords?.lon ?? null,
  });

  let reverseFailureReason = '';

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.lat}&lon=${coords.lng}&accept-language=ko`,
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) throw new Error('reverse-geocode-failed');
    const payload = await response.json();
    console.info('[geo] reverse address payload', payload);

    const address = payload.address || {};
    const sido = parseSido(address);
    const sigungu = parseSigungu(address, sido);
    const legalDong = parseLegalDong(address);

    console.info('[geo] parsed sido/sigungu/legalDong', {
      sido,
      sigungu,
      legalDong,
    });

    if (sido && sigungu) {
      const matchedDistrict = findDistrictByName(districts, sido, sigungu);
      console.info('[geo] matchedDistrict', matchedDistrict ? {
        sido: matchedDistrict.sido,
        sigungu: matchedDistrict.sigungu,
        fullName: matchedDistrict.fullName,
      } : null);

      if (matchedDistrict) {
        console.info('[geo] matchSource', {
          matchSource: 'reverse-geocode',
          isTrusted: true,
          confidence: 'high',
        });

        return {
          region: matchedDistrict,
          legalDong,
          matchSource: 'reverse-geocode',
          confidence: 'high',
          isTrusted: true,
        };
      }

      console.info('[geo] matchSource', {
        matchSource: 'reverse-geocode-unlisted',
        isTrusted: false,
        confidence: 'low',
      });

      return {
        region: null,
        parsedRegion: {
          sido,
          sigungu,
          fullName: `${sido} ${sigungu}`,
          center: null,
        },
        legalDong,
        matchSource: 'reverse-geocode-unlisted',
        confidence: 'low',
        isTrusted: false,
        fallbackReason: 'reverse-geocode-sigungu-not-in-district-index',
      };
    }

    reverseFailureReason = 'reverse-geocode-missing-sido-or-sigungu';
  } catch (error) {
    reverseFailureReason = String(error?.message || 'reverse-geocode-failed');
  }

  const fallback = findNearestDistrict(coords, districts);
  console.info('[geo] matchSource', {
    matchSource: 'nearest-district',
    isTrusted: false,
    confidence: 'low',
    fallbackReason: reverseFailureReason || 'reverse-geocode-no-match',
    nearestCandidate: fallback ? {
      sido: fallback.sido,
      sigungu: fallback.sigungu,
      fullName: fallback.fullName,
      distanceKm: fallback.distanceKm ?? null,
    } : null,
  });

  if (!fallback) return null;

  return {
    region: null,
    legalDong: '',
    nearestCandidate: fallback,
    matchSource: 'nearest-district',
    confidence: 'low',
    isTrusted: false,
    fallbackReason: reverseFailureReason || 'reverse-geocode-no-match',
  };
}
