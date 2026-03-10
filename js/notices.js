const noticesUrl = new URL("../data/notices.json", import.meta.url);
const regionsUrl = new URL("../data/regions.json", import.meta.url);
const guidesUrl = new URL("../data/guides.json", import.meta.url);

let noticesCache;
let regionsCache;
let guidesCache;

const areaMap = {
  서울특별시: "seoul",
  인천광역시: "incheon",
  경기도: "gyeonggi",
};

const statusLabels = {
  active: "진행 중",
  "closing-soon": "마감 임박",
  ended: "종료 공고",
  recent: "최근 공고",
};

function asDate(value) {
  return new Date(`${value}T00:00:00+09:00`);
}

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function formatDate(value) {
  if (!value) return "미기재";
  const date = asDate(value);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function inferStatus(notice, now = new Date()) {
  const today = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const endDate = asDate(notice.hearingEndDate);
  const startDate = asDate(notice.hearingStartDate);
  const daysLeft = daysBetween(today, endDate);
  const recentDays = Math.max(0, daysBetween(asDate(notice.postedDate), today));

  if (endDate < today) {
    return {
      key: "ended",
      label: statusLabels.ended,
      daysLeft,
      isRecent: recentDays <= 10,
    };
  }

  if (daysLeft <= 3) {
    return {
      key: "closing-soon",
      label: statusLabels["closing-soon"],
      daysLeft,
      isRecent: recentDays <= 10,
    };
  }

  if (today >= startDate) {
    return {
      key: "active",
      label: statusLabels.active,
      daysLeft,
      isRecent: recentDays <= 10,
    };
  }

  return {
    key: notice.status === "ended" ? "ended" : "active",
    label: notice.status === "ended" ? statusLabels.ended : statusLabels.active,
    daysLeft,
    isRecent: recentDays <= 10,
  };
}

function decorateNotice(notice) {
  const statusInfo = inferStatus(notice);
  const areaKey = areaMap[notice.sido] || "gyeonggi";
  return {
    ...notice,
    areaKey,
    statusKey: statusInfo.key,
    statusLabel: statusInfo.label,
    daysLeft: statusInfo.daysLeft,
    isRecent: statusInfo.isRecent,
    postedDateText: formatDate(notice.postedDate),
    hearingStartDateText: formatDate(notice.hearingStartDate),
    hearingEndDateText: formatDate(notice.hearingEndDate),
    lastVerifiedAtText: new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Seoul",
    }).format(new Date(notice.lastVerifiedAt)),
    statusBadgeText:
      statusInfo.key === "closing-soon"
        ? `${Math.max(statusInfo.daysLeft, 0)}일 남음`
        : statusInfo.label,
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }
  return response.json();
}

export async function loadNotices() {
  if (!noticesCache) {
    noticesCache = fetchJson(noticesUrl).then((items) => items.map(decorateNotice));
  }
  return noticesCache;
}

export async function loadRegions() {
  if (!regionsCache) {
    regionsCache = fetchJson(regionsUrl);
  }
  return regionsCache;
}

export async function loadGuides() {
  if (!guidesCache) {
    guidesCache = fetchJson(guidesUrl);
  }
  return guidesCache;
}

export async function getNoticeById(id) {
  const notices = await loadNotices();
  return notices.find((notice) => notice.id === id) || null;
}

export function groupByArea(notices) {
  return notices.reduce((acc, notice) => {
    if (!acc[notice.areaKey]) acc[notice.areaKey] = [];
    acc[notice.areaKey].push(notice);
    return acc;
  }, {});
}

export function sortByRecent(notices) {
  return [...notices].sort((a, b) => {
    if (a.statusKey !== b.statusKey) {
      const order = { "closing-soon": 0, active: 1, ended: 2 };
      return order[a.statusKey] - order[b.statusKey];
    }
    return asDate(b.postedDate) - asDate(a.postedDate);
  });
}

export function getRelatedNotices(notices, currentNotice, limit = 3) {
  return notices
    .filter((notice) => notice.id !== currentNotice.id)
    .sort((a, b) => {
      const sameAreaA = a.sigungu === currentNotice.sigungu ? -2 : 0;
      const sameTypeA = a.projectType === currentNotice.projectType ? -1 : 0;
      const sameAreaB = b.sigungu === currentNotice.sigungu ? -2 : 0;
      const sameTypeB = b.projectType === currentNotice.projectType ? -1 : 0;
      const scoreA = sameAreaA + sameTypeA;
      const scoreB = sameAreaB + sameTypeB;
      if (scoreA !== scoreB) return scoreA - scoreB;
      return asDate(b.postedDate) - asDate(a.postedDate);
    })
    .slice(0, limit);
}

export function getStatusCounts(notices) {
  return notices.reduce(
    (acc, notice) => {
      if (notice.statusKey === "active") acc.active += 1;
      if (notice.statusKey === "closing-soon") acc.closingSoon += 1;
      if (notice.statusKey === "ended") acc.ended += 1;
      if (notice.isRecent) acc.recent += 1;
      return acc;
    },
    { active: 0, closingSoon: 0, recent: 0, ended: 0 }
  );
}

export { formatDate, statusLabels };
