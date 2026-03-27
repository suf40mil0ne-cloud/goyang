import { formatIsoDate } from '../../shared/public-hearings';

export type EumAttachment = {
  name: string;
  url: string;
};

export type EumListItem = {
  seq: string;
  title: string;
  noticeNumber: string;
  agency: string;
  publishedAt: string;
  hearingStartDate: string;
  hearingEndDate: string;
  detailUrl: string;
  listPage: number;
  rawSource: {
    periodText: string;
    rowHtml: string;
  };
};

export type EumListPage = {
  items: EumListItem[];
  lastPageNo: number;
};

export type EumDetailItem = {
  seq: string;
  title: string;
  noticeNumber: string;
  agency: string;
  department: string;
  contact: string;
  publishedAt: string;
  hearingStartDate: string;
  hearingEndDate: string;
  location: string;
  body: string;
  attachments: EumAttachment[];
  link: string;
  rawSource: {
    titleHtml: string;
    tableHtml: string;
    bodyHtml: string;
  };
};

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

export function decodeHtmlEntities(value: string): string {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#8228;/g, '·')
    .replace(/&#183;/g, '·')
    .replace(/&middot;/gi, '·')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)));
}

export function stripHtml(value: string): string {
  return decodeHtmlEntities(String(value))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|dt|dd|th|td|h1|h2|h3|h4|h5|h6)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeInlineText(value: unknown): string {
  return stripHtml(String(value ?? '')).replace(/\s+/g, ' ').trim();
}

function normalizeLabel(value: unknown): string {
  return normalizeInlineText(value).replace(/[()/:]/g, '');
}

function extractTagContents(tagName: string, html: string): string[] {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  return [...String(html).matchAll(pattern)].map((match) => match[1]);
}

function extractFirstMatch(pattern: RegExp, html: string): string {
  return normalizeString(String(html).match(pattern)?.[1] ?? '');
}

function parseDateRange(value: string): { hearingStartDate: string; hearingEndDate: string } {
  const matches = [...String(value).matchAll(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/g)];
  if (matches.length === 0) {
    return { hearingStartDate: '', hearingEndDate: '' };
  }

  const normalized = matches.map((match) => formatIsoDate(`${match[1]}-${match[2]}-${match[3]}`));
  return {
    hearingStartDate: normalized[0] || '',
    hearingEndDate: normalized[1] || normalized[0] || '',
  };
}

