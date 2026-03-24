import { computePublicHearingStatus, formatIsoDate } from '../../shared/public-hearings';
import { dedupeNotices, NoticeItem, NoticesResponse, sortNotices } from '../../shared/notices';
import { findSigunguCodeByRegion, getRegionLabelBySigunguCode, normalizeSigunguCode } from '../../shared/region-codes';

type EnvMap = {
  PUBLIC_DATA_SERVICE_KEY?: string;
};

type RequestContext = {
  request: Request;
  env: EnvMap;
};

type CombinedCacheEntry = {
  cachedAt: number;
  payload: {
    items: NoticeItem[];
    sourceCounts: {
      seoul: number;
      molit: number;
    };
    fetchedAt: string;
  };
};

type MolitRecord = Record<string, unknown>;

type SeoulDataset = 'TbWcmBoardB0414' | 'upisDraft';

const MOLIT_API_URL = 'https://api.odcloud.kr/api/15144538/v1/uddi:e3214695-5339-4f73-abd2-9157715f3b16';
const SEOUL_API_KEY = '577153464d67757337334b56705171';
const SEOUL_DATASETS: Array<{ dataset: SeoulDataset; start: number; end: number }> = [
  { dataset: 'TbWcmBoardB0414', start: 1, end: 120 },
  { dataset: 'upisDraft', start: 1, end: 120 },
];
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;
const MOLIT_FETCH_PER_PAGE = 200;
const SEOUL_DEFAULT_LINK = 'https://data.seoul.go.kr/';
const MOLIT_DEFAULT_LINK = 'https://www.data.go.kr/data/15144538/openapi.do';
const RESPONSE_PREVIEW_LIMIT = 300;
const combinedCache = new Map<string, CombinedCacheEntry>();

const SEOUL_SIGUNGU_CODES = [
  ['종로구', '11110'],
  ['중구', '11140'],
  ['용산구', '11170'],
  ['성동구', '11200'],
  ['광진구', '11215'],
  ['동대문구', '11230'],
  ['중랑구', '11260'],
  ['성북구', '11290'],
  ['강북구', '11305'],
  ['도봉구', '11320'],
  ['노원구', '11350'],
  ['은평구', '11380'],
  ['서대문구', '11410'],
  ['마포구', '11440'],
  ['양천구', '11470'],
  ['강서구', '11500'],
  ['구로구', '11530'],
  ['금천구', '11545'],
  ['영등포구', '11560'],
  ['동작구', '11590'],
  ['관악구', '11620'],
  ['서초구', '11650'],
  ['강남구', '11680'],
  ['송파구', '11710'],
  ['강동구', '11740'],
] as const;

function parsePositiveInteger(value: string | null, fallbackValue: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  const safeValue = Number.isFinite(parsed) ? parsed : fallbackValue;
  return Math.min(max, Math.max(min, safeValue));
}

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

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=300',
    },
  });
}

function readServiceKey(env: EnvMap): string {
  return normalizeServiceKey(env.PUBLIC_DATA_SERVICE_KEY || '');
}

