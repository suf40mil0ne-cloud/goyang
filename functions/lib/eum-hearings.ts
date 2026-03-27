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
  contentType: string;
  fetchStartedAt: string;
  headersReceivedAt: string;
  bodyReceivedAt: string;
};

type EumStage =
  | 'list-fetch-start'
  | 'list-fetch-headers'
  | 'list-fetch-body'
  | 'list-fetch-error'
  | 'list-fetch-timeout'
  | 'list-parse'
  | 'detail-fetch'
  | 'detail-fetch-timeout'
  | 'detail-parse'
  | 'dataset-build';

type EumDebugSnapshot = {
  lastErrorStage: EumStage | '';
  listCount: number;
  detailAttemptCount: number;
  detailSuccessCount: number;
  lastRequestUrl: string;
  lastListUrl: string;
  lastDetailUrl: string;
  lastListContentType: string;
  lastListPreview: string;
  lastDetailPreview: string;
  listFetchStartedAt: string;
  listFetchHeadersReceivedAt: string;
  listFetchBodyReceivedAt: string;
  elapsedMs: number;
  timeoutMs: number;
};

type EumDebugState = EumDebugSnapshot & {
  lastDetailContentType: string;
  lastListDetectedCharset: string;
  lastDetailDetectedCharset: string;
};

type ExternalEumDebugState = {
  lastErrorStage?: string;
  listCount?: number;
  detailAttemptCount?: number;
  detailSuccessCount?: number;
  lastRequestUrl?: string;
  lastListUrl?: string;
  lastDetailUrl?: string;
  lastListContentType?: string;
  lastListPreview?: string;
  lastDetailPreview?: string;
  lastDetailContentType?: string;
  lastListDetectedCharset?: string;
  lastDetailDetectedCharset?: string;
  listFetchStartedAt?: string;
  listFetchHeadersReceivedAt?: string;
  listFetchBodyReceivedAt?: string;
  elapsedMs?: number;
  timeoutMs?: number;
};

export class EumStageError extends Error {
  stage: EumStage;
  debug: EumDebugSnapshot;

  constructor(stage: EumStage, message: string, debug: EumDebugSnapshot) {
    super(message);
    this.name = 'EumStageError';
    this.stage = stage;
    this.debug = debug;
  }
}

const EUM_LIST_URL = 'https://www.eum.go.kr/web/cp/hr/hrPeopleHearList.jsp';
const EUM_CACHED_JSON_URL = 'https://raw.githubusercontent.com/suf40mil0ne-cloud/goyang/main/data/eum-hearings.json';
const DATASET_CACHE_TTL_MS = 15 * 60 * 1000;
const DATASET_STALE_TTL_MS = 60 * 60 * 1000;
const DETAIL_CACHE_TTL_MS = 60 * 60 * 1000;
export const EUM_LIST_FETCH_TIMEOUT_MS = 20000;
const LIST_FETCH_TIMEOUT_MS = EUM_LIST_FETCH_TIMEOUT_MS;
const DETAIL_FETCH_TIMEOUT_MS = 8000;
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
  score -= (text.match(/\uFFFD/g) || []).length * 8;
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

function createEmptyEumDebugState(): EumDebugState {
  return {
    lastErrorStage: '',
    listCount: 0,
    detailAttemptCount: 0,
    detailSuccessCount: 0,
    lastRequestUrl: '',
    lastListUrl: '',
    lastDetailUrl: '',
    lastListContentType: '',
    lastListPreview: '',
    lastDetailPreview: '',
    listFetchStartedAt: '',
    listFetchHeadersReceivedAt: '',
    listFetchBodyReceivedAt: '',
    lastDetailContentType: '',
    lastListDetectedCharset: '',
    lastDetailDetectedCharset: '',
    elapsedMs: 0,
    timeoutMs: 0,
  };
}

