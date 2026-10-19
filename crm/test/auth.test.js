import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import passwordRules from '../src/password.cjs';
import { createAuth, countRealLeads, parseCookies, safeEqual, COOKIE_NAME } from '../src/auth.js';

const { generatePassword, passwordProblem } = passwordRules;
const SENHA = 'Xk3m-Pq9R-tW4n-Jd7s';

// Sobe um app mínimo com o mesmo encadeamento do server.js e devolve helpers.
async function boot(opts = {}) {
  const clock = { t: 1_000_000 };
  const auth = createAuth({ password: SENHA, now: () => clock.t, ...opts });
  const app = express();
  app.use(express.json());
  app.use(auth.middleware);
  app.get('/login', (req, res) => res.send('tela de login'));
  app.post('/api/login', auth.login);
  app.post('/api/logout', auth.logout);
  app.get('/api/session', auth.session);
  app.get('/assets/x.css', (req, res) => res.send('css'));
  app.get('/', (req, res) => res.send('home'));
  app.get('/api/leads', (req, res) => res.json([{ id: 'a' }]));
  app.post('/api/leads/a/manual-message', (req, res) => res.json({ enviado: true }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init });
  const entrar = (senha) => call('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: senha }) });
  const cookieDe = (res) => (res.headers.get('set-cookie') ?? '').split(';')[0];
  return { auth, clock, call, entrar, cookieDe, close: () => server.close() };
}

// ── Regras da senha ─────────────────────────────────────────────────────────
test('senha gerada: 16 caracteres em 4 grupos, sem caracteres ambíguos, e aceita pelas regras', () => {
  const vistas = new Set();
  for (let i = 0; i < 50; i++) {
    const s = generatePassword();
    assert.match(s, /^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){3}$/);
    assert.equal(passwordProblem(s), null);
    vistas.add(s);
  }
  assert.equal(vistas.size, 50, 'não pode repetir');
});

test('senha fraca é recusada: vazia, exemplo, curta', () => {
  for (const ruim of ['', '   ', null, undefined, 'senha', 'change-me', 'ADMIN123', 'your_password_here', 'curta-123', '12345678901']) {
    assert.ok(passwordProblem(ruim), `deveria recusar ${JSON.stringify(ruim)}`);
  }
  assert.equal(passwordProblem('uma-frase-longa-e-boa'), null);
  assert.equal(passwordProblem('123456789012'), null, '12 caracteres é o mínimo');
});

test('createAuth exige senha, salvo no modo demonstração', () => {
  assert.throws(() => createAuth({}), /sem senha/);
  assert.doesNotThrow(() => createAuth({ demo: true }));
});

test('safeEqual e parseCookies', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.deepEqual(parseCookies('a=1; zxcrm_session=tok%20en; b=2'), { a: '1', zxcrm_session: 'tok en', b: '2' });
  assert.deepEqual(parseCookies(undefined), {});
});

test('countRealLeads: só conta o que não é de demonstração', () => {
  assert.equal(countRealLeads({}), 0);
  assert.equal(countRealLeads(null), 0);
  assert.equal(countRealLeads({ 'demo-01': {}, 'demo-teste': {}, x: { demo: true } }), 0);
  assert.equal(countRealLeads({ 'demo-01': {}, 'lead-real': { phone: '+5511999990001' } }), 1);
});

