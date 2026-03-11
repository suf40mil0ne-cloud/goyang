import { haversineKm, normalizeRegionText } from './filters.js';

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

  if (stateText.includes('서울')) return '서울특별시';
  if (stateText.includes('인천')) return '인천광역시';
  if (stateText.includes('경기')) return '경기도';
  return stateText;
}

function parseSigungu(address = {}, sido = '') {
  const districtLike = [address.city_district, address.borough, address.district]
    .find((value) => /구$/.test(value || '')) || '';
  const cityLike = [address.city, address.municipality, address.county]
    .find((value) => /(시|군)$/.test(value || '')) || '';
  const countyLike = address.county || '';

  if (sido === '서울특별시' || sido === '인천광역시') {
    return districtLike || countyLike || '';
  }

  if (sido === '경기도') {
    if (cityLike && districtLike) return `${cityLike} ${districtLike}`;
    return cityLike || countyLike || districtLike || '';
  }

  return districtLike || cityLike || countyLike || '';
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
        fullName: `${region.name} ${district.sigungu}`,
        aliases: district.aliases || [],
        center: centerMap.get(key) || null,
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
