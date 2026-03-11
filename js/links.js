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
  const pathname = (url.pathname || '').toLowerCase();
  return (
    ((pathname === '/' || pathname === '') && !url.search)
    || /^\/(index(\.[a-z]+)?|main(\.[a-z]+)?|home(\.[a-z]+)?)$/i.test(pathname)
  );
}

function getPathWithSearch(value = '') {
  if (!isUsableUrl(value)) return '';
  const url = new URL(String(value));
  return `${url.pathname}${url.search}`.toLowerCase();
}

function getLastPathSegment(value = '') {
  if (!isUsableUrl(value)) return '';
  const segments = new URL(String(value)).pathname.split('/').filter(Boolean);
  return (segments[segments.length - 1] || '').toLowerCase();
}

function isLikelySearchUrl(value = '') {
  const pathWithSearch = getPathWithSearch(value);
  if (!pathWithSearch) return false;
  return /(^|\/)(search|srch|totalsearch)(\/|\.|$)|search(keyword|word|query|q)=/i.test(pathWithSearch);
}

function isLikelyLandingUrl(value = '') {
  if (!isUsableUrl(value)) return false;
  if (isLikelyHomepageUrl(value) || isLikelySearchUrl(value) || isLikelyNoticeListUrl(value)) return true;
  const pathWithSearch = getPathWithSearch(value);
  const lastSegment = getLastPathSegment(value);

  if (/\/(login|intro|sitemap|portal)(\/|$)/i.test(pathWithSearch)) return true;
  if (/(^|\/)(category|section|tag|archive|archives)(\/|$)/i.test(pathWithSearch)) return true;
  if (/(^|\/)(news|press|article|notice|gonggo|gosi|bbs|board)(\/|$)/i.test(pathWithSearch) && !hasDirectIdentifier(value)) {
    return ['news', 'press', 'article', 'notice', 'gonggo', 'gosi', 'bbs', 'board', 'list'].includes(lastSegment);
  }

  return false;
}

function classifyUrl(value = '') {
  if (!isUsableUrl(value)) return 'invalid';
  const normalizedUrl = normalizeUrl(value).toLowerCase();
  if (/\.(pdf|hwp|hwpx|doc|docx|xls|xlsx|zip)(\?|$)/i.test(normalizedUrl)) return 'document';
  if (isLikelyHomepageUrl(value)) return 'homepage';
  if (isEumUrl(value)) return 'source-detail';
  if (isLikelyNoticeListUrl(value)) return 'list';
  return 'detail';
}

function getQueryKeys(value = '') {
  if (!isUsableUrl(value)) return [];
  return [...new URL(String(value)).searchParams.keys()].map((key) => key.toLowerCase());
}

function hasDirectIdentifier(value = '') {
  const keys = getQueryKeys(value);
  return keys.some((key) => ['nttid', 'articleid', 'article_no', 'articleno', 'seq', 'no', 'idx', 'bidx', 'bltnno', 'nttsn', 'nttid', 'noticeid'].includes(key));
}

function isLikelyNoticeListUrl(value = '') {
  if (!isUsableUrl(value)) return false;
  const url = new URL(String(value));
  const pathWithSearch = `${url.pathname}${url.search}`.toLowerCase();
  const keys = getQueryKeys(value);

  if (isEumUrl(value) && /list/i.test(pathWithSearch)) return true;
  if (/archives\/category|boardlist|noticelist|gonggolist|gosilist|\/list\b/i.test(pathWithSearch)) return true;
  if (/bbs\.do|board\.do|notice\.do/i.test(pathWithSearch) && !hasDirectIdentifier(value)) return true;
  if (!hasDirectIdentifier(value) && keys.length > 0 && keys.every((key) => ['menuid', 'menuno', 'bbsid', 'pageindex', 'page', 'categoryid', 'searchcnd', 'searchwrd', 'searchcondition', 'searchkeyword'].includes(key))) {
    return true;
  }
  return false;
}

