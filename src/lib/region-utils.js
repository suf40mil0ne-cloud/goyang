import regions from '../../data/regions.json';

const districtIndex = regions.flatMap((region) =>
  (region.districts || []).map((district) => ({
    sido: region.name,
    shortSido: region.shortName || region.name,
    sigungu: district.sigungu,
    aliases: [region.name, region.shortName, district.sigungu, ...(district.aliases || [])]
      .filter(Boolean)
      .map(normalizeText),
  }))
);

export function normalizeText(value = '') {
  return String(value).replace(/\s+/g, '').trim().toLowerCase();
}

export function getRegions() {
  return regions;
}

export function getDistrictIndex() {
  return districtIndex;
}

export function getDistrictsForSido(sido) {
  return regions.find((region) => region.name === sido)?.districts || [];
}

export function matchRegionByText(sourceText = '') {
  const normalized = normalizeText(sourceText);
  if (!normalized) return null;

  return districtIndex.find((district) =>
    district.aliases.some((alias) => normalized.includes(alias))
  ) || null;
}

export function matchRegionFromAddress(address = {}) {
  const parts = [
    address.state,
    address.region,
    address.province,
    address.city,
    address.city_district,
    address.district,
    address.county,
    address.suburb,
    address.borough,
  ].filter(Boolean);

  const fullText = parts.join(' ');
  const normalizedFullText = normalizeText(fullText);
  const matched = matchRegionByText(fullText);
  if (matched) return { sido: matched.sido, sigungu: matched.sigungu };

  const normalizedState = normalizeText(address.state || address.region || address.province || '');
  const normalizedCity = normalizeText(
    address.city_district || address.district || address.county || address.borough || address.city || ''
  );

  for (const region of regions) {
    const regionNames = [region.name, region.shortName, ...(region.aliases || [])].map(normalizeText);
    if (!regionNames.some((name) => normalizedState.includes(name) || normalizedCity.includes(name))) {
      continue;
    }

    const district = (region.districts || []).find((item) => {
      const aliases = [item.sigungu, ...(item.aliases || [])].map(normalizeText);
      return aliases.some((alias) => normalizedCity.includes(alias) || normalizedFullText.includes(alias));
    });

    if (district) {
      return { sido: region.name, sigungu: district.sigungu };
    }
  }

  return null;
}

export function formatRegionLabel(region) {
  if (!region) return '선택된 지역 없음';
  return region.sigungu === region.sido ? region.sido : `${region.sido} ${region.sigungu}`;
}
