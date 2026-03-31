/**
 * js/comments.js
 * 배치 위치: Pages 레포 js/comments.js
 * 사용법: <script src="/js/comments.js"></script> 후
 *         initComments('notice-id', document.getElementById('comments-root')) 호출
 *
 * 의존:
 *   - localStorage의 gonglam_token, gonglam_user (auth.js와 공유)
 *   - window.kakaoLogin (auth.js 로드 시 노출)
 */

// ── 설정 ──────────────────────────────────────
const WORKER_URL = 'https://goyang-worker.suf40mil0ne.workers.dev';
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// 내부 유틸
// ──────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('gonglam_token');
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('gonglam_user') || 'null');
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ──────────────────────────────────────────────
// API 호출
// ──────────────────────────────────────────────

async function loadComments(noticeId) {
  try {
    const res = await fetch(`${WORKER_URL}/comments?notice_id=${encodeURIComponent(noticeId)}`);
    if (!res.ok) return [];
    const { comments } = await res.json();
    return comments ?? [];
  } catch (e) {
    console.error('[comments] fetch failed', e);
    return [];
  }
}

async function postComment(noticeId, content) {
  const token = getToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const res = await fetch(`${WORKER_URL}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ notice_id: noticeId, content }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `댓글 등록 실패: ${res.status}`);
  }
  return res.json();
}

async function deleteComment(id) {
  const token = getToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const res = await fetch(`${WORKER_URL}/comments/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `댓글 삭제 실패: ${res.status}`);
  }
  return res.json();
}

// ──────────────────────────────────────────────
// 렌더링
// ──────────────────────────────────────────────

function renderComments(comments, currentUserId) {
  if (!comments.length) {
    return `<p class="gc-empty">아직 댓글이 없습니다. 첫 댓글을 남겨보세요.</p>`;
  }

  return comments.map((c) => `
    <div class="gc-item" data-id="${c.id}">
      <div class="gc-meta">
        ${c.profile_image
          ? `<img class="gc-avatar" src="${escapeHtml(c.profile_image)}" alt="프로필" width="28" height="28" />`
          : ''}
        <span class="gc-nickname">${escapeHtml(c.nickname)}</span>
        <span class="gc-date">${formatDate(c.created_at)}</span>
        ${c.user_id === currentUserId
          ? `<button class="gc-delete-btn" type="button" data-id="${c.id}">삭제</button>`
          : ''}
      </div>
      <p class="gc-content">${escapeHtml(c.content)}</p>
    </div>
  `).join('');
}

function renderInputArea(isLoggedIn) {
  if (isLoggedIn) {
    return `
      <div class="gc-input-area">
        <textarea class="gc-textarea" placeholder="댓글을 입력하세요 (최대 1000자)" maxlength="1000" rows="3"></textarea>
        <div class="gc-input-footer">
          <span class="gc-char-count">0 / 1000</span>
          <button class="gc-submit-btn" type="button">등록</button>
        </div>
        <p class="gc-error" style="display:none;"></p>
      </div>`;
  }
  return `<p style="font-size:13px;color:#888;text-align:center;padding:12px 0;">
    댓글을 작성하려면 <a href="#" onclick="kakaoLogin();return false;" style="color:#3B82F6;">카카오 로그인</a>이 필요합니다.
  </p>`;
}

// ──────────────────────────────────────────────
// 진입점
// ──────────────────────────────────────────────

