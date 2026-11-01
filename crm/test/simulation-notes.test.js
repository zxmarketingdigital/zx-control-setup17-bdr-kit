import test from 'node:test';
import assert from 'node:assert/strict';
import { createMasterStore } from '../src/master-store.js';
import { saveNote, noteProblem } from '../src/simulations.js';

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

test('duas notas gravadas ao mesmo tempo sobrevivem (a gravação passa pela fila)', async () => {
  const f = memFile({});
  const { withFile } = createMasterStore(f);
  await Promise.all([
    saveNote(withFile, { key: 'A1#1', note: 'tom ok', verdict: 'ok' }),
    saveNote(withFile, { key: 'A1#2', note: 'cortar a 2ª frase', verdict: 'ajustar' }),
    saveNote(withFile, { key: 'B2#3', note: '', verdict: 'ok' }),
  ]);
  assert.deepEqual(Object.keys(f.get()).sort(), ['A1#1', 'A1#2', 'B2#3']);
  assert.equal(f.get()['A1#2'].verdict, 'ajustar');
});

test('nota vazia e sem veredito apaga a nota daquela mensagem, só dela', async () => {
  const f = memFile({ 'A1#1': { note: 'x', verdict: 'ok' }, 'A1#2': { note: 'y', verdict: null } });
  const { withFile } = createMasterStore(f);
  const notes = await saveNote(withFile, { key: 'A1#1', note: '   ', verdict: null });
  assert.deepEqual(Object.keys(notes), ['A1#2']);
  assert.deepEqual(Object.keys(f.get()), ['A1#2']);
});

test('a nota é cortada em 2000 caracteres e recebe a data', async () => {
  const f = memFile({});
  const { withFile } = createMasterStore(f);
  const notes = await saveNote(withFile, { key: 'BA#4', note: 'a'.repeat(3000), verdict: null });
  assert.equal(notes['BA#4'].note.length, 2000);
  assert.match(notes['BA#4'].updated_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('arquivo de notas em formato inesperado: para em vez de gravar por cima', async () => {
  for (const ruim of [['x'], 'texto', 7]) {
    const f = memFile(ruim);
    const { withFile } = createMasterStore(f);
    await assert.rejects(saveNote(withFile, { key: 'A1#1', note: 'x', verdict: 'ok' }), /formato inesperado/);
    assert.deepEqual(f.get(), ruim);
  }
});

test('chave e veredito inválidos são recusados antes de gravar', () => {
  assert.equal(noteProblem({ key: 'A1#1', verdict: 'ok' }), null);
  assert.equal(noteProblem({ key: 'BA#12', verdict: null }), null);
  assert.equal(noteProblem({ key: '__proto__', verdict: null }), 'key inválida');
  assert.equal(noteProblem({ key: 'C1#1', verdict: null }), 'key inválida');
  assert.equal(noteProblem({ key: 'A1#1', verdict: 'talvez' }), 'verdict inválido');
  assert.equal(noteProblem({}), 'key inválida');
});
