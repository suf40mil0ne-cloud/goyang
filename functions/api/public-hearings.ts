import { getRegionLabelBySigunguCode, normalizeSigunguCode } from '../../shared/region-codes';
import {
  normalizePublicHearingItem,
  PublicHearingsResponse,
  sortPublicHearings,
} from '../../shared/public-hearings';

type EnvMap = {
  PUBLIC_DATA_SERVICE_KEY?: string;
};

type RequestContext = {
  request: Request;
  env: EnvMap;
};

type UpstreamRecord = Record<string, unknown>;

type CacheEntry = {
  cachedAt: number;
  payload: {
    items: ReturnType<typeof normalizePublicHearingItem>[];
    totalCount: number;
    fetchedAt: string;
  };
};

type UpstreamPayload = {
  data?: UpstreamRecord[];
  totalCount?: number;
};

type UpstreamStatus = number | 'network-error' | 'invalid-json' | 'invalid-payload';

type UpstreamFailureDetails = {
  upstreamStatus: UpstreamStatus;
  responsePreview: string;
  serviceKeyPresent: boolean;
  requestUrl: string;
};

class UpstreamFetchError extends Error {
  status: UpstreamStatus;
  canUseStaleCache: boolean;

  constructor(message: string, status: UpstreamStatus, canUseStaleCache: boolean) {
    super(message);
    this.name = 'UpstreamFetchError';
    this.status = status;
    this.canUseStaleCache = canUseStaleCache;
  }
}

const API_URL = 'https://api.odcloud.kr/api/15144538/v1/uddi:e3214695-5339-4f73-abd2-9157715f3b16';
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const RESPONSE_PREVIEW_LIMIT = 300;
const cache = new Map<string, CacheEntry>();

function getCacheKey(page: number, perPage: number): string {
  return `${page}:${perPage}`;
}

function parsePositiveInteger(
  value: string | null,
  fallbackValue: number,
  limits: { min?: number; max?: number } = {}
): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  const safeValue = Number.isFinite(parsed) ? parsed : fallbackValue;
  const min = limits.min ?? 1;
  const max = limits.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(max, Math.max(min, safeValue));
}

function normalizeServiceKey(value: string): string {
  let normalized = String(value ?? '').trim();

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
  return value.replace(/\s+/g, ' ').trim().slice(0, RESPONSE_PREVIEW_LIMIT);
}

function logUpstreamFailure(details: UpstreamFailureDetails): void {
  console.error('[public-hearings] Upstream request failed', details);
}

function readServiceKey(env: EnvMap): string {
  return normalizeServiceKey(env.PUBLIC_DATA_SERVICE_KEY || '');
}

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
    },
  });
}

async function fetchUpstreamPayload(url: URL, serviceKeyPresent: boolean, retries = 1): Promise<UpstreamPayload> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });
      const responseText = await response.text();

      clearTimeout(timeoutId);

      if (!response.ok) {
        logUpstreamFailure({
          upstreamStatus: response.status,
          responsePreview: getResponsePreview(responseText),
          serviceKeyPresent,
          requestUrl: buildMaskedUrl(url),
        });

        const error = new UpstreamFetchError(
          `upstream-http-${response.status}`,
          response.status,
          response.status >= 500
        );
        lastError = error;

        if (attempt === retries || !error.canUseStaleCache) {
          throw error;
        }

        continue;
      }

      let payload: UpstreamPayload;

      try {
        payload = JSON.parse(responseText) as UpstreamPayload;
      } catch {
        const error = new UpstreamFetchError('upstream-json-invalid', 'invalid-json', false);
        logUpstreamFailure({
          upstreamStatus: error.status,
          responsePreview: getResponsePreview(responseText),
          serviceKeyPresent,
          requestUrl: buildMaskedUrl(url),
        });
        throw error;
      }

      if (!payload || !Array.isArray(payload.data)) {
        const error = new UpstreamFetchError('upstream-payload-invalid', 'invalid-payload', false);
        logUpstreamFailure({
          upstreamStatus: error.status,
          responsePreview: getResponsePreview(responseText),
          serviceKeyPresent,
          requestUrl: buildMaskedUrl(url),
        });
        throw error;
      }

      return payload;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof UpstreamFetchError) {
        lastError = error;
        if (attempt === retries || !error.canUseStaleCache) {
          throw error;
        }
        continue;
      }

      const networkError = new UpstreamFetchError(
        error instanceof Error ? error.message : 'upstream-network-error',
        'network-error',
        true
      );
      logUpstreamFailure({
        upstreamStatus: networkError.status,
        responsePreview: getResponsePreview(error instanceof Error ? error.message : String(error)),
        serviceKeyPresent,
        requestUrl: buildMaskedUrl(url),
      });
      lastError = networkError;

      if (attempt === retries) {
        throw networkError;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error('upstream-fetch-failed');
}

