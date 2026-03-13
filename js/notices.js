import { getLocationConfidenceMeta, normalizeLocationConfidence } from './geocode.js';
import { getMatchingConfidenceMeta, getNoticeSignalBadges, getSourceCoverage, mergeNoticeConnections } from './links.js';
import { getSourceMeta } from './sources.js';
import { getStatusBadgeText, inferStatus, statusLabels } from './status.js';

const noticesUrl = new URL('../data/notices.json', import.meta.url);
const noticeLinksUrl = new URL('../data/notice-links.json', import.meta.url);
const eumDetailOverridesUrl = new URL('../data/eum-detail-overrides.json', import.meta.url);
const regionsUrl = new URL('../data/regions.json', import.meta.url);
const guidesUrl = new URL('../data/guides.json', import.meta.url);
const relatedGosiUrl = new URL('../data/related-gosi.json', import.meta.url);

let noticesCache;
let regionsCache;
let guidesCache;
let relatedGosiCache;

const areaMap = {
  서울특별시: 'seoul',
  부산광역시: 'busan',
  대구광역시: 'daegu',
  인천광역시: 'incheon',
  광주광역시: 'gwangju',
  대전광역시: 'daejeon',
  울산광역시: 'ulsan',
  세종특별자치시: 'sejong',
  경기도: 'gyeonggi',
  강원특별자치도: 'gangwon',
  충청북도: 'chungbuk',
  충청남도: 'chungnam',
  전북특별자치도: 'jeonbuk',
  전라남도: 'jeonnam',
  경상북도: 'gyeongbuk',
  경상남도: 'gyeongnam',
  제주특별자치도: 'jeju',
};

function asDate(value) {
  return new Date(`${value}T00:00:00+09:00`);
}

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function formatDate(value) {
  if (!value) return '미기재';
  const date = asDate(value);
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(date);
}

