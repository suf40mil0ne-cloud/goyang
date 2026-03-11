function compactPublisher(value = '') {
  return String(value).replace(/주식회사|\(주\)|신문|뉴스/g, '').trim() || value;
}

function normalizeList(items, fallback = []) {
  return Array.isArray(items) ? items : fallback;
}

function deriveOfficialNotices(notice, enrichment) {
  const officialNotices = normalizeList(enrichment.officialNotices);
  if (officialNotices.length) return officialNotices;

  return [
    {
      id: `${notice.id}-official`,
      title: notice.title,
      organization: notice.organization,
      noticeNumber: enrichment.noticeNumber || notice.noticeNumber || '번호 확인 필요',
      postedDate: notice.postedDate,
      url: notice.sourceUrl,
      sourceSite: notice.rawSourceName || notice.sourceMeta?.label || '공식 공고 원문',
      matchType: '기본 원문',
      confidence: 0.72,
    },
  ];
}

function derivePressReleases(enrichment) {
  return normalizeList(enrichment.officialPressReleases);
}

function deriveRelatedNews(enrichment) {
  return normalizeList(enrichment.relatedNews).map((item, index) => ({
    id: item.id || `news-${index + 1}`,
    title: item.title,
    publisher: compactPublisher(item.publisher),
    publishedAt: item.publishedAt,
    url: item.url,
    snippet: item.snippet,
    relevanceScore: item.relevanceScore ?? 0.5,
    sourceType: item.sourceType || 'news',
  }));
}

function deriveFollowups(notice, relatedGosi) {
  return relatedGosi
    .filter((item) => notice.relatedGosi.includes(item.id))
    .map((item) => ({
      id: item.id,
      title: item.title,
      organization: item.organization,
      postedDate: item.postedDate,
      url: item.sourceUrl,
      stageType: item.stageType,
      sourceSite: '후속 고시',
      confidence: 0.86,
    }));
}

export function mergeNoticeConnections(notice, enrichment = {}, relatedGosi = []) {
  const officialNotices = deriveOfficialNotices(notice, enrichment);
  const officialPressReleases = derivePressReleases(enrichment);
  const relatedNews = deriveRelatedNews(enrichment);
  const relatedFollowups = deriveFollowups(notice, relatedGosi);

  return {
    normalizedTitle: enrichment.normalizedTitle || notice.title,
    noticeNumber: enrichment.noticeNumber || notice.noticeNumber || '',
    officialNotices,
    officialPressReleases,
    relatedNews,
    relatedFollowups,
    matchingConfidence: enrichment.matchingConfidence ?? (officialNotices.length ? 0.74 : 0.48),
  };
}

export function getNoticeSignalBadges(notice) {
  return [
    notice.onlineSubmissionMeta
      ? { tone: notice.onlineSubmissionMeta.tone, label: notice.onlineSubmissionMeta.label }
      : null,
    notice.officialNotices?.length ? { tone: 'official', label: '지자체 원문 연결' } : null,
    notice.officialPressReleases?.length ? { tone: 'press', label: '설명자료 있음' } : null,
    notice.relatedNews?.length ? { tone: 'news', label: '관련 기사 있음' } : null,
    notice.attachments?.length ? { tone: 'attachment', label: '첨부문서 있음' } : null,
    notice.locationConfidenceMeta?.tone === 'high'
      ? { tone: 'location', label: '위치 확인됨' }
      : { tone: 'location-estimated', label: '위치 추정' },
  ].filter(Boolean);
}

export function getSourceCoverage(notice) {
  return {
    officialCount: notice.officialNotices?.length || 0,
    pressCount: notice.officialPressReleases?.length || 0,
    newsCount: notice.relatedNews?.length || 0,
    followupCount: notice.relatedFollowups?.length || 0,
  };
}

export function getMatchingConfidenceMeta(score = 0) {
  if (score >= 0.88) return { label: '연결 신뢰도 높음', tone: 'high' };
  if (score >= 0.7) return { label: '연결 신뢰도 보통', tone: 'medium' };
  return { label: '추가 검수 필요', tone: 'low' };
}