export function isDirectNoticeUrl(value = '') {
  if (!isUsableUrl(value)) return false;
  const urlType = classifyUrl(value);
  if (urlType === 'document') return true;
  if (urlType === 'homepage' || urlType === 'list' || urlType === 'invalid' || isLikelySearchUrl(value) || isLikelyLandingUrl(value)) return false;

  const pathWithSearch = `${new URL(String(value)).pathname}${new URL(String(value)).search}`.toLowerCase();
  if (hasDirectIdentifier(value)) return true;
  if (isEumUrl(value)) return !/list/i.test(pathWithSearch);
  return /(view|detail|read|gonggo|gosi|notice|bbsview|boardview)/i.test(pathWithSearch);
}

export function isDirectAttachmentUrl(value = '') {
  return classifyUrl(value) === 'document';
}

export function isDirectNoticePostUrl(value = '', metadata = {}) {
  if (!isUsableUrl(value)) return false;
  if (isEumUrl(value) || isDirectAttachmentUrl(value)) return false;
  if (classifyUrl(value) !== 'detail' || !isDirectNoticeUrl(value)) return false;

  const pathWithSearch = getPathWithSearch(value);
  const normalizedTitle = normalizeTitle(metadata.title);
  const normalizedNoticeNumber = normalizeNoticeNumber(metadata.noticeNumber);

  if (hasDirectIdentifier(value)) return true;
  if (normalizedNoticeNumber && pathWithSearch.includes(normalizedNoticeNumber)) return true;
  if (normalizedTitle) {
    const titleTokens = normalizedTitle.split(' ').filter((token) => token.length >= 2).slice(0, 3);
    if (titleTokens.length && titleTokens.some((token) => pathWithSearch.includes(token))) return true;
  }

  return /(view|detail|read|gonggo|gosi|notice|bbsview|boardview)/i.test(pathWithSearch);
}

export function isDirectDocumentUrl(value = '') {
  if (!isUsableUrl(value)) return false;
  const urlType = classifyUrl(value);
  if (urlType === 'document') return true;
  if (urlType === 'homepage' || urlType === 'list' || urlType === 'invalid' || urlType === 'source-detail') return false;
  if (isLikelyLandingUrl(value)) return false;

  const pathWithSearch = getPathWithSearch(value);
  if (hasDirectIdentifier(value)) return true;
  return /(view|detail|read|download|viewer|file|doc|pdf|hwp|hwpx|dataView|articleView|boardview|bbsview|gonggo|gosi|notice)/i.test(pathWithSearch);
}

export function isDirectArticleUrl(value = '') {
  if (!isUsableUrl(value)) return false;
  const urlType = classifyUrl(value);
  if (urlType === 'homepage' || urlType === 'list' || urlType === 'invalid' || urlType === 'document' || urlType === 'source-detail') return false;
  if (isLikelyLandingUrl(value)) return false;

  const pathWithSearch = getPathWithSearch(value);
  const lastSegment = getLastPathSegment(value);
  if (hasDirectIdentifier(value)) return true;
  if (/(article|articleview|newsview|story|view|detail|read|newsarticle)/i.test(pathWithSearch)) return true;

  const segments = new URL(String(value)).pathname.split('/').filter(Boolean);
  if (segments.length < 2) return false;
  if (['news', 'press', 'article', 'articles', 'section', 'category', 'tag', 'list'].includes(lastSegment)) return false;
  return lastSegment.length >= 8;
}

function getDirectLinkConfidence(url = '', kind = 'document') {
  if (!isUsableUrl(url)) return 'low';
  if (kind === 'article') {
    if (isDirectArticleUrl(url)) return hasDirectIdentifier(url) ? 'high' : 'medium';
    return 'low';
  }
  if (kind === 'document') {
    if (classifyUrl(url) === 'document') return 'high';
    if (isDirectDocumentUrl(url)) return hasDirectIdentifier(url) ? 'high' : 'medium';
    return 'low';
  }
  if (kind === 'notice') {
    if (classifyUrl(url) === 'document') return 'high';
    if (isDirectNoticeUrl(url)) return hasDirectIdentifier(url) ? 'high' : 'medium';
    return 'low';
  }
  return 'low';
}

