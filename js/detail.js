import { getNoticeById, getRelatedNotices, loadNotices } from './notices.js';

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
    baseLines[0] || notice.shortSummary,
    notice.impactSummary,
    notice.whoShouldCare,
  ].filter(Boolean).slice(0, 3);
}

function renderNotice(notice, relatedNotices) {
  document.title = `${notice.title} | 주민공람 레이더`;
  setMeta('meta[name="description"]', `${notice.shortSummary} 실제 제출은 원문 공고 기준으로 진행해야 합니다.`);
  setMeta('meta[property="og:title"]', document.title);
  setMeta('meta[property="og:description"]', notice.shortSummary);
  setCanonical(`https://goyang.pages.dev/notice.html?id=${encodeURIComponent(notice.id)}`);

  const title = document.getElementById('notice-title');
  const breadcrumbCurrent = document.getElementById('breadcrumb-current');
  const summary = document.getElementById('notice-summary');
  const meta = document.getElementById('notice-meta-badges');
  const regionMeta = document.getElementById('notice-region-meta');
  const periodMeta = document.getElementById('notice-period-meta');
  const lastVerified = document.getElementById('last-verified');
  const overview = document.getElementById('notice-overview');
  const details = document.getElementById('notice-details');
  const actions = document.getElementById('notice-actions');
  const relatedContainer = document.getElementById('related-notices');

  if (title) title.textContent = notice.title;
  if (breadcrumbCurrent) breadcrumbCurrent.textContent = notice.title;
  if (summary) summary.textContent = notice.shortSummary;
  if (regionMeta) regionMeta.textContent = `지역: ${notice.sido} ${notice.sigungu} ${notice.legalDong}`;
  if (periodMeta) periodMeta.textContent = `열람기간: ${notice.hearingStartDateText} - ${notice.hearingEndDateText}`;
  if (lastVerified) lastVerified.textContent = `마지막 확인: ${notice.lastVerifiedAtText}`;

  if (meta) {
    meta.innerHTML = `
      <span class="status-badge ${notice.statusKey}">${notice.statusLabel}</span>
      <span class="badge">${notice.organization}</span>
      <span class="badge">${notice.hearingType}</span>
    `;
  }

  if (overview) {
    overview.innerHTML = `
      <article class="summary-card">
        <h4>한줄 요약</h4>
        <p>${notice.shortSummary}</p>
      </article>
      <article class="summary-card">
        <h4>쉬운 설명 3줄</h4>
        <ul class="detail-list">${buildSummaryLines(notice).map((line) => `<li>${line}</li>`).join('')}</ul>
      </article>
      <article class="summary-card">
        <h4>왜 봐야 하나요?</h4>
        <p>${notice.whyPublicReview}</p>
      </article>
    `;
  }

  if (details) {
    details.innerHTML = [
      renderInfoRow('공고기관', notice.organization),
      renderInfoRow('지역', `${notice.sido} ${notice.sigungu} ${notice.legalDong}`),
      renderInfoRow('공고일', notice.postedDateText),
      renderInfoRow('열람기간', `${notice.hearingStartDateText} - ${notice.hearingEndDateText}`),
      renderInfoRow('현재 상태', notice.statusLabel),
      renderInfoRow('한줄 요약', notice.shortSummary),
      renderInfoRow('의견 제출 방법', notice.submissionMethod),
      renderInfoRow('문의처', notice.contact),
    ].join('');
  }

  if (actions) {
    actions.innerHTML = `
      <article class="mini-card">
        <strong>원문 공고</strong>
        <p>실제 기준 문서는 원문 공고문과 첨부도서입니다.</p>
        <a class="resource-link" href="${notice.sourceUrl}" target="_blank" rel="noopener noreferrer">원문 공고 보기</a>
      </article>
      <article class="mini-card">
        <strong>공식 제출 안내</strong>
        <p>${notice.submissionMethod}</p>
        <p>${notice.submissionPlace || notice.viewLocation || '원문 공고문에 적힌 열람 장소와 제출처를 확인하세요.'}</p>
      </article>
      <article class="mini-card">
        <strong>문의처</strong>
        <p>${notice.contact}</p>
        <p>접수 시각과 방식은 공고문 원문 기준으로 다시 확인해야 합니다.</p>
      </article>
    `;
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
