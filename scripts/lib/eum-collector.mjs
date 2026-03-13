import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

export const EUM_ENDPOINTS = {
  hr: {
    list: 'https://www.eum.go.kr/web/cp/hr/hrPeopleHearList.jsp',
    detail: 'https://www.eum.go.kr/web/cp/hr/hrPeopleHearDet.jsp',
    detailParam: 'seq',
  },
  ih: {
    list: 'https://www.eum.go.kr/web/cp/ih/ihHearingList.jsp',
    detail: 'https://www.eum.go.kr/web/cp/ih/ihHearingDet.jsp',
    detailParam: 'pnnc_cd',
  },
};

const EUM_KEYWORDS = [
  '주민의견청취',
  '주민공람',
  '인터넷 주민의견청취',
  '공고',
  '열람기간',
  '공고기관',
  '토지이음',
];

const BROKEN_TEXT_PATTERN = /�|Ã|Ð|¤|þ|¿/;
const execFileAsync = promisify(execFile);

function compactText(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(value = '') {
  return compactText(
    String(value)
      .replace(/\[[^\]]+\]/g, ' ')
      .replace(/\([^)]+\)/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  ).toLowerCase();
}

function normalizeNoticeNumber(value = '') {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[()\-]/g, '')
    .toLowerCase();
}

function normalizeOrganization(value = '') {
  return compactText(
    String(value || '')
      .replace(/도시관리국|도시계획국|도시정책국|도시계획과|도시관리과|도시정비과|도시디자인과/g, ' ')
      .replace(/\s+/g, ' ')
  ).toLowerCase();
}

function isUsableUrl(value = '') {
  try {
    new URL(String(value));
    return true;
  } catch {
    return false;
  }
}

function isLikelyHomepageUrl(value = '') {
  if (!isUsableUrl(value)) return false;
  const url = new URL(String(value));
  const pathname = (url.pathname || '').toLowerCase();
  return (
    ((pathname === '/' || pathname === '') && !url.search)
    || /^\/(index(\.[a-z]+)?|main(\.[a-z]+)?|home(\.[a-z]+)?)$/i.test(pathname)
  );
}

function isLikelyListUrl(value = '') {
  if (!isUsableUrl(value)) return false;
  const url = new URL(String(value));
  const pathname = (url.pathname || '').toLowerCase();
  const pathWithSearch = `${url.pathname}${url.search}`.toLowerCase();
  return (
    /(?:list|search)\.jsp$/i.test(pathname)
    || /(?:list|search)\.do$/i.test(pathname)
    || /(boardlist|noticelist|gosilist|gonggolist)/i.test(pathWithSearch)
  );
}

function hasDirectIdentifier(value = '') {
  if (!isUsableUrl(value)) return false;
  const keys = [...new URL(String(value)).searchParams.keys()].map((key) => key.toLowerCase());
  return keys.some((key) => ['nttid', 'articleid', 'article_no', 'articleno', 'seq', 'no', 'idx', 'bidx', 'bltnno', 'nttsn', 'noticeid'].includes(key));
}

function isDirectAttachmentUrl(value = '') {
  return isUsableUrl(value) && /\.(pdf|hwp|hwpx|doc|docx|xls|xlsx|zip)(\?|$)/i.test(String(value));
}

function isDirectNoticePostUrl(value = '') {
  if (!isUsableUrl(value) || isLikelyHomepageUrl(value) || isLikelyListUrl(value) || isDirectAttachmentUrl(value)) return false;
  const url = new URL(String(value));
  const pathWithSearch = `${url.pathname}${url.search}`.toLowerCase();
  if (hasDirectIdentifier(value)) return true;
  return /(view|detail|read|bbsview|boardview|gonggo|gosi)/i.test(pathWithSearch);
}

function hasBrokenText(value = '') {
  return BROKEN_TEXT_PATTERN.test(String(value || ''));
}

function decodeHtmlEntities(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(value = '') {
  return compactText(
    decodeHtmlEntities(
      String(value)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|tr|li|dt|dd|th|td|h1|h2|h3|h4)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
    )
  );
}