export function resolveDirectLink(url = '', kind = 'document') {
  if (!isUsableUrl(url)) return null;
  const direct = kind === 'article'
    ? isDirectArticleUrl(url)
    : kind === 'notice'
      ? isDirectNoticeUrl(url)
      : isDirectDocumentUrl(url);

  if (!direct) return null;

  return {
    url,
    type: kind,
    confidence: getDirectLinkConfidence(url, kind),
  };
}

export function getPreferredNoticeActionLink(notice) {
  const directNoticeLink = notice?.directNoticeLink;
  if (directNoticeLink?.url && isDirectNoticePostUrl(directNoticeLink.url, notice)) {
    return {
      url: directNoticeLink.url,
      type: directNoticeLink.type || 'notice',
      label: notice?.hearingType === '인터넷 주민의견청취'
        ? '원문·제출처 확인'
        : '원문 공고',
    };
  }

  if (notice?.sourceDetailLink?.url && isDirectNoticeUrl(notice.sourceDetailLink.url)) {
    return {
      url: notice.sourceDetailLink.url,
      type: 'source-detail',
      label: notice.sourceDetailLink.buttonLabel || '출처 보기',
    };
  }

  return null;
}

function normalizeNoticeNumber(value = '') {
  return String(value).replace(/\s+/g, '').replace(/[()]/g, '').toLowerCase();
}

