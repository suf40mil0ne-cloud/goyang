import sigunguData from '../data/sigungu.json';

type RegionEntry = {
  sido?: string;
  sigungu?: string;
  adminCode?: string;
  aliases?: string[];
};

type RegionHierarchyEntry = {
  sido: string;
  sigungu: string;
  adminCode: string;
  aliases: string[];
  cityName: string;
  cityAliases: string[];
  districtName: string | null;
  districtAliases: string[];
  cityLevelRegionName: string;
  cityLevelRegionKey: string;
  districtLevelRegionName: string | null;
  districtLevelRegionKey: string | null;
};

type CityHierarchyEntry = {
  sido: string;
  cityName: string;
  cityAliases: string[];
  cityLevelRegionName: string;
  cityLevelRegionKey: string;
};

export type HearingRegionMatchType = 'district-exact' | 'city-only' | 'text-fallback' | 'unmatched';

export type HearingRegionFields = {
  sido: string;
  sigungu: string;
  region?: string;
  sigunguCode?: string;
  cityLevelRegionName: string;
  cityLevelRegionKey: string;
  districtLevelRegionName: string | null;
  districtLevelRegionKey: string | null;
  matchedCity: string;
  matchedDistrict: string | null;
  regionMatchType: HearingRegionMatchType;
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function uniqueNormalized(values: unknown[]): string[] {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

function stripAdministrativeSuffix(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/(특별자치도|특별자치시|특별시|광역시|자치시|자치도)$/u, '')
    .replace(/(시|군|구)$/u, '')
    .trim();
}

function buildRegionKey(scope: 'city' | 'district', sido: string, cityName: string, districtName?: string | null): string {
  return [scope, normalizeText(sido), normalizeText(cityName), normalizeText(districtName)]
    .filter(Boolean)
    .join('::');
}

function deriveCityAndDistrict(sido: string, sigungu: string): { cityName: string; districtName: string | null } {
  const parts = String(sigungu || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return {
      cityName: parts[0],
      districtName: parts.slice(1).join(' '),
    };
  }

  if (/[시군]$/u.test(sigungu)) {
    return {
      cityName: sigungu,
      districtName: null,
    };
  }

  if (/구$/u.test(sigungu)) {
    return {
      cityName: sido,
      districtName: sigungu,
    };
  }

  return {
    cityName: sigungu,
    districtName: null,
  };
}

export function normalizeSigunguCode(value: unknown): string {
  const digits = String(value ?? '').replace(/\D+/g, '');
  return digits.slice(0, 5);
}

const AMBIGUOUS_DISTRICT_ALIASES = new Set([
  // 광역시에 동일 이름으로 존재하는 구 이름 (시 맥락 없이 단독 매칭 금지)
  '서구',
  '동구',
  '남구',
  '북구',
  '중구',
  // sigungu.json의 단일 문자 alias ("서", "동" 등)는 너무 짧아 오매칭 유발 가능
  // 예: "서울특별시 공고" 텍스트에서 부산 서구의 alias "서"가 매칭되는 문제 방지
  '서',
  '동',
  '남',
  '북',
  '중',
  '일산서구',
  '일산동구',
  '수정구',
  '중원구',
  '분당구',
  '장안구',
  '권선구',
  '팔달구',
  '영통구',
  '만안구',
  '동안구',
  '상록구',
  '단원구',
  '덕양구',
  '처인구',
  '기흥구',
  '수지구',
  '동남구',
  '서북구',
  '완산구',
  '덕진구',
  '상당구',
  '서원구',
  '흥덕구',
  '청원구',
  '남구',
  '포항시 남구',
  '포항시 북구',
  '의창구',
  '성산구',
  '마산합포구',
  '마산회원구',
  '진해구',
].map(normalizeText));

const regionEntries = (sigunguData as RegionEntry[]).map((entry) => ({
  sido: String(entry.sido ?? '').trim(),
  sigungu: String(entry.sigungu ?? '').trim(),
  adminCode: normalizeSigunguCode(entry.adminCode),
  aliases: uniqueNormalized([entry.sigungu, ...(entry.aliases ?? [])]),
}));

const manualRegionEntries = [
  ['서울특별시', '종로구', '11110'],
  ['서울특별시', '중구', '11140'],
  ['서울특별시', '용산구', '11170'],
  ['서울특별시', '성동구', '11200'],
  ['서울특별시', '광진구', '11215'],
  ['서울특별시', '동대문구', '11230'],
  ['서울특별시', '중랑구', '11260'],
  ['서울특별시', '성북구', '11290'],
  ['서울특별시', '강북구', '11305'],
  ['서울특별시', '도봉구', '11320'],
  ['서울특별시', '노원구', '11350'],
  ['서울특별시', '은평구', '11380'],
  ['서울특별시', '서대문구', '11410'],
  ['서울특별시', '마포구', '11440'],
  ['서울특별시', '양천구', '11470'],
  ['서울특별시', '강서구', '11500'],
  ['서울특별시', '구로구', '11530'],
  ['서울특별시', '금천구', '11545'],
  ['서울특별시', '영등포구', '11560'],
  ['서울특별시', '동작구', '11590'],
  ['서울특별시', '관악구', '11620'],
  ['서울특별시', '서초구', '11650'],
  ['서울특별시', '강남구', '11680'],
  ['서울특별시', '송파구', '11710'],
  ['서울특별시', '강동구', '11740'],
].map(([sido, sigungu, adminCode]) => ({
  sido,
  sigungu,
  adminCode,
  aliases: uniqueNormalized([sigungu]),
}));

for (const manualEntry of manualRegionEntries) {
  if (!regionEntries.some((entry) => entry.adminCode === manualEntry.adminCode)) {
    regionEntries.push(manualEntry);
  }
}

const hierarchyEntries: RegionHierarchyEntry[] = regionEntries.map((entry) => {
  const cityAndDistrict = deriveCityAndDistrict(entry.sido, entry.sigungu);
  const cityName = cityAndDistrict.cityName;
  const districtName = cityAndDistrict.districtName;
  const cityLevelRegionName = cityName ? cityName + ' 전체' : '';
  const cityLevelRegionKey = buildRegionKey('city', entry.sido, cityName);
  const districtLevelRegionName = districtName || null;
  const districtLevelRegionKey = districtName
    ? buildRegionKey('district', entry.sido, cityName, districtName)
    : null;
  const cityAliases = uniqueNormalized([
    cityName,
    stripAdministrativeSuffix(cityName),
    entry.sido,
    stripAdministrativeSuffix(entry.sido),
  ]);
  const districtAliases = uniqueNormalized([
    entry.sigungu,
    districtName,
    districtName && cityName ? cityName + ' ' + districtName : '',
    districtName && cityName ? cityName + districtName : '',
    ...entry.aliases,
  ]);

  return {
    sido: entry.sido,
    sigungu: entry.sigungu,
    adminCode: entry.adminCode,
    aliases: entry.aliases,
    cityName,
    cityAliases,
    districtName,
    districtAliases,
    cityLevelRegionName,
    cityLevelRegionKey,
    districtLevelRegionName,
    districtLevelRegionKey,
  };
});

const cityHierarchyEntries = [...hierarchyEntries.reduce((map, entry) => {
  if (!entry.cityLevelRegionKey) {
    return map;
  }

  const existing = map.get(entry.cityLevelRegionKey);
  if (existing) {
    existing.cityAliases = [...new Set([...existing.cityAliases, ...entry.cityAliases])];
    return map;
  }

  map.set(entry.cityLevelRegionKey, {
    sido: entry.sido,
    cityName: entry.cityName,
    cityAliases: [...entry.cityAliases],
    cityLevelRegionName: entry.cityLevelRegionName,
    cityLevelRegionKey: entry.cityLevelRegionKey,
  });
  return map;
}, new Map<string, CityHierarchyEntry>()).values()];

function buildRegionLabel(sido: string, sigungu: string): string {
  if (!sigungu) {
    return '';
  }

  return sigungu === sido ? sido : [sido, sigungu].filter(Boolean).join(' ');
}

function toHearingRegionFields(
  input: {
    sido: string;
    sigungu?: string;
    sigunguCode?: string;
    cityLevelRegionName: string;
    cityLevelRegionKey: string;
    districtLevelRegionName?: string | null;
    districtLevelRegionKey?: string | null;
    matchedCity: string;
    matchedDistrict?: string | null;
  },
  regionMatchType: HearingRegionMatchType
): HearingRegionFields {
  return {
    sido: input.sido,
    sigungu: input.sigungu || input.matchedCity || '',
    region: buildRegionLabel(input.sido, input.sigungu || input.matchedCity || ''),
    sigunguCode: input.sigunguCode || '',
    cityLevelRegionName: input.cityLevelRegionName,
    cityLevelRegionKey: input.cityLevelRegionKey,
    districtLevelRegionName: input.districtLevelRegionName || null,
    districtLevelRegionKey: input.districtLevelRegionKey || null,
    matchedCity: input.matchedCity,
    matchedDistrict: input.matchedDistrict || null,
    regionMatchType,
  };
}

export function getRegionLabelBySigunguCode(sigunguCode: unknown): string {
  const normalizedCode = normalizeSigunguCode(sigunguCode);
  if (!normalizedCode) {
    return '';
  }

  const matched = hierarchyEntries.find((entry) => entry.adminCode === normalizedCode);
  if (!matched) {
    return normalizedCode;
  }

  return buildRegionLabel(matched.sido, matched.sigungu);
}

export function findSigunguCodeByRegion(sido: unknown, sigungu: unknown): string {
  const normalizedSido = normalizeText(sido);
  const normalizedSigungu = normalizeText(sigungu);

  if (!normalizedSido || !normalizedSigungu) {
    return '';
  }

  const exact = hierarchyEntries.find((entry) =>
    normalizeText(entry.sido) === normalizedSido
    && normalizeText(entry.sigungu) === normalizedSigungu
    && entry.adminCode
  );

  if (exact) {
    return exact.adminCode;
  }

  const aliasMatch = hierarchyEntries.find((entry) =>
    normalizeText(entry.sido) === normalizedSido
    && entry.adminCode
    && entry.districtAliases.some((alias) => alias === normalizedSigungu)
  );

  return aliasMatch?.adminCode ?? '';
}

export type RegionMatch = {
  sido: string;
  sigungu: string;
  sigunguCode: string;
  label: string;
};

export function getRegionHierarchyBySigunguCode(sigunguCode: unknown): HearingRegionFields | null {
  const normalizedCode = normalizeSigunguCode(sigunguCode);
  if (!normalizedCode) {
    return null;
  }

  const matched = hierarchyEntries.find((entry) => entry.adminCode === normalizedCode);
  if (!matched) {
    return null;
  }

  return toHearingRegionFields({
    sido: matched.sido,
    sigungu: matched.sigungu,
    sigunguCode: matched.adminCode,
    cityLevelRegionName: matched.cityLevelRegionName,
    cityLevelRegionKey: matched.cityLevelRegionKey,
    districtLevelRegionName: matched.districtLevelRegionName,
    districtLevelRegionKey: matched.districtLevelRegionKey,
    matchedCity: matched.cityName,
    matchedDistrict: matched.districtName,
  }, matched.districtName ? 'district-exact' : 'city-only');
}

export function getRegionHierarchyByRegion(sido: unknown, sigungu: unknown): HearingRegionFields | null {
  const normalizedSido = normalizeText(sido);
  const normalizedSigungu = normalizeText(sigungu);
  if (!normalizedSido || !normalizedSigungu) {
    return null;
  }

  const matched = hierarchyEntries.find((entry) =>
    normalizeText(entry.sido) === normalizedSido
    && (
      normalizeText(entry.sigungu) === normalizedSigungu
      || entry.districtAliases.includes(normalizedSigungu)
    )
  );

  if (!matched) {
    return null;
  }

  return toHearingRegionFields({
    sido: matched.sido,
    sigungu: matched.sigungu,
    sigunguCode: matched.adminCode,
    cityLevelRegionName: matched.cityLevelRegionName,
    cityLevelRegionKey: matched.cityLevelRegionKey,
    districtLevelRegionName: matched.districtLevelRegionName,
    districtLevelRegionKey: matched.districtLevelRegionKey,
    matchedCity: matched.cityName,
    matchedDistrict: matched.districtName,
  }, matched.districtName ? 'district-exact' : 'city-only');
}

export function getCityHierarchyByName(sido: unknown, cityName: unknown, regionMatchType: HearingRegionMatchType = 'city-only'): HearingRegionFields | null {
  const normalizedSido = normalizeText(sido);
  const normalizedCity = normalizeText(cityName);
  if (!normalizedSido || !normalizedCity) {
    return null;
  }

  const matched = cityHierarchyEntries.find((entry) =>
    normalizeText(entry.sido) === normalizedSido
    && entry.cityAliases.includes(normalizedCity)
  );

  if (!matched) {
    return null;
  }

  return toHearingRegionFields({
    sido: matched.sido,
    sigungu: matched.cityName,
    sigunguCode: '',
    cityLevelRegionName: matched.cityLevelRegionName,
    cityLevelRegionKey: matched.cityLevelRegionKey,
    districtLevelRegionName: null,
    districtLevelRegionKey: null,
    matchedCity: matched.cityName,
    matchedDistrict: null,
  }, regionMatchType);
}

function findBestDistrictHierarchyByText(normalizedValue: string): RegionHierarchyEntry | null {
  let bestMatch: (RegionHierarchyEntry & { score: number }) | null = null;

  for (const entry of hierarchyEntries) {
    if (!entry.districtAliases.length) {
      continue;
    }

    const hasCityContext = entry.cityAliases.some((alias) => normalizedValue.includes(alias));

    for (const alias of entry.districtAliases) {
      if (!alias || !normalizedValue.includes(alias)) {
        continue;
      }

      if (AMBIGUOUS_DISTRICT_ALIASES.has(alias) && !hasCityContext) {
        continue;
      }

      const score = alias.length
        + (hasCityContext ? 16 : 0)
        + (alias === normalizeText(entry.sigungu) ? 10 : 0)
        + (entry.districtName && alias === normalizeText(entry.districtName) ? 8 : 0)
        + (entry.adminCode ? 2 : 0);

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          ...entry,
          score,
        };
      }
    }
  }

  return bestMatch;
}

