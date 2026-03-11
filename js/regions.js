import { loadRegions } from './notices.js';

const sidoUrl = new URL('../data/sido.json', import.meta.url);
const sigunguUrl = new URL('../data/sigungu.json', import.meta.url);
const adjacencyUrl = new URL('../data/region-adjacency.json', import.meta.url);

let sidoCache;
let sigunguCache;
let adjacencyCache;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  return response.json();
}

export async function loadSidoCatalog() {
  if (!sidoCache) sidoCache = fetchJson(sidoUrl);
  return sidoCache;
}

export async function loadSigunguCatalog() {
  if (!sigunguCache) sigunguCache = fetchJson(sigunguUrl);
  return sigunguCache;
}

export async function loadRegionAdjacency() {
  if (!adjacencyCache) adjacencyCache = fetchJson(adjacencyUrl);
  return adjacencyCache;
}

export async function loadRegionCatalog() {
  const [regions, sidos, sigungus, adjacency] = await Promise.all([
    loadRegions(),
    loadSidoCatalog(),
    loadSigunguCatalog(),
    loadRegionAdjacency(),
  ]);

  return { regions, sidos, sigungus, adjacency };
}

export function getNationMeta() {
  return {
    area: 'nation',
    name: '전국',
    shortName: '전국',
    adminCode: '00',
    center: { lat: 36.35, lng: 127.85 },
    defaultZoom: 7,
  };
}

export function getRegionHref({ scope = 'nation', sido = '', sigungu = '' } = {}) {
  const params = new URLSearchParams();
  if (scope === 'nation') {
    params.set('scope', 'nation');
  } else if (sido && sigungu) {
    params.set('sido', sido);
    params.set('sigungu', sigungu);
  } else if (sido) {
    params.set('sido', sido);
  } else {
    params.set('scope', 'nation');
  }
  return `region.html?${params.toString()}`;
}

export function parseRegionQuery(search = window.location.search) {
  const params = new URLSearchParams(search);
  const sido = params.get('sido') || '';
  const sigungu = params.get('sigungu') || '';
  const scope = params.get('scope') || (sido ? 'sido' : 'nation');

  if (sido && sigungu) return { scope: 'sigungu', sido, sigungu };
  if (sido) return { scope: 'sido', sido, sigungu: '' };
  return { scope: scope === 'nation' ? 'nation' : 'nation', sido: '', sigungu: '' };
}

export function flattenDistricts(regions) {
  return regions.flatMap((region) =>
    (region.districts || []).map((district) => ({
      ...district,
      area: region.area,
      sido: region.name,
      fullName: district.sigungu === region.name ? region.name : `${region.name} ${district.sigungu}`,
    }))
  );
}

export function findRegionBySido(regions, sido) {
  return regions.find((region) => region.name === sido) || null;
}

export function findDistrictByRegion(regions, sido, sigungu) {
  const region = findRegionBySido(regions, sido);
  const district = region?.districts?.find((item) => item.sigungu === sigungu) || null;
  if (!region || !district) return null;
  return {
    ...district,
    area: region.area,
    sido: region.name,
    fullName: district.sigungu === region.name ? region.name : `${region.name} ${district.sigungu}`,
  };
}

export function getRegionDisplayName({ scope, sido, sigungu }) {
  if (scope === 'sigungu' && sido && sigungu) return `${sido} ${sigungu}`;
  if (scope === 'sido' && sido) return sido;
  return '전국';
}

export function getAdjacentDistricts(adjacencyMap, districts, region) {
  if (!adjacencyMap || !districts?.length || !region) return [];

  const districtByCode = new Map(
    districts
      .filter((district) => district.adminCode)
      .map((district) => [district.adminCode, district])
  );

  const regionCode = region.adminCode || '';
  const directAdjacentCodes = regionCode && Array.isArray(adjacencyMap[regionCode]) ? adjacencyMap[regionCode] : [];
  const reverseAdjacentCodes = regionCode
    ? Object.entries(adjacencyMap)
      .filter(([, adjacent]) => Array.isArray(adjacent) && adjacent.includes(regionCode))
      .map(([code]) => code)
    : [];

  const exactMatches = [...new Set([...directAdjacentCodes, ...reverseAdjacentCodes])]
    .map((code) => districtByCode.get(code))
    .filter(Boolean)
    .filter((district) => district.sigungu !== region.sigungu || district.sido !== region.sido);

  if (exactMatches.length) {
    return exactMatches.sort((a, b) => a.sigungu.localeCompare(b.sigungu, 'ko'));
  }

  const cityKey = getSharedCityKey(region);
  if (!cityKey) return [];

  return districts
    .filter((district) => getSharedCityKey(district) === cityKey)
    .filter((district) => district.sigungu !== region.sigungu || district.sido !== region.sido)
    .sort((a, b) => a.sigungu.localeCompare(b.sigungu, 'ko'));
}

function getSharedCityKey(region) {
  const sigungu = String(region?.sigungu || '').trim();
  const sido = String(region?.sido || '').trim();
  const [firstToken] = sigungu.split(' ');

  if (!sido || !firstToken || !firstToken.endsWith('시') || !sigungu.includes(' ')) return '';
  return `${sido}::${firstToken}`;
}
