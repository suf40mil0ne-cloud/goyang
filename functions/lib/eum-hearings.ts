import { computeHearingStatus, HearingItem, sortHearings } from '../../shared/hearings';
import { findRegionMatchByText, normalizeSigunguCode } from '../../shared/region-codes';
import { formatIsoDate } from '../../shared/public-hearings';
import { EumDetailItem, EumListItem, parseEumDetailHtml, parseEumListHtml } from './eum-hearings-parser';

type EumQuery = {
  startdt?: string;
  enddt?: string;
  selSggCd?: string;
  zonenm?: string;
  chrgorg?: string;
  gosino?: string;
  maxPages?: number;
};

type EumDatasetPayload = {
  items: HearingItem[];
  fetchedAt: string;
  listCount: number;
  detailSuccessCount: number;
  detailFailureCount: number;
};

type DatasetCacheEntry = {
  cachedAt: number;
  payload: EumDatasetPayload;
};

type DetailCacheEntry = {
  cachedAt: number;
  item: EumDetailItem | null;
};

type DecodedHtmlResponse = {
  status: number;
  url: string;
  html: string;
  detectedCharset: string;
};

const EUM_LIST_URL = 'https://www.eum.go.kr/web/cp/hr/hrPeopleHearList.jsp';
const DATASET_CACHE_TTL_MS = 15 * 60 * 1000;
const DATASET_STALE_TTL_MS = 60 * 60 * 1000;
const DETAIL_CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;
const REQUEST_RETRIES = 2;
const RETRY_DELAY_MS = 600;
const DEFAULT_MAX_PAGES = 2;
const MAX_MAX_PAGES = 3;
const DETAIL_CONCURRENCY = 4;
const datasetCache = new Map<string, DatasetCacheEntry>();
const detailCache = new Map<string, DetailCacheEntry>();

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeInlineText(value: unknown): string {
  return normalizeString(value).replace(/\s+/g, ' ').trim();
}

