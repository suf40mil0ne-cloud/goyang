function compactPublisher(value = '') {
  return String(value).replace(/주식회사|\(주\)|신문|뉴스/g, '').trim() || value;
}

function normalizeList(items, fallback = []) {
  return Array.isArray(items) ? items : fallback;
}

function isUsableUrl(value = '') {
  try {
    new URL(String(value));
    return true;
  } catch {
    return false;
  }
}

function normalizeUrl(value = '') {
  if (!isUsableUrl(value)) return '';
  const url = new URL(String(value));
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const search = url.search || '';
  return `${url.protocol}//${url.hostname.toLowerCase()}${pathname}${search}`;
}

function dedupeByUrl(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizeUrl(item.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isEumUrl(value = '') {
  return normalizeUrl(value).includes('eum.go.kr');
}

function isLikelyHomepageUrl(value = '') {
  if (!isUsableUrl(value)) return false;
  const url = new URL(String(value));
  return (url.pathname === '/' || url.pathname === '') && !url.search;
}

function isLikelyAttachment(item) {
  if (!isUsableUrl(item?.url)) return false;
  const label = `${item.label || item.title || ''}`.toLowerCase();
  const normalizedUrl = normalizeUrl(item.url).toLowerCase();
  if (label.includes('대표 페이지')) return false;
  if (/\.(pdf|hwp|hwpx|doc|docx|xls|xlsx|zip)(\?|$)/i.test(normalizedUrl)) return true;
  return /(첨부|공고문|도면|문서|파일|pdf|hwp|hwpx)/i.test(label);
}

function buildSourceDetailLink(notice) {
  if (!isUsableUrl(notice.sourceUrl)) return null;

  return {
    title: isEumUrl(notice.sourceUrl) ? '토지이음에서 보기' : '기준 출처에서 보기',
    url: notice.sourceUrl,
    description: isEumUrl(notice.sourceUrl)
      ? '토지이음 상세 화면에서 공고 메타데이터와 열람기간을 다시 확인합니다.'
      : '수집 기준이 된 출처 화면입니다. 실제 제출과 법적 효력 판단은 공식 공고 원문을 우선 확인해야 합니다.',
    sourceSite: notice.sourceMeta?.label || notice.rawSourceName || '기준 출처',
    buttonLabel: isEumUrl(notice.sourceUrl) ? '토지이음에서 보기' : '출처 보기',
  };
}

function deriveOfficialNotices(notice, enrichment) {
  return dedupeByUrl(
    normalizeList(enrichment.officialNotices)
      .filter((item) => isUsableUrl(item?.url))
      .filter((item) => (item.confidence ?? 0) >= 0.88)
      .filter((item) => !isLikelyHomepageUrl(item.url))
      .map((item, index) => ({
        id: item.id || `${notice.id}-official-${index + 1}`,
        ...item,
      }))
  );
}

function hasReviewPendingOfficial(enrichment = {}) {
  return normalizeList(enrichment.officialNotices).some(
    (item) =>
      isUsableUrl(item?.url)
      && (item.confidence ?? 0) >= 0.7
      && ((item.confidence ?? 0) < 0.88 || isLikelyHomepageUrl(item.url))
  );
}

function deriveAttachmentLinks(notice, officialNotices, sourceDetailLink) {
  const excluded = new Set(
    [sourceDetailLink?.url, ...officialNotices.map((item) => item.url)]
      .map((item) => normalizeUrl(item))
      .filter(Boolean)
  );

  return dedupeByUrl(
    normalizeList(notice.attachments)
      .filter((item) => isLikelyAttachment(item))
      .filter((item) => !excluded.has(normalizeUrl(item.url)))
      .map((item, index) => ({
        id: item.id || `${notice.id}-attachment-${index + 1}`,
        title: item.label || `첨부 공고문 ${index + 1}`,
        url: item.url,
        sourceSite: '첨부 공고문',
        fileLabel: item.label || '첨부 문서',
      }))
  );
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
  const tentativeSourceDetailLink = buildSourceDetailLink(notice);
  const sourceDetailLink = tentativeSourceDetailLink
    && !officialNotices.some((item) => normalizeUrl(item.url) === normalizeUrl(tentativeSourceDetailLink.url))
    ? tentativeSourceDetailLink
    : null;
  const attachmentLinks = deriveAttachmentLinks(notice, officialNotices, sourceDetailLink);
  const officialPressReleases = derivePressReleases(enrichment);
  const relatedNews = deriveRelatedNews(enrichment);
  const relatedFollowups = deriveFollowups(notice, relatedGosi);

  return {
    normalizedTitle: enrichment.normalizedTitle || notice.title,
    noticeNumber: enrichment.noticeNumber || notice.noticeNumber || '',
    officialNotices,
    officialNoticeReviewPending: hasReviewPendingOfficial(enrichment),
    sourceDetailLink,
    attachmentLinks,
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
    notice.attachmentLinks?.length ? { tone: 'attachment', label: '첨부문서 있음' } : null,
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
