import regionAdjacency from '../../../data/region-adjacency.json';
import { CombinedHearingsResponse, HearingItem, dedupeHearings, sortHearings } from '../../../shared/hearings';
import { getRegionLabelBySigunguCode, normalizeSigunguCode } from '../../../shared/region-codes';
import { loadEumPublicHearings } from '../../lib/eum-hearings';
import { EnvMap, loadMolitHearings } from '../../lib/molit-hearings';

type RequestContext = {
  request: Request;
  env: EnvMap;
};

type FallbackSelection = {
  items: HearingItem[];
  fallbackApplied: boolean;
  fallbackReason: string;
};

type FailedSourceEntry = {
  source: string;
  stage: string;
  message?: string;
};

type EumDebugState = {
  lastErrorStage: string;
  listCount: number;
  detailAttemptCount: number;
  detailSuccessCount: number;
  lastListUrl: string;
  lastDetailUrl: string;
  lastListPreview: string;
  lastDetailPreview: string;
};

const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 200;

function parsePositiveInteger(value: string | null, fallbackValue: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  const safeValue = Number.isFinite(parsed) ? parsed : fallbackValue;
  return Math.min(max, Math.max(min, safeValue));
}

function parseBooleanFlag(value: string | null, fallbackValue: boolean): boolean {
  if (value == null) {
    return fallbackValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  return fallbackValue;
}

function createJsonResponse(body: Record<string, unknown>, status: number, cacheControl?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': cacheControl || 'public, max-age=300, stale-while-revalidate=300',
    },
  });
}

function createEmptyEumDebug(): EumDebugState {
  return {
    lastErrorStage: '',
    listCount: 0,
    detailAttemptCount: 0,
    detailSuccessCount: 0,
    lastListUrl: '',
    lastDetailUrl: '',
    lastListPreview: '',
    lastDetailPreview: '',
  };
}

function formatEumDebug(debug: EumDebugState): Record<string, unknown> {
  return {
    listCount: debug.listCount,
    detailAttemptCount: debug.detailAttemptCount,
    detailSuccessCount: debug.detailSuccessCount,
    lastListUrl: debug.lastListUrl,
    lastDetailUrl: debug.lastDetailUrl,
    lastListPreview: debug.lastListPreview,
    lastDetailPreview: debug.lastDetailPreview,
  };
}

function getErrorStage(error: unknown): string {
  if (error && typeof error === 'object' && 'stage' in error) {
    return String((error as { stage?: unknown }).stage || 'unknown');
  }
  return 'unknown';
}

function getErrorDebug(error: unknown): EumDebugState | null {
  if (!error || typeof error !== 'object' || !('debug' in error)) {
    return null;
  }

  const debug = (error as { debug?: unknown }).debug;
  if (!debug || typeof debug !== 'object') {
    return null;
  }

  return {
    ...createEmptyEumDebug(),
    ...(debug as Partial<EumDebugState>),
    lastErrorStage: String((debug as { lastErrorStage?: unknown }).lastErrorStage || ''),
  };
}

function inferRequestedSido(sigunguCode: string): string {
  const label = getRegionLabelBySigunguCode(sigunguCode);
  return label.split(' ')[0] || '';
}

function isRelatedToSido(item: HearingItem, requestedSido: string, requestedPrefix: string): boolean {
  if (!requestedSido && !requestedPrefix) {
    return false;
  }

  if (item.sigunguCode && requestedPrefix && item.sigunguCode.startsWith(requestedPrefix)) {
    return true;
  }

  return [item.region, item.agency, item.department, item.title, item.summary, item.body]
    .join(' ')
    .includes(requestedSido);
}

function applyRegionFallback(items: HearingItem[], requestedSigunguCode: string): FallbackSelection {
  if (!requestedSigunguCode) {
    return {
      items,
      fallbackApplied: false,
      fallbackReason: '',
    };
  }

  const exactItems = items.filter((item) => item.sigunguCode === requestedSigunguCode);
  if (exactItems.length) {
    return {
      items: exactItems,
      fallbackApplied: false,
      fallbackReason: '',
    };
  }

  const adjacentCodes = (regionAdjacency as Record<string, string[]>)[requestedSigunguCode] || [];
  const adjacentSet = new Set(adjacentCodes);
  const requestedPrefix = requestedSigunguCode.slice(0, 2);
  const requestedSido = inferRequestedSido(requestedSigunguCode);
  const relatedItems = items.filter((item) =>
    Boolean(item.sigunguCode && adjacentSet.has(item.sigunguCode))
    || isRelatedToSido(item, requestedSido, requestedPrefix)
  );

  if (relatedItems.length) {
    return {
      items: relatedItems,
      fallbackApplied: true,
      fallbackReason: '선택 지역 공고가 없어 인접 또는 관련 지역 결과를 함께 표시했습니다.',
    };
  }

  return {
    items,
    fallbackApplied: true,
    fallbackReason: '선택 지역 공고가 없어 전체 최신 공고를 표시했습니다.',
  };
}

