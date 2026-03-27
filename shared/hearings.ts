import { formatIsoDate, parseKoreanDate } from './public-hearings';

export type HearingSource = 'molit_api' | 'eum_public_hearing';
export type HearingStatus = 'open' | 'closed' | 'unknown';

export type HearingAttachment = {
  name: string;
  url: string;
};

export type HearingItem = {
  id: string;
  source: HearingSource;
  sourceLabel: string;
  seq?: string;
  noticeNumber?: string;
  title: string;
  region?: string;
  sigunguCode?: string;
  cityLevelRegionName?: string;
  cityLevelRegionKey?: string;
  districtLevelRegionName?: string | null;
  districtLevelRegionKey?: string | null;
  matchedCity?: string;
  matchedDistrict?: string | null;
  regionMatchType?: 'district-exact' | 'city-only' | 'text-fallback' | 'unmatched';
  agency?: string;
  department?: string;
  publishedAt?: string;
  hearingStartDate?: string;
  hearingEndDate?: string;
  location?: string;
  contact?: string;
  status?: HearingStatus;
  summary?: string;
  body?: string;
  attachments?: HearingAttachment[];
  link: string;
  rawSource?: unknown;
};

export type CombinedHearingsResponse = {
  items: HearingItem[];
  total: number;
  page: number;
  perPage: number;
  sourceCounts: {
    molit_api: number;
    eum_public_hearing: number;
  };
  fallbackApplied: boolean;
  fallbackReason: string;
  requestedSigunguCode: string;
  filteredCount: number;
  usedStaleCache: boolean;
  failedSources: string[];
  fetchedAt: string;
};

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeInlineText(value: unknown): string {
  return normalizeString(value).replace(/\s+/g, ' ').trim();
}