// ── Middleware e sessão ─────────────────────────────────────────────────────
test('sem login: a página redireciona para /login e a API responde 401', async () => {
  const s = await boot();
  try {
    const home = await s.call('/');
    assert.equal(home.status, 302);
    assert.equal(home.headers.get('location'), '/login');
    const api = await s.call('/api/leads');
    assert.equal(api.status, 401);
    assert.equal((await api.json()).login_required, true);
    const envio = await s.call('/api/leads/a/manual-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(envio.status, 401, 'enviar WhatsApp exige login');
    assert.equal((await s.call('/login')).status, 200);
    assert.equal((await s.call('/assets/x.css')).status, 200, 'arquivos de /assets abrem sem login');
  } finally { s.close(); }
});

test('senha errada não entra; senha certa entra e o cookie vale para a API e a página', async () => {
  const s = await boot();
  try {
    const errada = await s.entrar('Xk3m-Pq9R-tW4n-Jd7x');
    assert.equal(errada.status, 401);
    assert.equal(errada.headers.get('set-cookie'), null);

    const certa = await s.entrar(SENHA);
    assert.equal(certa.status, 200);
    const setCookie = certa.headers.get('set-cookie');
    assert.match(setCookie, new RegExp(`^${COOKIE_NAME}=[0-9a-f]{64};`));
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);

    const cookie = s.cookieDe(certa);
    assert.equal((await s.call('/api/leads', { headers: { cookie } })).status, 200);
    assert.equal((await s.call('/', { headers: { cookie } })).status, 200);
    const sess = await (await s.call('/api/session', { headers: { cookie } })).json();
    assert.deepEqual(sess, { demo: false, login: true });
  } finally { s.close(); }
});

test('login com corpo estranho (sem senha, número, formulário) é recusado', async () => {
  const s = await boot();
  try {
    for (const body of ['{}', '{"password":123}', '{"password":null}', '[]']) {
      const r = await s.call('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      assert.equal(r.status, 401, body);
    }
    const form = await s.call('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `password=${SENHA}` });
    assert.equal(form.status, 401, 'formulário de outro site não entra');
  } finally { s.close(); }
});

test('o dispatcher entra com a senha no cabeçalho Authorization (Bearer)', async () => {
  const s = await boot();
  try {
    assert.equal((await s.call('/api/leads', { headers: { Authorization: `Bearer ${SENHA}` } })).status, 200);
    assert.equal((await s.call('/api/leads', { headers: { Authorization: 'Bearer outra-senha-qualquer' } })).status, 401);
    assert.equal((await s.call('/api/leads', { headers: { Authorization: SENHA } })).status, 401, 'sem a palavra Bearer');
  } finally { s.close(); }
});

test('sair invalida a sessão; cookie inventado não vale', async () => {
  const s = await boot();
  try {
    const cookie = s.cookieDe(await s.entrar(SENHA));
    assert.equal((await s.call('/api/leads', { headers: { cookie } })).status, 200);
    const out = await s.call('/api/logout', { method: 'POST', headers: { cookie } });
    assert.equal(out.status, 200);
    assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await s.call('/api/leads', { headers: { cookie } })).status, 401);
    assert.equal((await s.call('/api/leads', { headers: { cookie: `${COOKIE_NAME}=${'0'.repeat(64)}` } })).status, 401);
  } finally { s.close(); }
});

test('a sessão expira', async () => {
  const s = await boot({ sessionTtlMs: 60_000 });
  try {
    const cookie = s.cookieDe(await s.entrar(SENHA));
    s.clock.t += 59_000;
    assert.equal((await s.call('/api/leads', { headers: { cookie } })).status, 200);
    s.clock.t += 2_000;
    assert.equal((await s.call('/api/leads', { headers: { cookie } })).status, 401);
  } finally { s.close(); }
});

test('5 senhas erradas travam o login por um tempo, mesmo com a senha certa', async () => {
  const s = await boot({ maxFails: 5, lockMs: 60_000 });
  try {
    for (let i = 0; i < 5; i++) assert.equal((await s.entrar('errada-errada-1')).status, 401);
    const travado = await s.entrar(SENHA);
    assert.equal(travado.status, 429);
    assert.ok(Number(travado.headers.get('retry-after')) > 0);
    s.clock.t += 61_000;
    assert.equal((await s.entrar(SENHA)).status, 200, 'passado o tempo, volta a aceitar');
  } finally { s.close(); }
});

test('modo demonstração: nada pede login e a API avisa que é demonstração', async () => {
  const s = await boot({ password: undefined, demo: true });
  try {
    assert.equal((await s.call('/api/leads')).status, 200);
    assert.equal((await s.call('/')).status, 200);
    const sess = await (await s.call('/api/session')).json();
    assert.deepEqual(sess, { demo: true, login: false });
    const login = await s.entrar('qualquer-coisa');
    assert.equal(login.status, 200);
    assert.equal(login.headers.get('set-cookie'), null);
  } finally { s.close(); }
});
