import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Passada 2 da revisão: mesmo número com outro lead_id, log corrompido, respostas lidas
// e não tratadas. Pipeline temporário; nenhum teste aqui alcança rede ou número real.
const PIPELINE = await fs.mkdtemp(path.join(os.tmpdir(), 'zxc7-p2-'));
process.env.PIPELINE_DIR = PIPELINE;
process.env.DAILY_NEW_CAP = '20';
process.env.EVOLUTION_API_URL = 'http://127.0.0.1:9';
process.env.EVOLUTION_API_KEY = 'chave-de-teste-123456789012345678';

const { filterDispatchableQueue } = await import('../src/queue.js');
const { readDispatchLog } = await import('../src/dispatch-log.js');
const { settleConsumed } = await import('../src/consumed-guard.js');

const LOG = path.join(PIPELINE, 'log-disparos.json');
test.after(async () => { await fs.rm(PIPELINE, { recursive: true, force: true }); });

test('mesmo número com lead_id diferente recebe o primeiro contato uma vez só', async () => {
  await fs.writeFile(LOG, '[]');
  const out = await filterDispatchableQueue([
    { lead_id: 'L1', phone: '5511999990001', copy: 'oi' },
    { lead_id: 'L2', phone: '+55 (11) 99999-0001', copy: 'oi' },
    { lead_id: 'L3', phone: '5511999990002', copy: 'oi' },
  ]);
  assert.deepEqual(out.map((e) => e.lead_id), ['L1', 'L3']);
});

test('número que já recebeu o toque 1 por outro lead não recebe de novo', async () => {
  await fs.writeFile(LOG, JSON.stringify([{ lead_id: 'OLD', phone: '5511999990001', touch: 1, status: 'sent', timestamp: '2026-01-01T12:00:00Z' }]));
  const out = await filterDispatchableQueue([{ lead_id: 'NOVO', phone: '11 99999-0001'.replace(/^/, '55'), copy: 'oi' }]);
  assert.equal(out.length, 0);
});

test('log de disparos que não é lista para o envio em vez de virar log vazio', async () => {
  await fs.writeFile(LOG, '{"x":1}');
  await assert.rejects(readDispatchLog());
  await assert.rejects(filterDispatchableQueue([{ lead_id: 'L9', phone: '5511999990009', copy: 'oi' }]));
  await fs.writeFile(LOG, '[]');
});

test('resposta lida e não tratada: marca respondido, e opt-out fecha o lead', async () => {
  const chamadas = [];
  const deps = {
    markResponded: async (id, phone) => chamadas.push(['responded', id, phone]),
    markClosed: async (id, why) => chamadas.push(['closed', id, why]),
  };
  await settleConsumed([
    ['A', [{ phone: '1', message: 'tenho interesse sim' }]],
    ['B', [{ phone: '2', message: 'pode parar de me mandar mensagem' }]],
    ['C', []],
  ], deps);
  assert.deepEqual(chamadas, [['responded', 'A', '1'], ['responded', 'B', '2'], ['closed', 'B', 'opt_out']]);
});

test('erro num lead não impede de registrar os outros', async () => {
  const feitos = [];
  await settleConsumed([
    ['A', [{ phone: '1', message: 'oi' }]],
    ['B', [{ phone: '2', message: 'oi' }]],
  ], { markResponded: async (id) => { if (id === 'A') throw new Error('disco'); feitos.push(id); }, markClosed: async () => {} });
  assert.deepEqual(feitos, ['B']);
});