function normalizeComparableText(value: unknown): string {
  return normalizeInlineText(value)
    .toLowerCase()
    .replace(/[\s()\[\]{}.,·ㆍ:;!?"'`~\-_/\\|]/g, '');
}

function pickDateValue(item: HearingItem): string {
  return normalizeString(item.publishedAt || item.hearingStartDate || item.hearingEndDate);
}

export function computeHearingStatus(
  hearingStartDate?: unknown,
  hearingEndDate?: unknown,
  todayInput: Date = new Date()
): HearingStatus {
  const today = new Date(Date.UTC(
    todayInput.getUTCFullYear(),
    todayInput.getUTCMonth(),
    todayInput.getUTCDate()
  ));
  const startDate = parseKoreanDate(hearingStartDate);
  const endDate = parseKoreanDate(hearingEndDate);

  if (endDate) {
    return today > endDate ? 'closed' : 'open';
  }

  if (startDate) {
    return 'open';
  }

  return 'unknown';
}

const statusOrder: Record<HearingStatus, number> = {
  open: 0,
  unknown: 1,
  closed: 2,
};

export function sortHearings(items: HearingItem[]): HearingItem[] {
  return [...items].sort((left, right) => {
    const leftStatus = left.status || 'unknown';
    const rightStatus = right.status || 'unknown';
    const statusGap = statusOrder[leftStatus] - statusOrder[rightStatus];
    if (statusGap !== 0) {
      return statusGap;
    }

    const leftDate = parseKoreanDate(pickDateValue(left))?.getTime() ?? 0;
    const rightDate = parseKoreanDate(pickDateValue(right))?.getTime() ?? 0;
    if (leftDate !== rightDate) {
      return rightDate - leftDate;
    }

    return normalizeInlineText(left.title).localeCompare(normalizeInlineText(right.title), 'ko');
  });
}

export function matchesHearingQuery(item: HearingItem, query: string): boolean {
  const normalizedQuery = normalizeInlineText(query).toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [
    item.title,
    item.summary,
    item.region,
    item.noticeNumber,
    item.agency,
    item.department,
    item.location,
    item.contact,
    item.body,
    item.sourceLabel,
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}

export function filterAndSortHearings(items: HearingItem[], query: string): HearingItem[] {
  return sortHearings(items.filter((item) => matchesHearingQuery(item, query)));
}

function buildAttachmentSignature(item: HearingItem): string {
  return (item.attachments || [])
    .map((attachment) => `${normalizeInlineText(attachment.name)}::${normalizeInlineText(attachment.url)}`)
    .sort()
    .join('|');
}

function getDataScore(item: HearingItem): number {
  return [
    item.body ? 4 : 0,
    item.summary ? 2 : 0,
    item.attachments?.length ? 3 : 0,
    item.hearingStartDate ? 2 : 0,
    item.hearingEndDate ? 2 : 0,
    item.location ? 2 : 0,
    item.contact ? 1 : 0,
    item.link ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

function choosePreferredText(left: string | undefined, right: string | undefined): string | undefined {
  const normalizedLeft = normalizeInlineText(left);
  const normalizedRight = normalizeInlineText(right);
  if (!normalizedLeft) return normalizedRight || undefined;
  if (!normalizedRight) return normalizedLeft || undefined;
  return normalizedRight.length > normalizedLeft.length ? normalizedRight : normalizedLeft;
}

function choosePreferredDate(left: string | undefined, right: string | undefined): string | undefined {
  const leftDate = formatIsoDate(left);
  const rightDate = formatIsoDate(right);
  if (!leftDate) return rightDate || undefined;
  if (!rightDate) return leftDate || undefined;
  return rightDate || leftDate;
}

function choosePreferredRegionMatchType(left: HearingItem['regionMatchType'], right: HearingItem['regionMatchType']): HearingItem['regionMatchType'] {
  const score = {
    'district-exact': 4,
    'text-fallback': 3,
    'city-only': 2,
    unmatched: 1,
    '': 0,
    undefined: 0,
  } as const;

  return (score[right || ''] || 0) >= (score[left || ''] || 0) ? right || left : left || right;
}

function mergeAttachments(left: HearingAttachment[] = [], right: HearingAttachment[] = []): HearingAttachment[] {
  const merged = new Map<string, HearingAttachment>();
  [...left, ...right].forEach((attachment) => {
    const key = `${normalizeInlineText(attachment.name)}::${normalizeInlineText(attachment.url)}`;
    if (!key) {
      return;
    }

    if (!merged.has(key)) {
      merged.set(key, attachment);
    }
  });

  return [...merged.values()];
}

function areDuplicateHearings(left: HearingItem, right: HearingItem): boolean {
  if (left.seq && right.seq && left.seq === right.seq) {
    return true;
  }

  const leftNoticeNumber = normalizeComparableText(left.noticeNumber);
  const rightNoticeNumber = normalizeComparableText(right.noticeNumber);
  const leftPublishedAt = formatIsoDate(left.publishedAt);
  const rightPublishedAt = formatIsoDate(right.publishedAt);
  const leftAgency = normalizeComparableText(left.agency);
  const rightAgency = normalizeComparableText(right.agency);

  if (leftNoticeNumber && rightNoticeNumber && leftPublishedAt && rightPublishedAt && leftAgency && rightAgency) {
    const leftComposite = [leftNoticeNumber, leftPublishedAt, leftAgency].join('::');
    const rightComposite = [rightNoticeNumber, rightPublishedAt, rightAgency].join('::');
    if (leftComposite === rightComposite) {
      return true;
    }
  }

  if (left.source === right.source) {
    return false;
  }

  const leftTitleKey = [normalizeComparableText(left.title), leftPublishedAt, leftAgency].join('::');
  const rightTitleKey = [normalizeComparableText(right.title), rightPublishedAt, rightAgency].join('::');
  return Boolean(leftPublishedAt && rightPublishedAt && leftAgency && rightAgency) && leftTitleKey === rightTitleKey;
}

function mergeHearings(left: HearingItem, right: HearingItem): HearingItem {
  const preferred = getDataScore(right) > getDataScore(left) ? right : left;
  const secondary = preferred === left ? right : left;

  return {
    ...secondary,
    ...preferred,
    source: preferred.source,
    sourceLabel: preferred.sourceLabel || secondary.sourceLabel,
    id: preferred.id || secondary.id,
    seq: preferred.seq || secondary.seq,
    noticeNumber: choosePreferredText(preferred.noticeNumber, secondary.noticeNumber),
    title: choosePreferredText(preferred.title, secondary.title) || preferred.title || secondary.title,
    region: choosePreferredText(preferred.region, secondary.region),
    sigunguCode: choosePreferredText(preferred.sigunguCode, secondary.sigunguCode),
    cityLevelRegionName: choosePreferredText(preferred.cityLevelRegionName, secondary.cityLevelRegionName),
    cityLevelRegionKey: choosePreferredText(preferred.cityLevelRegionKey, secondary.cityLevelRegionKey),
    districtLevelRegionName: choosePreferredText(preferred.districtLevelRegionName || '', secondary.districtLevelRegionName || '') || undefined,
    districtLevelRegionKey: choosePreferredText(preferred.districtLevelRegionKey || '', secondary.districtLevelRegionKey || '') || undefined,
    matchedCity: choosePreferredText(preferred.matchedCity, secondary.matchedCity),
    matchedDistrict: choosePreferredText(preferred.matchedDistrict || '', secondary.matchedDistrict || '') || undefined,
    regionMatchType: choosePreferredRegionMatchType(preferred.regionMatchType, secondary.regionMatchType),
    agency: choosePreferredText(preferred.agency, secondary.agency),
    department: choosePreferredText(preferred.department, secondary.department),
    publishedAt: choosePreferredDate(preferred.publishedAt, secondary.publishedAt),
    hearingStartDate: choosePreferredDate(preferred.hearingStartDate, secondary.hearingStartDate),
    hearingEndDate: choosePreferredDate(preferred.hearingEndDate, secondary.hearingEndDate),
    location: choosePreferredText(preferred.location, secondary.location),
    contact: choosePreferredText(preferred.contact, secondary.contact),
    status: preferred.status || secondary.status,
    summary: choosePreferredText(preferred.summary, secondary.summary),
    body: choosePreferredText(preferred.body, secondary.body),
    attachments: mergeAttachments(preferred.attachments, secondary.attachments),
    link: preferred.link || secondary.link,
    rawSource: preferred.rawSource || secondary.rawSource,
  };
}

export function dedupeHearings(items: HearingItem[]): HearingItem[] {
  const deduped: HearingItem[] = [];

  for (const item of items) {
    const existingIndex = deduped.findIndex((candidate) => areDuplicateHearings(candidate, item));
    if (existingIndex === -1) {
      deduped.push(item);
      continue;
    }

    deduped[existingIndex] = mergeHearings(deduped[existingIndex], item);
  }

  return deduped.map((item) => ({
    ...item,
    attachments: buildAttachmentSignature(item) ? item.attachments || [] : [],
  }));
}
