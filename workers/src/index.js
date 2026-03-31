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
 *   KAKAO_REDIRECT_URI - https://공람.com/auth/callback
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
  const bodyStr = unescape(encodeURIComponent(JSON.stringify(payload)));
  const body = btoa(bodyStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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

const ALLOWED_ORIGINS = [
  'https://goyang-eke.pages.dev',
  'https://xn--ob0bw4r.com',
  'https://www.xn--ob0bw4r.com',
  'https://공람.com',
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

function jsonResponse(data, status = 200, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(request) },
  });
}

function errorResponse(message, status = 400, request) {
  return jsonResponse({ error: message }, status, request);
}

// ──────────────────────────────────────────────
// 관리자 설정
// ──────────────────────────────────────────────

const ADMIN_IDS = ['4823280911']; // 본인 카카오 ID 숫자

function isAdmin(userId) {
  return ADMIN_IDS.includes(String(userId));
}

// ──────────────────────────────────────────────
// 랜덤 닉네임 생성
// ──────────────────────────────────────────────

function generateRandomNickname() {
  const adjectives = ['행복한', '용감한', '슬기로운', '따뜻한', '빠른', '조용한', '씩씩한', '부지런한', '신나는', '영리한'];
  const nouns = ['시민', '주민', '이웃', '탐색가', '관찰자', '기록자', '참여자', '목격자', '제보자', '감시자'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${adj}${noun}${num}`;
}

// ──────────────────────────────────────────────
// 카카오 인증 라우트 핸들러
// ──────────────────────────────────────────────

async function handleKakaoAuth(request, env) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return errorResponse('missing_code', 400, request);
  }

  let tokenData;
  try {
    tokenData = await fetchKakaoToken(code, env);
  } catch (e) {
    console.error('[kakao] token exchange failed', e.message);
    return errorResponse(e.message, 502, request);
  }

  let user;
  try {
    user = await fetchKakaoUser(tokenData.access_token);
  } catch (e) {
    console.error('[kakao] user info failed', e.message);
    return errorResponse('user_info_failed', 502, request);
  }

  // users 테이블에서 기존 닉네임 조회, 없으면 랜덤 닉네임 생성 후 저장
  let nickname;
  const existingUser = await env.DB.prepare(
    'SELECT nickname FROM users WHERE kakao_id = ?'
  ).bind(user.id).first();

  if (existingUser) {
    nickname = existingUser.nickname;
  } else {
    nickname = generateRandomNickname();
    await env.DB.prepare(
      'INSERT INTO users (kakao_id, nickname, profile_image) VALUES (?, ?, ?)'
    ).bind(user.id, nickname, user.profileImage ?? null).run();
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJWT(
    {
      sub: user.id,
      nickname,
      profileImage: user.profileImage,
      iat: now,
      exp: now + 60 * 60 * 24, // 24시간
    },
    env.JWT_SECRET,
  );

  return jsonResponse({ token: jwt, user: { ...user, nickname } }, 200, request);
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

  const rawPayload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
  const payloadBytes = Uint8Array.from(rawPayload, (c) => c.charCodeAt(0));
  const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
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
  if (!noticeId) return errorResponse('missing_notice_id', 400, request);

  const { results } = await env.DB.prepare(
    'SELECT id, notice_id, user_id, nickname, profile_image, content, created_at FROM comments WHERE notice_id = ? ORDER BY created_at ASC'
  ).bind(noticeId).all();

  return jsonResponse({ comments: results }, 200, request);
}

// POST /comments  body: { notice_id, content }
async function handlePostComment(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let payload;
  try {
    payload = await verifyJWT(token, env.JWT_SECRET);
  } catch (e) {
    return errorResponse('unauthorized:' + e.message, 401, request);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('invalid_json', 400, request);
  }

  const { notice_id, content } = body;
  if (!notice_id || !content?.trim()) return errorResponse('missing_fields', 400, request);
  if (content.trim().length > 1000) return errorResponse('content_too_long', 400, request);

  const result = await env.DB.prepare(
    'INSERT INTO comments (notice_id, user_id, nickname, profile_image, content) VALUES (?, ?, ?, ?, ?)'
  ).bind(notice_id, payload.sub, payload.nickname, payload.profileImage ?? null, content.trim()).run();

  return jsonResponse({ id: result.meta.last_row_id }, 201, request);
}

// DELETE /comments/:id
async function handleDeleteComment(request, env, id) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let payload;
  try {
    payload = await verifyJWT(token, env.JWT_SECRET);
  } catch (e) {
    return errorResponse('unauthorized:' + e.message, 401, request);
  }

  // 본인 댓글인지 확인
  const row = await env.DB.prepare('SELECT user_id FROM comments WHERE id = ?').bind(id).first();
  if (!row) return errorResponse('not_found', 404, request);
  if (row.user_id !== payload.sub) return errorResponse('forbidden', 403, request);

  await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  return jsonResponse({ deleted: true }, 200, request);
}

// ──────────────────────────────────────────────
// 관리자 API 핸들러
// ──────────────────────────────────────────────

async function requireAdmin(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  try {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!isAdmin(payload.sub)) return { error: errorResponse('forbidden', 403, request) };
    return { payload };
  } catch (e) {
    return { error: errorResponse('unauthorized:' + e.message, 401, request) };
  }
}

// GET /admin/comments?page=1&limit=50
async function handleAdminGetComments(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const page  = Math.max(1, Number(searchParams.get('page')  || 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)));
  const offset = (page - 1) * limit;

  const { results } = await env.DB.prepare(
    'SELECT id, notice_id, user_id, nickname, content, created_at FROM comments ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(limit, offset).all();

  const { results: countRows } = await env.DB.prepare(
    'SELECT COUNT(*) as total FROM comments'
  ).all();

  return jsonResponse({ comments: results, total: countRows[0].total, page, limit }, 200, request);
}

// DELETE /admin/comments/:id
async function handleAdminDeleteComment(request, env, id) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const row = await env.DB.prepare('SELECT id FROM comments WHERE id = ?').bind(id).first();
  if (!row) return errorResponse('not_found', 404, request);

  await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  return jsonResponse({ deleted: true }, 200, request);
}

// GET /me
async function handleMe(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  try {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    return jsonResponse(payload, 200, request);
  } catch (e) {
    return errorResponse('unauthorized:' + e.message, 401, request);
  }
}

// ──────────────────────────────────────────────
// fetch 핸들러
// ──────────────────────────────────────────────

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(request) });
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

    // ── 관리자 라우트 ──
    if (url.pathname === '/admin/comments' && request.method === 'GET') {
      return handleAdminGetComments(request, env);
    }
    const adminDeleteMatch = url.pathname.match(/^\/admin\/comments\/(\d+)$/);
    if (adminDeleteMatch && request.method === 'DELETE') {
      return handleAdminDeleteComment(request, env, Number(adminDeleteMatch[1]));
    }

    // ── /me ──
    if (url.pathname === '/me' && request.method === 'GET') {
      return handleMe(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};
