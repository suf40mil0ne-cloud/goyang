/**
 * workers/src/index.js
 *
 * 배치 위치: 별도 Cloudflare Workers 프로젝트의 메인 엔트리
 *
 * 기존 Workers 통합 방법:
 *   1. 아래 헬퍼 함수(base64url ~ handleKakaoAuth)를 기존 파일에 붙여넣기
 *   2. 기존 fetch 핸들러 맨 위에 ── 카카오 인증 라우트 ── 블록만 삽입
 *   3. 기존 라우트/로직은 그대로 유지
 *
 * 필요 환경변수 (wrangler secret put 또는 대시보드에서 설정):
 *   KAKAO_REST_KEY     - 카카오 앱 REST API 키
 *   KAKAO_REDIRECT_URI - https://goyang-eke.pages.dev/auth/callback
 *   JWT_SECRET         - 32자 이상 랜덤 문자열 (openssl rand -base64 32)
 */

// ──────────────────────────────────────────────
// Web Crypto API 기반 HS256 JWT (외부 라이브러리 없음)
// ──────────────────────────────────────────────

/** Uint8Array 또는 문자열을 base64url로 인코딩 */
function base64url(input) {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** HS256 JWT 발급 (Web Crypto API) */
async function signJWT(payload, secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sigBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64url(new Uint8Array(sigBuffer))}`;
}

// ──────────────────────────────────────────────
// 카카오 API 호출
// ──────────────────────────────────────────────

/** 인가코드 → 카카오 액세스 토큰 교환 */
async function fetchKakaoToken(code, env) {
  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.KAKAO_REST_KEY,
      redirect_uri: env.KAKAO_REDIRECT_URI,
      code,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`kakao_token_error:${res.status}:${err}`);
  }
  return res.json();
}

/** 카카오 사용자 정보 조회 (닉네임, 프로필사진, id) */
async function fetchKakaoUser(accessToken) {
  const res = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`kakao_user_error:${res.status}`);
  }

  const data = await res.json();
  return {
    id: String(data.id),
    nickname: data.kakao_account?.profile?.nickname ?? '사용자',
    profileImage: data.kakao_account?.profile?.profile_image_url ?? null,
  };
}

// ──────────────────────────────────────────────
// CORS 유틸리티
// ──────────────────────────────────────────────

const ALLOWED_ORIGIN = 'https://goyang-eke.pages.dev';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

// ──────────────────────────────────────────────
// 카카오 인증 라우트 핸들러
// ──────────────────────────────────────────────

async function handleKakaoAuth(request, env) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return errorResponse('missing_code');
  }

  let tokenData;
  try {
    tokenData = await fetchKakaoToken(code, env);
  } catch (e) {
    console.error('[kakao] token exchange failed', e.message);
    return errorResponse('token_exchange_failed', 502);
  }

  let user;
  try {
    user = await fetchKakaoUser(tokenData.access_token);
  } catch (e) {
    console.error('[kakao] user info failed', e.message);
    return errorResponse('user_info_failed', 502);
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJWT(
    {
      sub: user.id,
      nickname: user.nickname,
      profileImage: user.profileImage,
      iat: now,
      exp: now + 60 * 60 * 24, // 24시간
    },
    env.JWT_SECRET,
  );

  return jsonResponse({ token: jwt, user });
}

// ──────────────────────────────────────────────
// fetch 핸들러 (기존 Workers에 통합할 때는
// 아래 export default 블록 대신 기존 핸들러에
// ── 카카오 인증 라우트 ── 블록만 삽입하세요)
// ──────────────────────────────────────────────

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ── 카카오 인증 라우트 (기존 코드에 이 블록만 추가) ──
    if (url.pathname === '/auth/kakao' && request.method === 'GET') {
      return handleKakaoAuth(request, env);
    }
    // ── 여기까지가 추가 블록, 기존 라우트는 아래에 유지 ──

    return new Response('Not Found', { status: 404 });
  },
};