function splitAiSummary(text) {
  return String(text)
    .split(/(?<=[.!?다])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function getEasySummary(notice) {
  if (notice.easySummary) return notice.easySummary;
  if (notice.shortSummary) return notice.shortSummary;
  return splitAiSummary(notice.aiSummary)[0] || '';
}

function normalizeTopicText(value = '') {
  return String(value)
    .replace(/\[[^\]]+\]|\([^)]+\)|<[^>]+>/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractKeywords(notice) {
  const stopwords = new Set([
    '주민공람', '주민의견청취', '인터넷', '열람', '공람', '공고', '계획', '변경', '결정', '주민', '의견', '청취', '주민열람',
  ]);
  return new Set(
    normalizeTopicText(`${notice.title} ${notice.projectType || ''} ${notice.hearingType || ''}`)
      .split(' ')
      .filter((token) => token.length >= 2 && !stopwords.has(token))
  );
}

function distanceKm(a, b) {
  if (![a?.latitude, a?.longitude, b?.latitude, b?.longitude].every(Number.isFinite)) return null;
  const toRadians = (value) => value * Math.PI / 180;
  const earthRadius = 6371;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

function scoreRelatedNotice(currentNotice, candidate) {
  if (candidate.id === currentNotice.id) return null;
  if (candidate.sigungu !== currentNotice.sigungu || candidate.sido !== currentNotice.sido) return null;

  let score = 2.5;
  if (currentNotice.legalDong && candidate.legalDong && currentNotice.legalDong === candidate.legalDong) score += 2;
  if (currentNotice.projectType && candidate.projectType && currentNotice.projectType === candidate.projectType) score += 1.6;
  if (currentNotice.hearingType && candidate.hearingType && currentNotice.hearingType === candidate.hearingType) score += 0.7;

  const currentKeywords = extractKeywords(currentNotice);
  const candidateKeywords = extractKeywords(candidate);
  let overlap = 0;
  currentKeywords.forEach((keyword) => {
    if (candidateKeywords.has(keyword)) overlap += 1;
  });
  score += Math.min(overlap * 0.7, 2.1);

  const dateGap = Math.abs(daysBetween(asDate(currentNotice.postedDate), asDate(candidate.postedDate)));
  if (dateGap <= 14) score += 0.8;
  else if (dateGap <= 30) score += 0.45;

  const km = distanceKm(currentNotice, candidate);
  if (km !== null) {
    if (km <= 2.5) score += 0.9;
    else if (km <= 6) score += 0.45;
  }

  if (overlap === 0 && currentNotice.projectType !== candidate.projectType) return null;
  if (score < 4.2) return null;

  return {
    ...candidate,
    relatedRelevanceScore: Number(score.toFixed(2)),
  };
}

function getOnlineSubmissionMeta(notice) {
  const isAvailable = Boolean(notice.onlineSubmissionAvailable);
  if (isAvailable) {
    return {
      available: true,
      label: '온라인 제출 가능',
      description: '토지이음 또는 원문 공고에서 온라인 의견제출을 지원하는 공고입니다.',
      tone: 'submission-available',
    };
  }

  return {
    available: false,
    label: '온라인 제출 별도 확인',
    description: '공고 열람과 온라인 제출은 다를 수 있으므로 원문 공고에서 제출 방식을 다시 확인해야 합니다.',
    tone: 'submission-check',
  };
}

function hasValue(value) {
  return Boolean(String(value || '').trim());
}

function evaluateVerification(notice, enrichment) {
  const hasRequiredMetadata = hasValue(notice.title)
    && hasValue(notice.organization)
    && hasValue(notice.sourceType)
    && (hasValue(notice.postedDate) || (hasValue(notice.hearingStartDate) && hasValue(notice.hearingEndDate)));
  const isLegacySeed = String(notice.sourceNoticeId || '').startsWith('LEGACY-');
  const hasEumDetail = enrichment.sourceDetailLink?.kind === 'eum'
    && enrichment.sourceDetailLink?.mode === 'detail'
    && hasValue(enrichment.sourceDetailLink?.url);
  const hasOfficialDetail = enrichment.directNoticeType === 'official-detail' && hasValue(enrichment.directNoticeUrl);
  const hasOfficialAttachment = Array.isArray(enrichment.attachmentLinks) && enrichment.attachmentLinks.length > 0;

  if (isLegacySeed) {
    return {
      verificationStatus: 'rejected',
      verificationReason: '개발용 LEGACY seed 데이터는 노출 대상에서 제거합니다.',
      sourceConfidence: 'low',
    };
  }

  if (!hasRequiredMetadata) {
    return {
      verificationStatus: 'rejected',
      verificationReason: '제목·기관·공고일/열람기간·sourceType 필수 메타데이터가 부족합니다.',
      sourceConfidence: 'low',
    };
  }

  if (hasEumDetail) {
    return {
      verificationStatus: 'verified',
      verificationReason: '토지이음 상세 공고문과 직접 연결됩니다.',
      sourceConfidence: 'high',
    };
  }

  if (hasOfficialDetail) {
    return {
      verificationStatus: 'verified',
      verificationReason: '지자체 공식 게시글 상세 URL이 직접 확인됩니다.',
      sourceConfidence: 'high',
    };
  }

  if (hasOfficialAttachment) {
    return {
      verificationStatus: 'verified',
      verificationReason: '공식 첨부 공고문 파일이 직접 확인됩니다.',
      sourceConfidence: 'medium',
    };
  }

  if (enrichment.sourceDetailLink?.kind === 'eum' && enrichment.sourceDetailLink?.mode === 'search-number') {
    return {
      verificationStatus: 'partial',
      verificationReason: '토지이음 목록 검색까지만 확보됐고 상세 공고문이 직접 확인되지 않았습니다.',
      sourceConfidence: 'medium',
    };
  }

  return {
    verificationStatus: 'rejected',
    verificationReason: '토지이음 상세 또는 지자체 공식 원문이 직접 확인되지 않았습니다.',
    sourceConfidence: 'low',
  };
}

function applyEumDetailOverrides(notice, overrides = {}) {
  const override = overrides?.[notice.id];
  if (!override) return notice;

  return {
    ...notice,
    ...override,
    sourceDetailUrl: override.sourceDetailUrl ?? notice.sourceDetailUrl ?? '',
    seq: override.seq ?? notice.seq ?? '',
    pnncCd: override.pnncCd ?? override.pnnc_cd ?? notice.pnncCd ?? notice.pnnc_cd ?? '',
    noticeNumber: override.noticeNumber ?? notice.noticeNumber ?? '',
    eumDirectUrl: override.eumDirectUrl ?? notice.eumDirectUrl ?? '',
    eumSourceType: override.eumSourceType ?? notice.eumSourceType ?? '',
  };
}

function decorateNotice(notice, relatedGosi, noticeLinks) {
  const statusInfo = inferStatus(notice);
  const areaKey = areaMap[notice.sido] || 'gyeonggi';
  const normalizedConfidence = normalizeLocationConfidence(notice);
  const sourceMeta = getSourceMeta(notice.sourceType);
  const enrichment = mergeNoticeConnections(notice, noticeLinks?.[notice.id], relatedGosi);
  const verification = evaluateVerification(notice, enrichment);
  const locationConfidenceMeta = getLocationConfidenceMeta(normalizedConfidence);
  const statusBadgeText = getStatusBadgeText(statusInfo.key, statusInfo.daysLeft);
  const onlineSubmissionMeta = getOnlineSubmissionMeta(notice);
  return {
    ...notice,
    areaKey,
    sourceMeta,
    easySummary: getEasySummary(notice),
    ...enrichment,
    ...verification,
    statusKey: statusInfo.key,
    statusLabel: statusInfo.label,
    daysLeft: statusInfo.daysLeft,
    isRecent: statusInfo.isRecent,
    postedDateText: formatDate(notice.postedDate),
    hearingStartDateText: formatDate(notice.hearingStartDate),
    hearingEndDateText: formatDate(notice.hearingEndDate),
    lastVerifiedAtText: new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Seoul',
    }).format(new Date(notice.lastVerifiedAt)),
    lastFetchedAtText: new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Seoul',
    }).format(new Date(notice.lastFetchedAt)),
    statusBadgeText,
    locationConfidence: normalizedConfidence,
    locationConfidenceMeta,
    matchingConfidenceMeta: getMatchingConfidenceMeta(enrichment.matchingConfidence),
    signalBadges: getNoticeSignalBadges({
      ...notice,
      ...enrichment,
      locationConfidenceMeta,
      onlineSubmissionMeta,
    }),
    sourceCoverage: getSourceCoverage({
      ...notice,
      ...enrichment,
    }),
    onlineSubmissionMeta,
    aiSummaryLines: splitAiSummary(notice.aiSummary),
    changeSummary: notice.shortSummary,
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  return response.json();
}

