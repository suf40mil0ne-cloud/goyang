import regionAdjacency from '../../../data/region-adjacency.json';
import { CombinedHearingsResponse, HearingItem, dedupeHearings, sortHearings } from '../../../shared/hearings';
import { getRegionLabelBySigunguCode, normalizeSigunguCode } from '../../../shared/region-codes';
import { getBuildStamp, type BuildStampEnv } from '../../lib/build-stamp';
import { EUM_LIST_FETCH_TIMEOUT_MS, loadEumPublicHearings } from '../../lib/eum-hearings';
import { EnvMap, loadMolitHearings } from '../../lib/molit-hearings';

type RequestContext = {
  request: Request;
  env: EnvMap & BuildStampEnv;
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
  elapsedMs?: number;
  requestUrl?: string;
};

type EumDebugState = {
  lastErrorStage: string;
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

const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 200;
const MOLIT_SOURCE_TIMEOUT_MS = 15000;
const EUM_SOURCE_WRAPPER_TIMEOUT_MS = 30000;
const EUM_SOURCE_TIMEOUT_MS = EUM_SOURCE_WRAPPER_TIMEOUT_MS;

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
      'access-control-allow-origin': '*',
    },
  });
}

function createEmptyEumDebug(): EumDebugState {
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
    elapsedMs: 0,
    timeoutMs: 0,
  };
}

