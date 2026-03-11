import { getNoticeById, getRelatedNotices, loadNotices } from './notices.js';
import { getRegionHref } from './regions.js';

function setCurrentYear() {
  document.querySelectorAll('[data-current-year]').forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name) || '';
}

function setMeta(selector, content) {
  const element = document.querySelector(selector);
  if (element) element.setAttribute('content', content);
}

function setCanonical(url) {
  const link = document.querySelector('link[rel="canonical"]');
  if (link) link.setAttribute('href', url);
}

function renderInfoRow(label, value) {
  return `<div class="info-row"><strong>${label}</strong><span>${value}</span></div>`;
}

function getNoticeRegionLabel(notice) {
  const base = notice.sigungu === notice.sido ? notice.sido : `${notice.sido} ${notice.sigungu}`;
  return `${base} ${notice.legalDong || ''}`.trim();
}

function injectStructuredData(notice) {
  const articleScript = document.createElement('script');
  articleScript.type = 'application/ld+json';
  articleScript.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: notice.title,
    description: notice.shortSummary,
    datePublished: notice.postedDate,
    dateModified: notice.lastVerifiedAt,
    author: { '@type': 'Organization', name: '주민공람 레이더' },
    mainEntityOfPage: `https://goyang.pages.dev/notice.html?id=${notice.id}`,
  });
  document.head.appendChild(articleScript);
}

function buildSummaryLines(notice) {
  const baseLines = notice.aiSummaryLines?.length ? notice.aiSummaryLines : [notice.aiSummary];
  return [
    baseLines[0] || notice.easySummary,
    notice.whoShouldCare ? `누가 보면 좋은가: ${notice.whoShouldCare}` : '',
    notice.submissionDeadlineText ? `언제까지 확인해야 하나: ${notice.submissionDeadlineText}` : '',
  ].filter(Boolean).slice(0, 3);
}

function renderLinkedSourceCard(item, typeLabel, buttonLabel = '바로가기') {
  return `
    <article class="source-card">
      <div class="source-card-head">
        <strong>${item.title}</strong>
        <span class="subtle-label">${typeLabel}</span>
      </div>
      <p>${item.organization || item.publisher || item.sourceSite || ''}</p>
      <div class="meta-line">
        ${item.noticeNumber ? `<span>${item.noticeNumber}</span>` : ''}
        ${item.postedDate ? `<span>${item.postedDate}</span>` : ''}
        ${item.publishedAt ? `<span>${item.publishedAt}</span>` : ''}
        ${item.confidence ? `<span>연결도 ${Math.round(item.confidence * 100)}%</span>` : ''}
        ${item.relevanceScore ? `<span>관련도 ${Math.round(item.relevanceScore * 100)}%</span>` : ''}
      </div>
      ${item.snippet ? `<p>${item.snippet}</p>` : ''}
      <a class="resource-link" href="${item.url}" target="_blank" rel="noopener noreferrer">${buttonLabel}</a>
    </article>
  `;
}

function renderPrimaryActionCard({ title, label, description, url, buttonLabel }) {
  return `
    <article class="source-card source-card-compact">
      <div class="source-card-head">
        <strong>${title}</strong>
        <span class="subtle-label">${label}</span>
      </div>
      <p>${description}</p>
      <a class="resource-link" href="${url}" target="_blank" rel="noopener noreferrer">${buttonLabel}</a>
    </article>
  `;
}