export async function loadNotices() {
  if (!noticesCache) {
    noticesCache = Promise.all([
      fetchJson(noticesUrl),
      fetchJson(relatedGosiUrl),
      fetchJson(noticeLinksUrl),
      fetchJson(eumDetailOverridesUrl),
    ]).then(([items, relatedGosi, noticeLinks, eumDetailOverrides]) => {
      relatedGosiCache = Promise.resolve(relatedGosi);
      return items
        .map((item) => applyEumDetailOverrides(item, eumDetailOverrides))
        .map((item) => decorateNotice(item, relatedGosi, noticeLinks))
        .filter((item) => item.verificationStatus === 'verified');
    });
  }
  return noticesCache;
}

export async function loadRegions() {
  if (!regionsCache) regionsCache = fetchJson(regionsUrl);
  return regionsCache;
}

export async function loadGuides() {
  if (!guidesCache) guidesCache = fetchJson(guidesUrl);
  return guidesCache;
}

export async function loadRelatedGosi() {
  if (!relatedGosiCache) relatedGosiCache = fetchJson(relatedGosiUrl);
  return relatedGosiCache;
}

export async function getNoticeById(id) {
  const notices = await loadNotices();
  return notices.find((notice) => notice.id === id) || null;
}

export function getRelatedNotices(notices, currentNotice, limit = 3) {
  return notices
    .map((notice) => scoreRelatedNotice(currentNotice, notice))
    .filter(Boolean)
    .sort((a, b) => {
      if (b.relatedRelevanceScore !== a.relatedRelevanceScore) return b.relatedRelevanceScore - a.relatedRelevanceScore;
      return asDate(b.postedDate) - asDate(a.postedDate);
    })
    .slice(0, limit);
}

export function getStatusCounts(notices) {
  return notices.reduce(
    (acc, notice) => {
      if (notice.statusKey === 'active') acc.active += 1;
      if (notice.statusKey === 'closing-soon') acc.closingSoon += 1;
      if (notice.statusKey === 'ended') acc.ended += 1;
      if (notice.isRecent) acc.recent += 1;
      return acc;
    },
    { active: 0, closingSoon: 0, recent: 0, ended: 0 }
  );
}

export async function getTimelineBundle(key) {
  const [notices, relatedGosi] = await Promise.all([loadNotices(), loadRelatedGosi()]);
  const linkedNotices = notices.filter((notice) => notice.timelineKey === key || notice.relatedGosi.includes(key));
  const linkedGosi = relatedGosi.filter((item) => item.key === key);
  return { notices: linkedNotices, relatedGosi: linkedGosi };
}

export function getRelatedGosiForNotice(relatedGosi, notice) {
  return relatedGosi.filter((item) => notice.relatedGosi.includes(item.id));
}

export function getTimelineEntries(notices, relatedGosi, key) {
  const noticeEntries = notices
    .filter((item) => item.timelineKey === key)
    .map((item) => ({
      date: item.hearingStartDate,
      stageType: item.hearingType,
      title: item.title,
      summary: item.shortSummary,
      href: `notice.html?id=${encodeURIComponent(item.id)}`,
      type: 'notice',
    }));

  const gosiEntries = relatedGosi
    .filter((item) => item.key === key)
    .map((item) => ({
      date: item.postedDate,
      stageType: item.stageType,
      title: item.title,
      summary: item.summary,
      href: item.sourceUrl,
      type: 'gosi',
    }));

  return [...noticeEntries, ...gosiEntries].sort((a, b) => asDate(a.date) - asDate(b.date));
}

export function sortByRecent(notices) {
  return [...notices].sort((a, b) => new Date(b.postedDate) - new Date(a.postedDate));
}

export function getTopTimelineKeys(notices, relatedGosi, limit = 4) {
  const counts = new Map();
  notices.forEach((item) => counts.set(item.timelineKey, (counts.get(item.timelineKey) || 0) + 1));
  relatedGosi.forEach((item) => counts.set(item.key, (counts.get(item.key) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

export { formatDate, statusLabels };
