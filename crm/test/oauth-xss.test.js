import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerGoogleOAuthRoutes } from '../src/oauth-routes.js';
import { createAuth } from '../src/auth.js';

async function boot(cal) {
  const app = express();
  registerGoogleOAuthRoutes(app, cal);
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { get: (p, headers = {}) => fetch(base + p, { redirect: 'manual', headers }), close: () => server.close() };
}

const PAYLOAD = '<script>alert(document.cookie)</script>';

test('callback do Google: ?error= com script volta escapado, nunca como HTML ativo', async () => {
  const s = await boot({ handleAuthCallback: async () => {} });
  try {
    const res = await s.get('/auth/google/callback?error=' + encodeURIComponent(PAYLOAD));
    const body = await res.text();
    assert.equal(res.status, 400);
    assert.ok(!body.includes('<script>'), body);
    assert.ok(body.includes('&lt;script&gt;'), body);
  } finally { s.close(); }
});

test('callback do Google: mensagem de erro do provedor também é escapada', async () => {
  const s = await boot({ handleAuthCallback: async () => { throw new Error(PAYLOAD); }, getAuthUrl: async () => { throw new Error(PAYLOAD); } });
  try {
    const cookie = { cookie: 'zxcrm_oauth_state=st123' };
    for (const [p, h] of [['/auth/google/callback?code=abc&state=st123', cookie], ['/auth/google', {}]]) {
      const body = await (await s.get(p, h)).text();
      assert.ok(!body.includes('<script>'), `${p}: ${body}`);
      if (p.startsWith('/auth/google/callback')) assert.ok(body.includes('&lt;script&gt;'), 'chegou no handler e escapou');
    }
  } finally { s.close(); }
});

test('/assets/ com ".." (cru ou codificado) não passa sem login', async () => {
  const auth = createAuth({ password: 'Xk3m-Pq9R-tW4n-Jd7s' });
  const app = express();
  app.use(auth.middleware);
  app.get(/^\/assets\/.*/, (req, res) => res.send('conteudo'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/assets/x.css', { redirect: 'manual' })).status, 200);
    for (const p of ['/assets/%2e%2e/server.js', '/assets/%2E%2E%2Fserver.js']) {
      const res = await fetch(base + p, { redirect: 'manual' });
      assert.notEqual(res.status, 200, p);
    }
  } finally { server.close(); }
});

test('callback do Google sem o state deste navegador é recusada antes de trocar o code', async () => {
  let trocou = 0;
  const s = await boot({ handleAuthCallback: async () => { trocou++; }, getAuthUrl: async (st) => `https://accounts.google.com/o?state=${st}` });
  try {
    const ini = await s.get('/auth/google');
    const setCookie = ini.headers.get('set-cookie') ?? '';
    const st = /zxcrm_oauth_state=([0-9a-f]+)/.exec(setCookie)?.[1];
    assert.ok(st && st.length >= 32, setCookie);
    assert.ok(/HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie));
    assert.ok((ini.headers.get('location') ?? '').includes(`state=${st}`), 'state vai pro Google');

    assert.equal((await s.get('/auth/google/callback?code=abc')).status, 400, 'sem state');
    assert.equal((await s.get(`/auth/google/callback?code=abc&state=${st}`)).status, 400, 'sem cookie');
    assert.equal((await s.get('/auth/google/callback?code=abc&state=outro', { cookie: `zxcrm_oauth_state=${st}` })).status, 400, 'state trocado');
    assert.equal(trocou, 0, 'nenhum code trocado por token');

    const ok = await s.get(`/auth/google/callback?code=abc&state=${st}`, { cookie: `zxcrm_oauth_state=${st}` });
    assert.notEqual(ok.status, 400);
    assert.equal(trocou, 1);
  } finally { s.close(); }
});

test('state com acento (mesmo nº de caracteres, bytes diferentes) é recusado sem estourar 500', async () => {
  let trocou = 0;
  const s = await boot({ handleAuthCallback: async () => { trocou++; } });
  try {
    const res = await s.get('/auth/google/callback?code=abc&state=' + encodeURIComponent('é'), { cookie: 'zxcrm_oauth_state=a' });
    assert.notEqual(res.status, 500);
    assert.ok(res.status >= 400 && res.status < 500, String(res.status));
    assert.equal(trocou, 0);
  } finally { s.close(); }
});
