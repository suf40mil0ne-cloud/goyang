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

  const districtAliases = (district) => [district.sigungu, ...(district.aliases || [])].map(normalizeText);

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
  });

  const findExplicitDistrictInRegion = (region) => {
    const cityMatchesRegion = cityText && regionNameMatches(region, cityText);

    for (const [cityValue, districtValue] of explicitDistrictCombos) {
      const normalizedCity = normalizeText(cityValue);
      const normalizedDistrict = normalizeText(districtValue);
      const normalizedCombined = normalizeText([cityValue, districtValue].join(" "));
      if (!normalizedCity || !normalizedDistrict) continue;

      const district = (region.districts || []).find((item) => {
        const aliases = districtAliases(item);
        const combinedMatch = aliases.some((alias) => alias.includes(normalizedCombined) || normalizedCombined.includes(alias));
        const splitMatch = aliases.some((alias) => alias.includes(normalizedCity) && alias.includes(normalizedDistrict));
        const districtOnlyMatch = aliases.some((alias) => alias.includes(normalizedDistrict) || normalizedDistrict.includes(alias));

        if (cityMatchesRegion) {
          return combinedMatch || districtOnlyMatch;
        }

        return combinedMatch || splitMatch;
      });

      if (district) {
        console.info('[location-debug] parsed region/district', {
          stage: 'explicit-combo-match',
          region: { sido: region.name, sigungu: district.sigungu },
          cityValue,
          districtValue,
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

      const matches = (region.districts || []).filter((district) => {
        const aliases = districtAliases(district);
        return aliases.some((alias) => alias.includes(normalizedCandidate) || normalizedCandidate.includes(alias));
      });

      if (!matches.length) {
        continue;
      }

      const exactMatch = matches.find((district) => {
        const aliases = districtAliases(district);
        return aliases.includes(normalizedCandidate);
      });

      if (exactMatch) {
        console.info('[location-debug] parsed region/district', {
          stage: 'candidate-exact-match',
          region: { sido: region.name, sigungu: exactMatch.sigungu },
          candidate,
        });
        return exactMatch;
      }

      if (candidate !== cityText || matches.length === 1) {
        console.info('[location-debug] parsed region/district', {
          stage: 'candidate-fallback-match',
          region: { sido: region.name, sigungu: matches[0].sigungu },
          candidate,
        });
        return matches[0];
      }
    }

    return null;
  };

  const stateRegions = normalizedState ? regions.filter((region) => regionNameMatches(region, stateText)) : [];
  const candidateRegions = stateRegions.length ? stateRegions : regions;

  for (const region of candidateRegions) {
    const district = findExplicitDistrictInRegion(region);
    if (district) {
      return { sido: region.name, sigungu: district.sigungu };
    }
  }

  for (const region of candidateRegions) {
    const district = findDistrictInRegion(region);
    if (district) {
      return { sido: region.name, sigungu: district.sigungu };
    }
  }

  const matched = matchRegionByText(fullText);
  if (matched && (!normalizedState || stateRegions.some((region) => region.name === matched.sido))) {
    console.info('[location-debug] parsed region/district', {
      stage: 'full-text-match',
      region: { sido: matched.sido, sigungu: matched.sigungu },
      fullText,
    });
    return { sido: matched.sido, sigungu: matched.sigungu };
  }

  console.warn('[region-match] unable to match address', address);
  return null;
}

export function formatRegionLabel(region) {
  if (!region) return '선택된 지역 없음';
  return region.sigungu === region.sido ? region.sido : `${region.sido} ${region.sigungu}`;
}