async function initComments(noticeId, container) {
  if (!container || !noticeId) return;

  const token = localStorage.getItem('gonglam_token');
  const user = (() => { try { return JSON.parse(localStorage.getItem('gonglam_user') || 'null'); } catch { return null; } })();
  const isLoggedIn = !!(token && user);
  const currentUserId = user?.id ?? null;

  // 스타일 주입
  injectCommentStyles();

  // 초기 HTML
  container.innerHTML = `
    <section class="gc-section">
      <h3 class="gc-title">댓글</h3>
      ${renderInputArea(isLoggedIn)}
      <div class="gc-list"><p class="gc-loading">불러오는 중…</p></div>
    </section>`;

  const list = container.querySelector('.gc-list');

  // 댓글 로드
  const comments = await loadComments(noticeId);
  list.innerHTML = renderComments(comments, currentUserId);

  // 글자 수 카운트
  const textarea = container.querySelector('.gc-textarea');
  const charCount = container.querySelector('.gc-char-count');
  if (textarea && charCount) {
    textarea.addEventListener('input', () => {
      charCount.textContent = `${textarea.value.length} / 1000`;
    });
  }

  // 등록 버튼
  const submitBtn = container.querySelector('.gc-submit-btn');
  const errorEl   = container.querySelector('.gc-error');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const content = textarea?.value.trim();
      if (!content) return;

      submitBtn.disabled = true;
      submitBtn.textContent = '등록 중…';
      if (errorEl) errorEl.style.display = 'none';

      try {
        await postComment(noticeId, content);
        if (textarea) { textarea.value = ''; charCount.textContent = '0 / 1000'; }
        const updated = await loadComments(noticeId);
        list.innerHTML = renderComments(updated, currentUserId);
      } catch (e) {
        console.error('[comments] post failed', e);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '등록';
      }
    });
  }

  // 삭제 버튼 (이벤트 위임)
  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('.gc-delete-btn');
    if (!btn) return;

    if (!confirm('댓글을 삭제하시겠습니까?')) return;
    const id = Number(btn.dataset.id);
    btn.disabled = true;

    try {
      await deleteComment(id);
      const updated = await loadComments(noticeId);
      list.innerHTML = renderComments(updated, currentUserId);
    } catch (e) {
      console.error('[comments] delete failed', e);
      btn.disabled = false;
    }
  });
}

// ──────────────────────────────────────────────
// 스타일
// ──────────────────────────────────────────────

function injectCommentStyles() {
  if (document.getElementById('gc-styles')) return;
  const style = document.createElement('style');
  style.id = 'gc-styles';
  style.textContent = `
    .gc-section {
      margin-top: 2rem;
      font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif;
    }
    .gc-title {
      font-size: 1rem;
      font-weight: 700;
      color: #1a2530;
      margin-bottom: 1rem;
    }

    /* 입력 영역 */
    .gc-input-area { margin-bottom: 1.5rem; }
    .gc-textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d0d5db;
      border-radius: 8px;
      font-size: 0.9rem;
      font-family: inherit;
      resize: vertical;
      box-sizing: border-box;
      transition: border-color 0.15s;
    }
    .gc-textarea:focus { outline: none; border-color: #006194; }
    .gc-input-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 6px;
    }
    .gc-char-count { font-size: 0.78rem; color: #8a9aa8; }
    .gc-submit-btn {
      padding: 7px 18px;
      background: #006194;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .gc-submit-btn:hover:not(:disabled) { background: #00507a; }
    .gc-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* 로그인 유도 */
    .gc-login-prompt {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: #f7f9fb;
      border-radius: 8px;
      margin-bottom: 1.5rem;
    }
    .gc-login-prompt p { font-size: 0.875rem; color: #3f4850; margin: 0; }
    .gc-kakao-login-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      background: #FEE500;
      color: #3C1E1E;
      border: none;
      border-radius: 6px;
      font-size: 0.825rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .gc-kakao-login-btn:hover { filter: brightness(0.96); }

    /* 댓글 목록 */
    .gc-item {
      padding: 12px 0;
      border-bottom: 1px solid #f0f2f4;
    }
    .gc-item:last-child { border-bottom: none; }
    .gc-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .gc-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }
    .gc-nickname { font-size: 0.875rem; font-weight: 600; color: #1a2530; }
    .gc-date { font-size: 0.78rem; color: #8a9aa8; margin-left: 2px; }
    .gc-content {
      font-size: 0.9rem;
      color: #2c3a44;
      line-height: 1.6;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .gc-delete-btn {
      margin-left: auto;
      padding: 2px 8px;
      background: none;
      border: 1px solid #d0d5db;
      border-radius: 4px;
      font-size: 0.75rem;
      color: #8a9aa8;
      cursor: pointer;
    }
    .gc-delete-btn:hover { border-color: #e85c5c; color: #e85c5c; }

    /* 상태 메시지 */
    .gc-empty, .gc-loading { font-size: 0.875rem; color: #8a9aa8; padding: 8px 0; }
    .gc-error { font-size: 0.85rem; color: #e85c5c; margin-top: 6px; }
  `;
  document.head.appendChild(style);
}