export async function onRequestGet(context: RequestContext): Promise<Response> {
  const requestUrl = new URL(context.request.url);
  const page = parsePositiveInteger(requestUrl.searchParams.get('page'), 1, 1, 9999);
  const perPage = parsePositiveInteger(requestUrl.searchParams.get('perPage'), DEFAULT_PER_PAGE, 1, MAX_PER_PAGE);
  const requestedSigunguCode = normalizeSigunguCode(requestUrl.searchParams.get('sigunguCode'));
  const includeEum = parseBooleanFlag(requestUrl.searchParams.get('includeEum'), true);
  const includeMolit = parseBooleanFlag(requestUrl.searchParams.get('includeMolit'), true);
  const debugMode = requestUrl.searchParams.get('debug') === '1';
  const responseCacheControl = debugMode ? 'no-store' : 'public, max-age=300, stale-while-revalidate=300';
  const eumQuery = {
    startdt: requestUrl.searchParams.get('startdt') || '',
    enddt: requestUrl.searchParams.get('enddt') || '',
    selSggCd: requestUrl.searchParams.get('selSggCd') || '',
    zonenm: requestUrl.searchParams.get('zonenm') || '',
    chrgorg: requestUrl.searchParams.get('chrgorg') || '',
    gosino: requestUrl.searchParams.get('gosino') || '',
  };

  console.info('[hearings/combined] request', {
    page,
    perPage,
    requestedSigunguCode,
    includeEum,
    includeMolit,
    debugMode,
    eumQuery,
  });

  const executedSources = [
    ...(includeMolit ? ['molit'] : []),
    ...(includeEum ? ['eum'] : []),
  ];
  const sourceCounts = {
    molit_api: 0,
    eum_public_hearing: 0,
  };
  const failedSources: string[] = [];
  const failedSourceDetails: FailedSourceEntry[] = [];
  let fetchedAt = new Date().toISOString();
  let usedStaleCache = false;
  let lastErrorStage = '';
  let eumDebug = createEmptyEumDebug();

  try {
    const [molitResult, eumResult] = await Promise.allSettled([
      includeMolit ? loadMolitHearings(context.env) : Promise.resolve({ payload: { items: [], fetchedAt }, usedStaleCache: false }),
      includeEum
        ? loadEumPublicHearings(eumQuery)
        : Promise.resolve({
            payload: { items: [], fetchedAt, listCount: 0, detailSuccessCount: 0, detailFailureCount: 0 },
            usedStaleCache: false,
            debug: createEmptyEumDebug(),
          }),
    ]);

    const molitItems = molitResult.status === 'fulfilled' ? molitResult.value.payload.items : [];
    const eumItems = eumResult.status === 'fulfilled' ? eumResult.value.payload.items : [];
    sourceCounts.molit_api = molitItems.length;
    sourceCounts.eum_public_hearing = eumItems.length;

    if (molitResult.status === 'rejected') {
      failedSources.push('molit_api');
      failedSourceDetails.push({
        source: 'molit',
        stage: getErrorStage(molitResult.reason),
        message: String(molitResult.reason),
      });
      console.error('[hearings/combined] source failed', {
        source: 'molit_api',
        stage: getErrorStage(molitResult.reason),
        message: String(molitResult.reason),
      });
    } else {
      fetchedAt = molitResult.value.payload.fetchedAt || fetchedAt;
      usedStaleCache = usedStaleCache || molitResult.value.usedStaleCache;
    }

    if (eumResult.status === 'rejected') {
      const stage = getErrorStage(eumResult.reason);
      const errorDebug = getErrorDebug(eumResult.reason);
      failedSources.push('eum_public_hearing');
      failedSourceDetails.push({
        source: 'eum',
        stage,
        message: String(eumResult.reason),
      });
      if (errorDebug) {
        eumDebug = errorDebug;
      }
      lastErrorStage = stage;
      console.error('[hearings/combined] source failed', {
        source: 'eum_public_hearing',
        stage,
        message: String(eumResult.reason),
        eumDebug,
      });
    } else {
      fetchedAt = eumResult.value.payload.fetchedAt || fetchedAt;
      usedStaleCache = usedStaleCache || eumResult.value.usedStaleCache;
      eumDebug = {
        ...eumDebug,
        ...eumResult.value.debug,
      };
      if (eumDebug.lastErrorStage) {
        lastErrorStage = eumDebug.lastErrorStage;
      }
      console.info('[hearings/combined] eum detail stats', {
        listCount: eumResult.value.payload.listCount,
        detailAttemptCount: eumResult.value.debug.detailAttemptCount,
        detailSuccessCount: eumResult.value.payload.detailSuccessCount,
        detailFailureCount: eumResult.value.payload.detailFailureCount,
      });
    }

    const mergedItems = sortHearings(dedupeHearings([...molitItems, ...eumItems]));
    if (!mergedItems.length) {
      if (includeEum && !eumItems.length) {
        const stage = lastErrorStage || eumDebug.lastErrorStage || 'dataset-build';
        failedSources.push('eum_public_hearing');
        failedSourceDetails.push({
          source: 'eum',
          stage,
          message: 'EUM returned no items before merge',
        });
        lastErrorStage = stage;
      }
      throw new Error('combined-hearings-empty');
    }

    console.info('[hearings/combined] merged', {
      mergedCount: mergedItems.length,
      sourceCounts,
      failedSources,
      failedSourceDetails,
      usedStaleCache,
      lastErrorStage,
      eumDebug,
    });

    const fallbackSelection = applyRegionFallback(mergedItems, requestedSigunguCode);
    console.info('[hearings/combined] region filter', {
      requestedSigunguCode,
      filteredCount: fallbackSelection.items.length,
      fallbackApplied: fallbackSelection.fallbackApplied,
      fallbackReason: fallbackSelection.fallbackReason,
    });

    const startIndex = (page - 1) * perPage;
    const items = fallbackSelection.items.slice(startIndex, startIndex + perPage);
    const responseBody: Record<string, unknown> = {
      items,
      total: fallbackSelection.items.length,
      page,
      perPage,
      sourceCounts,
      fallbackApplied: fallbackSelection.fallbackApplied,
      fallbackReason: fallbackSelection.fallbackReason,
      requestedSigunguCode,
      filteredCount: fallbackSelection.items.length,
      usedStaleCache,
      failedSources,
      fetchedAt,
    } satisfies CombinedHearingsResponse as unknown as Record<string, unknown>;

    if (debugMode) {
      responseBody.executedSources = executedSources;
      responseBody.failedSources = failedSourceDetails;
      responseBody.lastErrorStage = lastErrorStage;
      responseBody.eumDebug = formatEumDebug(eumDebug);
    }

    return createJsonResponse(responseBody, 200, responseCacheControl);
  } catch (error) {
    const stage = lastErrorStage || getErrorStage(error) || eumDebug.lastErrorStage || 'unknown';
    lastErrorStage = stage;

    if (String(error).includes('public-data-service-key-missing')) {
      const body: Record<string, unknown> = {
        message: 'PUBLIC_DATA_SERVICE_KEY가 설정되지 않았습니다.',
        code: 'public_data_service_key_missing',
      };
      if (debugMode) {
        body.executedSources = executedSources;
        body.failedSources = failedSourceDetails;
        body.lastErrorStage = lastErrorStage;
        body.eumDebug = formatEumDebug(eumDebug);
      }
      return createJsonResponse(body, 500, responseCacheControl);
    }

    console.error('[hearings/combined] request failed', {
      message: String(error),
      requestedSigunguCode,
      includeEum,
      includeMolit,
      executedSources,
      failedSourceDetails,
      lastErrorStage,
      eumDebug,
      eumQuery,
    });

    const body: Record<string, unknown> = {
      message: '통합 공고 데이터를 불러오지 못했습니다. 서버 로그를 확인해주세요.',
      code: 'combined_hearings_failed',
    };

    if (debugMode) {
      body.executedSources = executedSources;
      body.failedSources = failedSourceDetails;
      body.lastErrorStage = lastErrorStage;
      body.eumDebug = formatEumDebug(eumDebug);
    }

    return createJsonResponse(body, 502, responseCacheControl);
  }
}
