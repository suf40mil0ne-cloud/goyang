import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { EUM_ENDPOINTS, decodeHtmlBuffer, extractDetailIdentifiersFromListHtml } from './eum-collector.mjs';

const execFileAsync = promisify(execFile);
const BROKEN_TEXT_PATTERN = /�|Ã|Ð|¤|þ|¿/;

function compactText(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(value = '') {
  return compactText(
    String(value)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|dt|dd|th|td|h1|h2|h3|h4|span)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
  );
}

function normalizeLabel(value = '') {
  return compactText(String(value).replace(/[()/:]/g, '').replace(/\s+/g, ''));
}

function normalizeDate(value = '') {
  const match = String(value).match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (!match) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function extractDateRange(value = '') {
  const matches = [...String(value).matchAll(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/g)];
  if (!matches.length) return { start: '', end: '' };
  const normalized = matches.map((match) => `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`);
  return { start: normalized[0] || '', end: normalized[1] || normalized[0] || '' };
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getDetailConfig(sourceType) {
  const config = EUM_ENDPOINTS[sourceType];
  if (!config) throw new Error(`Unsupported EUM source type: ${sourceType}`);
  return config;
}

function buildListUrl(sourceType, pageNo = 1) {
  const config = getDetailConfig(sourceType);
  const url = new URL(config.list);
  if (pageNo > 1) url.searchParams.set('pageNo', String(pageNo));
  return url.toString();
}

function buildDetailUrl(sourceType, identifier) {
  const config = getDetailConfig(sourceType);
  const url = new URL(config.detail);
  url.searchParams.set(config.detailParam, String(identifier));
  return url.toString();
}

function parseHeaderBlock(headerText = '') {
  const lines = String(headerText).split(/\r?\n/).filter(Boolean);
  const statusLine = lines.shift() || '';
  const statusMatch = statusLine.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/i);
  const headers = {};

  lines.forEach((line) => {
    const index = line.indexOf(':');
    if (index < 0) return;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
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
  return parseHeaderBlock(blocks[blocks.length - 1] || '');
}

function shellEscape(value = '') {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function hasBrokenText(...values) {
  return values.some((value) => BROKEN_TEXT_PATTERN.test(String(value || '')));
}

function isUsableUrl(value = '') {
  try {
    new URL(String(value));
    return true;
  } catch {
    return false;
  }
}

function isDirectDocumentUrl(value = '') {
  return isUsableUrl(value) && /\.(pdf|hwp|hwpx|doc|docx|xls|xlsx|zip)(\?|$)/i.test(String(value));
}

function isLikelyHomepageUrl(value = '') {
  if (!isUsableUrl(value)) return false;
  const url = new URL(String(value));
  const pathname = url.pathname.replace(/\/+$/u, '') || '/';
  return pathname === '/' || /^\/(index(\.[a-z0-9]+)?|main(\.[a-z0-9]+)?|home(\.[a-z0-9]+)?)$/iu.test(pathname);
}

function isLikelyListUrl(value = '') {
  if (!isUsableUrl(value)) return false;
  const url = new URL(String(value));
  const pathWithSearch = `${url.pathname}${url.search}`.toLowerCase();
  return /(list|search)\.jsp|boardlist|noticelist|gosilist|gonggolist/i.test(pathWithSearch);
}

function hasDirectIdentifier(value = '') {
  if (!isUsableUrl(value)) return false;
  const keys = [...new URL(String(value)).searchParams.keys()].map((key) => key.toLowerCase());
  return keys.some((key) => ['nttid', 'articleid', 'article_no', 'articleno', 'seq', 'no', 'idx', 'bidx', 'bltnno', 'nttsn', 'noticeid', 'pnnc_cd'].includes(key));
}

function isDirectNoticePostUrl(value = '') {
  if (!isUsableUrl(value) || isLikelyHomepageUrl(value) || isLikelyListUrl(value) || isDirectDocumentUrl(value)) return false;
  if (hasDirectIdentifier(value)) return true;
  const url = new URL(String(value));
  const path = `${url.pathname}${url.search}`.toLowerCase();
  return /(view|detail|read|bbsview|boardview|gonggo|gosi)/i.test(path);
}

async function fetchDecodedHtmlViaCurl(url, { headers = {} } = {}) {
  const tempDir = await mkdtemp(join(tmpdir(), 'gongramkok-safe-eum-'));
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
    const [headerText, bodyBuffer] = await Promise.all([
      readFile(headerPath, 'latin1'),
      readFile(bodyPath),
    ]);
    const { status, headers: responseHeaders } = parseCurlHeaderText(headerText);
    const { html, detectedCharset } = decodeHtmlBuffer(bodyBuffer, {
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchDecodedHtmlSafe(url, {
  headers = {},
  maxAttempts = 3,
  retryDelayMs = 400,
} = {}) {
  const requestHeaders = {
    'accept-language': 'ko-KR,ko;q=0.9,en;q=0.7',
    'user-agent': 'Mozilla/5.0 (compatible; GongramKokBot/1.0; +https://gongramkok.example)',
    ...headers,
  };

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchDecodedHtmlViaCurl(url, { headers: requestHeaders });
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await wait(retryDelayMs * attempt);
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${url}`);
}

function extractCells(tagName, rowHtml) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  return [...rowHtml.matchAll(pattern)].map((match) => stripHtml(match[1]));
}

function buildTableMap(html) {
  const rows = [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const map = new Map();
  rows.forEach((rowHtml) => {
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

function extractParagraphClassContent(html, className) {
  return stripHtml(
    (html.match(new RegExp(`<p[^>]*class=["'][^"']*\\b${escapeRegex(className)}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/p>`, 'i')) || [])[1] || ''
  );
}

function extractClassContent(html, className) {
  return stripHtml(
    (html.match(new RegExp(`<([a-z0-9]+)[^>]*class=["'][^"']*\\b${escapeRegex(className)}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i')) || [])[2] || ''
  );
}

function extractLabeledCellValue(html, labels) {
  for (const label of labels) {
    const escaped = escapeRegex(label);
    const patterns = [
      new RegExp(`<th\\b[^>]*>\\s*${escaped}\\s*<\\/th>\\s*<td\\b[^>]*>([\\s\\S]*?)<\\/td>`, 'i'),
      new RegExp(`<td\\b[^>]*>\\s*${escaped}\\s*<\\/td>\\s*<td\\b[^>]*>([\\s\\S]*?)<\\/td>`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      const value = stripHtml(match?.[1] || '');
      if (value) return value;
    }
  }
  return '';
}

function extractTitleFromHtml(html) {
  return extractParagraphClassContent(html, 'title')
    || extractClassContent(html, 'title')
    || stripHtml((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
}

function extractTargetAreaText(...values) {
  const source = values
    .map((value) => stripHtml(value))
    .filter(Boolean)
    .join('\n');

  const lines = source.split(/\n+/).map((line) => compactText(line)).filter(Boolean);
  const areaLine = lines.find((line) => /(일원|일대|일부|지구|동|읍|면|리|가|시청|구청|군청|출장소|행정복지센터)/.test(line));
  if (areaLine) return areaLine;

  const sentence = source.match(/([가-힣0-9\s]+(?:시|군|구|동|읍|면|리|가)[가-힣0-9\s]*(?:일원|일대|일부))/);
  return compactText(sentence?.[1] || '');
}

function extractDownloadLinks(html, detailUrl) {
  return [...String(html).matchAll(/download\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/gi)]
    .map((match) => {
      try {
        const endpoint = new URL(match[1], detailUrl);
        endpoint.searchParams.set('path', match[2]);
        return endpoint.toString();
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

function extractAnchors(html, baseUrl) {
  return [...String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      try {
        return {
          url: new URL(match[1], baseUrl).toString(),
          text: stripHtml(match[2]),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function buildNoticeId(sourceType, identifier) {
  return `eum-${sourceType}-${String(identifier).trim()}`;
}

function parseSafeDetailHtml(html, { sourceType, identifier, detailUrl, listUrl, detectedCharset }) {
  const tableMap = buildTableMap(html);
  const bodyText = extractClassContent(html, 'content') || extractClassContent(html, 'edit_view');
  const rawText = stripHtml(html);
  const title = pickValue(tableMap, ['공고명', '공람명', '제목', '건명'])
    || extractParagraphClassContent(html, 'title')
    || extractLabeledCellValue(html, ['공고명', '공람명', '제목', '건명'])
    || extractTitleFromHtml(html);
  const organization = pickValue(tableMap, ['공고기관', '공고 기관', '기관명', '담당기관', '열람기관', '시행기관'])
    || extractLabeledCellValue(html, ['공고기관', '공고 기관', '기관명', '담당기관', '열람기관', '시행기관']);
  const noticeNumber = pickValue(tableMap, ['공고번호', '고시번호', '공람번호'])
    || extractParagraphClassContent(html, 'number');
  const postedDate = normalizeDate(
    pickValue(tableMap, ['공고일', '공고일자', '게시일', '등록일'])
    || extractLabeledCellValue(html, ['공고일', '공고일자', '게시일', '등록일'])
  );
  const hearingPeriod = pickValue(tableMap, ['열람기간', '공람기간', '의견청취기간', '의견제출기간', '청취기간', '청취 기간'])
    || extractLabeledCellValue(html, ['열람기간', '공람기간', '의견청취기간', '의견제출기간', '청취기간', '청취 기간']);
  const { start: hearingStartDate, end: hearingEndDate } = extractDateRange(hearingPeriod);
  const targetAreaText = pickValue(tableMap, ['대상지', '대상지역', '사업위치', '위치', '소재지', '주소'])
    || extractLabeledCellValue(html, ['대상지', '대상지역', '사업위치', '위치', '소재지', '주소', '열람 및 의견서 제출장소', '열람장소', '의견서 제출장소'])
    || extractTargetAreaText(bodyText, rawText, title);
  const sigunguCode = sourceType === 'ih'
    ? String(identifier).slice(0, 5)
    : '';

  const anchors = extractAnchors(html, detailUrl);
  const attachmentUrls = [
    ...extractDownloadLinks(html, detailUrl),
    ...anchors.filter((item) => isDirectDocumentUrl(item.url)).map((item) => item.url),
  ].filter((value, index, items) => items.indexOf(value) === index);
  const officialNoticeUrl = anchors.find((item) => isDirectNoticePostUrl(item.url))?.url || '';

  const hasCoreFields = Boolean(title && organization && (postedDate || hearingStartDate || hearingEndDate));
  const hasDetailSource = Boolean(detailUrl) && (sourceType === 'hr' ? /^\d+$/.test(String(identifier)) : String(identifier).length >= 6);
  const encodingOk = !hasBrokenText(title, organization);

  return {
    id: buildNoticeId(sourceType, identifier),
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
    sigunguCode,
    targetAreaText,
    officialNoticeUrl,
    attachmentUrls,
    rawText,
    rawHtml: html,
    responseCharset: detectedCharset,
    classificationConfidence: sigunguCode ? 'high' : targetAreaText ? 'medium' : 'low',
    sourceConfidence: hasCoreFields ? 'high' : 'medium',
    verificationStatus: hasCoreFields && hasDetailSource && encodingOk ? 'verified' : hasDetailSource && encodingOk ? 'partial' : 'rejected',
    lastFetchedAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
  };
}

export async function collectEumTypeSafe(sourceType, {
  maxPages = 1,
  detailDelayMs = 0,
  maxAttempts = 3,
  retryDelayMs = 400,
  onProgress = () => {},
} = {}) {
  const notices = [];
  const seen = new Set();
  const stats = {
    sourceType,
    listRowsCount: 0,
    detailFetchedCount: 0,
    detailParseSuccessCount: 0,
    fetchFailures: [],
  };

  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    const listUrl = buildListUrl(sourceType, pageNo);
    const listResponse = await fetchDecodedHtmlSafe(listUrl, { maxAttempts, retryDelayMs });
    if (!listResponse.ok) {
      throw new Error(`Failed to fetch ${sourceType} list page ${pageNo}: ${listResponse.status}`);
    }

    const identifiers = extractDetailIdentifiersFromListHtml(listResponse.html, sourceType);
    stats.listRowsCount += identifiers.length;
    onProgress({ stage: 'list', sourceType, pageNo, identifiers: identifiers.length });
    if (!identifiers.length) break;

    for (const identifier of identifiers) {
      if (seen.has(identifier)) continue;
      seen.add(identifier);

      const detailUrl = buildDetailUrl(sourceType, identifier);
      try {
        const detailResponse = await fetchDecodedHtmlSafe(detailUrl, { maxAttempts, retryDelayMs });
        if (!detailResponse.ok) {
          stats.fetchFailures.push({ sourceType, identifier, detailUrl, reason: `http_${detailResponse.status}` });
          continue;
        }
        stats.detailFetchedCount += 1;
        const notice = parseSafeDetailHtml(detailResponse.html, {
          sourceType,
          identifier,
          detailUrl: detailResponse.url || detailUrl,
          listUrl,
          detectedCharset: detailResponse.detectedCharset,
        });
        notices.push(notice);
        stats.detailParseSuccessCount += 1;
        onProgress({ stage: 'detail', sourceType, identifier, title: notice.title });
      } catch (error) {
        stats.fetchFailures.push({
          sourceType,
          identifier,
          detailUrl,
          reason: error instanceof Error ? error.message : String(error),
        });
      }

      if (detailDelayMs > 0) {
        await wait(detailDelayMs);
      }
    }
  }

  return { notices, stats };
}

export async function collectEumDatasetSafe({
  types = ['hr', 'ih'],
  maxPages = 1,
  detailDelayMs = 250,
  maxAttempts = 3,
  retryDelayMs = 400,
  onProgress = () => {},
} = {}) {
  const notices = [];
  const stageStats = {
    hr: { listRowsCount: 0, detailFetchedCount: 0, detailParseSuccessCount: 0, fetchFailures: [] },
    ih: { listRowsCount: 0, detailFetchedCount: 0, detailParseSuccessCount: 0, fetchFailures: [] },
  };

  for (const sourceType of types) {
    const result = await collectEumTypeSafe(sourceType, {
      maxPages,
      detailDelayMs,
      maxAttempts,
      retryDelayMs,
      onProgress,
    });
    notices.push(...result.notices);
    stageStats[sourceType] = result.stats;
  }

  return { notices, stageStats };
}