function formatEumDebug(debug: EumDebugState): Record<string, unknown> {
  return {
    lastErrorStage: debug.lastErrorStage,
    listCount: debug.listCount,
    detailAttemptCount: debug.detailAttemptCount,
    detailSuccessCount: debug.detailSuccessCount,
    lastRequestUrl: debug.lastRequestUrl,
    lastListUrl: debug.lastListUrl,
    lastDetailUrl: debug.lastDetailUrl,
    lastListContentType: debug.lastListContentType,
    lastListPreview: debug.lastListPreview,
    lastDetailPreview: debug.lastDetailPreview,
    listFetchStartedAt: debug.listFetchStartedAt,
    listFetchHeadersReceivedAt: debug.listFetchHeadersReceivedAt,
    listFetchBodyReceivedAt: debug.listFetchBodyReceivedAt,
    elapsedMs: debug.elapsedMs,
    timeoutMs: debug.timeoutMs,
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

function getErrorElapsedMs(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('elapsedMs' in error)) {
    return undefined;
  }
  const value = Number((error as { elapsedMs?: unknown }).elapsedMs);
  return Number.isFinite(value) ? value : undefined;
}

function getErrorRequestUrl(error: unknown): string {
  if (!error || typeof error !== 'object' || !('requestUrl' in error)) {
    return '';
  }
  return String((error as { requestUrl?: unknown }).requestUrl || '');
}

function isTerminalEumFailureStage(stage: string): boolean {
  return ['list-fetch-timeout', 'list-fetch-error', 'source-timeout'].includes(String(stage || ''));
}

function applyCombinedDebugFields(
  body: Record<string, unknown>,
  options: {
    env: BuildStampEnv;
    executedSources: string[];
    failedSourceDetails: FailedSourceEntry[];
    lastErrorStage: string;
    eumDebug: EumDebugState;
  }
): void {
  body.buildStamp = getBuildStamp(options.env);
  body.executedSources = options.executedSources;
  body.failedSources = options.failedSourceDetails;
  body.lastErrorStage = options.lastErrorStage;
  body.lastRequestUrl = options.eumDebug.lastRequestUrl;
  body.lastListContentType = options.eumDebug.lastListContentType;
  body.elapsedMs = options.eumDebug.elapsedMs;
  body.timeoutMs = options.eumDebug.timeoutMs;
  body.effectiveListFetchTimeoutMs = EUM_LIST_FETCH_TIMEOUT_MS;
  body.effectiveSourceWrapperTimeoutMs = EUM_SOURCE_WRAPPER_TIMEOUT_MS;
  body.eumDebug = formatEumDebug(options.eumDebug);
}

function buildFailedSourceEntry(source: string, error: unknown, debug?: EumDebugState | null, messageOverride?: string): FailedSourceEntry {
  const resolvedDebug = debug || getErrorDebug(error) || createEmptyEumDebug();
  return {
    source,
    stage: resolvedDebug.lastErrorStage || getErrorStage(error),
    message: messageOverride || (error instanceof Error ? error.message : String(error)),
    elapsedMs: getErrorElapsedMs(error) ?? resolvedDebug.elapsedMs,
    requestUrl: getErrorRequestUrl(error) || resolvedDebug.lastRequestUrl,
  };
}

type SourceTimeoutError = Error & {
  stage: string;
  source: string;
  elapsedMs: number;
  requestUrl: string;
};

function createSourceTimeoutError(source: string, debug: EumDebugState | null, elapsedMs: number): SourceTimeoutError {
  const error = new Error(`${source}-source-timeout`) as SourceTimeoutError;
  error.name = 'SourceTimeoutError';
  error.stage = debug?.lastErrorStage || 'source-timeout';
  error.source = source;
  error.elapsedMs = elapsedMs;
  error.requestUrl = debug?.lastRequestUrl || '';
  return error;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, createError: () => Error): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(createError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function runSourceWithTimeout<T>(
  source: string,
  timeoutMs: number,
  work: () => Promise<T>,
  getDebugState?: () => EumDebugState | null
): Promise<T> {
  const startedAt = Date.now();
  console.info('[hearings/combined] source start', { source, timeoutMs });
  try {
    const result = await withTimeout(work(), timeoutMs, () => createSourceTimeoutError(source, getDebugState?.() || null, Date.now() - startedAt));
    console.info('[hearings/combined] source done', {
      source,
      status: 'fulfilled',
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    console.error('[hearings/combined] source done', {
      source,
      status: 'rejected',
      durationMs: Date.now() - startedAt,
      stage: getErrorStage(error),
      message: String(error),
      requestUrl: error && typeof error === 'object' && 'requestUrl' in error ? String((error as { requestUrl?: unknown }).requestUrl || '') : '',
      elapsedMs: error && typeof error === 'object' && 'elapsedMs' in error ? Number((error as { elapsedMs?: unknown }).elapsedMs || 0) : undefined,
    });
    throw error;
  }
}

function inferRequestedSigungu(sigunguCode: string): string {
  const label = getRegionLabelBySigunguCode(sigunguCode);
  const parts = label.split(' ');
  return parts[parts.length - 1] || '';
}

function isRelatedToSigungu(item: HearingItem, requestedSigungu: string, requestedPrefix: string): boolean {
  if (!requestedSigungu && !requestedPrefix) {
    return false;
  }

  if (item.sigunguCode && requestedPrefix && item.sigunguCode.startsWith(requestedPrefix)) {
    return true;
  }

  return [item.region, item.agency, item.department, item.title, item.summary, item.body]
    .join(' ')
    .includes(requestedSigungu);
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
  const requestedSigungu = inferRequestedSigungu(requestedSigunguCode);
  const relatedItems = items.filter((item) =>
    Boolean(item.sigunguCode && adjacentSet.has(item.sigunguCode))
    || isRelatedToSigungu(item, requestedSigungu, requestedPrefix)
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
      includeMolit
        ? runSourceWithTimeout('molit', MOLIT_SOURCE_TIMEOUT_MS, () => loadMolitHearings(context.env))
        : Promise.resolve({ payload: { items: [], fetchedAt }, usedStaleCache: false }),
      includeEum
        ? runSourceWithTimeout('eum', EUM_SOURCE_TIMEOUT_MS, () => loadEumPublicHearings(eumQuery, eumDebug), () => eumDebug)
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
      failedSourceDetails.push(buildFailedSourceEntry('molit', molitResult.reason));
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
      const errorDebug = getErrorDebug(eumResult.reason);
      const stage = errorDebug?.lastErrorStage || getErrorStage(eumResult.reason);
      failedSources.push('eum_public_hearing');
      failedSourceDetails.push(buildFailedSourceEntry('eum', eumResult.reason, errorDebug));
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
      const stage = lastErrorStage || eumDebug.lastErrorStage || 'dataset-build';
      const hasEumFailure = isTerminalEumFailureStage(stage)
        || failedSourceDetails.some((item) => item.source === 'eum' || item.source === 'eum_public_hearing');
      if (includeEum && eumResult.status === 'fulfilled' && !eumItems.length && !hasEumFailure) {
        failedSources.push('eum_public_hearing');
        failedSourceDetails.push({
          source: 'eum',
          stage,
          message: 'EUM returned no items before merge',
          elapsedMs: eumDebug.elapsedMs,
          requestUrl: eumDebug.lastRequestUrl,
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
      applyCombinedDebugFields(responseBody, {
        env: context.env,
        executedSources,
        failedSourceDetails,
        lastErrorStage,
        eumDebug,
      });
    }

    return createJsonResponse(responseBody, 200, responseCacheControl);
  } catch (error) {
    const stage = lastErrorStage || eumDebug.lastErrorStage || getErrorStage(error) || 'unknown';
    lastErrorStage = stage;

    if (String(error).includes('public-data-service-key-missing')) {
      const body: Record<string, unknown> = {
        message: 'PUBLIC_DATA_SERVICE_KEY가 설정되지 않았습니다.',
        code: 'public_data_service_key_missing',
      };
      if (debugMode) {
        applyCombinedDebugFields(body, {
          env: context.env,
          executedSources,
          failedSourceDetails,
          lastErrorStage,
          eumDebug,
        });
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
      applyCombinedDebugFields(body, {
        env: context.env,
        executedSources,
        failedSourceDetails,
        lastErrorStage,
        eumDebug,
      });
    }

    return createJsonResponse(body, 502, responseCacheControl);
  }
}