async function fetchText(url: URL, accept: string): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: accept,
      },
    });
    const text = await response.text();
    return { status: response.status, text };
  } finally {
    clearTimeout(timeoutId);
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#13;/g, ' ')
    .replace(/&#10;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)));
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractXmlRows(xmlText: string): string[] {
  return [...xmlText.matchAll(/<row>([\s\S]*?)<\/row>/g)].map((match) => match[1]);
}

function extractXmlValue(rowText: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  return normalizeString(rowText.match(pattern)?.[1] ?? '');
}

function summarizeText(value: string, maxLength = 140): string {
  const normalized = normalizeInlineText(value);
  if (!normalized) {
    return '';
  }

  const sentences = normalized
    .split(/[.!?。]\s|\n|\r/)
    .map((item) => item.trim())
    .filter(Boolean);
  const firstSentence = sentences.find((item) => item.length > 12) || sentences[0] || normalized;
  return firstSentence.length > maxLength
    ? `${firstSentence.slice(0, maxLength).trim()}...`
    : firstSentence;
}

function inferSeoulDistrict(text: string): { region: string; sigunguCode: string } {
  const haystack = normalizeInlineText(text);

  for (const [sigungu, code] of SEOUL_SIGUNGU_CODES) {
    if (haystack.includes(sigungu)) {
      return {
        region: `서울특별시 ${sigungu}`,
        sigunguCode: code,
      };
    }
  }

  return {
    region: '서울특별시 서울 전역',
    sigunguCode: '',
  };
}

function parseSeoulPeriod(period: string): { startDate: string; endDate: string } {
  const normalized = normalizeInlineText(period).replace(/~/g, ' ~ ');
  const dateMatches = [...normalized.matchAll(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})|(\d{1,2})[.\-/]\s*(\d{1,2})/g)];

  if (dateMatches.length === 0) {
    return { startDate: '', endDate: '' };
  }

  const first = dateMatches[0];
  const startYear = first[1] ? Number(first[1]) : new Date().getUTCFullYear();
  const startMonth = Number(first[2] || first[4] || 0);
  const startDay = Number(first[3] || first[5] || 0);
  const startDate = startMonth && startDay
    ? formatIsoDate(`${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`)
    : '';

  if (dateMatches.length === 1) {
    return { startDate, endDate: '' };
  }

  const last = dateMatches[dateMatches.length - 1];
  const endYear = last[1] ? Number(last[1]) : startYear;
  const endMonth = Number(last[2] || last[4] || 0);
  const endDay = Number(last[3] || last[5] || 0);
  const endDate = endMonth && endDay
    ? formatIsoDate(`${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`)
    : '';

  return { startDate, endDate };
}

function deriveUpisStatus(taskProcess: string, processStatus: string, title: string): NoticeItem['status'] {
  const haystack = `${taskProcess} ${processStatus} ${title}`;
  if (/열람|공람|의견청취|진행중/i.test(haystack)) {
    return 'ongoing';
  }
  if (/예정/i.test(haystack)) {
    return 'upcoming';
  }
  return 'closed';
}

function normalizeMolitNotice(record: MolitRecord): NoticeItem {
  const sigunguCode = normalizeSigunguCode(record['시군구코드'] ?? record.sigunguCode);
  const region = getRegionLabelBySigunguCode(sigunguCode) || sigunguCode;
  const noticeDate = formatIsoDate(record['공고일자'] ?? record.noticeDate);
  const viewStartDate = formatIsoDate(record['열람시작일자'] ?? record.viewStartDate);
  const viewEndDate = formatIsoDate(record['열람종료일자'] ?? record.viewEndDate);
  const title = normalizeInlineText(record['공고제목'] ?? record.title);
  const content = normalizeInlineText(record['공고내용'] ?? record.content);
  const summary = summarizeText(content || title);

  return {
    id: normalizeString(record['공고코드'] ?? record.id) || [sigunguCode, noticeDate, title].filter(Boolean).join('::'),
    source: 'molit',
    title,
    region,
    sigunguCode,
    date: noticeDate || viewStartDate || viewEndDate,
    status: computePublicHearingStatus(viewStartDate, viewEndDate),
    link: MOLIT_DEFAULT_LINK,
    summary,
    regionLabel: region,
    noticeDate,
    viewStartDate,
    viewEndDate,
    noticeNumber: normalizeString(record['공고번호'] ?? record.noticeNumber),
    contact: normalizeString(record['문의처'] ?? record.contact),
    fileName: normalizeString(record['파일명'] ?? record.fileName),
    fileExt: normalizeString(record['파일확장자'] ?? record.fileExt),
    content: content || summary,
  };
}

