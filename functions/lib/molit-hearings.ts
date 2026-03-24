import { computeHearingStatus, HearingItem, sortHearings } from '../../shared/hearings';
import { getRegionLabelBySigunguCode, normalizeSigunguCode } from '../../shared/region-codes';
import { formatIsoDate } from '../../shared/public-hearings';

type EnvMap = {
  PUBLIC_DATA_SERVICE_KEY?: string;
};

type MolitPayload = {
  data?: Record<string, unknown>[];
};

type CacheEntry = {
  cachedAt: number;
  payload: {
    items: HearingItem[];
    fetchedAt: string;
  };
};

const API_URL = 'https://api.odcloud.kr/api/15144538/v1/uddi:e3214695-5339-4f73-abd2-9157715f3b16';
const CACHE_TTL_MS = 15 * 60 * 1000;
const STALE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const REQUEST_RETRIES = 1;
const FETCH_PER_PAGE = 200;
const RESPONSE_PREVIEW_LIMIT = 240;
const cache = new Map<string, CacheEntry>();

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeInlineText(value: unknown): string {
  return normalizeString(value).replace(/\s+/g, ' ').trim();
}

function normalizeServiceKey(value: string): string {
  let normalized = normalizeString(value);

  for (let index = 0; index < 3; index += 1) {
    if (!/%[0-9a-f]{2}/i.test(normalized)) {
      break;
    }

    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) {
        break;
      }
      normalized = decoded;
    } catch {
      break;
    }
  }

  return normalized;
}

function buildMaskedUrl(url: URL): string {
  const maskedUrl = new URL(url.toString());
  if (maskedUrl.searchParams.has('serviceKey')) {
    maskedUrl.searchParams.set('serviceKey', '[masked]');
  }
  return maskedUrl.toString();
}

function getResponsePreview(value: string): string {
  return normalizeInlineText(value).slice(0, RESPONSE_PREVIEW_LIMIT);
}

function buildSummary(item: { region: string; publishedAt: string; hearingStartDate: string; hearingEndDate: string; contact: string; body: string }): string {
  const parts = [
    item.region,
    item.publishedAt ? `공고일 ${item.publishedAt}` : '',
    item.hearingStartDate || item.hearingEndDate
      ? `청취기간 ${item.hearingStartDate || '-'} ~ ${item.hearingEndDate || '-'}`
      : '',
    item.contact ? `문의 ${item.contact}` : '',
  ].filter(Boolean);

  if (parts.length >= 2) {
    return parts.join(' · ');
  }

  return parts.concat(item.body ? [item.body.slice(0, 100)] : []).join(' · ').slice(0, 140);
}

function normalizeMolitItem(record: Record<string, unknown>): HearingItem {
  const sigunguCode = normalizeSigunguCode(record['시군구코드'] ?? record.sigunguCode);
  const region = getRegionLabelBySigunguCode(sigunguCode) || normalizeString(record['시군구명']);
  const title = normalizeInlineText(record['공고제목'] ?? record.title);
  const body = normalizeInlineText(record['공고내용'] ?? record.content);
  const publishedAt = formatIsoDate(record['공고일자'] ?? record.noticeDate);
  const hearingStartDate = formatIsoDate(record['열람시작일자'] ?? record.viewStartDate);
  const hearingEndDate = formatIsoDate(record['열람종료일자'] ?? record.viewEndDate);
  const contact = normalizeInlineText(record['문의처'] ?? record.contact);
  const noticeNumber = normalizeInlineText(record['공고번호'] ?? record.noticeNumber);

  return {
    id: normalizeInlineText(record['공고코드'] ?? record.id) || [sigunguCode, publishedAt, title].filter(Boolean).join('::'),
    source: 'molit_api',
    sourceLabel: '국토부 인터넷 주민의견청취',
    noticeNumber,
    title,
    region,
    sigunguCode,
    agency: region,
    publishedAt,
    hearingStartDate,
    hearingEndDate,
    contact,
    status: computeHearingStatus(hearingStartDate, hearingEndDate),
    summary: buildSummary({ region, publishedAt, hearingStartDate, hearingEndDate, contact, body }),
    body,
    attachments: [],
    link: 'https://www.data.go.kr/data/15144538/openapi.do',
    rawSource: record,
  };
}

async function fetchJsonText(url: URL): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    const text = await response.text();
    return { status: response.status, text };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchMolitPayload(url: URL): Promise<MolitPayload> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt += 1) {
    try {
      const response = await fetchJsonText(url);
      if (response.status < 200 || response.status >= 300) {
        console.error('[molit] upstream failed', {
          upstreamStatus: response.status,
          responsePreview: getResponsePreview(response.text),
          requestUrl: buildMaskedUrl(url),
          serviceKeyPresent: true,
        });
        throw new Error(`molit-upstream-${response.status}`);
      }

      return JSON.parse(response.text) as MolitPayload;
    } catch (error) {
      lastError = error;
      console.warn('[molit] fetch retry', {
        attempt: attempt + 1,
        requestUrl: buildMaskedUrl(url),
        message: String(error),
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error('molit-fetch-failed');
}

export async function loadMolitHearings(env: EnvMap): Promise<{ payload: { items: HearingItem[]; fetchedAt: string }; usedStaleCache: boolean }> {
  const cacheKey = 'default';
  const cached = cache.get(cacheKey);
  const now = Date.now();
  const serviceKey = normalizeServiceKey(env.PUBLIC_DATA_SERVICE_KEY || '');

  if (!serviceKey) {
    throw new Error('public-data-service-key-missing');
  }

  if (cached && now - cached.cachedAt <= CACHE_TTL_MS) {
    console.info('[molit] using fresh cache', { count: cached.payload.items.length });
    return {
      payload: cached.payload,
      usedStaleCache: false,
    };
  }

  const url = new URL(API_URL);
  url.searchParams.set('page', '1');
  url.searchParams.set('perPage', String(FETCH_PER_PAGE));
  url.searchParams.set('returnType', 'JSON');
  url.searchParams.set('serviceKey', serviceKey);

  try {
    const payload = await fetchMolitPayload(url);
    const items = sortHearings((payload.data || []).map(normalizeMolitItem).filter((item) => item.title));
    const normalizedPayload = {
      items,
      fetchedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, {
      cachedAt: now,
      payload: normalizedPayload,
    });

    console.info('[molit] fetch success', {
      count: items.length,
      requestUrl: buildMaskedUrl(url),
    });

    return {
      payload: normalizedPayload,
      usedStaleCache: false,
    };
  } catch (error) {
    if (cached && now - cached.cachedAt <= STALE_TTL_MS) {
      console.warn('[molit] using stale cache after fetch failure', {
        count: cached.payload.items.length,
        message: String(error),
        requestUrl: buildMaskedUrl(url),
      });
      return {
        payload: cached.payload,
        usedStaleCache: true,
      };
    }

    throw error;
  }
}

export type { EnvMap };