function normalizeOrganization(value = '') {
  return String(value)
    .replace(/특별자치도|특별자치시|특별시|광역시|경기도|경상북도|경상남도|전라남도|전북특별자치도|충청남도|충청북도|강원특별자치도/g, '')
    .replace(/시청|군청|구청|시장|군수|구청장|도시계획국|도시정비과|도시관리과|도시계획과|경제자유구역청/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function normalizeTitle(value = '') {
  return String(value)
    .replace(/\[[^\]]+\]|\([^)]+\)|<[^>]+>/g, ' ')
    .replace(/공고|주민공람|주민열람|주민의견청취|인터넷|결정안|변경안|고시공고/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function scoreOfficialCandidate(notice, enrichment, item) {
  let score = item.confidence ?? 0;
  const noticeNumber = normalizeNoticeNumber(enrichment.noticeNumber || notice.noticeNumber);
  const candidateNumber = normalizeNoticeNumber(item.noticeNumber);
  if (noticeNumber && candidateNumber && noticeNumber === candidateNumber) score += 0.18;

  const noticeOrg = normalizeOrganization(notice.organization);
  const candidateOrg = normalizeOrganization(item.organization || item.sourceSite);
  if (noticeOrg && candidateOrg && (candidateOrg.includes(noticeOrg) || noticeOrg.includes(candidateOrg))) score += 0.08;

  const noticeTitle = normalizeTitle(enrichment.normalizedTitle || notice.title);
  const candidateTitle = normalizeTitle(item.title);
  if (noticeTitle && candidateTitle && (candidateTitle.includes(noticeTitle) || noticeTitle.includes(candidateTitle))) score += 0.06;

  if (notice.postedDate && item.postedDate && notice.postedDate === item.postedDate) score += 0.05;

  const urlType = classifyUrl(item.url);
  if (urlType === 'document') score += 0.05;
  if (urlType === 'homepage') score -= 0.35;
  if (urlType === 'source-detail') score -= 0.25;

  return Math.max(0, Math.min(score, 1));
}

function getLinkConfidenceTier(score = 0) {
  if (score >= 0.9) return 'high';
  if (score >= 0.75) return 'medium';
  return 'low';
}

function isLikelyAttachment(item) {
  if (!isUsableUrl(item?.url)) return false;
  const label = `${item.label || item.title || ''}`.toLowerCase();
  const normalizedUrl = normalizeUrl(item.url).toLowerCase();
  if (label.includes('대표 페이지')) return false;
  if (/\.(pdf|hwp|hwpx|doc|docx|xls|xlsx|zip)(\?|$)/i.test(normalizedUrl)) return true;
  return /(첨부|공고문|도면|문서|파일|pdf|hwp|hwpx)/i.test(label) && isDirectNoticeUrl(item.url);
}

function buildSourceDetailLink(notice) {
  const sourceUrl = notice.sourceDetailUrl || notice.sourceUrl;
  if (!isUsableUrl(sourceUrl)) return null;
  if (!isEumUrl(sourceUrl) && !isDirectNoticeUrl(sourceUrl)) return null;

  return {
    title: isEumUrl(sourceUrl) ? '토지이음에서 보기' : '기준 출처에서 보기',
    url: sourceUrl,
    description: isEumUrl(sourceUrl)
      ? '토지이음 상세 화면에서 공고 메타데이터와 열람기간을 다시 확인합니다.'
      : '수집 기준이 된 출처 화면입니다. 실제 제출과 법적 효력 판단은 공식 공고 원문을 우선 확인해야 합니다.',
    sourceSite: notice.sourceMeta?.label || notice.rawSourceName || '기준 출처',
    buttonLabel: isEumUrl(sourceUrl) ? '토지이음에서 보기' : '출처 보기',
  };
}

function deriveOfficialNotices(notice, enrichment) {
  return dedupeByUrl(
    normalizeList(enrichment.officialNotices)
      .filter((item) => isUsableUrl(item?.url))
      .map((item) => ({
        ...item,
        verifiedScore: scoreOfficialCandidate(notice, enrichment, item),
      }))
      .filter((item) => classifyUrl(item.url) === 'detail' || classifyUrl(item.url) === 'document')
      .filter((item) => getLinkConfidenceTier(item.verifiedScore) === 'high')
      .sort((a, b) => b.verifiedScore - a.verifiedScore)
      .map((item, index) => ({
        id: item.id || `${notice.id}-official-${index + 1}`,
        ...item,
        confidence: item.verifiedScore,
      }))
  );
}

function getOfficialReviewState(notice, enrichment = {}) {
  const candidates = normalizeList(enrichment.officialNotices)
    .filter((item) => isUsableUrl(item?.url))
    .map((item) => ({
      ...item,
      verifiedScore: scoreOfficialCandidate(notice, enrichment, item),
      urlType: classifyUrl(item.url),
    }));

  if (!candidates.length) {
    return {
      pending: false,
      reason: '',
      confidence: 'low',
    };
  }

  const best = candidates.sort((a, b) => b.verifiedScore - a.verifiedScore)[0];
  const confidence = getLinkConfidenceTier(best.verifiedScore);

  if ((best.urlType === 'homepage' || best.urlType === 'source-detail') && confidence !== 'low') {
    return {
      pending: true,
      reason: '현재 연결된 후보는 기관 대표 페이지 수준이어서 공식 공고 원문으로 확정하지 않았습니다.',
      confidence: 'medium',
    };
  }

  if (best.urlType === 'detail' || best.urlType === 'document') {
    return {
      pending: confidence !== 'high',
      reason: confidence === 'medium'
        ? '기관명·제목·날짜는 대체로 맞지만, 공고번호까지 확인된 링크는 아닙니다.'
        : '',
      confidence,
    };
  }

  return {
    pending: confidence !== 'low',
    reason: '공식 원문 후보를 검토 중입니다.',
    confidence,
  };
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

function buildDirectNoticeLink({ officialNotices, attachmentLinks, sourceDetailLink }) {
  const officialDetail = officialNotices.find((item) => isDirectNoticePostUrl(item.url, item));
  if (officialDetail) {
    return {
      url: officialDetail.url,
      type: 'official-detail',
      label: officialDetail.sourceSite || '공식 게시판',
    };
  }

  return null;
}

function derivePressReleases(enrichment) {
  return normalizeList(enrichment.officialPressReleases)
    .map((item) => {
      const resolvedLink = resolveDirectLink(item?.url, 'document');
      return {
        ...item,
        directUrl: resolvedLink?.url || '',
        linkConfidence: resolvedLink?.confidence || 'low',
      };
    });
}

function deriveRelatedNews(enrichment) {
  return normalizeList(enrichment.relatedNews).map((item, index) => ({
    id: item.id || `news-${index + 1}`,
    title: item.title,
    publisher: compactPublisher(item.publisher),
    publishedAt: item.publishedAt,
    url: item.url,
    directUrl: resolveDirectLink(item.url, 'article')?.url || '',
    snippet: item.snippet,
    relevanceScore: item.relevanceScore ?? 0.5,
    linkConfidence: resolveDirectLink(item.url, 'article')?.confidence || 'low',
    sourceType: item.sourceType || 'news',
  }));
}

function scoreFollowupCandidate(notice, item) {
  let score = 0.84;
  if (normalizeNoticeNumber(item.noticeNumber) && normalizeNoticeNumber(item.noticeNumber) === normalizeNoticeNumber(notice.noticeNumber)) {
    score += 0.08;
  }
  if (item.relatedNoticeIds?.includes?.(notice.id)) score += 0.06;
  if (classifyUrl(item.sourceUrl) === 'homepage') score -= 0.38;
  if (classifyUrl(item.sourceUrl) === 'source-detail') score -= 0.28;

  const text = `${item.summary || ''} ${item.status || ''} ${item.title || ''}`.toLowerCase();
  if (/예시|예상 후속|후속 추적/.test(text)) score -= 0.34;

  const noticeOrg = normalizeOrganization(notice.organization);
  const itemOrg = normalizeOrganization(item.organization);
  if (noticeOrg && itemOrg && (noticeOrg.includes(itemOrg) || itemOrg.includes(noticeOrg))) score += 0.04;

  return Math.max(0, Math.min(score, 1));
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
      confidence: scoreFollowupCandidate(notice, item),
      summary: item.summary,
      status: item.status,
    }));
}