function normalizeSeoulBoardNotice(rowText: string): NoticeItem | null {
  const title = normalizeInlineText(extractXmlValue(rowText, 'AGND_NM'));
  if (!title) {
    return null;
  }

  const content = stripHtml(extractXmlValue(rowText, 'CN'));
  const place = normalizeInlineText(extractXmlValue(rowText, 'EXHB_PLC'));
  const department = normalizeInlineText(extractXmlValue(rowText, 'JRSD_DEPT'));
  const period = extractXmlValue(rowText, 'PBANC_PRD');
  const attachmentUrl = normalizeInlineText(extractXmlValue(rowText, 'ATCH_FILE_URL_ADDR')).replace(/^http:/, 'https:');
  const district = inferSeoulDistrict([title, content, place, department].join(' '));
  const { startDate, endDate } = parseSeoulPeriod(period);
  const summary = summarizeText(content || `${title} ${place}`);

  return {
    id: `seoul-board-${extractXmlValue(rowText, 'PST_SN') || title}`,
    source: 'seoul',
    title,
    region: district.region,
    sigunguCode: district.sigunguCode,
    date: startDate || endDate,
    status: computePublicHearingStatus(startDate, endDate),
    link: attachmentUrl || SEOUL_DEFAULT_LINK,
    summary,
    regionLabel: district.region,
    noticeDate: startDate || endDate,
    viewStartDate: startDate,
    viewEndDate: endDate,
    noticeNumber: extractXmlValue(rowText, 'PST_SN'),
    contact: normalizeInlineText(extractXmlValue(rowText, 'TELNO') || department),
    fileName: normalizeInlineText(extractXmlValue(rowText, 'FILE_NM')),
    fileExt: '',
    content: content || summary,
  };
}

function normalizeSeoulDraftNotice(rowText: string): NoticeItem | null {
  const title = normalizeInlineText(extractXmlValue(rowText, 'AGND_NM'));
  if (!title) {
    return null;
  }

  const sigungu = normalizeInlineText(extractXmlValue(rowText, 'LOGVM_CD'));
  const sigunguCode = findSigunguCodeByRegion('서울특별시', sigungu);
  const region = sigunguCode ? getRegionLabelBySigunguCode(sigunguCode) : `서울특별시 ${sigungu || '서울 전역'}`;
  const projectCode = extractXmlValue(rowText, 'PRJC_CD');
  const dateMatch = projectCode.match(/(\d{8})/);
  const date = dateMatch ? formatIsoDate(dateMatch[1]) : '';
  const taskProcess = normalizeInlineText(extractXmlValue(rowText, 'TASK_PROCS'));
  const processStatus = normalizeInlineText(extractXmlValue(rowText, 'PRCS_STTS'));
  const purpose = normalizeInlineText(extractXmlValue(rowText, 'AGND_RSN'));
  const place = normalizeInlineText(extractXmlValue(rowText, 'PSTN'));
  const summary = summarizeText(purpose || `${title} ${place}`);

  return {
    id: `seoul-draft-${projectCode || title}`,
    source: 'seoul',
    title,
    region,
    sigunguCode,
    date,
    status: deriveUpisStatus(taskProcess, processStatus, title),
    link: SEOUL_DEFAULT_LINK,
    summary,
    regionLabel: region,
    noticeDate: date,
    viewStartDate: '',
    viewEndDate: '',
    noticeNumber: projectCode,
    contact: normalizeInlineText(extractXmlValue(rowText, 'TKCG_DEPT_NM')),
    fileName: '',
    fileExt: '',
    content: summary,
  };
}

async function fetchMolitNotices(env: EnvMap): Promise<NoticeItem[]> {
  const serviceKey = readServiceKey(env);
  if (!serviceKey) {
    throw new Error('public-data-service-key-missing');
  }

  const url = new URL(MOLIT_API_URL);
  url.searchParams.set('page', '1');
  url.searchParams.set('perPage', String(MOLIT_FETCH_PER_PAGE));
  url.searchParams.set('returnType', 'JSON');
  url.searchParams.set('serviceKey', serviceKey);

  const { status, text } = await fetchText(url, 'application/json');
  if (status < 200 || status >= 300) {
    console.error('[notices] molit fetch failed', {
      upstreamStatus: status,
      responsePreview: getResponsePreview(text),
      serviceKeyPresent: true,
      requestUrl: buildMaskedUrl(url),
    });
    throw new Error(`molit-upstream-${status}`);
  }

  const payload = JSON.parse(text) as { data?: MolitRecord[] };
  const notices = (payload.data ?? []).map(normalizeMolitNotice).filter((item) => item.title);
  console.info('[notices] molit fetch success', { count: notices.length, requestUrl: buildMaskedUrl(url) });
  return notices;
}

