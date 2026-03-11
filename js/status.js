const statusCatalog = {
  active: {
    label: '진행 중',
    tone: 'active',
    accentLabel: '지금 확인',
  },
  'closing-soon': {
    label: '마감 임박',
    tone: 'closing-soon',
    accentLabel: '마감 임박',
  },
  ended: {
    label: '종료 공고',
    tone: 'ended',
    accentLabel: '종료',
  },
  recent: {
    label: '최근 공고',
    tone: 'recent',
    accentLabel: '최근 등록',
  },
};

function asDate(value) {
  return new Date(`${value}T00:00:00+09:00`);
}

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function inferStatus(notice, now = new Date()) {
  const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const endDate = asDate(notice.hearingEndDate);
  const startDate = asDate(notice.hearingStartDate);
  const daysLeft = daysBetween(today, endDate);
  const recentDays = Math.max(0, daysBetween(asDate(notice.postedDate), today));

  if (endDate < today) {
    return { key: 'ended', label: statusCatalog.ended.label, daysLeft, isRecent: recentDays <= 10 };
  }
  if (daysLeft <= 3) {
    return { key: 'closing-soon', label: statusCatalog['closing-soon'].label, daysLeft, isRecent: recentDays <= 10 };
  }
  if (today >= startDate) {
    return { key: 'active', label: statusCatalog.active.label, daysLeft, isRecent: recentDays <= 10 };
  }
  return { key: 'active', label: statusCatalog.active.label, daysLeft, isRecent: recentDays <= 10 };
}

export function getStatusMeta(statusKey = 'active') {
  return statusCatalog[statusKey] || statusCatalog.active;
}

export function getStatusBadgeText(statusKey, daysLeft = 0) {
  if (statusKey === 'closing-soon') return `${Math.max(daysLeft, 0)}일 남음`;
  return getStatusMeta(statusKey).label;
}

export const statusLabels = Object.fromEntries(
  Object.entries(statusCatalog).map(([key, value]) => [key, value.label])
);
