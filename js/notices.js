import { getLocationConfidenceMeta, normalizeLocationConfidence } from './geocode.js';
import { getSourceMeta } from './sources.js';

const noticesUrl = new URL('../data/notices.json', import.meta.url);
const regionsUrl = new URL('../data/regions.json', import.meta.url);
const guidesUrl = new URL('../data/guides.json', import.meta.url);
const relatedGosiUrl = new URL('../data/related-gosi.json', import.meta.url);

let noticesCache;
let regionsCache;
let guidesCache;
let relatedGosiCache;

const areaMap = {
  서울특별시: 'seoul',
  인천광역시: 'incheon',
  경기도: 'gyeonggi',
};

const statusLabels = {
  active: '진행 중',
  'closing-soon': '마감 임박',
  ended: '종료 공고',
  recent: '최근 공고',
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

function inferStatus(notice, now = new Date()) {
  const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const endDate = asDate(notice.hearingEndDate);
  const startDate = asDate(notice.hearingStartDate);
  const daysLeft = daysBetween(today, endDate);
  const recentDays = Math.max(0, daysBetween(asDate(notice.postedDate), today));

  if (endDate < today) {
    return { key: 'ended', label: statusLabels.ended, daysLeft, isRecent: recentDays <= 10 };
  }
  if (daysLeft <= 3) {
    return { key: 'closing-soon', label: statusLabels['closing-soon'], daysLeft, isRecent: recentDays <= 10 };
  }
  if (today >= startDate) {
    return { key: 'active', label: statusLabels.active, daysLeft, isRecent: recentDays <= 10 };
  }
  return { key: 'active', label: statusLabels.active, daysLeft, isRecent: recentDays <= 10 };
}

function decorateNotice(notice) {
  const statusInfo = inferStatus(notice);
  const areaKey = areaMap[notice.sido] || 'gyeonggi';
  const normalizedConfidence = normalizeLocationConfidence(notice);
  const sourceMeta = getSourceMeta(notice.sourceType);
  return {
    ...notice,
    areaKey,
    sourceMeta,
    easySummary: getEasySummary(notice),
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
    statusBadgeText: statusInfo.key === 'closing-soon' ? `${Math.max(statusInfo.daysLeft, 0)}일 남음` : statusInfo.label,
    locationConfidence: normalizedConfidence,
    locationConfidenceMeta: getLocationConfidenceMeta(normalizedConfidence),
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
  if (!noticesCache) noticesCache = fetchJson(noticesUrl).then((items) => items.map(decorateNotice));
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