function normalizeCharset(value = '') {
  return String(value).trim().replace(/['"]/g, '').toLowerCase();
}

function parseCharsetFromContentType(value = '') {
  const match = String(value).match(/charset\s*=\s*([^;]+)/i);
  return normalizeCharset(match?.[1] || '');
}

function parseCharsetFromMeta(buffer) {
  const latin1 = Buffer.from(buffer).toString('latin1').slice(0, 8192);
  const direct = latin1.match(/<meta[^>]+charset=["']?\s*([^"'>\s/]+)/i);
  if (direct?.[1]) return normalizeCharset(direct[1]);
  const httpEquiv = latin1.match(/<meta[^>]+content=["'][^"']*charset=([^"';\s]+)/i);
  return normalizeCharset(httpEquiv?.[1] || '');
}

function tryDecode(buffer, encoding) {
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(buffer);
  } catch {
    return '';
  }
}

function getDecodedScore(text) {
  if (!text) return Number.NEGATIVE_INFINITY;
  let score = 0;
  score -= (text.match(/�/g) || []).length * 12;
  score -= (text.match(/\u0000/g) || []).length * 8;
  if (/[가-힣]/.test(text)) score += 50;
  EUM_KEYWORDS.forEach((keyword) => {
    if (text.includes(keyword)) score += 8;
  });
  if (/<html/i.test(text) && /<\/html>/i.test(text)) score += 6;
  if (/<title>/i.test(text)) score += 4;
  return score;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function decodeHtmlBuffer(buffer, { contentType = '' } = {}) {
  const charsetCandidates = [
    parseCharsetFromContentType(contentType),
    parseCharsetFromMeta(buffer),
    'utf-8',
    'euc-kr',
    'cp949',
    'x-windows-949',
  ].filter(Boolean);

  const uniqueCharsets = [...new Set(charsetCandidates)];
  let best = { charset: 'utf-8', text: '', score: Number.NEGATIVE_INFINITY };

  uniqueCharsets.forEach((charset) => {
    const text = tryDecode(buffer, charset);
    const score = getDecodedScore(text);
    if (score > best.score) {
      best = { charset, text, score };
    }
  });

  if (!best.text) {
    best = {
      charset: 'utf-8',
      text: Buffer.from(buffer).toString('utf8'),
      score: getDecodedScore(Buffer.from(buffer).toString('utf8')),
    };
  }

  return {
    html: best.text,
    detectedCharset: best.charset,
  };
}

function parseHeaderBlock(headerText = '') {
  const lines = String(headerText).split(/\r?\n/).filter(Boolean);
  const statusLine = lines.shift() || '';
  const statusMatch = statusLine.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/i);
  const headers = {};

  lines.forEach((line) => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) return;
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) return;
    headers[key] = value;
  });

  return {
    status: Number(statusMatch?.[1] || 0),
    headers,
  };
}

function parseCurlHeaderText(headerText = '') {
  const blocks = String(headerText)
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter((block) => /^HTTP\/\d/i.test(block));
  const lastBlock = blocks[blocks.length - 1] || '';
  return parseHeaderBlock(lastBlock);
}

