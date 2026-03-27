import regions from '../../data/regions.json';
import { findHearingRegionFieldsByText, getCityHierarchyByName, getRegionHierarchyByRegion } from '../../shared/region-codes';

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

const AMBIGUOUS_STANDALONE_DISTRICTS = new Set([
  '서구',
  '동구',
  '남구',
  '북구',
  '중구',
].map(normalizeText));

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
  const matched = findHearingRegionFieldsByText(sourceText, 'text-fallback');
  if (!matched) {
    return null;
  }

  return {
    sido: matched.sido,
    sigungu: matched.sigungu,
    cityLevelRegionName: matched.cityLevelRegionName,
    cityLevelRegionKey: matched.cityLevelRegionKey,
    districtLevelRegionName: matched.districtLevelRegionName,
    districtLevelRegionKey: matched.districtLevelRegionKey,
    matchedCity: matched.matchedCity,
    matchedDistrict: matched.matchedDistrict,
    regionMatchType: matched.regionMatchType,
  };
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

  const buildMatchedRegion = (fields, stage, extras = {}) => {
    if (!fields) {
      return null;
    }

    console.info('[location-debug] parsed region/district', {
      stage,
      region: { sido: fields.sido, sigungu: fields.sigungu },
      matchedCity: fields.matchedCity,
      matchedDistrict: fields.matchedDistrict,
      regionMatchType: fields.regionMatchType,
      ...extras,
    });

    return {
      sido: fields.sido,
      sigungu: fields.sigungu,
      cityLevelRegionName: fields.cityLevelRegionName,
      cityLevelRegionKey: fields.cityLevelRegionKey,
      districtLevelRegionName: fields.districtLevelRegionName,
      districtLevelRegionKey: fields.districtLevelRegionKey,
      matchedCity: fields.matchedCity,
      matchedDistrict: fields.matchedDistrict,
      regionMatchType: fields.regionMatchType,
    };
  };

  const buildCityOnlyMatch = (candidateRegions, stage) => {
    if (!cityText) {
      return null;
    }

    for (const region of candidateRegions) {
      const cityOnly = getCityHierarchyByName(region.name, cityText, 'city-only');
      if (cityOnly) {
        return buildMatchedRegion(cityOnly, stage, {
          cityValue: cityText,
        });
      }
    }

    return null;
  };

  const findExplicitDistrictInRegion = (region) => {
    for (const [cityValue, districtValue] of explicitDistrictCombos) {
      const normalizedCombined = normalizeText([cityValue, districtValue].join(' '));
      if (!normalizedCombined) continue;

      const district = (region.districts || []).find((item) => hasExactDistrictAlias(item, normalizedCombined));
      if (district) {
        return buildMatchedRegion(
          getRegionHierarchyByRegion(region.name, district.sigungu),
          'explicit-combo-exact-match',
          {
            cityValue,
            districtValue,
            combined: normalizedCombined,
          }
        );
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

      return buildMatchedRegion(
        getRegionHierarchyByRegion(region.name, exactMatch.sigungu),
        'candidate-exact-match',
        {
          candidate,
        }
      );
    }

    return null;
  };

  const candidateRegions = stateRegions.length
    ? stateRegions
    : cityScopedRegions;

  if (explicitDistrictCombos.length) {
    const explicitCandidateRegions = candidateRegions.length ? candidateRegions : regions;

    for (const region of explicitCandidateRegions) {
      const districtMatch = findExplicitDistrictInRegion(region);
      if (districtMatch) {
        return districtMatch;
      }
    }

    const cityOnlyMatch = buildCityOnlyMatch(explicitCandidateRegions, 'explicit-combo-city-only');
    if (cityOnlyMatch) {
      return cityOnlyMatch;
    }

    console.warn('[region-match] explicit combo match failed', {
      address,
      explicitDistrictCombos,
      stateRegionNames: stateRegions.map((region) => region.name),
      cityScopedRegionNames: cityScopedRegions.map((region) => region.name),
    });
    return null;
  }

  for (const region of candidateRegions) {
    const districtMatch = findDistrictInRegion(region);
    if (districtMatch) {
      return districtMatch;
    }
  }

  const fullTextMatch = candidateRegions.length
    ? findHearingRegionFieldsByText(fullText, 'text-fallback')
    : null;
  if (fullTextMatch && candidateRegions.some((region) => region.name === fullTextMatch.sido)) {
    return buildMatchedRegion(fullTextMatch, 'full-text-exact-match', {
      fullText,
    });
  }

  const cityOnlyMatch = buildCityOnlyMatch(candidateRegions, 'city-only-match');
  if (cityOnlyMatch) {
    return cityOnlyMatch;
  }

  console.warn('[region-match] unable to match address', address);
  return null;
}

export function formatRegionLabel(region) {
  if (!region) return '선택된 지역 없음';
  return region.sigungu === region.sido ? region.sido : region.sido + ' ' + region.sigungu;
}