async function loadBasePayload(page: number, perPage: number, env: EnvMap) {
  const cacheKey = getCacheKey(page, perPage);
  const now = Date.now();
  const cached = cache.get(cacheKey);
  const serviceKey = readServiceKey(env);

  if (!serviceKey) {
    throw new Error('service-key-missing');
  }

  if (cached && now - cached.cachedAt <= CACHE_TTL_MS) {
    return { ...cached.payload, usedStaleCache: false };
  }

  const url = new URL(API_URL);
  url.searchParams.set('page', String(page));
  url.searchParams.set('perPage', String(perPage));
  url.searchParams.set('returnType', 'JSON');
  url.searchParams.set('serviceKey', serviceKey);

  try {
    const payload = await fetchUpstreamPayload(url, true, 1);
    const normalizedItems = (payload.data ?? []).map((item) =>
      normalizePublicHearingItem(item, {
        regionLabel: getRegionLabelBySigunguCode(item.sigunguCode ?? item['시군구코드']),
      })
    );

    const normalizedPayload = {
      items: sortPublicHearings(normalizedItems),
      totalCount: Number(payload.totalCount ?? normalizedItems.length),
      fetchedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, {
      cachedAt: now,
      payload: normalizedPayload,
    });

    return {
      ...normalizedPayload,
      usedStaleCache: false,
    };
  } catch (error) {
    console.error('[public-hearings] Upstream fetch handling result', {
      serviceKeyPresent: true,
      requestUrl: buildMaskedUrl(url),
      usedStaleCache: Boolean(cached),
      error: error instanceof Error ? error.message : String(error),
    });

    if (cached && error instanceof UpstreamFetchError && error.canUseStaleCache) {
      return {
        ...cached.payload,
        usedStaleCache: true,
      };
    }

    throw error;
  }
}

export async function onRequestGet(context: RequestContext): Promise<Response> {
  const requestUrl = new URL(context.request.url);
  const page = parsePositiveInteger(requestUrl.searchParams.get('page'), 1, { min: 1, max: 9999 });
  const perPage = parsePositiveInteger(requestUrl.searchParams.get('perPage'), 20, { min: 1, max: 100 });
  const requestedSigunguCode = normalizeSigunguCode(requestUrl.searchParams.get('sigunguCode'));

  try {
    const basePayload = await loadBasePayload(page, perPage, context.env);
    const exactItems = requestedSigunguCode
      ? basePayload.items.filter((item) => item.sigunguCode === requestedSigunguCode)
      : basePayload.items;

    const fallbackMessage = requestedSigunguCode && exactItems.length === 0
      ? `${getRegionLabelBySigunguCode(requestedSigunguCode) || requestedSigunguCode} 기준 정확히 일치하는 공고가 없어 전체 결과를 보여줍니다.`
      : '';

    const responseBody: PublicHearingsResponse = {
      items: sortPublicHearings(exactItems.length ? exactItems : basePayload.items),
      meta: {
        page,
        perPage,
        totalCount: basePayload.totalCount,
        requestedSigunguCode,
        exactMatchCount: exactItems.length,
        usedStaleCache: basePayload.usedStaleCache,
        fallbackMessage,
        fetchedAt: basePayload.fetchedAt,
      },
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'cache-control': 'public, max-age=600, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    if (String(error).includes('service-key-missing')) {
      console.error('[public-hearings] PUBLIC_DATA_SERVICE_KEY is missing.', {
        serviceKeyPresent: false,
      });
      return createJsonResponse(
        {
          message: 'PUBLIC_DATA_SERVICE_KEY가 설정되지 않았습니다.',
          code: 'public_data_service_key_missing',
        },
        500
      );
    }

    return createJsonResponse(
      {
        message: '공고 데이터를 불러오지 못했습니다. 서버 로그를 확인해주세요.',
        code: 'public_hearings_upstream_failed',
      },
      502
    );
  }
}