function renderNotice(notice, relatedNotices) {
  document.title = `${notice.title} | 주민공람 레이더`;
  setMeta('meta[name="description"]', `${notice.easySummary} 실제 제출은 원문 공고 기준으로 진행해야 합니다.`);
  setMeta('meta[property="og:title"]', document.title);
  setMeta('meta[property="og:description"]', notice.easySummary);
  setCanonical(`https://goyang.pages.dev/notice.html?id=${encodeURIComponent(notice.id)}`);

  const title = document.getElementById('notice-title');
  const breadcrumbCurrent = document.getElementById('breadcrumb-current');
  const breadcrumbSido = document.getElementById('breadcrumb-sido');
  const breadcrumbSigungu = document.getElementById('breadcrumb-sigungu');
  const summary = document.getElementById('notice-summary');
  const meta = document.getElementById('notice-meta-badges');
  const regionMeta = document.getElementById('notice-region-meta');
  const periodMeta = document.getElementById('notice-period-meta');
  const lastVerified = document.getElementById('last-verified');
  const coverageSummary = document.getElementById('source-coverage-summary');
  const overview = document.getElementById('notice-overview');
  const details = document.getElementById('notice-details');
  const actions = document.getElementById('notice-actions');
  const officialNoticeSection = document.getElementById('official-notice-section');
  const officialNoticeList = document.getElementById('official-notice-list');
  const officialPressList = document.getElementById('official-press-list');
  const relatedNewsList = document.getElementById('related-news-list');
  const impactNotes = document.getElementById('impact-notes');
  const followupList = document.getElementById('followup-list');
  const relatedContainer = document.getElementById('related-notices');

  if (title) title.textContent = notice.title;
  if (breadcrumbCurrent) breadcrumbCurrent.textContent = notice.title;
  if (breadcrumbSido) {
    breadcrumbSido.textContent = notice.sido;
    breadcrumbSido.href = getRegionHref({ scope: 'sido', sido: notice.sido });
  }
  if (breadcrumbSigungu) {
    breadcrumbSigungu.textContent = notice.sigungu;
    breadcrumbSigungu.href = getRegionHref({ scope: 'sigungu', sido: notice.sido, sigungu: notice.sigungu });
  }
  if (summary) summary.textContent = notice.easySummary;
  if (regionMeta) regionMeta.textContent = `지역: ${getNoticeRegionLabel(notice)}`;
  if (periodMeta) periodMeta.textContent = `열람기간: ${notice.hearingStartDateText} - ${notice.hearingEndDateText}`;
  if (lastVerified) lastVerified.textContent = `마지막 확인: ${notice.lastVerifiedAtText}`;
  if (coverageSummary) {
    coverageSummary.textContent = `공식 원문 ${notice.sourceCoverage.officialCount}건 · 설명자료 ${notice.sourceCoverage.pressCount}건 · 기사 ${notice.sourceCoverage.newsCount}건`;
  }

  if (meta) {
    meta.innerHTML = `
      <span class="status-badge ${notice.statusKey}">${notice.statusBadgeText}</span>
      <span class="badge">${notice.organization}</span>
      <span class="badge">${notice.matchingConfidenceMeta.label}</span>
      <span class="badge">${notice.locationConfidenceMeta.label}</span>
    `;
  }

  if (overview) {
    overview.innerHTML = `
      <div class="summary-grid">
        <article class="summary-card">
          <h4>한줄 요약</h4>
          <p>${notice.easySummary}</p>
        </article>
        <article class="summary-card">
          <h4>쉬운 설명 3줄</h4>
          <ul class="detail-list">${buildSummaryLines(notice).map((line) => `<li>${line}</li>`).join('')}</ul>
        </article>
        <article class="summary-card">
          <h4>왜 이 공고가 나왔나</h4>
          <p>${notice.whyPublicReview}</p>
        </article>
      </div>
    `;
  }

  if (details) {
    details.innerHTML = [
      renderInfoRow('공고기관', notice.organization),
      renderInfoRow('공고번호', notice.noticeNumber || '원문 확인 필요'),
      renderInfoRow('지역', getNoticeRegionLabel(notice)),
      renderInfoRow('공고일', notice.postedDateText),
      renderInfoRow('열람기간', `${notice.hearingStartDateText} - ${notice.hearingEndDateText}`),
      renderInfoRow('현재 상태', notice.statusLabel),
      renderInfoRow('한줄 요약', notice.easySummary),
      renderInfoRow('온라인 제출 여부', notice.onlineSubmissionMeta.label),
      renderInfoRow('의견 제출 방법', notice.submissionMethod),
      renderInfoRow('제출 장소', notice.submissionPlace || notice.viewLocation || '원문 공고문 확인'),
      renderInfoRow('문의처', notice.contact),
      renderInfoRow('최종 확인일', notice.lastVerifiedAtText),
    ].join('');
  }

  if (actions) {
    const primaryLinks = [];
    const primaryOfficial = notice.officialNotices[0];
    const additionalOfficialNotices = notice.officialNotices.slice(1);

    if (primaryOfficial) {
      primaryLinks.push(renderPrimaryActionCard({
        title: '공식 공고 원문',
        label: primaryOfficial.sourceSite || primaryOfficial.matchType || '공식 게시판',
        description: '지자체 고시공고 또는 공식 게시판에서 연결한 원문입니다. 실제 제출과 법적 효력 판단은 이 링크를 우선 확인해야 합니다.',
        url: primaryOfficial.url,
        buttonLabel: '공식 공고 원문 열기',
      }));
    } else if (notice.officialNoticeReviewPending) {
      primaryLinks.push(`
        <article class="source-card source-card-compact">
          <div class="source-card-head">
            <strong>공식 공고 원문</strong>
            <span class="subtle-label">확인 중</span>
          </div>
          <p>${notice.officialNoticeReviewReason || '현재 공고번호 또는 연결 신뢰도가 충분히 확인된 공식 원문 링크를 검수 중입니다. 아래 기준 출처와 제출 안내를 먼저 확인해 주세요.'}</p>
        </article>
      `);
    }

    notice.attachmentLinks.forEach((attachment) => {
      primaryLinks.push(renderPrimaryActionCard({
        title: '첨부 공고문',
        label: attachment.fileLabel || '첨부 문서',
        description: '공식 원문에 연결된 첨부 문서입니다. PDF, HWP 등 실제 문서 파일을 바로 열 수 있는 경우에만 표시합니다.',
        url: attachment.url,
        buttonLabel: '첨부 공고문 열기',
      }));
    });

    if (notice.sourceDetailLink) {
      primaryLinks.push(renderPrimaryActionCard({
        title: notice.sourceDetailLink.title,
        label: notice.sourceDetailLink.sourceSite,
        description: notice.sourceDetailLink.description,
        url: notice.sourceDetailLink.url,
        buttonLabel: notice.sourceDetailLink.buttonLabel,
      }));
    }

    primaryLinks.push(`
      <article class="source-card source-card-compact">
        <div class="source-card-head">
          <strong>의견 제출 안내</strong>
          <span class="subtle-label">${notice.onlineSubmissionMeta.label}</span>
        </div>
        <p>${notice.submissionMethod}</p>
        <p>${notice.submissionPlace || notice.viewLocation || '원문 공고문에 적힌 제출처를 확인하세요.'}</p>
        <p>${notice.onlineSubmissionMeta.description}</p>
      </article>
    `);

    actions.innerHTML = primaryLinks.join('');

    if (officialNoticeSection) {
      officialNoticeSection.hidden = !additionalOfficialNotices.length;
    }

    if (officialNoticeList) {
      officialNoticeList.innerHTML = additionalOfficialNotices.length
        ? additionalOfficialNotices.map((item) => renderLinkedSourceCard(item, item.matchType, '공식 공고 보기')).join('')
        : '';
    }
  }

  if (officialPressList) {
    officialPressList.innerHTML = notice.officialPressReleases.length
      ? notice.officialPressReleases.map((item) => renderLinkedSourceCard(item, '공식 설명자료', '자료 보기')).join('')
      : '<div class="empty-state">연결된 지자체 설명자료가 아직 없습니다.</div>';
  }

  if (relatedNewsList) {
    relatedNewsList.innerHTML = notice.relatedNews.length
      ? notice.relatedNews.map((item) => renderLinkedSourceCard(item, item.publisher, '기사 보기')).join('')
      : '<div class="empty-state">연결된 관련 기사가 아직 없습니다.</div>';
  }

  if (impactNotes) {
    impactNotes.innerHTML = `
      <article class="mini-card">
        <strong>생활영향 해설</strong>
        <p>${notice.impactSummary}</p>
      </article>
      <article class="mini-card">
        <strong>특히 보면 좋은 사람</strong>
        <p>${notice.whoShouldCare}</p>
      </article>
      <article class="mini-card">
        <strong>위치와 자료 신뢰도</strong>
        <p>${notice.locationConfidenceMeta.description}</p>
        <p>${notice.matchingConfidenceMeta.label}. 공식 원문과 지자체 자료를 함께 확인하는 것이 안전합니다.</p>
      </article>
    `;
  }

  if (followupList) {
    followupList.innerHTML = notice.relatedFollowups.length
      ? notice.relatedFollowups.map((item) => `
          <article class="mini-card">
            <strong>${item.title}</strong>
            <p>${item.stageType} · ${item.postedDate} · ${item.organization}</p>
            <a class="text-link" href="${item.url}" target="_blank" rel="noopener noreferrer">후속 문서 보기</a>
          </article>
        `).join('')
      : '<div class="empty-state">현재 연결된 후속 절차 문서는 없습니다.</div>';
  }

  if (relatedContainer) {
    relatedContainer.innerHTML = relatedNotices.length
      ? relatedNotices.map((item) => `
          <article class="mini-card">
            <strong>${item.title}</strong>
            <p>${item.sigungu} ${item.legalDong} · ${item.statusLabel}</p>
            <a class="text-link" href="notice.html?id=${encodeURIComponent(item.id)}">공고 보기</a>
          </article>
        `).join('')
      : '<div class="empty-state">같은 지역의 다른 공고가 아직 없습니다.</div>';
  }

  injectStructuredData(notice);
}

export async function initDetailPage() {
  setCurrentYear();
  const id = getParam('id');
  const [notice, notices] = await Promise.all([
    getNoticeById(id),
    loadNotices(),
  ]);

  if (!notice) {
    const container = document.getElementById('notice-main');
    if (container) {
      container.innerHTML = '<div class="page-card"><h2>공고를 찾지 못했습니다.</h2><p>홈으로 돌아가 다른 공고를 선택해 주세요.</p></div>';
    }
    return;
  }

  renderNotice(notice, getRelatedNotices(notices, notice, 3));
}
