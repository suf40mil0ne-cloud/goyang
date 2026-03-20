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
