import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Lead que manda imagem/áudio vai pro humano. O lead só sai do "lido e não tratado"
// (settleConsumed) depois que o needs_review foi gravado: se a gravação falha, a mensagem
// já saiu do cursor e o registro de resposta ainda precisa acontecer.
const PIPELINE = await fs.mkdtemp(path.join(os.tmpdir(), 'zxc7-handoff-'));
process.env.PIPELINE_DIR = PIPELINE;
const { handOffToHuman, settleConsumed } = await import('../src/consumed-guard.js');

test.after(async () => { await fs.rm(PIPELINE, { recursive: true, force: true }); });

test('gravou o needs_review: o lead sai da lista de lidos e não tratados', async () => {
  const handled = new Set();
  const chamadas = [];
  await handOffToHuman('A', 'Lead mandou imagem', handled, { markNeedsReview: async (...a) => chamadas.push(a) });
  assert.deepEqual(chamadas, [['A', 'Lead mandou imagem']]);
  assert.equal(handled.has('A'), true);
});

test('a gravação falha: o lead NÃO fica como tratado e o settleConsumed ainda registra a resposta', async () => {
  const handled = new Set();
  const falha = async () => { throw new Error('disco cheio'); };
  await assert.rejects(handOffToHuman('A', 'Lead mandou imagem', handled, { markNeedsReview: falha }), /disco cheio/);
  assert.equal(handled.has('A'), false);

  const registrados = [];
  const msgs = [{ phone: '5511999990001', message: '[imagem]', media: 'image' }];
  await settleConsumed([['A', msgs]].filter(([id]) => !handled.has(id)), {
    markResponded: async (id, phone) => registrados.push(['responded', id, phone]),
    markClosed: async () => registrados.push(['closed']),
  });
  assert.deepEqual(registrados, [['responded', 'A', '5511999990001']]);
});

test('com o master de verdade: needs_review gravado e a anotação fica para o humano ver', async () => {
  const f = path.join(PIPELINE, 'leads-master.json');
  await fs.writeFile(f, JSON.stringify({ A: { phone: '5511999990001', status: 'responded', history: [] } }));
  const handled = new Set();
  await handOffToHuman('A', 'Lead mandou imagem: veja e responda você', handled);
  const lead = JSON.parse(await fs.readFile(f, 'utf8')).A;
  assert.equal(lead.status, 'needs_review');
  assert.match(lead.annotations.at(-1).text, /Lead mandou imagem/);
  assert.equal(handled.has('A'), true);
});