function extractHrefAndText(anchorHtml: string, baseUrl: string): { href: string; text: string } | null {
  const match = anchorHtml.match(/<a\b[^>]*href=(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/i);
  if (!match) {
    return null;
  }

  try {
    const rawHref = String(match[2] || '').trim();
    const fallbackBaseUrl = 'https://www.eum.go.kr/web/cp/hr/';
    const resolvedUrl = /^https?:\/\//i.test(rawHref)
      ? new URL(rawHref)
      : new URL(rawHref, fallbackBaseUrl);

    if (/hrPeopleHearDet.jsp$/i.test(resolvedUrl.pathname)) {
      const canonicalUrl = new URL('https://www.eum.go.kr/web/cp/hr/hrPeopleHearDet.jsp');
      resolvedUrl.searchParams.forEach((value, key) => {
        canonicalUrl.searchParams.append(key, value);
      });
      return {
        href: canonicalUrl.toString(),
        text: normalizeInlineText(match[3]),
      };
    }

    return {
      href: resolvedUrl.toString(),
      text: normalizeInlineText(match[3]),
    };
  } catch {
    return null;
  }
}

function extractAttachmentUrl(href: string, baseUrl: string): string {
  const downloadMatch = href.match(/javascript:download\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i);
  if (downloadMatch) {
    const actionUrl = new URL(downloadMatch[1], baseUrl);
    actionUrl.searchParams.set('file', downloadMatch[2]);
    return actionUrl.toString();
  }

  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function parseAttachmentAnchors(html: string, baseUrl: string): EumAttachment[] {
  const attachments = [...String(html).matchAll(/<a\b[^>]*href=(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      name: normalizeInlineText(match[3]),
      url: extractAttachmentUrl(match[2], baseUrl),
    }))
    .filter((attachment) => attachment.name);

  const byKey = new Map<string, EumAttachment>();
  attachments.forEach((attachment) => {
    const key = `${attachment.name}::${attachment.url}`;
    if (!byKey.has(key)) {
      byKey.set(key, attachment);
    }
  });

  return [...byKey.values()];
}

function buildFieldMap(tableHtml: string): Map<string, { text: string; html: string }> {
  const map = new Map<string, { text: string; html: string }>();
  const tbodyHtml = extractFirstMatch(/<tbody>([\s\S]*?)<\/tbody>/i, tableHtml) || tableHtml;
  const rows = extractTagContents('tr', tbodyHtml);

  rows.forEach((rowHtml) => {
    const headers = extractTagContents('th', rowHtml).map((header) => normalizeLabel(header));
    const cells = extractTagContents('td', rowHtml);
    if (!headers.length || !cells.length) {
      return;
    }

    headers.forEach((header, index) => {
      const cellHtml = cells[index] || cells[0] || '';
      if (!header || !cellHtml) {
        return;
      }

      if (!map.has(header)) {
        map.set(header, {
          text: normalizeInlineText(cellHtml),
          html: cellHtml,
        });
      }
    });
  });

  return map;
}

function pickField(map: Map<string, { text: string; html: string }>, labels: string[]): { text: string; html: string } {
  for (const label of labels) {
    const normalizedLabel = normalizeLabel(label);
    if (map.has(normalizedLabel)) {
      return map.get(normalizedLabel)!;
    }

    for (const [key, value] of map.entries()) {
      if (key.includes(normalizedLabel)) {
        return value;
      }
    }
  }

  return { text: '', html: '' };
}

export function extractLastPageNo(html: string): number {
  const direct = html.match(/pageNo=(\d+)[^>]*title="마지막 페이지로 이동"/i);
  if (direct?.[1]) {
    return Number.parseInt(direct[1], 10);
  }

  const pageMatches = [...html.matchAll(/pageNo=(\d+)/gi)].map((match) => Number.parseInt(match[1], 10));
  return pageMatches.length ? Math.max(...pageMatches) : 1;
}

export function parseEumListHtml(html: string, options: { baseUrl: string; pageNo: number }): EumListPage {
  const listTableHtml = extractFirstMatch(/<table\b[^>]*>[\s\S]*?<caption>\s*주민의견청취 공람\s*<\/caption>([\s\S]*?)<\/table>/i, html);
  const bodyMatches = [...String(listTableHtml || html).matchAll(/<tbody>([\s\S]*?)<\/tbody>/gi)].map((match) => match[1]);
  const targetBody = bodyMatches.find((tbodyHtml) => tbodyHtml.includes('hrPeopleHearDet.jsp')) || bodyMatches[0] || '';
  const rows = extractTagContents('tr', targetBody);
  const items: EumListItem[] = [];

  rows.forEach((rowHtml) => {
    const cells = extractTagContents('td', rowHtml);
    if (cells.length < 5) {
      return;
    }

    const anchor = extractHrefAndText(cells[1], options.baseUrl);
    if (!anchor?.href || !anchor.text) {
      return;
    }

    const seq = new URL(anchor.href).searchParams.get('seq') || '';
    if (!seq) {
      return;
    }

    const noticeNumber = normalizeInlineText(cells[0]);
    const agency = normalizeInlineText(cells[2]);
    const periodText = normalizeInlineText(cells[3]);
    const publishedAt = formatIsoDate(cells[4]);
    const { hearingStartDate, hearingEndDate } = parseDateRange(periodText);

    items.push({
      seq,
      title: anchor.text,
      noticeNumber,
      agency,
      publishedAt,
      hearingStartDate,
      hearingEndDate,
      detailUrl: anchor.href,
      listPage: options.pageNo,
      rawSource: {
        periodText,
        rowHtml,
      },
    });
  });

  return {
    items,
    lastPageNo: extractLastPageNo(html),
  };
}

export function parseEumDetailHtml(html: string, options: { seq: string; detailUrl: string }): EumDetailItem | null {
  const tableMatch = String(html).match(/<table>[\s\S]*?<caption>주민의견청취 공람 상세보기[\s\S]*?<\/table>/i);
  const tableHtml = tableMatch?.[0] || '';
  if (!tableHtml) {
    return null;
  }

  const titleHtml = extractFirstMatch(/<thead>[\s\S]*?<th[^>]*>([\s\S]*?)<\/th>/i, tableHtml);
  const fieldMap = buildFieldMap(tableHtml);
  const titleFromTable = normalizeInlineText(titleHtml);
  const titleFromBody = normalizeInlineText(extractFirstMatch(/<p class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/p>/i, tableHtml));
  const title = titleFromBody || titleFromTable;

  const periodField = pickField(fieldMap, ['청취기간', '의견청취기간', '열람기간', '공람기간']);
  const { hearingStartDate, hearingEndDate } = parseDateRange(periodField.text);
  const locationField = pickField(fieldMap, ['열람 및 의견서 제출장소', '열람장소', '의견서 제출장소']);
  const attachmentField = pickField(fieldMap, ['첨부파일']);
  const noticeNumberFromBody = normalizeInlineText(extractFirstMatch(/<p class=["'][^"']*number[^"']*["'][^>]*>([\s\S]*?)<\/p>/i, tableHtml));
  const bodyHtml = extractFirstMatch(/<div class=["'][^"']*edit_view[^"']*["'][^>]*>([\s\S]*?)<\/td>/i, tableHtml);
  const contentHtml = extractFirstMatch(/<p class=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/p>\s*<p class=["'][^"']*com/i, bodyHtml || tableHtml)
    || extractFirstMatch(/<p class=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/p>/i, bodyHtml || tableHtml);
  const body = normalizeInlineText(contentHtml);

  return {
    seq: options.seq,
    title,
    noticeNumber: noticeNumberFromBody || pickField(fieldMap, ['공고번호', '고시번호']).text,
    agency: pickField(fieldMap, ['담당기관', '공고기관', '기관명']).text,
    department: pickField(fieldMap, ['담당부서', '부서']).text,
    contact: pickField(fieldMap, ['문의처', '담당자연락처']).text,
    publishedAt: formatIsoDate(pickField(fieldMap, ['공고일', '공고일자', '게시일']).text),
    hearingStartDate,
    hearingEndDate,
    location: locationField.text,
    body,
    attachments: parseAttachmentAnchors(attachmentField.html, options.detailUrl),
    link: options.detailUrl,
    rawSource: {
      titleHtml,
      tableHtml,
      bodyHtml,
    },
  };
}
