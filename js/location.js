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
  const normalizedSigungu = normalizeRegionText(sigungu);

  return districts.find((district) =>
    normalizeRegionText(district.sido) === normalizedSido &&
    normalizeRegionText(district.sigungu) === normalizedSigungu
  ) || null;
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
    const address = payload.address || {};
    const sido = parseSido(address);
    const sigungu = parseSigungu(address, sido);
    const legalDong = parseLegalDong(address);

    if (sido && sigungu) {
      const matchedDistrict = findDistrictByName(districts, sido, sigungu);
      return {
        region: matchedDistrict || {
          sido,
          sigungu,
          fullName: `${sido} ${sigungu}`,
          center: null,
        },
        legalDong,
        matchSource: matchedDistrict ? 'reverse-geocode' : 'reverse-geocode-unlisted',
      };
    }
  } catch (error) {
    // Fall through to local fallback below.
  }

  const fallback = findNearestDistrict(coords, districts);
  if (!fallback) return null;

  return {
    region: fallback,
    legalDong: '',
    matchSource: 'nearest-district',
  };
}
