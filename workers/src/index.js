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
      client_secret: env.KAKAO_CLIENT_SECRET,
      redirect_uri: env.KAKAO_REDIRECT_URI,
      code,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`kakao_token_error:${res.status}:${err}:key=${env.KAKAO_REST_KEY?.slice(0,6)}:uri=${env.KAKAO_REDIRECT_URI}`);
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
    return errorResponse(e.message, 502);
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
// JWT 검증 (댓글 API 인증용)
// ──────────────────────────────────────────────

async function verifyJWT(token, secret) {
  if (!token) throw new Error('no_token');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid_token_format');

  const signingInput = `${parts[0]}.${parts[1]}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  // base64url → Uint8Array
  const b64 = parts[2].replace(/-/g, '+').replace(/_/g, '/');
  const sigBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    new TextEncoder().encode(signingInput),
  );
  if (!valid) throw new Error('invalid_signature');

  const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('token_expired');

  return payload;
}

// ──────────────────────────────────────────────
// 댓글 API 핸들러
// ──────────────────────────────────────────────

// GET /comments?notice_id=xxx
async function handleGetComments(request, env) {
  const { searchParams } = new URL(request.url);
  const noticeId = searchParams.get('notice_id');
  if (!noticeId) return errorResponse('missing_notice_id');

  const { results } = await env.DB.prepare(
    'SELECT id, notice_id, user_id, nickname, profile_image, content, created_at FROM comments WHERE notice_id = ? ORDER BY created_at ASC'
  ).bind(noticeId).all();

  return jsonResponse({ comments: results });
}

// POST /comments  body: { notice_id, content }
async function handlePostComment(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let payload;
  try {
    payload = await verifyJWT(token, env.JWT_SECRET);
  } catch (e) {
    return errorResponse('unauthorized:' + e.message, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('invalid_json');
  }

  const { notice_id, content } = body;
  if (!notice_id || !content?.trim()) return errorResponse('missing_fields');
  if (content.trim().length > 1000) return errorResponse('content_too_long');

  const result = await env.DB.prepare(
    'INSERT INTO comments (notice_id, user_id, nickname, profile_image, content) VALUES (?, ?, ?, ?, ?)'
  ).bind(notice_id, payload.sub, payload.nickname, payload.profileImage ?? null, content.trim()).run();

  return jsonResponse({ id: result.meta.last_row_id }, 201);
}

// DELETE /comments/:id
async function handleDeleteComment(request, env, id) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let payload;
  try {
    payload = await verifyJWT(token, env.JWT_SECRET);
  } catch (e) {
    return errorResponse('unauthorized:' + e.message, 401);
  }

  // 본인 댓글인지 확인
  const row = await env.DB.prepare('SELECT user_id FROM comments WHERE id = ?').bind(id).first();
  if (!row) return errorResponse('not_found', 404);
  if (row.user_id !== payload.sub) return errorResponse('forbidden', 403);

  await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  return jsonResponse({ deleted: true });
}

// ──────────────────────────────────────────────
// fetch 핸들러
// ──────────────────────────────────────────────

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ── 카카오 인증 라우트 ──
    if (url.pathname === '/auth/kakao' && request.method === 'GET') {
      return handleKakaoAuth(request, env);
    }

    // ── 댓글 라우트 ──
    if (url.pathname === '/comments') {
      if (request.method === 'GET')  return handleGetComments(request, env);
      if (request.method === 'POST') return handlePostComment(request, env);
    }

    // DELETE /comments/:id
    const deleteMatch = url.pathname.match(/^\/comments\/(\d+)$/);
    if (deleteMatch && request.method === 'DELETE') {
      return handleDeleteComment(request, env, Number(deleteMatch[1]));
    }

    return new Response('Not Found', { status: 404 });
  },
};
