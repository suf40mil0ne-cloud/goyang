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
async function fetchKakaoToken(code, redirectUri, env) {
  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.KAKAO_REST_KEY,
      client_secret: env.KAKAO_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`kakao_token_error:${res.status}:${err}:key=${env.KAKAO_REST_KEY?.slice(0,6)}:uri=${redirectUri}`);
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
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:8788',
  'http://127.0.0.1:8788',
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

const BOT_USER_AGENT_PATTERN = /bot|crawler|spider/i;
const SEOUL_TIME_OFFSET = '+9 hours';

function normalizeTrackedPath(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function getSeoulDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date).reduce((accumulator, part) => {
    if (part.type !== 'literal') {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDateString(dateString, days) {
  const [year, month, day] = String(dateString).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getWeekStartDateString(dateString) {
  const [year, month, day] = String(dateString).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

const EUM_ATTACHMENT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 GonglamKok/1.0';

function decodeHtmlEntities(value) {
  return String(value ?? '').replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const normalized = String(entity).toLowerCase();
    if (normalized === 'amp') return '&';
    if (normalized === 'lt') return '<';
    if (normalized === 'gt') return '>';
    if (normalized === 'quot') return '"';
    if (normalized === 'apos') return "'";
    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return match;
  });
}

function extractAttribute(tag, attributeName) {
  const pattern = new RegExp("\\b" + attributeName + "\\s*=\\s*(['\"])(.*?)\\1", 'i');
  const match = String(tag ?? '').match(pattern);
  return match ? decodeHtmlEntities(match[2]).trim() : '';
}

function isAllowedEumUrl(value) {
  try {
    const url = new URL(value);
    return ['www.eum.go.kr', 'eum.go.kr'].includes(url.hostname);
  } catch {
    return false;
  }
}

function extractEumAttachments(html, pageUrl) {
  const files = [];
  const seen = new Set();
  const formRegex = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let formMatch;

  while ((formMatch = formRegex.exec(html)) !== null) {
    const formAttributes = formMatch[1] || '';
    const formContent = formMatch[2] || '';
    const action = extractAttribute(formAttributes, 'action');
    const formAction = new URL(action || pageUrl, pageUrl).toString();
    const inputRegex = /<input\b[^>]*>/gi;
    let inputMatch;

    while ((inputMatch = inputRegex.exec(formContent)) !== null) {
      const inputTag = inputMatch[0] || '';
      if (extractAttribute(inputTag, 'name') !== 'file') {
        continue;
      }

      const filePath = extractAttribute(inputTag, 'value');
      if (!filePath) {
        continue;
      }

      const decodedPath = decodeHtmlEntities(filePath);
      const fileName = decodedPath.split('/').filter(Boolean).pop() || '';
      const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
      const key = formAction + '::' + decodedPath;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      files.push({
        name: fileName || decodedPath,
        ext,
        path: decodedPath,
        formAction,
      });
    }
  }

  return files;
}

async function getAttachment(request, _env) {
  const { searchParams } = new URL(request.url);
  const targetUrl = decodeHtmlEntities(searchParams.get('url'));

  if (!targetUrl) {
    return errorResponse('missing_url', 400, request);
  }
  if (!isAllowedEumUrl(targetUrl)) {
    return errorResponse('invalid_url', 400, request);
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent': EUM_ATTACHMENT_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        Referer: 'https://www.eum.go.kr/',
      },
      redirect: 'follow',
    });
  } catch (error) {
    console.error('[attachment] fetch failed', error);
    return errorResponse('attachment_fetch_failed', 502, request);
  }

  if (!upstream.ok) {
    return errorResponse('attachment_fetch_failed:' + upstream.status, 502, request);
  }

  const html = await upstream.text();
  return jsonResponse({ files: extractEumAttachments(html, targetUrl) }, 200, request);
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
  const redirectUri = searchParams.get('redirect_uri') || env.KAKAO_REDIRECT_URI;

  if (!code) {
    return errorResponse('missing_code', 400, request);
  }

  let tokenData;
  try {
    tokenData = await fetchKakaoToken(code, redirectUri, env);
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

async function handleTrack(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('invalid_json', 400, request);
  }

  const trackedPath = normalizeTrackedPath(body?.path);
  if (!trackedPath) {
    return errorResponse('missing_path', 400, request);
  }

  const userAgent = String(request.headers.get('User-Agent') || '').trim();
  if (BOT_USER_AGENT_PATTERN.test(userAgent)) {
    return jsonResponse({ ok: true }, 200, request);
  }

  const referrer = String(request.headers.get('Referer') || request.headers.get('Referrer') || '').trim();

  await env.DB.prepare(
    'INSERT INTO page_views (path, user_agent, referrer) VALUES (?, ?, ?)'
  ).bind(
    trackedPath,
    userAgent ? userAgent.slice(0, 1000) : null,
    referrer ? referrer.slice(0, 1000) : null,
  ).run();

  const today = getSeoulDateString();
  await env.DB.prepare(
    `INSERT INTO daily_stats (date, total_views, unique_ips)
     VALUES (?, 1, 0)
     ON CONFLICT(date) DO UPDATE SET total_views = total_views + 1`
  ).bind(today).run();

  return jsonResponse({ ok: true }, 200, request);
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

async function handleAdminStats(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const today = getSeoulDateString();
  const yesterday = shiftDateString(today, -1);
  const weekStart = getWeekStartDateString(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const recentStart = shiftDateString(today, -6);
  const dateExpression = `date(datetime(visited_at, '${SEOUL_TIME_OFFSET}'))`;

  const [todayRow, yesterdayRow, weekRow, monthRow, totalRow, dailyRows, topPageRows] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM page_views WHERE ${dateExpression} = ?`).bind(today).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM page_views WHERE ${dateExpression} = ?`).bind(yesterday).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM page_views WHERE ${dateExpression} >= ? AND ${dateExpression} <= ?`).bind(weekStart, today).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM page_views WHERE ${dateExpression} >= ? AND ${dateExpression} <= ?`).bind(monthStart, today).first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM page_views').first(),
    env.DB.prepare(
      `SELECT ${dateExpression} AS date, COUNT(*) AS count
       FROM page_views
       WHERE ${dateExpression} >= ? AND ${dateExpression} <= ?
       GROUP BY ${dateExpression}
       ORDER BY date ASC`
    ).bind(recentStart, today).all(),
    env.DB.prepare(
      `SELECT path, COUNT(*) AS count
       FROM page_views
       GROUP BY path
       ORDER BY count DESC, path ASC
       LIMIT 5`
    ).all(),
  ]);

  const dailyMap = new Map((dailyRows.results || []).map((row) => [row.date, Number(row.count || 0)]));
  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDateString(today, -6 + index);
    return { date, count: Number(dailyMap.get(date) || 0) };
  });

  return jsonResponse({
    today: Number(todayRow?.count || 0),
    yesterday: Number(yesterdayRow?.count || 0),
    thisWeek: Number(weekRow?.count || 0),
    thisMonth: Number(monthRow?.count || 0),
    total: Number(totalRow?.count || 0),
    daily,
    topPages: (topPageRows.results || []).map((row) => ({
      path: row.path,
      count: Number(row.count || 0),
    })),
  }, 200, request);
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

    if (url.pathname === '/attachment' && request.method === 'GET') {
      return getAttachment(request, env);
    }

    if (url.pathname === '/track' && request.method === 'POST') {
      return handleTrack(request, env);
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
    if (url.pathname === '/admin/stats' && request.method === 'GET') {
      return handleAdminStats(request, env);
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
