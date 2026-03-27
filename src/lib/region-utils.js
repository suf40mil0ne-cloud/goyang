import regions from '../../data/regions.json';

const AMBIGUOUS_STANDALONE_DISTRICTS = new Set([
  '서구',
  '동구',
  '남구',
  '북구',
  '중구',
].map(normalizeText));

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
  const normalizedCity = normalizeText(cityText);

  const regionNameMatches = (region, value) => {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) return false;
    const names = [region.name, region.shortName, ...(region.aliases || [])].map(normalizeText);
    return names.includes(normalizedValue);
  };

  const districtAliases = (district) => [...new Set([district.sigungu, ...(district.aliases || [])].map(normalizeText).filter(Boolean))];
  const hasExactDistrictAlias = (district, value) => districtAliases(district).includes(normalizeText(value));
  const isAmbiguousStandaloneDistrict = (value) => AMBIGUOUS_STANDALONE_DISTRICTS.has(normalizeText(value));
  const isCityScopedDistrict = (district, cityValue) => {
    const normalizedCityValue = normalizeText(cityValue);
    if (!normalizedCityValue) return false;
    return districtAliases(district).some((alias) => alias === normalizedCityValue || alias.startsWith(normalizedCityValue));
  };

  const explicitDistrictCombos = [
    [cityText, address.borough],
    [cityText, address.suburb],
    [cityText, address.city_district],
  ].filter(([cityValue, districtValue]) => cityValue && districtValue);

  const districtCandidates = districtTexts.flatMap((text, index) => {
    const current = String(text || '').trim();
    if (!current) return [];
    const combined = cityText && index < districtTexts.length - 1 ? [cityText, current].join(' ') : '';
    return combined && combined !== current ? [combined, current] : [current];
  });

  const stateRegions = normalizedState ? regions.filter((region) => regionNameMatches(region, stateText)) : [];
  const cityScopedRegions = normalizedCity
    ? regions.filter((region) => (region.districts || []).some((district) => isCityScopedDistrict(district, cityText)))
    : [];

  // Debug only: log the parsed address fields and candidate combinations used for matching.
  console.info('[location-debug] parsed region/district candidates', {
    stateText,
    cityText,
    borough: address.borough || '',
    suburb: address.suburb || '',
    cityDistrict: address.city_district || '',
    county: address.county || '',
    districtTexts,
    explicitDistrictCombos,
    fullText,
    stateRegionNames: stateRegions.map((region) => region.name),
    cityScopedRegionNames: cityScopedRegions.map((region) => region.name),
  });

  const findExplicitDistrictInRegion = (region) => {
    for (const [cityValue, districtValue] of explicitDistrictCombos) {
      const normalizedCombined = normalizeText([cityValue, districtValue].join(' '));
      if (!normalizedCombined) continue;

      const district = (region.districts || []).find((item) => hasExactDistrictAlias(item, normalizedCombined));
      if (district) {
        console.info('[location-debug] parsed region/district', {
          stage: 'explicit-combo-exact-match',
          region: { sido: region.name, sigungu: district.sigungu },
          cityValue,
          districtValue,
          combined: normalizedCombined,
        });
        return district;
      }
    }

    return null;
  };

  const findDistrictInRegion = (region) => {
    for (const candidate of districtCandidates) {
      const normalizedCandidate = normalizeText(candidate);
      if (!normalizedCandidate) continue;
      if (isAmbiguousStandaloneDistrict(candidate)) {
        console.info('[location-debug] parsed region/district', {
          stage: 'candidate-skipped-ambiguous',
          region: region.name,
          candidate,
        });
        continue;
      }

      const exactMatch = (region.districts || []).find((district) => hasExactDistrictAlias(district, normalizedCandidate));
      if (!exactMatch) {
        continue;
      }

      console.info('[location-debug] parsed region/district', {
        stage: 'candidate-exact-match',
        region: { sido: region.name, sigungu: exactMatch.sigungu },
        candidate,
      });
      return exactMatch;
    }

    return null;
  };

  if (explicitDistrictCombos.length) {
    const explicitCandidateRegions = stateRegions.length
      ? stateRegions
      : cityScopedRegions.length
        ? cityScopedRegions
        : regions;

    for (const region of explicitCandidateRegions) {
      const district = findExplicitDistrictInRegion(region);
      if (district) {
        return { sido: region.name, sigungu: district.sigungu };
      }
    }

    console.warn('[region-match] explicit combo match failed', {
      address,
      explicitDistrictCombos,
      stateRegionNames: stateRegions.map((region) => region.name),
      cityScopedRegionNames: cityScopedRegions.map((region) => region.name),
    });
    return null;
  }

  const candidateRegions = stateRegions.length
    ? stateRegions
    : cityScopedRegions;

  for (const region of candidateRegions) {
    const district = findDistrictInRegion(region);
    if (district) {
      return { sido: region.name, sigungu: district.sigungu };
    }
  }

  const fullTextCandidates = [...new Set([
    fullText,
    ...districtCandidates,
  ].map(normalizeText).filter(Boolean))];

  for (const region of candidateRegions) {
    for (const district of region.districts || []) {
      const aliases = districtAliases(district);
      const matchedCandidate = fullTextCandidates.find((candidate) => (
        !isAmbiguousStandaloneDistrict(candidate)
        && aliases.includes(candidate)
      ));

      if (matchedCandidate) {
        console.info('[location-debug] parsed region/district', {
          stage: 'full-text-exact-match',
          region: { sido: region.name, sigungu: district.sigungu },
          candidate: matchedCandidate,
          fullText,
        });
        return { sido: region.name, sigungu: district.sigungu };
      }
    }
  }

  console.warn('[region-match] unable to match address', address);
  return null;
}

export function formatRegionLabel(region) {
  if (!region) return '선택된 지역 없음';
  return region.sigungu === region.sido ? region.sido : `${region.sido} ${region.sigungu}`;
}