export function mergeNoticeConnections(notice, enrichment = {}, relatedGosi = []) {
  const officialNotices = deriveOfficialNotices(notice, enrichment);
  const primaryOfficialPost = officialNotices.find((item) => isDirectNoticePostUrl(item.url, { ...notice, ...item })) || null;
  const officialReviewState = getOfficialReviewState(notice, enrichment);
  const tentativeSourceDetailLink = buildSourceDetailLink(notice);
  const sourceDetailLink = tentativeSourceDetailLink
    && !officialNotices.some((item) => normalizeUrl(item.url) === normalizeUrl(tentativeSourceDetailLink.url))
    ? tentativeSourceDetailLink
    : null;
  const attachmentLinks = deriveAttachmentLinks(notice, officialNotices, sourceDetailLink);
  const directNoticeLink = buildDirectNoticeLink({ officialNotices, attachmentLinks, sourceDetailLink });
  const officialPressReleases = derivePressReleases(enrichment);
  const relatedNews = deriveRelatedNews(enrichment);
  const relatedFollowups = deriveFollowups(notice, relatedGosi);

  return {
    normalizedTitle: enrichment.normalizedTitle || notice.title,
    noticeNumber: enrichment.noticeNumber || notice.noticeNumber || '',
    officialNotices,
    officialNoticeReviewPending: officialReviewState.pending,
    officialNoticeReviewReason: officialReviewState.reason,
    sourceDetailLink,
    sourceDetailUrl: sourceDetailLink?.url || '',
    officialNoticeUrl: primaryOfficialPost?.url || '',
    officialNoticeLabel: primaryOfficialPost?.sourceSite || '',
    directNoticeLink,
    directNoticeUrl: directNoticeLink?.url || '',
    directNoticeType: directNoticeLink?.type || '',
    attachmentLinks,
    attachmentUrls: attachmentLinks.map((item) => item.url),
    linkConfidence: officialNotices[0] ? 'high' : officialReviewState.confidence,
    linkVerifiedAt: notice.lastVerifiedAt,
    hasOfficialNotice: Boolean(officialNotices.length),
    hasAttachment: Boolean(attachmentLinks.length),
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
