import { getTimelineEntries, getTimelineBundle, loadGuides } from './notices.js';

function setCurrentYear() {
  document.querySelectorAll('[data-current-year]').forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name) || '';
}

function humanizeKey(key) {
  return key
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function initTimelinePage() {
  setCurrentYear();
  const key = getParam('key') || 'magok-district-plan';
  const [bundle, guides] = await Promise.all([getTimelineBundle(key), loadGuides()]);
  const entries = getTimelineEntries(bundle.notices, bundle.relatedGosi, key);
  const title = document.getElementById('timeline-title');
  const summary = document.getElementById('timeline-summary');
  const flow = document.getElementById('timeline-flow');
  const related = document.getElementById('timeline-related');
  const faq = document.getElementById('timeline-faq');

  if (title) title.textContent = `${bundle.notices[0]?.title || humanizeKey(key)} 추적 타임라인`;
  if (summary) {
    summary.textContent = bundle.notices.length
      ? '공람에서 끝나지 않고, 같은 사업 키워드의 고시정보·결정고시·실시계획인가까지 한 화면에서 추적합니다.'
      : '연결된 공람 또는 후속 고시 데이터를 찾지 못했습니다.';
  }

  if (flow) {
    flow.innerHTML = entries.length
      ? entries
          .map(
            (entry) => `
              <article class="timeline-card">
                <div class="meta-line">
                  <span>${entry.date}</span>
                  <span>${entry.stageType}</span>
                </div>
                <h3>${entry.title}</h3>
                <p>${entry.summary}</p>
                <a class="resource-link" href="${entry.href}" ${entry.type === 'gosi' ? 'target="_blank" rel="noopener noreferrer"' : ''}>${entry.type === 'gosi' ? '📎 원문 · 첨부파일 보기' : '상세 보기'}</a>
              </article>
            `
          )
          .join('')
      : '<div class="empty-state">아직 연결된 추적 데이터가 없습니다.</div>';
  }

  if (related) {
    related.innerHTML = bundle.notices.length
      ? bundle.notices
          .map(
            (notice) => `
              <article class="mini-card">
                <strong>${notice.title}</strong>
                <p>${notice.sigungu} ${notice.legalDong} · ${notice.hearingType}</p>
                <a class="text-link" href="notice.html?id=${encodeURIComponent(notice.id)}">공고 상세 보기</a>
              </article>
            `
          )
          .join('')
      : '<div class="empty-state">연결된 공고가 없습니다.</div>';
  }

  if (faq) {
    faq.innerHTML = `
      <article class="faq-item">
        <h4>공람이 끝나면 바로 사업이 확정되나요?</h4>
        <p>항상 그렇지는 않습니다. 주민공람 이후에도 결정고시, 실시계획인가, 추가 열람 같은 단계가 이어질 수 있어 후속 고시를 함께 봐야 합니다.</p>
      </article>
      <article class="faq-item">
        <h4>왜 타임라인이 필요한가요?</h4>
        <p>공람 단계만 보면 사업이 실제로 어떻게 이어졌는지 알기 어렵기 때문입니다. 같은 지역과 같은 키워드의 후속 문서를 이어 봐야 흐름이 보입니다.</p>
      </article>
      <article class="faq-item">
        <h4>이 타임라인도 원문 확인이 필요한가요?</h4>
        <p>${guides.officialDisclaimerCopies?.[2] || '원문 공고와 고시 문서 기준 최종 확인이 필요합니다.'}</p>
      </article>
    `;
  }
}
