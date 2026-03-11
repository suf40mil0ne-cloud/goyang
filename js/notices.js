import { getLocationConfidenceMeta, normalizeLocationConfidence } from './geocode.js';
import { getMatchingConfidenceMeta, getNoticeSignalBadges, getSourceCoverage, mergeNoticeConnections } from './links.js';
import { getSourceMeta } from './sources.js';
import { getStatusBadgeText, inferStatus, statusLabels } from './status.js';

const noticesUrl = new URL('../data/notices.json', import.meta.url);
const noticeLinksUrl = new URL('../data/notice-links.json', import.meta.url);
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

function decorateNotice(notice, relatedGosi, noticeLinks) {
  const statusInfo = inferStatus(notice);
  const areaKey = areaMap[notice.sido] || 'gyeonggi';
  const normalizedConfidence = normalizeLocationConfidence(notice);
  const sourceMeta = getSourceMeta(notice.sourceType);
  const enrichment = mergeNoticeConnections(notice, noticeLinks?.[notice.id], relatedGosi);
  const locationConfidenceMeta = getLocationConfidenceMeta(normalizedConfidence);
  const statusBadgeText = getStatusBadgeText(statusInfo.key, statusInfo.daysLeft);
  const onlineSubmissionMeta = getOnlineSubmissionMeta(notice);
  return {
    ...notice,
    areaKey,
    sourceMeta,
    easySummary: getEasySummary(notice),
    ...enrichment,
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
    ]).then(([items, relatedGosi, noticeLinks]) => {
      relatedGosiCache = Promise.resolve(relatedGosi);
      return items.map((item) => decorateNotice(item, relatedGosi, noticeLinks));
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
    .filter((notice) => notice.id !== currentNotice.id)
    .sort((a, b) => {
      const scoreA = (a.sigungu === currentNotice.sigungu ? -2 : 0) + (a.projectType === currentNotice.projectType ? -1 : 0);
      const scoreB = (b.sigungu === currentNotice.sigungu ? -2 : 0) + (b.projectType === currentNotice.projectType ? -1 : 0);
      if (scoreA !== scoreB) return scoreA - scoreB;
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
