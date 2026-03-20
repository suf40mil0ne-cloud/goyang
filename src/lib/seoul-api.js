import { getDistrictIndex, normalizeText } from './region-utils';

const SEOUL_API_KEY = '714563777567757338346d70445972';
const SEOUL_DATASET = 'TbWcmBoardB0414';
const SEOUL_FETCH_RANGE = { start: 1, end: 80 };
const SEOUL_PROXY_ENDPOINT = `/api/seoul/${SEOUL_API_KEY}/xml/${SEOUL_DATASET}/${SEOUL_FETCH_RANGE.start}/${SEOUL_FETCH_RANGE.end}/`;
const SEOUL_SNAPSHOT_ENDPOINT = '/data/seoul-open-api.xml';

function decodeHtmlEntities(value = '') {
  if (!value || typeof window === 'undefined') return value;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function stripHtml(value = '') {
  return decodeHtmlEntities(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getText(node, tagName) {
  return node.querySelector(tagName)?.textContent?.trim() || '';
}

function buildAttachmentUrl(value = '') {
  if (!value) return '';
  return decodeHtmlEntities(value).replace(/^http:/, 'https:');
}

function inferDistrict(row) {
  const haystack = [
    row.title,
    row.place,
    row.content,
    row.department,
  ]
    .filter(Boolean)
    .join(' ');

  const normalized = normalizeText(haystack);
  const matched = getDistrictIndex().find((district) =>
    district.sido === '서울특별시' &&
    district.aliases.some((alias) => normalized.includes(alias))
  );

  if (!matched) {
    return {
      sido: '서울특별시',
      sigungu: '서울 전역',
      regionLabel: '서울특별시 서울 전역',
    };
  }

  return {
    sido: '서울특별시',
    sigungu: matched.sigungu,
    regionLabel: `서울특별시 ${matched.sigungu}`,
  };
}

function normalizePeriod(value = '') {
  return value || '기간 정보 없음';
}

function parseSeoulXml(xmlText) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(xmlText, 'application/xml');
  const rows = [...documentNode.querySelectorAll('row')].map((node) => ({
    id: getText(node, 'PST_SN'),
    title: getText(node, 'AGND_NM'),
    period: normalizePeriod(getText(node, 'PBANC_PRD')),
    place: getText(node, 'EXHB_PLC'),
    phone: getText(node, 'TELNO'),
    department: getText(node, 'JRSD_DEPT'),
    content: stripHtml(getText(node, 'CN')),
    fileName: getText(node, 'FILE_NM'),
    attachmentUrl: buildAttachmentUrl(getText(node, 'ATCH_FILE_URL_ADDR')),
  }));

  const deduped = new Map();
  for (const row of rows) {
    const existing = deduped.get(row.id);
    if (!existing) {
      deduped.set(row.id, {
        ...row,
        attachments: row.attachmentUrl
          ? [{ name: row.fileName || '첨부파일', url: row.attachmentUrl }]
          : [],
      });
      continue;
    }

    if (row.attachmentUrl && !existing.attachments.some((item) => item.url === row.attachmentUrl)) {
      existing.attachments.push({ name: row.fileName || '첨부파일', url: row.attachmentUrl });
    }
  }

  return [...deduped.values()].map((item) => {
    const district = inferDistrict(item);
    return {
      id: `seoul-${item.id}`,
      source: 'seoul-open-api',
      sourceLabel: '서울시 Open API',
      type: '도시계획 공고',
      title: item.title,
      period: item.period,
      sido: district.sido,
      sigungu: district.sigungu,
      regionLabel: district.regionLabel,
      department: item.department || '담당부서 정보 없음',
      place: item.place || '열람장소 정보 없음',
      phone: item.phone,
      excerpt: item.content || '상세 본문 정보 없음',
      link: item.attachments[0]?.url || 'https://openapi.seoul.go.kr/',
      attachments: item.attachments,
      isMock: false,
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function fetchSeoulUrbanPlanningNotices() {
  const candidates = [SEOUL_PROXY_ENDPOINT, SEOUL_SNAPSHOT_ENDPOINT];

  for (const endpoint of candidates) {
    const response = await fetch(endpoint);
    if (!response.ok) {
      continue;
    }

    const xmlText = await response.text();
    return parseSeoulXml(xmlText);
  }

  throw new Error('seoul-api-unavailable');
}