async function fetchSeoulDataset(context: RequestContext, dataset: SeoulDataset, start: number, end: number): Promise<string> {
  const requestUrl = new URL(context.request.url);
  const url = new URL(`/api/seoul/${SEOUL_API_KEY}/xml/${dataset}/${start}/${end}/`, requestUrl.origin);
  const { status, text } = await fetchText(url, 'application/xml,text/xml;q=0.9,*/*;q=0.8');

  if (status < 200 || status >= 300) {
    console.error('[notices] seoul fetch failed', {
      dataset,
      upstreamStatus: status,
      responsePreview: getResponsePreview(text),
      requestUrl: url.toString(),
    });
    throw new Error(`seoul-upstream-${dataset}-${status}`);
  }

  console.info('[notices] seoul fetch success', {
    dataset,
    requestUrl: url.toString(),
    responsePreview: getResponsePreview(text),
  });
  return text;
}

async function fetchSeoulNotices(context: RequestContext): Promise<NoticeItem[]> {
  const [boardXml, draftXml] = await Promise.all([
    fetchSeoulDataset(context, 'TbWcmBoardB0414', SEOUL_DATASETS[0].start, SEOUL_DATASETS[0].end),
    fetchSeoulDataset(context, 'upisDraft', SEOUL_DATASETS[1].start, SEOUL_DATASETS[1].end),
  ]);

  const boardItems = extractXmlRows(boardXml)
    .map(normalizeSeoulBoardNotice)
    .filter((item): item is NoticeItem => Boolean(item));
  const draftItems = extractXmlRows(draftXml)
    .map(normalizeSeoulDraftNotice)
    .filter((item): item is NoticeItem => Boolean(item));

  return [...boardItems, ...draftItems];
}

async function loadCombinedPayload(context: RequestContext) {
  const cacheKey = 'combined';
  const now = Date.now();
  const cached = combinedCache.get(cacheKey);

  if (cached && now - cached.cachedAt <= CACHE_TTL_MS) {
    return cached.payload;
  }

  const results = await Promise.allSettled([
    fetchMolitNotices(context.env),
    fetchSeoulNotices(context),
  ]);

  const molitItems = results[0].status === 'fulfilled' ? results[0].value : [];
  const seoulItems = results[1].status === 'fulfilled' ? results[1].value : [];

  if (results[0].status === 'rejected') {
    console.error('[notices] molit source unavailable', { error: String(results[0].reason) });
  }
  if (results[1].status === 'rejected') {
    console.error('[notices] seoul source unavailable', { error: String(results[1].reason) });
  }

  const mergedItems = sortNotices(dedupeNotices([...molitItems, ...seoulItems]));
  if (mergedItems.length === 0) {
    throw new Error('combined-notices-empty');
  }

  const payload = {
    items: mergedItems,
    sourceCounts: {
      seoul: seoulItems.length,
      molit: molitItems.length,
    },
    fetchedAt: new Date().toISOString(),
  };

  combinedCache.set(cacheKey, {
    cachedAt: now,
    payload,
  });

  console.info('[notices] merge completed', {
    totalCount: mergedItems.length,
    sourceCounts: payload.sourceCounts,
  });

  return payload;
}

export async function onRequestGet(context: RequestContext): Promise<Response> {
  const requestUrl = new URL(context.request.url);
  const page = parsePositiveInteger(requestUrl.searchParams.get('page'), 1, 1, 9999);
  const perPage = parsePositiveInteger(requestUrl.searchParams.get('perPage'), 200, 1, 300);

  try {
    const payload = await loadCombinedPayload(context);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const slicedItems = payload.items.slice(startIndex, endIndex);

    const responseBody: NoticesResponse = {
      items: slicedItems,
      meta: {
        page,
        perPage,
        totalCount: payload.items.length,
        sourceCounts: payload.sourceCounts,
        fetchedAt: payload.fetchedAt,
      },
    };

    return createJsonResponse(responseBody as unknown as Record<string, unknown>, 200);
  } catch (error) {
    if (String(error).includes('public-data-service-key-missing')) {
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
        message: '통합 공고 데이터를 불러오지 못했습니다. 서버 로그를 확인해주세요.',
        code: 'combined_notices_upstream_failed',
      },
      502
    );
  }
}
