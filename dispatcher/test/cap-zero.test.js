import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// DAILY_NEW_CAP=0 é "pausar leads novos", não "usar o padrão".
const PIPELINE = await fs.mkdtemp(path.join(os.tmpdir(), 'zxc7-cap0-'));
process.env.PIPELINE_DIR = PIPELINE;
process.env.DAILY_NEW_CAP = '0';
process.env.EVOLUTION_API_URL = 'http://127.0.0.1:9';
process.env.EVOLUTION_API_KEY = 'chave-de-teste-123456789012345678';

const { config } = await import('../src/config.js');
const { filterDispatchableQueue } = await import('../src/queue.js');
test.after(async () => { await fs.rm(PIPELINE, { recursive: true, force: true }); });

test('DAILY_NEW_CAP=0 não manda nenhum lead novo', async () => {
  await fs.writeFile(path.join(PIPELINE, 'log-disparos.json'), '[]');
  assert.equal(config.dailyNewCap, 0);
  assert.equal((await filterDispatchableQueue([{ lead_id: 'L1', phone: '5511999990001', copy: 'oi' }])).length, 0);
});