function findBestCityHierarchyByText(normalizedValue: string): CityHierarchyEntry | null {
  let bestMatch: (CityHierarchyEntry & { score: number }) | null = null;

  for (const entry of cityHierarchyEntries) {
    for (const alias of entry.cityAliases) {
      if (!alias || !normalizedValue.includes(alias)) {
        continue;
      }

      const score = alias.length + (alias === normalizeText(entry.cityName) ? 8 : 0);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          ...entry,
          score,
        };
      }
    }
  }

  return bestMatch;
}

export function findHearingRegionFieldsByText(value: unknown, regionMatchType?: HearingRegionMatchType): HearingRegionFields | null {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return null;
  }

  const districtMatch = findBestDistrictHierarchyByText(normalizedValue);
  if (districtMatch) {
    return toHearingRegionFields({
      sido: districtMatch.sido,
      sigungu: districtMatch.sigungu,
      sigunguCode: districtMatch.adminCode,
      cityLevelRegionName: districtMatch.cityLevelRegionName,
      cityLevelRegionKey: districtMatch.cityLevelRegionKey,
      districtLevelRegionName: districtMatch.districtLevelRegionName,
      districtLevelRegionKey: districtMatch.districtLevelRegionKey,
      matchedCity: districtMatch.cityName,
      matchedDistrict: districtMatch.districtName,
    }, regionMatchType || 'district-exact');
  }

  const cityMatch = findBestCityHierarchyByText(normalizedValue);
  if (!cityMatch) {
    return null;
  }

  return toHearingRegionFields({
    sido: cityMatch.sido,
    sigungu: cityMatch.cityName,
    sigunguCode: '',
    cityLevelRegionName: cityMatch.cityLevelRegionName,
    cityLevelRegionKey: cityMatch.cityLevelRegionKey,
    districtLevelRegionName: null,
    districtLevelRegionKey: null,
    matchedCity: cityMatch.cityName,
    matchedDistrict: null,
  }, regionMatchType || 'city-only');
}

