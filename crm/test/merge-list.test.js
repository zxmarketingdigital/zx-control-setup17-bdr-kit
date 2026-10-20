import test from 'node:test';
import assert from 'node:assert/strict';
import { createMasterStore } from '../src/master-store.js';

function memFile(initial) {
  let data = structuredClone(initial);
  const tick = () => new Promise((r) => setTimeout(r, 5));
  return {
    readJson: async () => { await tick(); return structuredClone(data); },
    writeJsonAtomic: async (_f, v) => { await tick(); data = structuredClone(v); },
    get: () => data,
  };
}

test('duas rotas acrescentam anotação com retrato antigo: as duas ficam', async () => {
  const f = memFile({ a: { annotations: [{ at: '1', text: 'x' }] } });
  const store = createMasterStore(f);
  const s1 = await f.readJson(); const s2 = await f.readJson();
  const l1 = store.ownLead(s1, 'a'); const l2 = store.ownLead(s2, 'a');
  l1.annotations.push({ at: '2', text: 'opt-out' });
  l2.annotations.push({ at: '3', text: 'nota manual' });
  await Promise.all([store.saveLead('a', l1), store.saveLead('a', l2)]);
  assert.deepEqual(f.get().a.annotations.map((n) => n.at), ['1', '2', '3']);
});

test('remoção de item da lista continua valendo', async () => {
  const f = memFile({ a: { annotations: [{ at: '1' }, { at: '2' }] } });
  const store = createMasterStore(f);
  const l = store.ownLead(await f.readJson(), 'a');
  l.annotations.splice(0, 1);
  await store.saveLead('a', l);
  assert.deepEqual(f.get().a.annotations, [{ at: '2' }]);
});
