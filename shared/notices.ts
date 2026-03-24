export type NoticeSource = 'seoul' | 'molit';
export type NoticeStatus = 'upcoming' | 'ongoing' | 'closed';

export type NoticeItem = {
  id: string;
  source: NoticeSource;
  title: string;
  region: string;
  sigunguCode: string;
  date: string;
  status: NoticeStatus;
  link: string;
  summary: string;
  regionLabel: string;
  noticeDate: string;
  viewStartDate: string;
  viewEndDate: string;
  noticeNumber: string;
  contact: string;
  fileName: string;
  fileExt: string;
  content: string;
};

export type NoticesResponse = {
  items: NoticeItem[];
  meta: {
    page: number;
    perPage: number;
    totalCount: number;
    sourceCounts: {
      seoul: number;
      molit: number;
    };
    fetchedAt: string;
  };
};

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

const statusOrder: Record<NoticeStatus, number> = {
  ongoing: 0,
  upcoming: 1,
  closed: 2,
};

export function sortNotices(items: NoticeItem[]): NoticeItem[] {
  return [...items].sort((left, right) => {
    const statusGap = statusOrder[left.status] - statusOrder[right.status];
    if (statusGap !== 0) {
      return statusGap;
    }

    const leftDate = normalizeString(left.date);
    const rightDate = normalizeString(right.date);
    if (leftDate !== rightDate) {
      return rightDate.localeCompare(leftDate);
    }

    return left.title.localeCompare(right.title, 'ko');
  });
}

export function matchesNoticeQuery(item: NoticeItem, query: string): boolean {
  const normalizedQuery = normalizeString(query).toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [
    item.title,
    item.summary,
    item.region,
    item.noticeNumber,
    item.contact,
    item.content,
    item.source,
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}

export function filterAndSortNotices(items: NoticeItem[], searchQuery: string): NoticeItem[] {
  return sortNotices(items.filter((item) => matchesNoticeQuery(item, searchQuery)));
}

export function dedupeNotices(items: NoticeItem[]): NoticeItem[] {
  const byFingerprint = new Map<string, NoticeItem>();

  for (const item of items) {
    const fingerprint = [
      normalizeString(item.sigunguCode),
      normalizeString(item.date),
      normalizeString(item.title).toLowerCase(),
    ].join('::');

    const existing = byFingerprint.get(fingerprint);
    if (!existing) {
      byFingerprint.set(fingerprint, item);
      continue;
    }

    const existingScore = Number(Boolean(existing.link)) + Number(Boolean(existing.summary));
    const nextScore = Number(Boolean(item.link)) + Number(Boolean(item.summary));
    if (nextScore > existingScore) {
      byFingerprint.set(fingerprint, item);
    }
  }

  return [...byFingerprint.values()];
}
