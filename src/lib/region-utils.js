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
  const stateText = address.state || address.region || address.province || '';
  const cityText = address.city || address.town || address.municipality || address.village || '';
  const districtTexts = [
    address.county,
    address.suburb,
    address.city_district,
    address.borough,
    address.district,
    cityText,
  ].filter(Boolean);
  const fullText = [
    stateText,
    cityText,
    address.county,
    address.suburb,
    address.city_district,
    address.borough,
    address.district,
  ].filter(Boolean).join(' ');
  const normalizedState = normalizeText(stateText);

  const regionNameMatches = (region, value) => {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) return false;
    const names = [region.name, region.shortName, ...(region.aliases || [])].map(normalizeText);
    return names.some((name) => normalizedValue.includes(name) || name.includes(normalizedValue));
  };

  const districtCandidates = districtTexts.flatMap((text, index) => {
    const current = String(text || '').trim();
    if (!current) return [];
    const combined = cityText && index < districtTexts.length - 1 ? [cityText, current].join(' ') : '';
    return combined && combined !== current ? [combined, current] : [current];
  });

  const findDistrictInRegion = (region) => {
    for (const candidate of districtCandidates) {
      const normalizedCandidate = normalizeText(candidate);
      if (!normalizedCandidate) continue;

      const matches = (region.districts || []).filter((district) => {
        const aliases = [district.sigungu, ...(district.aliases || [])].map(normalizeText);
        return aliases.some((alias) => alias.includes(normalizedCandidate) || normalizedCandidate.includes(alias));
      });

      if (!matches.length) {
        continue;
      }

      const exactMatch = matches.find((district) => {
        const aliases = [district.sigungu, ...(district.aliases || [])].map(normalizeText);
        return aliases.includes(normalizedCandidate);
      });

      if (exactMatch) {
        return exactMatch;
      }

      if (candidate !== cityText || matches.length === 1) {
        return matches[0];
      }
    }

    return null;
  };

  const stateRegions = normalizedState ? regions.filter((region) => regionNameMatches(region, stateText)) : [];
  const candidateRegions = stateRegions.length ? stateRegions : regions;

  for (const region of candidateRegions) {
    const district = findDistrictInRegion(region);
    if (district) {
      return { sido: region.name, sigungu: district.sigungu };
    }
  }

  const matched = matchRegionByText(fullText);
  if (matched && (!normalizedState || stateRegions.some((region) => region.name === matched.sido))) {
    return { sido: matched.sido, sigungu: matched.sigungu };
  }

  console.warn('[region-match] unable to match address', address);
  return null;
}


export function formatRegionLabel(region) {
  if (!region) return '선택된 지역 없음';
  return region.sigungu === region.sido ? region.sido : `${region.sido} ${region.sigungu}`;
}