function snapshotEumDebug(state: EumDebugState): EumDebugSnapshot {
  return {
    lastErrorStage: state.lastErrorStage,
    listCount: state.listCount,
    detailAttemptCount: state.detailAttemptCount,
    detailSuccessCount: state.detailSuccessCount,
    lastRequestUrl: state.lastRequestUrl,
    lastListUrl: state.lastListUrl,
    lastDetailUrl: state.lastDetailUrl,
    lastListContentType: state.lastListContentType,
    lastListPreview: state.lastListPreview,
    lastDetailPreview: state.lastDetailPreview,
    listFetchStartedAt: state.listFetchStartedAt,
    listFetchHeadersReceivedAt: state.listFetchHeadersReceivedAt,
    listFetchBodyReceivedAt: state.listFetchBodyReceivedAt,
    elapsedMs: state.elapsedMs,
    timeoutMs: state.timeoutMs,
  };
}

function getHtmlPreview(html: string): string {
  return String(html || '').slice(0, 200);
}

function hasActiveListFilters(query: EumQuery): boolean {
  return Boolean(
    normalizeString(query.startdt)
    || normalizeString(query.enddt)
    || normalizeSigunguCode(query.selSggCd)
    || normalizeString(query.zonenm)
    || normalizeString(query.chrgorg)
    || normalizeString(query.gosino)
  );
}

function classifyEumHtml(html: string, responseUrl: string, kind: 'list' | 'detail'): string {
  const normalizedHtml = normalizeInlineText(html).toLowerCase();
  const normalizedUrl = String(responseUrl || '').toLowerCase();
  const expectedPath = kind === 'list' ? '/web/cp/hr/hrpeoplehearlist.jsp' : '/web/cp/hr/hrpeopleheardet.jsp';

  if (normalizedUrl && !normalizedUrl.includes(expectedPath)) {
    if (normalizedUrl.includes('/web/am/ammain.jsp')) {
      return 'main-page';
    }
    return 'redirect';
  }

  if (
    normalizedHtml.includes('비정상적인 접근')
    || normalizedHtml.includes('접근이 제한')
    || normalizedHtml.includes('권한이 없습니다')
    || normalizedHtml.includes('차단')
  ) {
    return 'blocked';
  }

  if (normalizedHtml.includes('로그인') && normalizedHtml.includes('토지이음')) {
    return 'login-page';
  }

  if (
    kind === 'list'
    && normalizedHtml.includes('메인페이지로 이동')
    && !normalizedHtml.includes('전체:')
    && !normalizedHtml.includes('주민의견청취 공람')
  ) {
    return 'main-page';
  }

  return 'expected';
}

function isAbortLikeError(error: unknown): boolean {
  const text = String(error || '');
  return text.includes('AbortError') || text.includes('aborted') || text.includes('timed out');
}

