import { getRegionLabelBySigunguCode, normalizeSigunguCode } from '../../shared/region-codes';
import {
  normalizePublicHearingItem,
  PublicHearingsResponse,
  sortPublicHearings,
} from '../../shared/public-hearings';

type EnvMap = {
  PUBLIC_DATA_SERVICE_KEY?: string;
  DATA_GO_KR_SERVICE_KEY?: string;
};

type RequestContext = {
  request: Request;
  env: EnvMap;
};

type CacheEntry = {
  cachedAt: number;
  payload: {
    items: ReturnType<typeof normalizePublicHearingItem>[];
    totalCount: number;
    fetchedAt: string;
  };
};

const API_URL = 'https://api.odcloud.kr/api/15144538/v1/uddi:e3214695-5339-4f73-abd2-9157715f3b16';
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const cache = new Map<string, CacheEntry>();

async function fetchWithRetry(url: URL, retries = 1): Promise<Response> {
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

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`upstream-${response.status}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (attempt === retries) {
        throw lastError;
      }
    }
  }

  throw lastError;
}

function getCacheKey(page: number, perPage: number): string {
  return `${page}:${perPage}`;
}

function readServiceKey(env: EnvMap): string {
  const serviceKey = env.PUBLIC_DATA_SERVICE_KEY || env.DATA_GO_KR_SERVICE_KEY || '';
  if (!serviceKey) {
    console.error('[public-hearings] Missing PUBLIC_DATA_SERVICE_KEY or DATA_GO_KR_SERVICE_KEY.');
  }
  return serviceKey;
}

async function loadBasePayload(page: number, perPage: number, env: EnvMap) {
  const cacheKey = getCacheKey(page, perPage);
  const now = Date.now();
  const cached = cache.get(cacheKey);
  const serviceKey = readServiceKey(env);

  if (cached && now - cached.cachedAt <= CACHE_TTL_MS) {
    return { ...cached.payload, usedStaleCache: false };
  }

  if (!serviceKey) {
    if (cached) {
      return { ...cached.payload, usedStaleCache: true };
    }

    throw new Error('service-key-missing');
  }

  const url = new URL(API_URL);
  url.searchParams.set('page', String(page));
  url.searchParams.set('perPage', String(perPage));
  url.searchParams.set('returnType', 'JSON');
  url.searchParams.set('serviceKey', serviceKey);

  try {
    const response = await fetchWithRetry(url, 1);
    const payload = await response.json() as { data?: Record<string, unknown>[]; totalCount?: number };
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
    console.error('[public-hearings] Upstream fetch failed:', error);
    if (cached) {
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
  const page = Number(requestUrl.searchParams.get('page') ?? '1');
  const perPage = Number(requestUrl.searchParams.get('perPage') ?? '100');
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
    const status = String(error).includes('service-key-missing') ? 500 : 502;
    return new Response(
      JSON.stringify({
        message: '공고 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
      }),
      {
        status,
        headers: {
          'content-type': 'application/json; charset=UTF-8',
        },
      }
    );
  }
}
