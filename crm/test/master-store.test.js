import test from 'node:test';
import assert from 'node:assert/strict';
import { createMasterStore } from '../src/master-store.js';

// Arquivo em memória com um await entre ler e gravar, igual ao disco.
function memFile(initial) {
  let data = structuredClone(initial);
  const tick = () => new Promise((r) => setTimeout(r, 5));
  return {
    readJson: async () => { await tick(); return structuredClone(data); },
    writeJsonAtomic: async (_f, v) => { await tick(); data = structuredClone(v); },
    get: () => data,
  };
}

test('duas rotas com retrato antigo do master: as duas gravações sobrevivem', async () => {
  const f = memFile({ a: { status: 'new' }, b: { status: 'new' } });
  const store = createMasterStore(f);
  const snapA = await f.readJson(); const snapB = await f.readJson();   // lidos antes de qualquer gravação
  snapA.a.status = 'responded'; snapB.b.status = 'cold';
  await Promise.all([store.saveLead('a', snapA.a), store.saveLead('b', snapB.b)]);
  assert.equal(f.get().a.status, 'responded');
  assert.equal(f.get().b.status, 'cold');
});

test('retrato antigo do mesmo lead não desfaz um opt-out gravado no meio', async () => {
  const f = memFile({ a: { status: 'new', opt_out: false } });
  const store = createMasterStore(f);
  const velho = (await f.readJson()).a;
  await store.saveLead('a', { status: 'closed', opt_out: true, closed_reason: 'opt_out', closed_at: 'x' });
  velho.status = 'responded';
  await store.saveLead('a', velho);
  assert.equal(f.get().a.opt_out, true);
  assert.equal(f.get().a.status, 'closed');
});

test('PATCH explícito de opt_out pode reverter o opt-out', async () => {
  const f = memFile({ a: { status: 'closed', opt_out: true } });
  const store = createMasterStore(f);
  await store.saveLead('a', { status: 'new', opt_out: false }, { allowOptOutChange: true });
  assert.equal(f.get().a.opt_out, false);
});

test('"__proto__" e chaves herdadas não viram lead', () => {
  const { ownLead } = createMasterStore(memFile({}));
  const master = JSON.parse('{"a":{"status":"new"}}');
  assert.equal(ownLead(master, '__proto__'), undefined);
  assert.equal(ownLead(master, 'toString'), undefined);
  assert.deepEqual(ownLead(master, 'a'), { status: 'new' });
});

test('uma gravação que falha não trava a fila', async () => {
  const f = memFile({ a: {} });
  let falhar = true;
  const store = createMasterStore({ ...f, writeJsonAtomic: async (n, v) => { if (falhar) { falhar = false; throw new Error('disco'); } return f.writeJsonAtomic(n, v); } });
  await assert.rejects(store.saveLead('a', { status: 'x' }));
  await store.saveLead('a', { status: 'y' });
  assert.equal(f.get().a.status, 'y');
});
