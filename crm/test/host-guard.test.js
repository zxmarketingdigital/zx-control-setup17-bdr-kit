import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedHost, isAllowedOrigin, hostGuard } from '../src/host-guard.js';

test('aceita só o próprio computador', () => {
  for (const h of ['localhost:3001', '127.0.0.1:3001', '[::1]:3001', 'LOCALHOST:3001']) {
    assert.equal(isAllowedHost(h, 3001), true, h);
  }
});

test('recusa host de rede, domínio externo e porta errada', () => {
  for (const h of ['192.168.0.10:3001', '0.0.0.0:3001', 'evil.example.com', 'evil.example.com:3001',
    'localhost.evil.com:3001', 'localhost:3002', 'localhost', '', undefined]) {
    assert.equal(isAllowedHost(h, 3001), false, String(h));
  }
});

test('Origin: ausente passa; do próprio CRM passa; de outro site não', () => {
  assert.equal(isAllowedOrigin(undefined, 3001), true);
  assert.equal(isAllowedOrigin('http://localhost:3001', 3001), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:3001', 3001), true);
  assert.equal(isAllowedOrigin('https://evil.example.com', 3001), false);
  assert.equal(isAllowedOrigin('http://evil.example.com:3001', 3001), false);
  assert.equal(isAllowedOrigin('null', 3001), false);
});

test('middleware responde 403 e não chama next para host inválido', () => {
  const mw = hostGuard(3001);
  let status = null; let called = false;
  const res = { status(s) { status = s; return this; }, type() { return this; }, send() { return this; } };
  mw({ headers: { host: 'evil.example.com' } }, res, () => { called = true; });
  assert.equal(status, 403);
  assert.equal(called, false);
});

test('middleware chama next para localhost', () => {
  const mw = hostGuard(3001);
  let called = false;
  mw({ headers: { host: 'localhost:3001' } }, {}, () => { called = true; });
  assert.equal(called, true);
});