function shellEscape(value = '') {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

async function fetchDecodedHtmlViaCurl(url, { headers = {} } = {}) {
  const tempDir = await mkdtemp(join(tmpdir(), 'gongramkok-eum-'));
  const headerPath = join(tempDir, 'headers.txt');
  const bodyPath = join(tempDir, 'body.html');
  const args = ['--http1.1', '-L', '-sS', '-D', headerPath, '-o', bodyPath];
  Object.entries(headers).forEach(([key, value]) => {
    if (!value) return;
    args.push('-H', `${key}: ${value}`);
  });
  args.push(url);

  try {
    await execFileAsync('/bin/bash', ['-lc', `curl ${args.map(shellEscape).join(' ')}`], {
      maxBuffer: 16 * 1024 * 1024,
    });
    const [headerText, body] = await Promise.all([
      readFile(headerPath, 'latin1'),
      readFile(bodyPath),
    ]);
    const { status, headers: responseHeaders } = parseCurlHeaderText(headerText);
    const { html, detectedCharset } = decodeHtmlBuffer(body, {
      contentType: responseHeaders['content-type'] || '',
    });

    return {
      ok: status >= 200 && status < 300,
      status,
      url,
      html,
      detectedCharset,
      headers: responseHeaders,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function fetchDecodedHtmlOnce(url, { fetchImpl = fetch, headers = {}, signal } = {}) {
  const requestHeaders = {
    'accept-language': 'ko-KR,ko;q=0.9,en;q=0.7',
    'user-agent': 'Mozilla/5.0 (compatible; GongramKokBot/1.0; +https://gongramkok.example)',
    ...headers,
  };

  try {
    const response = await fetchImpl(url, {
      headers: requestHeaders,
      redirect: 'follow',
      signal,
    });

    const arrayBuffer = await response.arrayBuffer();
    const { html, detectedCharset } = decodeHtmlBuffer(arrayBuffer, {
      contentType: response.headers.get('content-type') || '',
    });

    return {
      ok: response.ok,
      status: response.status,
      url: response.url || url,
      html,
      detectedCharset,
      headers: Object.fromEntries(response.headers.entries()),
    };
  } catch (error) {
    return fetchDecodedHtmlViaCurl(url, { headers: requestHeaders, signal, cause: error });
  }
}

export async function fetchDecodedHtml(url, {
  fetchImpl = fetch,
  headers = {},
  signal,
  maxAttempts = 3,
  retryDelayMs = 300,
} = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchDecodedHtmlOnce(url, { fetchImpl, headers, signal });
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      await wait(retryDelayMs * attempt);
    }
  }

  throw lastError || new Error(`Failed to fetch ${url}`);
}

function buildNoticeMatchKey(item = {}) {
  const noticeNumber = normalizeNoticeNumber(item.noticeNumber);
  if (noticeNumber) return `number:${noticeNumber}`;

  const organization = normalizeOrganization(item.organization);
  const title = normalizeTitle(item.title);
  const postedDate = compactText(item.postedDate);
  if (organization && title && postedDate) {
    return `meta:${organization}:${postedDate}:${title}`;
  }

  return '';
}

function getDetailConfig(sourceType) {
  const config = EUM_ENDPOINTS[sourceType];
  if (!config) {
    throw new Error(`Unsupported EUM source type: ${sourceType}`);
  }
  return config;
}

function buildListUrl(sourceType, pageNo = 1) {
  const config = getDetailConfig(sourceType);
  const url = new URL(config.list);
  if (pageNo > 1) url.searchParams.set('pageNo', String(pageNo));
  return url.toString();
}

export function buildDetailUrl(sourceType, identifier) {
  const config = getDetailConfig(sourceType);
  const url = new URL(config.detail);
  url.searchParams.set(config.detailParam, String(identifier));
  return url.toString();
}

function extractWithRegex(pattern, text) {
  const results = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    results.push(match[1]);
  }
  return results;
}

export function extractDetailIdentifiersFromListHtml(html, sourceType) {
  const identifierPattern = sourceType === 'hr'
    ? /hrPeopleHearDet\.jsp\?[^"'<>]*seq=([0-9]+)/gi
    : /ihHearingDet\.jsp\?[^"'<>]*pnnc_cd=([^&"'<>]+)/gi;
  const jsPattern = sourceType === 'hr'
    ? /\b(?:goDetail|fnView|fn_view|fnDetail|detailView)\s*\(\s*['"]?([0-9]+)['"]?/gi
    : /\b(?:goDetail|fnView|fn_view|fnDetail|detailView)\s*\(\s*['"]?([A-Za-z0-9_-]+)['"]?/gi;

  const ids = [
    ...extractWithRegex(identifierPattern, html),
    ...extractWithRegex(jsPattern, html),
  ].map((value) => compactText(value));

  return [...new Set(ids)].filter(Boolean);
}

function extractTableRows(html) {
  return [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
}

function extractCells(tagName, rowHtml) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  return [...rowHtml.matchAll(pattern)].map((match) => stripHtml(match[1]));
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLabel(value = '') {
  return compactText(String(value).replace(/[()/:]/g, '').replace(/\s+/g, ''));
}

function normalizeDate(value = '') {
  const digits = String(value).match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (!digits) return '';
  const [, year, month, day] = digits;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function extractDateRange(value = '') {
  const matches = [...String(value).matchAll(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/g)];
  if (matches.length === 0) return { start: '', end: '' };

  const normalized = matches.map((match) => `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`);
  return {
    start: normalized[0] || '',
    end: normalized[1] || normalized[0] || '',
  };
}

function pickValue(tableMap, labels) {
  for (const label of labels) {
    const normalized = normalizeLabel(label);
    const direct = tableMap.get(normalized);
    if (direct) return direct;

    for (const [key, value] of tableMap.entries()) {
      if (key.includes(normalized)) return value;
    }
  }
  return '';
}

function extractTargetAreaText(...values) {
  const source = values
    .map((value) => stripHtml(value))
    .filter(Boolean)
    .join('\n');

  const lineMatches = source.split(/\n+/).map((line) => compactText(line)).filter(Boolean);
  const areaLine = lineMatches.find((line) => /(일원|일대|일부|지구|동\s|읍\s|면\s|리\s|가\s)/.test(line));
  if (areaLine) return areaLine;

  const sentence = source.match(/([가-힣0-9\s]+(?:시|군|구|동|읍|면|리|가)[가-힣0-9\s]*(?:일원|일대|일부))/);
  return compactText(sentence?.[1] || '');
}

function extractSigunguCodeFromText(value = '') {
  const match = String(value).match(/\b(\d{5})(?:\d{5})?\b/);
  return match?.[1] || '';
}

function extractAnchors(html, baseUrl) {
  return [...String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      try {
        const url = new URL(match[1], baseUrl).toString();
        return {
          url,
          text: stripHtml(match[2]),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function buildId(sourceType, identifier) {
  return `eum-${sourceType}-${String(identifier).trim()}`;
}

function buildTableMap(html) {
  const map = new Map();
  extractTableRows(html).forEach((rowHtml) => {
    const headers = extractCells('th', rowHtml);
    const cells = extractCells('td', rowHtml);
    if (!headers.length || !cells.length) return;
    headers.forEach((header, index) => {
      const value = cells[index] || cells[0] || '';
      if (!header || !value) return;
      const key = normalizeLabel(header);
      if (!map.has(key)) map.set(key, value);
    });
  });
  return map;
}

function extractTitleFromHtml(html) {
  const heading = stripHtml((html.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i) || [])[1] || '');
  if (heading) return heading;
  return stripHtml((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
}

function extractClassContent(html, className) {
  return stripHtml(
    (html.match(new RegExp(`<([a-z0-9]+)[^>]*class=["'][^"']*\\b${escapeRegex(className)}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i')) || [])[2] || ''
  );
}

function extractParagraphClassContent(html, className) {
  return stripHtml(
    (html.match(new RegExp(`<p[^>]*class=["'][^"']*\\b${escapeRegex(className)}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/p>`, 'i')) || [])[1] || ''
  );
}

function extractLabeledCellValue(html, labels) {
  for (const label of labels) {
    const escapedLabel = escapeRegex(label);
    const patterns = [
      new RegExp(`<th\\b[^>]*>\\s*${escapedLabel}\\s*<\\/th>\\s*<td\\b[^>]*>([\\s\\S]*?)<\\/td>`, 'i'),
      new RegExp(`<td\\b[^>]*>\\s*${escapedLabel}\\s*<\\/td>\\s*<td\\b[^>]*>([\\s\\S]*?)<\\/td>`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      const value = stripHtml(match?.[1] || '');
      if (value) return value;
    }
  }
  return '';
}

function extractNoticeNumberText(html) {
  return extractClassContent(html, 'number');
}

function extractSigunguCode(sourceType, identifier, html, detailUrl, rawText) {
  if (sourceType === 'ih') {
    const pnncPrefixMatch = String(identifier || '').match(/^(\d{5})/);
    if (pnncPrefixMatch?.[1]) return pnncPrefixMatch[1];
  }

  const explicitCode = extractLabeledCellValue(html, ['시군구코드', '행정구역코드', '법정동코드']);
  const explicitMatch = explicitCode.match(/\b(\d{5})/);
  if (explicitMatch?.[1]) return explicitMatch[1];

  const urlCode = extractSigunguCodeFromText(detailUrl);
  if (urlCode) return urlCode;
  return '';
}

function pickOfficialLinks(anchors, title, detailUrl) {
  const detailHref = isUsableUrl(detailUrl) ? new URL(String(detailUrl)) : null;
  const officialNotice = anchors.find((item) => {
    if (!isDirectNoticePostUrl(item.url, { title })) return false;
    if (!detailHref || !isUsableUrl(item.url)) return true;
    const candidate = new URL(String(item.url));
    return !(
      candidate.origin === detailHref.origin
      && candidate.pathname === detailHref.pathname
      && candidate.search === detailHref.search
    );
  })?.url || '';
  const attachmentUrls = [...new Set(
    anchors
      .filter((item) => isDirectAttachmentUrl(item.url))
      .map((item) => item.url)
  )];
  return {
    officialNoticeUrl: officialNotice,
    attachmentUrls,
  };
}

function mergeAttachmentUrls(...lists) {
  return [...new Set(
    lists
      .flat()
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean)
  )];
}

function mergeNoticeSources(primary, supplement = {}) {
  if (!supplement || typeof supplement !== 'object') return primary;
  return {
    ...primary,
    noticeNumber: primary.noticeNumber || supplement.noticeNumber || '',
    title: primary.title || supplement.title || '',
    organization: primary.organization || supplement.organization || '',
    postedDate: primary.postedDate || supplement.postedDate || '',
    hearingStartDate: primary.hearingStartDate || supplement.hearingStartDate || '',
    hearingEndDate: primary.hearingEndDate || supplement.hearingEndDate || '',
    sigunguCode: primary.sigunguCode || supplement.sigunguCode || supplement.adminCode || '',
    targetAreaText: primary.targetAreaText || supplement.targetAreaText || supplement.locationText || '',
    officialNoticeUrl: primary.officialNoticeUrl || supplement.officialNoticeUrl || '',
    attachmentUrls: mergeAttachmentUrls(primary.attachmentUrls || [], supplement.attachmentUrls || []),
    sourceConfidence: primary.sourceConfidence === 'high' ? 'high' : (supplement.sourceConfidence || primary.sourceConfidence || 'medium'),
  };
}

export function mergeSupplementSources(notices, {
  officialSources = [],
  ihPublicSources = [],
} = {}) {
  const officialByKey = new Map(
    officialSources
      .map((item) => [buildNoticeMatchKey(item), item])
      .filter(([key]) => key)
  );
  const ihByKey = new Map(
    ihPublicSources
      .map((item) => [buildNoticeMatchKey(item), item])
      .filter(([key]) => key)
  );

  return notices.map((notice) => {
    const key = buildNoticeMatchKey(notice);
    const officialMatch = key ? officialByKey.get(key) : null;
    const ihMatch = notice.sourceType === 'ih' && key ? ihByKey.get(key) : null;

    return mergeNoticeSources(
      mergeNoticeSources(notice, officialMatch || {}),
      ihMatch || {}
    );
  });
}

export function parseEumDetailHtml(html, { sourceType, identifier, detailUrl, listUrl }) {
  const tableMap = buildTableMap(html);
  const rawText = stripHtml(html);
  const bodyText = extractClassContent(html, 'content') || extractClassContent(html, 'edit_view');
  const title = pickValue(tableMap, ['공고명', '공람명', '제목', '건명'])
    || extractParagraphClassContent(html, 'title')
    || extractClassContent(html, 'title')
    || extractLabeledCellValue(html, ['공고명', '공람명', '제목', '건명'])
    || extractTitleFromHtml(html);
  const organization = pickValue(tableMap, ['공고기관', '공고 기관', '기관명', '담당기관', '열람기관', '시행기관'])
    || extractLabeledCellValue(html, ['공고기관', '공고 기관', '기관명', '담당기관', '열람기관', '시행기관']);
  const noticeNumber = pickValue(tableMap, ['공고번호', '고시번호', '공람번호'])
    || extractParagraphClassContent(html, 'number')
    || extractNoticeNumberText(html);
  const postedDate = normalizeDate(
    pickValue(tableMap, ['공고일', '공고일자', '게시일', '등록일'])
    || extractLabeledCellValue(html, ['공고일', '공고일자', '게시일', '등록일'])
  );
  const hearingPeriod = pickValue(tableMap, ['열람기간', '공람기간', '의견청취기간', '의견제출기간', '청취기간', '청취 기간'])
    || extractLabeledCellValue(html, ['열람기간', '공람기간', '의견청취기간', '의견제출기간', '청취기간', '청취 기간']);
  const { start: hearingStartDate, end: hearingEndDate } = extractDateRange(hearingPeriod);
  const targetAreaText = pickValue(tableMap, ['대상지', '대상지역', '사업위치', '위치', '소재지', '주소'])
    || extractLabeledCellValue(html, ['대상지', '대상지역', '사업위치', '위치', '소재지', '주소', '열람 및 의견서 제출장소', '열람장소', '의견서 제출장소'])
    || extractTargetAreaText(
      pickValue(tableMap, ['비고', '주요내용', '공고내용']),
      bodyText,
      rawText,
      title
    );
  const sigunguCode = extractSigunguCode(sourceType, identifier, html, detailUrl, rawText);
  const anchors = extractAnchors(html, detailUrl);
  const { officialNoticeUrl, attachmentUrls } = pickOfficialLinks(anchors, title, detailUrl);

  const hasRequiredFields = title && organization && (postedDate || hearingStartDate || hearingEndDate);
  const hasValidEncoding = !hasBrokenText(title) && !hasBrokenText(organization);

  return {
    id: buildId(sourceType, identifier),
    sourceType,
    sourceUrl: listUrl,
    sourceDetailUrl: detailUrl,
    ...(sourceType === 'hr' ? { seq: String(identifier) } : { pnncCd: String(identifier) }),
    title,
    organization,
    noticeNumber,
    postedDate,
    hearingStartDate,
    hearingEndDate,
    targetAreaText,
    sigunguCode,
    officialNoticeUrl,
    attachmentUrls,
    rawText,
    rawHtml: html,
    classificationConfidence: sigunguCode ? 'high' : targetAreaText ? 'medium' : 'low',
    sourceConfidence: title && organization ? 'high' : 'low',
    verificationStatus: hasRequiredFields && hasValidEncoding ? 'verified' : hasValidEncoding ? 'partial' : 'rejected',
    verificationReason: hasValidEncoding
      ? (hasRequiredFields ? '토지이음 상세 공고문을 직접 수집했습니다.' : '토지이음 상세는 수집했지만 필수 메타데이터가 부족합니다.')
      : '한글 디코딩이 깨진 응답이라 상세 공고문으로 확정하지 않았습니다.',
    lastFetchedAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
  };
}

export async function collectEumType(sourceType, {
  fetchImpl = fetch,
  maxPages = 1,
  detailDelayMs = 0,
  onProgress = () => {},
  officialSources = [],
  ihPublicSources = [],
} = {}) {
  const notices = [];
  const seenIds = new Set();

  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    const listUrl = buildListUrl(sourceType, pageNo);
    const listResponse = await fetchDecodedHtml(listUrl, { fetchImpl });
    if (!listResponse.ok) {
      throw new Error(`Failed to fetch ${sourceType} list page ${pageNo}: ${listResponse.status}`);
    }

    const identifiers = extractDetailIdentifiersFromListHtml(listResponse.html, sourceType);
    onProgress({ stage: 'list', sourceType, pageNo, identifiers: identifiers.length });

    if (!identifiers.length) break;

    for (const identifier of identifiers) {
      if (seenIds.has(identifier)) continue;
      seenIds.add(identifier);

      const detailUrl = buildDetailUrl(sourceType, identifier);
      const detailResponse = await fetchDecodedHtml(detailUrl, { fetchImpl });
      if (!detailResponse.ok) continue;

      const notice = parseEumDetailHtml(detailResponse.html, {
        sourceType,
        identifier,
        detailUrl: detailResponse.url || detailUrl,
        listUrl,
      });

      notices.push({
        ...notice,
        responseCharset: detailResponse.detectedCharset,
      });

      onProgress({ stage: 'detail', sourceType, identifier, title: notice.title });

      if (detailDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, detailDelayMs));
      }
    }
  }

  return mergeSupplementSources(notices, {
    officialSources,
    ihPublicSources,
  });
}

export async function collectEumDataset(options = {}) {
  const { types = ['hr', 'ih'] } = options;
  const results = [];

  for (const sourceType of types) {
    const notices = await collectEumType(sourceType, options);
    results.push(...notices);
  }

  return results;
}
