import sigunguData from '../data/sigungu.json';

type RegionEntry = {
  sido?: string;
  sigungu?: string;
  adminCode?: string;
  aliases?: string[];
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

export function normalizeSigunguCode(value: unknown): string {
  const digits = String(value ?? '').replace(/\D+/g, '');
  return digits.slice(0, 5);
}

const regionEntries = (sigunguData as RegionEntry[]).map((entry) => ({
  sido: String(entry.sido ?? '').trim(),
  sigungu: String(entry.sigungu ?? '').trim(),
  adminCode: normalizeSigunguCode(entry.adminCode),
  aliases: [entry.sigungu, ...(entry.aliases ?? [])]
    .filter(Boolean)
    .map(normalizeText),
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
  aliases: [normalizeText(sigungu)],
}));

for (const manualEntry of manualRegionEntries) {
  if (!regionEntries.some((entry) => entry.adminCode === manualEntry.adminCode)) {
    regionEntries.push(manualEntry);
  }
}

export function getRegionLabelBySigunguCode(sigunguCode: unknown): string {
  const normalizedCode = normalizeSigunguCode(sigunguCode);
  if (!normalizedCode) {
    return '';
  }

  const matched = regionEntries.find((entry) => entry.adminCode === normalizedCode);
  if (!matched) {
    return normalizedCode;
  }

  return matched.sigungu === matched.sido
    ? matched.sido
    : `${matched.sido} ${matched.sigungu}`.trim();
}

export function findSigunguCodeByRegion(sido: unknown, sigungu: unknown): string {
  const normalizedSido = normalizeText(sido);
  const normalizedSigungu = normalizeText(sigungu);

  if (!normalizedSido || !normalizedSigungu) {
    return '';
  }

  const exact = regionEntries.find((entry) =>
    normalizeText(entry.sido) === normalizedSido &&
    normalizeText(entry.sigungu) === normalizedSigungu &&
    entry.adminCode
  );

  if (exact) {
    return exact.adminCode;
  }

  const aliasMatch = regionEntries.find((entry) =>
    normalizeText(entry.sido) === normalizedSido &&
    entry.adminCode &&
    entry.aliases.some((alias) => alias === normalizedSigungu)
  );

  return aliasMatch?.adminCode ?? '';
}

export type RegionMatch = {
  sido: string;
  sigungu: string;
  sigunguCode: string;
  label: string;
};

export function findRegionMatchByText(value: unknown): RegionMatch | null {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return null;
  }

  let bestMatch: (typeof regionEntries[number] & { score: number }) | null = null;

  for (const entry of regionEntries) {
    if (!entry.adminCode) {
      continue;
    }

    const normalizedSido = normalizeText(entry.sido);
    const labels = [entry.sigungu, ...entry.aliases]
      .filter(Boolean)
      .map(normalizeText);

    for (const label of labels) {
      if (!label || !normalizedValue.includes(label)) {
        continue;
      }

      const score = label.length + (normalizedSido && normalizedValue.includes(normalizedSido) ? 6 : 0);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          ...entry,
          score,
        };
      }
    }
  }

  if (!bestMatch) {
    return null;
  }

  const label = bestMatch.sigungu === bestMatch.sido
    ? bestMatch.sido
    : `${bestMatch.sido} ${bestMatch.sigungu}`.trim();

  return {
    sido: bestMatch.sido,
    sigungu: bestMatch.sigungu,
    sigunguCode: bestMatch.adminCode,
    label,
  };
}