function logEumStage(
  level: 'info' | 'error',
  payload: {
    stage: EumStage;
    requestUrl: string;
    responseUrl: string;
    contentType: string;
    detectedCharset: string;
    pageNo?: number;
    seq?: string;
    htmlPreview: string;
    htmlKind?: string;
    parsedCount?: number;
    message?: string;
    fetchStartedAt?: string;
    headersReceivedAt?: string;
    bodyReceivedAt?: string;
    elapsedMs?: number;
    timeoutMs?: number;
    errorName?: string;
  }
): void {
  if (level === 'error') {
    console.error('[eum] stage', payload);
    return;
  }
  console.info('[eum] stage', payload);
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

async function fetchDecodedHtml(url: URL, timeoutMs: number): Promise<DecodedHtmlResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const fetchStartedAt = new Date().toISOString();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        Referer: 'https://www.eum.go.kr/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    });
    const headersReceivedAt = new Date().toISOString();

    const buffer = await response.arrayBuffer();
    const bodyReceivedAt = new Date().toISOString();
    const decoded = decodeHtmlBuffer(buffer, response.headers.get('content-type') || '');

    return {
      status: response.status,
      url: response.url || url.toString(),
      html: decoded.html,
      detectedCharset: decoded.detectedCharset,
      contentType: response.headers.get('content-type') || '',
      fetchStartedAt,
      headersReceivedAt,
      bodyReceivedAt,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchDecodedHtmlWithRetry(url: URL, label: string, timeoutMs: number): Promise<DecodedHtmlResponse> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt += 1) {
    try {
      const response = await fetchDecodedHtml(url, timeoutMs);
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
      if (isAbortLikeError(error)) {
        break;
      }
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

async function loadDetail(listItem: EumListItem, debugState: EumDebugState): Promise<EumDetailItem | null> {
  const cached = detailCache.get(listItem.seq);
  const now = Date.now();
  if (cached && now - cached.cachedAt <= DETAIL_CACHE_TTL_MS) {
    return cached.item;
  }

  const requestUrl = new URL(listItem.detailUrl);
  debugState.lastRequestUrl = requestUrl.toString();
  debugState.lastDetailUrl = requestUrl.toString();
  debugState.elapsedMs = 0;
  debugState.timeoutMs = DETAIL_FETCH_TIMEOUT_MS;

  let response: DecodedHtmlResponse;
  const fetchStartedAt = Date.now();
  try {
    response = await fetchDecodedHtmlWithRetry(requestUrl, `eum-detail-${listItem.seq}`, DETAIL_FETCH_TIMEOUT_MS);
  } catch (error) {
    const stage: EumStage = isAbortLikeError(error) ? 'detail-fetch-timeout' : 'detail-fetch';
    debugState.lastErrorStage = stage;
    debugState.elapsedMs = Date.now() - fetchStartedAt;
    logEumStage('error', {
      stage,
      requestUrl: requestUrl.toString(),
      responseUrl: '',
      contentType: '',
      detectedCharset: '',
      seq: listItem.seq,
      htmlPreview: debugState.lastDetailPreview,
      message: isAbortLikeError(error) ? 'detail fetch timed out' : String(error),
      elapsedMs: debugState.elapsedMs,
      timeoutMs: debugState.timeoutMs,
      errorName: error instanceof Error ? error.name : '',
    });
    throw new EumStageError(stage, isAbortLikeError(error) ? 'eum-detail-fetch-timeout' : String(error), snapshotEumDebug(debugState));
  }

  debugState.elapsedMs = Date.now() - fetchStartedAt;
  debugState.lastDetailPreview = getHtmlPreview(response.html);
  debugState.lastDetailContentType = response.contentType;
  debugState.lastDetailDetectedCharset = response.detectedCharset;

  const responseUrl = response.url || requestUrl.toString();
  const htmlKind = classifyEumHtml(response.html, responseUrl, 'detail');
  const detailFetchLog = {
    stage: 'detail-fetch' as const,
    requestUrl: requestUrl.toString(),
    responseUrl,
    contentType: response.contentType,
    detectedCharset: response.detectedCharset,
    seq: listItem.seq,
    htmlPreview: debugState.lastDetailPreview,
    htmlKind,
    elapsedMs: debugState.elapsedMs,
    timeoutMs: debugState.timeoutMs,
  };

  if (htmlKind !== 'expected') {
    debugState.lastErrorStage = 'detail-fetch';
    logEumStage('error', {
      ...detailFetchLog,
      message: `unexpected detail html: ${htmlKind}`,
    });
    throw new EumStageError('detail-fetch', `eum-detail-fetch-unexpected-${htmlKind}`, snapshotEumDebug(debugState));
  }

  logEumStage('info', detailFetchLog);

  const parsed = parseEumDetailHtml(response.html, {
    seq: listItem.seq,
    detailUrl: responseUrl,
  });

  if (!parsed) {
    debugState.lastErrorStage = 'detail-parse';
    logEumStage('error', {
      stage: 'detail-parse',
      requestUrl: requestUrl.toString(),
      responseUrl,
      contentType: response.contentType,
      detectedCharset: response.detectedCharset,
      seq: listItem.seq,
      htmlPreview: debugState.lastDetailPreview,
      htmlKind,
      message: 'detail parse returned null',
    });
    throw new EumStageError('detail-parse', 'eum-detail-parse-null', snapshotEumDebug(debugState));
  }

  logEumStage('info', {
    stage: 'detail-parse',
    requestUrl: requestUrl.toString(),
    responseUrl,
    contentType: response.contentType,
    detectedCharset: response.detectedCharset,
    seq: listItem.seq,
    htmlPreview: debugState.lastDetailPreview,
    htmlKind,
  });

  detailCache.set(listItem.seq, {
    cachedAt: now,
    item: parsed,
  });

  return parsed;
}

export async function loadEumPublicHearings(
  query: EumQuery = {},
  externalDebugState?: ExternalEumDebugState
): Promise<{ payload: EumDatasetPayload; usedStaleCache: boolean; debug: EumDebugSnapshot }> {
  const cacheKey = buildQueryKey(query);
  const now = Date.now();
  const cached = datasetCache.get(cacheKey);
  const debugState = (externalDebugState as EumDebugState | undefined) || createEmptyEumDebugState();
  Object.assign(debugState, createEmptyEumDebugState());

  if (cached && now - cached.cachedAt <= DATASET_CACHE_TTL_MS) {
    console.info('[eum] using fresh cache', { cacheKey, count: cached.payload.items.length });
    return {
      payload: cached.payload,
      usedStaleCache: false,
      debug: snapshotEumDebug(debugState),
    };
  }

  try {
    if (!hasActiveListFilters(query) && !query.maxPages) {
      try {
        const res = await fetch(EUM_CACHED_JSON_URL, { headers: { 'Cache-Control': 'no-cache' } });
        if (!res.ok) throw new Error(
          'cached-json-fetch-failed: ' + res.status
        );

        const json = await res.json() as {
          crawledAt: string;
          count: number;
          items: EumListItem[];
        };
        const listItems = Array.isArray(json.items) ? json.items : [];
        if (!listItems.length) {
          throw new Error('cached-json-empty');
        }

        const items = sortHearings(listItems.map((listItem) => normalizeEumHearing(listItem, null)));
        const payload: EumDatasetPayload = {
          items,
          fetchedAt: String(json.crawledAt || new Date().toISOString()),
          listCount: listItems.length,
          detailSuccessCount: 0,
          detailFailureCount: 0,
        };

        datasetCache.set(cacheKey, {
          cachedAt: now,
          payload,
        });

        console.info('[eum] dataset loaded from cached json', {
          cacheKey,
          sourceUrl: EUM_CACHED_JSON_URL,
          listCount: payload.listCount,
          totalCount: items.length,
        });

        return {
          payload,
          usedStaleCache: false,
          debug: snapshotEumDebug(debugState),
        };
      } catch (error) {
        console.warn('[eum] cached json unavailable, falling back to live fetch', {
          cacheKey,
          sourceUrl: EUM_CACHED_JSON_URL,
          message: String(error),
        });
      }
    }

    const maxPages = Math.min(MAX_MAX_PAGES, Math.max(1, query.maxPages || DEFAULT_MAX_PAGES));
    const listings: EumListItem[] = [];
    const seenSeq = new Set<string>();
    let lastPageNo = maxPages;

    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const listUrl = buildListUrl(query, pageNo);
      debugState.lastErrorStage = 'list-fetch-start';
      debugState.lastRequestUrl = listUrl.toString();
      debugState.lastListUrl = '';
      debugState.lastListContentType = '';
      debugState.lastListPreview = '';
      debugState.listFetchStartedAt = new Date().toISOString();
      debugState.listFetchHeadersReceivedAt = '';
      debugState.listFetchBodyReceivedAt = '';
      debugState.elapsedMs = 0;
      debugState.timeoutMs = LIST_FETCH_TIMEOUT_MS;
      logEumStage('info', {
        stage: 'list-fetch-start',
        requestUrl: listUrl.toString(),
        responseUrl: '',
        contentType: '',
        detectedCharset: '',
        pageNo,
        htmlPreview: '',
        fetchStartedAt: debugState.listFetchStartedAt,
        elapsedMs: 0,
        timeoutMs: debugState.timeoutMs,
      });

      let response: DecodedHtmlResponse;
      const fetchStartedAt = Date.now();
      try {
        response = await fetchDecodedHtmlWithRetry(listUrl, `eum-list-${pageNo}`, LIST_FETCH_TIMEOUT_MS);
      } catch (error) {
        const stage: EumStage = isAbortLikeError(error) ? 'list-fetch-timeout' : 'list-fetch-error';
        debugState.lastErrorStage = stage;
        debugState.elapsedMs = Date.now() - fetchStartedAt;
        logEumStage('error', {
          stage,
          requestUrl: listUrl.toString(),
          responseUrl: '',
          contentType: '',
          detectedCharset: '',
          pageNo,
          htmlPreview: debugState.lastListPreview,
          message: isAbortLikeError(error) ? 'list fetch timed out' : String(error),
          fetchStartedAt: debugState.listFetchStartedAt,
          headersReceivedAt: debugState.listFetchHeadersReceivedAt,
          bodyReceivedAt: debugState.listFetchBodyReceivedAt,
          elapsedMs: debugState.elapsedMs,
          timeoutMs: debugState.timeoutMs,
          errorName: error instanceof Error ? error.name : '',
        });
        throw new EumStageError(
          stage,
          isAbortLikeError(error)
            ? 'eum-list-fetch-timeout'
            : `${error instanceof Error ? error.name : 'Error'}: ${error instanceof Error ? error.message : String(error)}`,
          snapshotEumDebug(debugState)
        );
      }

      debugState.lastErrorStage = 'list-fetch-headers';
      debugState.elapsedMs = Date.now() - fetchStartedAt;
      debugState.lastListPreview = getHtmlPreview(response.html);
      debugState.lastListUrl = response.url || listUrl.toString();
      debugState.lastListContentType = response.contentType;
      debugState.lastListDetectedCharset = response.detectedCharset;
      debugState.listFetchStartedAt = response.fetchStartedAt;
      debugState.listFetchHeadersReceivedAt = response.headersReceivedAt;
      debugState.listFetchBodyReceivedAt = response.bodyReceivedAt;

      const responseUrl = response.url || listUrl.toString();
      const htmlKind = classifyEumHtml(response.html, responseUrl, 'list');
      const listFetchHeadersLog = {
        stage: 'list-fetch-headers' as const,
        requestUrl: listUrl.toString(),
        responseUrl,
        contentType: response.contentType,
        detectedCharset: response.detectedCharset,
        pageNo,
        htmlPreview: '',
        htmlKind,
        fetchStartedAt: debugState.listFetchStartedAt,
        headersReceivedAt: debugState.listFetchHeadersReceivedAt,
        bodyReceivedAt: '',
        elapsedMs: debugState.listFetchHeadersReceivedAt
          ? Date.parse(debugState.listFetchHeadersReceivedAt) - Date.parse(debugState.listFetchStartedAt)
          : debugState.elapsedMs,
        timeoutMs: debugState.timeoutMs,
      };
      logEumStage('info', listFetchHeadersLog);

      debugState.lastErrorStage = 'list-fetch-body';
      const listFetchBodyLog = {
        stage: 'list-fetch-body' as const,
        requestUrl: listUrl.toString(),
        responseUrl,
        contentType: response.contentType,
        detectedCharset: response.detectedCharset,
        pageNo,
        htmlPreview: debugState.lastListPreview,
        htmlKind,
        fetchStartedAt: debugState.listFetchStartedAt,
        headersReceivedAt: debugState.listFetchHeadersReceivedAt,
        bodyReceivedAt: debugState.listFetchBodyReceivedAt,
        elapsedMs: debugState.elapsedMs,
        timeoutMs: debugState.timeoutMs,
      };

      if (htmlKind !== 'expected') {
        debugState.lastErrorStage = 'list-fetch-error';
        logEumStage('error', {
          ...listFetchBodyLog,
          message: `unexpected list html: ${htmlKind}`,
        });
        throw new EumStageError('list-fetch-error', `eum-list-fetch-unexpected-${htmlKind}`, snapshotEumDebug(debugState));
      }

      logEumStage('info', listFetchBodyLog);

      const parsed = parseEumListHtml(response.html, {
        baseUrl: responseUrl,
        pageNo,
      });

      logEumStage(parsed.items.length ? 'info' : 'error', {
        stage: 'list-parse',
        requestUrl: listUrl.toString(),
        responseUrl,
        contentType: response.contentType,
        detectedCharset: response.detectedCharset,
        pageNo,
        htmlPreview: debugState.lastListPreview,
        htmlKind,
        parsedCount: parsed.items.length,
        message: parsed.items.length ? undefined : 'parsed 0 items',
      });

      console.info('[eum] list parsed', {
        pageNo,
        requestUrl: listUrl.toString(),
        parsedCount: parsed.items.length,
        lastPageNo: parsed.lastPageNo,
      });

      if (!parsed.items.length) {
        debugState.lastErrorStage = 'list-parse';
        if (pageNo === 1 && !hasActiveListFilters(query)) {
          throw new EumStageError('list-parse', 'eum-list-parse-empty', snapshotEumDebug(debugState));
        }
      }

      lastPageNo = parsed.lastPageNo || lastPageNo;
      const newItems = parsed.items.filter((item) => {
        if (seenSeq.has(item.seq)) {
          return false;
        }
        seenSeq.add(item.seq);
        return true;
      });
      listings.push(...newItems);
      debugState.listCount = listings.length;

      if (!parsed.items.length || pageNo >= lastPageNo) {
        break;
      }
    }

    const detailResults = await mapWithConcurrency(listings, DETAIL_CONCURRENCY, async (listItem) => {
      debugState.detailAttemptCount += 1;
      try {
        const detail = await loadDetail(listItem, debugState);
        return {
          ok: true,
          listItem,
          detail,
        };
      } catch (error) {
        if (error instanceof EumStageError) {
          debugState.lastErrorStage = error.stage;
        }
        console.error('[eum] detail fetch failed', {
          seq: listItem.seq,
          detailUrl: listItem.detailUrl,
          stage: error instanceof EumStageError ? error.stage : 'detail-fetch',
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
    debugState.listCount = listings.length;
    debugState.detailSuccessCount = detailSuccessCount;

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

    logEumStage('info', {
      stage: 'dataset-build',
      requestUrl: debugState.lastListUrl || EUM_LIST_URL,
      responseUrl: debugState.lastListUrl || EUM_LIST_URL,
      contentType: debugState.lastListContentType,
      detectedCharset: debugState.lastListDetectedCharset,
      htmlPreview: debugState.lastListPreview,
      parsedCount: items.length,
      message: `listCount=${payload.listCount}, detailAttemptCount=${debugState.detailAttemptCount}, detailSuccessCount=${detailSuccessCount}, detailFailureCount=${detailFailureCount}`,
    });

    console.info('[eum] dataset built', {
      cacheKey,
      listCount: payload.listCount,
      detailAttemptCount: debugState.detailAttemptCount,
      detailSuccessCount,
      detailFailureCount,
      totalCount: items.length,
    });

    return {
      payload,
      usedStaleCache: false,
      debug: snapshotEumDebug(debugState),
    };
  } catch (error) {
    if (cached && now - cached.cachedAt <= DATASET_STALE_TTL_MS) {
      console.warn('[eum] using stale cache after fetch failure', {
        cacheKey,
        stage: error instanceof EumStageError ? error.stage : debugState.lastErrorStage || 'dataset-build',
        message: String(error),
        staleCount: cached.payload.items.length,
      });
      return {
        payload: cached.payload,
        usedStaleCache: true,
        debug: snapshotEumDebug(debugState),
      };
    }

    if (error instanceof EumStageError) {
      throw error;
    }

    throw new EumStageError(debugState.lastErrorStage || 'dataset-build', String(error), snapshotEumDebug(debugState));
  }
}

export async function probeEumListConnection(
  query: EumQuery = {}
): Promise<{
  status: number;
  requestUrl: string;
  responseUrl: string;
  contentType: string;
  detectedCharset: string;
  timeoutMs: number;
  elapsedMs: number;
  fetchStartedAt: string;
  headersReceivedAt: string;
  bodyReceivedAt: string;
  preview: string;
}> {
  const listUrl = buildListUrl(query, 1);
  const startedAt = Date.now();
  const response = await fetchDecodedHtml(listUrl, LIST_FETCH_TIMEOUT_MS);

  return {
    status: response.status,
    requestUrl: listUrl.toString(),
    responseUrl: response.url || listUrl.toString(),
    contentType: response.contentType,
    detectedCharset: response.detectedCharset,
    timeoutMs: LIST_FETCH_TIMEOUT_MS,
    elapsedMs: Date.now() - startedAt,
    fetchStartedAt: response.fetchStartedAt,
    headersReceivedAt: response.headersReceivedAt,
    bodyReceivedAt: response.bodyReceivedAt,
    preview: getHtmlPreview(response.html),
  };
}

export type { EumQuery, EumDebugSnapshot, EumStage };
