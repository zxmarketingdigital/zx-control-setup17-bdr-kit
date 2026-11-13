import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Lead pré-criado pelo CRM (só anotações, sem histórico de toques) que entra na fila:
// o envio acontece e o registro no master não pode lançar depois dele.
const PIPELINE = await fs.mkdtemp(path.join(os.tmpdir(), 'zxc7-hist-'));
process.env.PIPELINE_DIR = PIPELINE;
const { recordTouchSent, alreadySentTouch } = await import('../src/master.js');

const MASTER = path.join(PIPELINE, 'leads-master.json');
const NOTAS = { sinais_observados: 'Instagram parado há 3 meses' };
const lerMaster = async () => JSON.parse(await fs.readFile(MASTER, 'utf8'));

test.after(async () => { await fs.rm(PIPELINE, { recursive: true, force: true }); });

test('lead pré-criado sem history: o toque é registrado em vez de lançar depois do envio', async () => {
  await fs.writeFile(MASTER, JSON.stringify({ pre: { name: 'Clínica X', phone: '5511999990001', crm_notes: NOTAS } }));
  await recordTouchSent('pre', 1, 'oi, tudo bem?', { crm_notes: NOTAS });
  const lead = (await lerMaster()).pre;
  assert.deepEqual(lead.history.map((h) => [h.touch, h.copy]), [[1, 'oi, tudo bem?']]);
  assert.equal(lead.status, 'active');
  assert.equal(lead.current_touch, 1);
});

test('history que não é lista (null, objeto) é refeito como lista, sem lançar', async () => {
  for (const ruim of [null, {}, 'x']) {
    await fs.writeFile(MASTER, JSON.stringify({ pre: { phone: '5511999990001', first_contact_date: '2026-10-19', history: ruim } }));
    await recordTouchSent('pre', 2, 'segundo toque', {});
    assert.equal((await lerMaster()).pre.history.length, 1, JSON.stringify(ruim));
  }
});

test('alreadySentTouch num lead sem history responde false em vez de lançar', async () => {
  await fs.writeFile(MASTER, JSON.stringify({ pre: { phone: '5511999990001', crm_notes: NOTAS } }));
  assert.equal(await alreadySentTouch('pre', 1), false);
  await recordTouchSent('pre', 1, 'oi', {});
  assert.equal(await alreadySentTouch('pre', 1), true);
  assert.equal(await alreadySentTouch('pre', 2), false);
});
