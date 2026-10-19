// crm/src/auth.js
// Login do CRM: uma senha só (a do dono do computador), sessão por cookie.
//
// O CRM já escuta só em 127.0.0.1 e recusa Host/Origin de fora (host-guard.js). O login é a
// camada seguinte: impede que outro usuário do mesmo computador, ou um programa local,
// leia a base de leads ou mande WhatsApp pelo número do aluno.
//
// - Cookie HttpOnly + SameSite=Lax: Lax (e não Strict) para o retorno do OAuth do Google,
//   que chega como navegação de outro site, continuar logado. POST/PATCH/DELETE de outro
//   site não levam o cookie.
// - O dispatcher (modo automático) chama o CRM com `Authorization: Bearer <senha>`.
// - Demonstração (`npm run start:demo`): demo=true, nada pede login.
import crypto from 'node:crypto';

export const COOKIE_NAME = 'zxcrm_session';
const DAY_MS = 24 * 60 * 60 * 1000;

function digest(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest();
}

// Comparação em tempo constante (os dois lados passam por SHA-256, então têm o mesmo tamanho).
export function safeEqual(a, b) {
  return crypto.timingSafeEqual(digest(a), digest(b));
}

// Leads que não são de demonstração (id demo-... ou "demo": true). O modo demonstração, que
// abre o CRM sem login, só pode rodar quando este número é zero.
export function countRealLeads(master) {
  return Object.entries(master ?? {}).filter(([id, lead]) => !(id.startsWith('demo-') || lead?.demo)).length;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function createAuth({
  password,
  demo = false,
  now = () => Date.now(),
  sessionTtlMs = DAY_MS / 2,
  maxFails = 5,
  lockMs = 60_000,
} = {}) {
  if (!demo && !password) throw new Error('createAuth: sem senha e fora do modo demonstração');

  const sessions = new Map(); // token -> expira em (ms)
  let fails = 0;
  let lockedUntil = 0;

  const pruneSessions = () => {
    const t = now();
    for (const [token, exp] of sessions) if (exp <= t) sessions.delete(token);
  };

  const sessionToken = (req) => parseCookies(req.headers.cookie)[COOKIE_NAME];

  function hasSession(req) {
    pruneSessions();
    const token = sessionToken(req);
    return Boolean(token && sessions.has(token));
  }

  function hasBearer(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '');
    return Boolean(m && safeEqual(m[1], password));
  }

  function isAuthorized(req) {
    return demo || hasSession(req) || hasBearer(req);
  }

  // Páginas e arquivos que precisam abrir sem login: a tela de entrada e o que ela usa.
  function isPublic(req) {
    if (req.method === 'POST' && req.path === '/api/login') return true;
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    return req.path === '/login' || req.path === '/login.html' || req.path.startsWith('/assets/');
  }

  function middleware(req, res, next) {
    if (isPublic(req) || isAuthorized(req)) return next();
    if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.redirect(302, '/login');
    return res.status(401).json({ error: 'Faça login para continuar.', login_required: true });
  }

  function cookie(token, maxAgeMs) {
    return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}`;
  }

  function login(req, res) {
    if (demo) return res.json({ ok: true, demo: true });
    const t = now();
    if (lockedUntil > t) {
      const wait = Math.ceil((lockedUntil - t) / 1000);
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: `Muitas tentativas. Espere ${wait} segundos e tente de novo.` });
    }
    const typed = req.body?.password;
    if (typeof typed !== 'string' || !safeEqual(typed, password)) {
      fails += 1;
      if (fails >= maxFails) {
        lockedUntil = t + lockMs;
        fails = 0;
      }
      return res.status(401).json({ error: 'Senha incorreta.' });
    }
    fails = 0;
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, t + sessionTtlMs);
    res.set('Set-Cookie', cookie(token, sessionTtlMs));
    return res.json({ ok: true });
  }

  function logout(req, res) {
    const token = sessionToken(req);
    if (token) sessions.delete(token);
    res.set('Set-Cookie', cookie('', 0));
    return res.json({ ok: true });
  }

  const session = (req, res) => res.json({ demo, login: !demo });

  return { middleware, login, logout, session, isAuthorized, demo };
}