function normalizeCharset(value: string): string {
  return String(value || '').trim().replace(/['"]/g, '').toLowerCase();
}

function parseCharsetFromContentType(value: string): string {
  const match = String(value).match(/charset\s*=\s*([^;]+)/i);
  return normalizeCharset(match?.[1] || '');
}

function parseCharsetFromMeta(buffer: ArrayBuffer): string {
  const preview = new TextDecoder('iso-8859-1').decode(buffer.slice(0, 8192));
  const direct = preview.match(/<meta[^>]+charset=["']?\s*([^"'>\s/]+)/i);
  if (direct?.[1]) {
    return normalizeCharset(direct[1]);
  }

  const httpEquiv = preview.match(/<meta[^>]+content=["'][^"']*charset=([^"';\s]+)/i);
  return normalizeCharset(httpEquiv?.[1] || '');
}

function tryDecode(buffer: ArrayBuffer, encoding: string): string {
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(buffer);
  } catch {
    return '';
  }
}

function getDecodedScore(text: string): number {
  if (!text) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  score -= (text.match(/�/g) || []).length * 8;
  score -= (text.match(/\u0000/g) || []).length * 4;
  if (/[가-힣]/.test(text)) score += 40;
  if (text.includes('주민의견청취')) score += 10;
  if (text.includes('공람')) score += 8;
  if (text.includes('공고일')) score += 6;
  if (/<html/i.test(text)) score += 4;
  return score;
}

function decodeHtmlBuffer(buffer: ArrayBuffer, contentType: string): { html: string; detectedCharset: string } {
  const candidates = [
    parseCharsetFromContentType(contentType),
    parseCharsetFromMeta(buffer),
    'utf-8',
    'euc-kr',
    'windows-949',
    'x-windows-949',
  ].filter(Boolean);

  let best = { html: '', detectedCharset: 'utf-8', score: Number.NEGATIVE_INFINITY };
  [...new Set(candidates)].forEach((candidate) => {
    const html = tryDecode(buffer, candidate);
    const score = getDecodedScore(html);
    if (score > best.score) {
      best = { html, detectedCharset: candidate, score };
    }
  });

  return {
    html: best.html,
    detectedCharset: best.detectedCharset,
  };
}

function buildQueryKey(query: EumQuery): string {
  return JSON.stringify({
    startdt: normalizeString(query.startdt),
    enddt: normalizeString(query.enddt),
    selSggCd: normalizeSigunguCode(query.selSggCd),
    zonenm: normalizeString(query.zonenm),
    chrgorg: normalizeString(query.chrgorg),
    gosino: normalizeString(query.gosino),
    maxPages: Math.min(MAX_MAX_PAGES, Math.max(1, query.maxPages || DEFAULT_MAX_PAGES)),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildListUrl(query: EumQuery, pageNo: number): URL {
  const url = new URL(EUM_LIST_URL);
  url.searchParams.set('pageNo', String(pageNo));

  const filters: Record<string, string> = {
    startdt: normalizeString(query.startdt),
    enddt: normalizeString(query.enddt),
    selSggCd: normalizeSigunguCode(query.selSggCd),
    zonenm: normalizeString(query.zonenm),
    chrgorg: normalizeString(query.chrgorg),
    gosino: normalizeString(query.gosino),
  };

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

  return url;
}

async function fetchDecodedHtml(url: URL): Promise<DecodedHtmlResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7',
        Referer: 'https://www.eum.go.kr/',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    });

    const buffer = await response.arrayBuffer();
    const decoded = decodeHtmlBuffer(buffer, response.headers.get('content-type') || '');

    return {
      status: response.status,
      url: response.url || url.toString(),
      html: decoded.html,
      detectedCharset: decoded.detectedCharset,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchDecodedHtmlWithRetry(url: URL, label: string): Promise<DecodedHtmlResponse> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt += 1) {
    try {
      const response = await fetchDecodedHtml(url);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`${label}-upstream-${response.status}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      console.warn('[eum] fetch retry', {
        label,
        attempt: attempt + 1,
        requestUrl: url.toString(),
        message: String(error),
      });
      if (attempt < REQUEST_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label}-failed`);
}

function normalizeNoticeNumber(value: string): string {
  return normalizeInlineText(value).replace(/\s+/g, ' ').replace(/\s+호$/, '호');
}

function buildSummary(item: {
  agency?: string;
  publishedAt?: string;
  hearingStartDate?: string;
  hearingEndDate?: string;
  location?: string;
  body?: string;
}): string {
  const parts = [
    normalizeInlineText(item.agency),
    item.publishedAt ? `공고일 ${item.publishedAt}` : '',
    item.hearingStartDate || item.hearingEndDate
      ? `청취기간 ${item.hearingStartDate || '-'} ~ ${item.hearingEndDate || '-'}`
      : '',
    item.location ? `열람장소 ${normalizeInlineText(item.location).slice(0, 40)}` : '',
  ].filter(Boolean);

  if (parts.length >= 2) {
    return parts.join(' · ');
  }

  const body = normalizeInlineText(item.body).slice(0, 120);
  return parts.concat(body ? [body] : []).join(' · ').slice(0, 140);
}

function normalizeEumHearing(listItem: EumListItem, detailItem: EumDetailItem | null): HearingItem {
  const agency = normalizeInlineText(detailItem?.agency || listItem.agency);
  const title = normalizeInlineText(detailItem?.title || listItem.title || '토지이음 주민의견청취 공람');
  const noticeNumber = normalizeNoticeNumber(detailItem?.noticeNumber || listItem.noticeNumber);
  const publishedAt = formatIsoDate(detailItem?.publishedAt || listItem.publishedAt);
  const hearingStartDate = formatIsoDate(detailItem?.hearingStartDate || listItem.hearingStartDate);
  const hearingEndDate = formatIsoDate(detailItem?.hearingEndDate || listItem.hearingEndDate);
  const location = normalizeInlineText(detailItem?.location);
  const body = normalizeInlineText(detailItem?.body);
  const regionMatch = findRegionMatchByText([
    listItem.noticeNumber,
    agency,
    title,
    location,
    body,
  ].join(' '));
  const region = regionMatch?.label || '';
  const sigunguCode = regionMatch?.sigunguCode || '';

  return {
    id: `eum-${listItem.seq}`,
    source: 'eum_public_hearing',
    sourceLabel: '토지이음 주민의견청취 공람',
    seq: listItem.seq,
    noticeNumber,
    title,
    region,
    sigunguCode,
    agency,
    department: normalizeInlineText(detailItem?.department),
    publishedAt,
    hearingStartDate,
    hearingEndDate,
    location,
    contact: normalizeInlineText(detailItem?.contact),
    status: computeHearingStatus(hearingStartDate, hearingEndDate),
    summary: buildSummary({ agency, publishedAt, hearingStartDate, hearingEndDate, location, body }),
    body,
    attachments: detailItem?.attachments || [],
    link: detailItem?.link || listItem.detailUrl,
    rawSource: {
      list: listItem.rawSource,
      detail: detailItem?.rawSource || null,
    },
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function loadDetail(listItem: EumListItem): Promise<EumDetailItem | null> {
  const cached = detailCache.get(listItem.seq);
  const now = Date.now();
  if (cached && now - cached.cachedAt <= DETAIL_CACHE_TTL_MS) {
    return cached.item;
  }

  const response = await fetchDecodedHtmlWithRetry(new URL(listItem.detailUrl), `eum-detail-${listItem.seq}`);
  const parsed = parseEumDetailHtml(response.html, {
    seq: listItem.seq,
    detailUrl: response.url || listItem.detailUrl,
  });

  detailCache.set(listItem.seq, {
    cachedAt: now,
    item: parsed,
  });

  return parsed;
}

export async function loadEumPublicHearings(query: EumQuery = {}): Promise<{ payload: EumDatasetPayload; usedStaleCache: boolean }> {
  const cacheKey = buildQueryKey(query);
  const now = Date.now();
  const cached = datasetCache.get(cacheKey);

  if (cached && now - cached.cachedAt <= DATASET_CACHE_TTL_MS) {
    console.info('[eum] using fresh cache', { cacheKey, count: cached.payload.items.length });
    return {
      payload: cached.payload,
      usedStaleCache: false,
    };
  }

  try {
    const maxPages = Math.min(MAX_MAX_PAGES, Math.max(1, query.maxPages || DEFAULT_MAX_PAGES));
    const listings: EumListItem[] = [];
    const seenSeq = new Set<string>();
    let lastPageNo = maxPages;

    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const listUrl = buildListUrl(query, pageNo);
      const response = await fetchDecodedHtmlWithRetry(listUrl, `eum-list-${pageNo}`);
      const parsed = parseEumListHtml(response.html, {
        baseUrl: response.url || listUrl.toString(),
        pageNo,
      });

      console.info('[eum] list parsed', {
        pageNo,
        requestUrl: listUrl.toString(),
        parsedCount: parsed.items.length,
        lastPageNo: parsed.lastPageNo,
      });

      lastPageNo = parsed.lastPageNo || lastPageNo;
      const newItems = parsed.items.filter((item) => {
        if (seenSeq.has(item.seq)) {
          return false;
        }
        seenSeq.add(item.seq);
        return true;
      });
      listings.push(...newItems);

      if (!parsed.items.length || pageNo >= lastPageNo) {
        break;
      }
    }

    const detailResults = await mapWithConcurrency(listings, DETAIL_CONCURRENCY, async (listItem) => {
      try {
        const detail = await loadDetail(listItem);
        return {
          ok: true,
          listItem,
          detail,
        };
      } catch (error) {
        console.error('[eum] detail fetch failed', {
          seq: listItem.seq,
          detailUrl: listItem.detailUrl,
          message: String(error),
        });
        return {
          ok: false,
          listItem,
          detail: null,
        };
      }
    });

    const detailSuccessCount = detailResults.filter((result) => result.ok && result.detail).length;
    const detailFailureCount = detailResults.filter((result) => !result.ok).length;
    const items = sortHearings(detailResults.map((result) => normalizeEumHearing(result.listItem, result.detail)));
    const payload: EumDatasetPayload = {
      items,
      fetchedAt: new Date().toISOString(),
      listCount: listings.length,
      detailSuccessCount,
      detailFailureCount,
    };

    datasetCache.set(cacheKey, {
      cachedAt: now,
      payload,
    });

    console.info('[eum] dataset built', {
      cacheKey,
      listCount: payload.listCount,
      detailSuccessCount,
      detailFailureCount,
      totalCount: items.length,
    });

    return {
      payload,
      usedStaleCache: false,
    };
  } catch (error) {
    if (cached && now - cached.cachedAt <= DATASET_STALE_TTL_MS) {
      console.warn('[eum] using stale cache after fetch failure', {
        cacheKey,
        message: String(error),
        staleCount: cached.payload.items.length,
      });
      return {
        payload: cached.payload,
        usedStaleCache: true,
      };
    }

    throw error;
  }
}

export type { EumQuery };
