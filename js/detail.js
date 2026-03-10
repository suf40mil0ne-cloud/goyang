import { createNoticeMap } from './map.js';
import { getNoticeById, getRelatedGosiForNotice, getRelatedNotices, loadGuides, loadNotices, loadRelatedGosi } from './notices.js';

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

  const faqScript = document.createElement('script');
  faqScript.type = 'application/ld+json';
  faqScript.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: '무엇이 바뀌는 공고인가요?',
        acceptedAnswer: { '@type': 'Answer', text: notice.aiSummary },
      },
      {
        '@type': 'Question',
        name: '언제까지 무엇을 해야 하나요?',
        acceptedAnswer: { '@type': 'Answer', text: `${notice.submissionDeadlineText}. 제출 방법은 ${notice.submissionMethod}입니다.` },
      },
      {
        '@type': 'Question',
        name: '이 사이트는 공식 제출처인가요?',
        acceptedAnswer: { '@type': 'Answer', text: '아닙니다. 실제 의견 제출은 원문 공고문에 적힌 공식 절차를 따라야 합니다.' },
      },
    ],
  });
  document.head.appendChild(faqScript);
}

function renderNotice(notice, relatedNotices, relatedGosi, guides) {
  document.title = `${notice.title} | 주민공람 레이더`;
  setMeta('meta[name="description"]', `${notice.shortSummary} ${guides?.officialDisclaimerCopies?.[0] || '원문 기준 최종 확인 필요'}`);
  setMeta('meta[property="og:title"]', document.title);
  setMeta('meta[property="og:description"]', notice.shortSummary);
  setCanonical(`https://goyang.pages.dev/notice.html?id=${encodeURIComponent(notice.id)}`);

  const title = document.getElementById('notice-title');
  const summary = document.getElementById('notice-summary');
  const meta = document.getElementById('notice-meta-badges');
  const overview = document.getElementById('notice-overview');
  const details = document.getElementById('notice-details');
  const attachments = document.getElementById('notice-attachments');
  const relatedContainer = document.getElementById('related-notices');
  const faq = document.getElementById('notice-faq');
  const breadcrumbCurrent = document.getElementById('breadcrumb-current');
  const lastVerified = document.getElementById('last-verified');
  const lastFetched = document.getElementById('last-fetched');
  const locationConfidence = document.getElementById('location-confidence');
  const mapNote = document.getElementById('detail-map-note');
  const timelineLink = document.getElementById('timeline-link');
  const relatedGosiContainer = document.getElementById('related-gosi');

  if (title) title.textContent = notice.title;
  if (breadcrumbCurrent) breadcrumbCurrent.textContent = notice.title;
  if (summary) summary.textContent = notice.aiSummary;
  if (lastVerified) lastVerified.textContent = `마지막 확인: ${notice.lastVerifiedAtText}`;
  if (lastFetched) lastFetched.textContent = `데이터 수집: ${notice.lastFetchedAtText}`;
  if (locationConfidence) locationConfidence.textContent = notice.locationConfidenceMeta.label;
  if (mapNote) mapNote.textContent = notice.locationConfidenceMeta.description;
  if (timelineLink) timelineLink.href = `timeline.html?key=${encodeURIComponent(notice.timelineKey)}`;

  if (meta) {
    meta.innerHTML = `
      <span class="status-badge ${notice.statusKey}">${notice.statusLabel}</span>
      <span class="badge">${notice.projectType}</span>
      <span class="badge">${notice.hearingType}</span>
      <span class="badge">${notice.organization}</span>
    `;
  }

  if (overview) {
    overview.innerHTML = `
      <div class="summary-grid">
        <article class="summary-card">
          <h4>AI 한줄 요약</h4>
          <p>${notice.shortSummary}</p>
        </article>
        <article class="summary-card">
          <h4>AI 3줄 요약</h4>
          <ul class="detail-list">${notice.aiSummaryLines.map((line) => `<li>${line}</li>`).join('')}</ul>
        </article>
        <article class="summary-card">
          <h4>왜 주민의견청취를 하나요?</h4>
          <p>${notice.whyPublicReview}</p>
        </article>
      </div>
      <div class="summary-grid">
        <article class="summary-card">
          <h4>무엇이 바뀌려는 것인지</h4>
          <p>${notice.changeSummary}</p>
        </article>
        <article class="summary-card">
          <h4>생활영향 가능성</h4>
          <p>${notice.impactSummary}</p>
        </article>
        <article class="summary-card">
          <h4>어떤 사람이 특히 봐야 하나요?</h4>
          <p>${notice.whoShouldCare}</p>
        </article>
      </div>
    `;
  }

  if (details) {
    details.innerHTML = [
      renderInfoRow('공고기관', notice.organization),
      renderInfoRow('공고 유형', notice.projectType),
      renderInfoRow('주민의견 유형', notice.hearingType),
      renderInfoRow('지역', `${notice.sido} ${notice.sigungu} ${notice.legalDong}`),
      renderInfoRow('행정코드', notice.adminCode || '미기재'),
      renderInfoRow('공고일', notice.postedDateText),
      renderInfoRow('열람 시작일', notice.hearingStartDateText),
      renderInfoRow('열람 종료일', notice.hearingEndDateText),
      renderInfoRow('현재 상태', notice.statusLabel),
      renderInfoRow('의견 제출 기간', notice.submissionDeadlineText),
      renderInfoRow('의견 제출 방법', notice.submissionMethod),
      renderInfoRow('제출 장소', notice.submissionPlace || notice.viewLocation),
      renderInfoRow('열람 장소', notice.viewLocation || notice.submissionPlace),
      renderInfoRow('문의처', notice.contact),
      renderInfoRow('원문 공고', `<a href="${notice.sourceUrl}" target="_blank" rel="noopener noreferrer">${notice.sourceMeta.label} 원문 바로가기</a>`),
    ].join('');
  }

  if (attachments) {
    attachments.innerHTML = notice.attachments.length
      ? notice.attachments.map((item) => `
          <li>
            <strong>${item.label}</strong>
            <p><a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.url}</a></p>
          </li>
        `).join('')
      : '<li><p>첨부문서 링크가 아직 정리되지 않았습니다. 원문 공고 게시판을 확인해 주세요.</p></li>';
  }

  if (relatedGosiContainer) {
    relatedGosiContainer.innerHTML = relatedGosi.length
      ? relatedGosi.map((item) => `
          <article class="mini-card">
            <strong>${item.title}</strong>
            <p>${item.stageType} · ${item.postedDate} · ${item.organization}</p>
            <a class="text-link" href="${item.sourceUrl}" target="_blank" rel="noopener noreferrer">원문 확인</a>
          </article>
        `).join('')
      : '<div class="empty-state">연결된 후속 고시 예시가 아직 없습니다.</div>';
  }

  if (relatedContainer) {
    relatedContainer.innerHTML = relatedNotices.length
      ? relatedNotices.map((item) => `
          <article class="mini-card">
            <strong>${item.title}</strong>
            <p>${item.sigungu} ${item.legalDong} · ${item.statusLabel}</p>
            <div class="button-row compact-actions">
              <a class="text-link" href="notice.html?id=${encodeURIComponent(item.id)}">관련 공고 보기</a>
              <a class="text-link" href="timeline.html?key=${encodeURIComponent(item.timelineKey)}">후속 추적</a>
            </div>
          </article>
        `).join('')
      : '<div class="empty-state">연결된 관련 공고가 없습니다.</div>';
  }

  if (faq) {
    faq.innerHTML = `
      <article class="faq-item">
        <h4>무엇이 바뀌는 공고인가요?</h4>
        <p>${notice.aiSummary}</p>
      </article>
      <article class="faq-item">
        <h4>언제까지 무엇을 해야 하나요?</h4>
        <p>${notice.submissionDeadlineText}. 제출 방법은 ${notice.submissionMethod}입니다.</p>
      </article>
      <article class="faq-item">
        <h4>공람 이후엔 무엇을 보면 되나요?</h4>
        <p>결정고시, 실시계획인가, 추가 고시정보가 이어지는지 타임라인과 원문 게시판을 함께 보세요.</p>
      </article>
      <article class="faq-item">
        <h4>이 사이트가 공식 제출처인가요?</h4>
        <p>${guides?.officialDisclaimerCopies?.[0] || '이 사이트는 공식 제출처가 아닙니다.'}</p>
      </article>
    `;
  }

  createNoticeMap({
    elementId: 'detail-map',
    notices: [notice],
    center: { lat: notice.latitude, lng: notice.longitude },
    zoom: 13,
    selectedId: notice.id,
  });

  injectStructuredData(notice);
}

export async function initDetailPage() {
  setCurrentYear();
  const id = getParam('id');
  const [notice, notices, guides, relatedGosi] = await Promise.all([
    getNoticeById(id),
    loadNotices(),
    loadGuides(),
    loadRelatedGosi(),
  ]);

  if (!notice) {
    const container = document.getElementById('notice-main');
    if (container) {
      container.innerHTML = '<div class="page-card"><h2>공고를 찾지 못했습니다.</h2><p>목록에서 다시 선택하거나 지역 허브에서 다른 공고를 확인해 주세요.</p></div>';
    }
    return;
  }

  renderNotice(notice, getRelatedNotices(notices, notice, 4), getRelatedGosiForNotice(relatedGosi, notice), guides);
}
