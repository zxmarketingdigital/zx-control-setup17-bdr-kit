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
  return { get: (p) => fetch(base + p, { redirect: 'manual' }), close: () => server.close() };
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
    for (const p of ['/auth/google/callback?code=abc', '/auth/google']) {
      const body = await (await s.get(p)).text();
      assert.ok(!body.includes('<script>'), `${p}: ${body}`);
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
