export type PublicHearingStatus = 'upcoming' | 'ongoing' | 'closed';

export type PublicHearingItem = {
  id: string;
  source: 'molit-public-hearing';
  sigunguCode: string;
  noticeNumber: string;
  title: string;
  content: string;
  noticeDate: string;
  viewStartDate: string;
  viewEndDate: string;
  contact: string;
  attachmentSeq: string;
  fileName: string;
  fileExt: string;
  status: PublicHearingStatus;
  regionLabel: string;
};

export type PublicHearingsResponse = {
  items: PublicHearingItem[];
  meta: {
    page: number;
    perPage: number;
    totalCount: number;
    requestedSigunguCode: string;
    exactMatchCount: number;
    usedStaleCache: boolean;
    fallbackMessage: string;
    fetchedAt: string;
  };
};

type NormalizerOptions = {
  regionLabel: string;
  today?: Date;
};

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function pickFirst(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeString(raw[key]);
    if (value) {
      return value;
    }
  }

  return '';
}

export function parseKoreanDate(value: unknown): Date | null {
  const input = normalizeString(value);
  if (!input) {
    return null;
  }

  const normalized = input
    .replace(/[.]/g, '-')
    .replace(/년|월/g, '-')
    .replace(/일/g, '')
    .replace(/\//g, '-')
    .replace(/\s+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const compactDigits = normalized.replace(/\D+/g, '');
  if (/^\d{8}$/.test(compactDigits)) {
    const year = Number(compactDigits.slice(0, 4));
    const month = Number(compactDigits.slice(4, 6));
    const day = Number(compactDigits.slice(6, 8));
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatIsoDate(value: unknown): string {
  const parsed = parseKoreanDate(value);
  if (!parsed) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
}

export function computePublicHearingStatus(
  viewStartDate: unknown,
  viewEndDate: unknown,
  todayInput: Date = new Date()
): PublicHearingStatus {
  const today = new Date(Date.UTC(
    todayInput.getUTCFullYear(),
    todayInput.getUTCMonth(),
    todayInput.getUTCDate()
  ));
  const startDate = parseKoreanDate(viewStartDate);
  const endDate = parseKoreanDate(viewEndDate);

  if (startDate && today < startDate) {
    return 'upcoming';
  }

  if (startDate && endDate && today >= startDate && today <= endDate) {
    return 'ongoing';
  }

  if (endDate && today > endDate) {
    return 'closed';
  }

  if (startDate && !endDate) {
    return today >= startDate ? 'ongoing' : 'upcoming';
  }

  if (!startDate && endDate) {
    return today <= endDate ? 'ongoing' : 'closed';
  }

  return 'closed';
}

export function normalizePublicHearingItem(
  raw: Record<string, unknown>,
  options: NormalizerOptions
): PublicHearingItem {
  const sigunguCode = normalizeString(
    raw.sigunguCode ?? raw['시군구코드'] ?? raw['SIGUNGU_CODE']
  ).replace(/\D+/g, '').slice(0, 5);

  const noticeNumber = pickFirst(raw, ['noticeNumber', '공고번호', 'NOTICE_NUMBER']);
  const title = pickFirst(raw, ['title', '공고제목', 'NOTICE_TITLE']);
  const content = pickFirst(raw, ['content', '공고내용', 'NOTICE_CONTENT']);
  const noticeDate = formatIsoDate(pickFirst(raw, ['noticeDate', '공고일자', 'NOTICE_DATE']));
  const viewStartDate = formatIsoDate(pickFirst(raw, ['viewStartDate', '열람시작일자', 'VIEW_START_DATE']));
  const viewEndDate = formatIsoDate(pickFirst(raw, ['viewEndDate', '열람종료일자', 'VIEW_END_DATE']));
  const contact = pickFirst(raw, ['contact', '문의처', 'CONTACT']);
  const attachmentSeq = pickFirst(raw, ['attachmentSeq', '첨부파일일련번호', 'ATTACHMENT_SEQ']);
  const fileName = pickFirst(raw, ['fileName', '파일명', 'FILE_NAME']);
  const fileExt = pickFirst(raw, ['fileExt', '파일확장자', 'FILE_EXT']);
  const primaryId = pickFirst(raw, ['id', '공고코드', 'NOTICE_CODE']);

  const fallbackId = [sigunguCode, noticeNumber, noticeDate, title]
    .filter(Boolean)
    .join('::');

  return {
    id: primaryId || fallbackId || crypto.randomUUID(),
    source: 'molit-public-hearing',
    sigunguCode,
    noticeNumber,
    title,
    content,
    noticeDate,
    viewStartDate,
    viewEndDate,
    contact,
    attachmentSeq,
    fileName,
    fileExt,
    status: computePublicHearingStatus(viewStartDate, viewEndDate, options.today),
    regionLabel: options.regionLabel || sigunguCode,
  };
}

const statusOrder: Record<PublicHearingStatus, number> = {
  ongoing: 0,
  upcoming: 1,
  closed: 2,
};

export function sortPublicHearings(items: PublicHearingItem[]): PublicHearingItem[] {
  return [...items].sort((left, right) => {
    const statusGap = statusOrder[left.status] - statusOrder[right.status];
    if (statusGap !== 0) {
      return statusGap;
    }

    const leftDate = parseKoreanDate(left.noticeDate)?.getTime() ?? 0;
    const rightDate = parseKoreanDate(right.noticeDate)?.getTime() ?? 0;
    return rightDate - leftDate;
  });
}

export function matchesPublicHearingQuery(item: PublicHearingItem, query: string): boolean {
  const normalizedQuery = normalizeString(query).toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [
    item.title,
    item.content,
    item.contact,
    item.noticeNumber,
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}