// 공고번호나 기관명 앞부분에 시도 이름이 명시적으로 등장하는 경우 추출.
// 정규 공고 형식: "서울특별시 공고 제2026-996호", "경기도 성남시 공고 ..."
// 긴 형태(세종특별자치시, 강원특별자치도 등)를 먼저 검사해 부분 매칭 방지.
const EXPLICIT_SIDO_NAMES: readonly string[] = [
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '강원특별자치도',
  '전북특별자치도',
  '제주특별자치도',
  '경기도',
  '강원도',
  '충청북도',
  '충청남도',
  '전라북도',
  '전라남도',
  '경상북도',
  '경상남도',
];

export function extractSidoFromText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  for (const sido of EXPLICIT_SIDO_NAMES) {
    if (text.startsWith(sido)) return sido;
  }
  return null;
}

export function findRegionMatchByText(value: unknown): RegionMatch | null {
  const matched = findHearingRegionFieldsByText(value);
  if (!matched || !matched.districtLevelRegionName) {
    return null;
  }

  const matchedEntry = hierarchyEntries.find((entry) =>
    entry.cityLevelRegionKey === matched.cityLevelRegionKey
    && entry.districtLevelRegionKey === matched.districtLevelRegionKey
  );

  if (!matchedEntry) {
    return null;
  }

  return {
    sido: matchedEntry.sido,
    sigungu: matchedEntry.sigungu,
    sigunguCode: matchedEntry.adminCode,
    label: buildRegionLabel(matchedEntry.sido, matchedEntry.sigungu),
  };
}
