/**
 * auth.js
 * 배치 위치: Pages 레포 루트 (모든 HTML에서 <script src="/auth.js"> 로 공통 사용)
 *
 * 제공 함수:
 *   kakaoLogin()       — 카카오 OAuth 로그인 페이지로 이동
 *   kakaoLogout()      — 로컬 세션 초기화 후 UI 갱신
 *   renderLoginState() — #kakao-auth-widget 엘리먼트의 UI를 상태에 맞게 렌더
 *
 * 저장소 키:
 *   gonglam_token  — HS256 JWT (Workers 발급)
 *   gonglam_user   — { id, nickname, profileImage } JSON
 */

// ── 설정 상수 ─────────────────────────────────
const KAKAO_KEY = '702f4cd88b9cf13b50973c9d9e42bea7'; // 카카오 앱 REST API 키
const REDIRECT   = 'https://goyang-eke.pages.dev/auth/callback';
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// 내부 유틸
// ──────────────────────────────────────────────

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('gonglam_user') || 'null');
  } catch {
    return null;
  }
}

function getToken() {
  return localStorage.getItem('gonglam_token');
}

/** JWT exp 클레임으로 만료 여부 확인 (서명 검증 아님 — 클라이언트 편의용) */
function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp < Math.floor(Date.now() / 1000);
  } catch {
    return true;
  }
}

// ──────────────────────────────────────────────
// 공개 API
// ──────────────────────────────────────────────

function kakaoLogin() {
  // 현재 페이지를 복귀 URL로 저장 (callback 후 돌아올 때 사용)
  sessionStorage.setItem('gonglam_return', window.location.pathname + window.location.search);

  const url = new URL('https://kauth.kakao.com/oauth/authorize');
  url.searchParams.set('client_id', KAKAO_KEY);
  url.searchParams.set('redirect_uri', REDIRECT);
  url.searchParams.set('response_type', 'code');
  window.location.href = url.toString();
}

function kakaoLogout() {
  localStorage.removeItem('gonglam_token');
  localStorage.removeItem('gonglam_user');
  renderLoginState();
}

function renderLoginState() {
  const widget = document.getElementById('kakao-auth-widget');
  if (!widget) return;

  const token = getToken();
  const user  = getUser();
  const loggedIn = user && token && !isTokenExpired(token);

  if (loggedIn) {
    widget.innerHTML = `
      <div class="kauth-user">
        ${user.profileImage
          ? `<img class="kauth-avatar" src="${escapeAttr(user.profileImage)}" alt="프로필" width="32" height="32" />`
          : `<span class="kauth-avatar kauth-avatar--placeholder" aria-hidden="true">👤</span>`
        }
        <span class="kauth-nickname">${escapeHtml(user.nickname)}</span>
        <button class="kauth-logout-btn" type="button" onclick="kakaoLogout()">로그아웃</button>
      </div>`;
  } else {
    widget.innerHTML = `
      <button class="kauth-login-btn" type="button" onclick="kakaoLogin()" aria-label="카카오 로그인">
        ${KAKAO_LOGO_SVG}
        <span>카카오로 로그인</span>
      </button>`;
  }
}

// ──────────────────────────────────────────────
// XSS 방지 헬퍼
// ──────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ──────────────────────────────────────────────
// 카카오 로고 SVG (공식 심볼 색상 #3C1E1E)
// ──────────────────────────────────────────────

const KAKAO_LOGO_SVG = `
<svg class="kauth-logo" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path fill="#3C1E1E" d="M12 3C6.477 3 2 6.477 2 10.8c0 2.733 1.643 5.133 4.127 6.55l-.995 3.673a.375.375 0 0 0 .554.41L9.94 19.14A11.56 11.56 0 0 0 12 19.4c5.523 0 10-3.477 10-7.8S17.523 3 12 3Z"/>
</svg>`;

// ──────────────────────────────────────────────
// 스타일 주입 (HTML에 <link> 없이도 동작)
// ──────────────────────────────────────────────

(function injectStyles() {
  if (document.getElementById('kauth-styles')) return;
  const style = document.createElement('style');
  style.id = 'kauth-styles';
  style.textContent = `
    #kakao-auth-widget {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 9999;
      font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif;
    }

    /* ── 로그인 버튼 ── */
    .kauth-login-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: #FEE500;
      color: #3C1E1E;
      border: none;
      border-radius: 10px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      transition: filter 0.15s, transform 0.1s;
      white-space: nowrap;
    }
    .kauth-login-btn:hover  { filter: brightness(0.96); }
    .kauth-login-btn:active { transform: scale(0.97); }

    .kauth-logo {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    /* ── 로그인 후 사용자 정보 ── */
    .kauth-user {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px 6px 8px;
      background: #fff;
      border-radius: 99px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    }

    .kauth-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }
    .kauth-avatar--placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f0f2f4;
      font-size: 1rem;
    }

    .kauth-nickname {
      font-size: 0.875rem;
      font-weight: 600;
      color: #1a2530;
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .kauth-logout-btn {
      padding: 4px 10px;
      background: #f0f2f4;
      color: #3f4850;
      border: none;
      border-radius: 6px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    .kauth-logout-btn:hover { background: #e0e3e5; }

    /* 모바일 대응 */
    @media (max-width: 480px) {
      #kakao-auth-widget { top: 12px; right: 12px; }
      .kauth-nickname { max-width: 56px; }
    }
  `;
  document.head.appendChild(style);
})();

// ──────────────────────────────────────────────
// 페이지 로드 시 자동 실행
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', renderLoginState);
