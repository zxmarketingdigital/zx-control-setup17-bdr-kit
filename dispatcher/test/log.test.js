import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Processo próprio (node --test isola por arquivo): dá pra apontar o log pra uma pasta
// temporária e baixar o limite de rotação antes de importar o logger.
const DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'zxc7-log-'));
const LOG = path.join(DIR, 'dispatcher.log');
process.env.DISPATCHER_LOG_FILE = LOG;
process.env.DISPATCHER_LOG_MAX_BYTES = '1500';

const { logger } = await import('../src/log.js');

test.after(async () => { await fs.rm(DIR, { recursive: true, force: true }); });

test('o telefone do lead é mascarado também no arquivo de log', async () => {
  await logger.info('teste', 'Sent to +5511999990001 via 5511999990001@s.whatsapp.net');
  const text = await fs.readFile(LOG, 'utf8');
  assert.match(text, /\+551\*\*\*\*01/);
  assert.ok(!text.includes('5511999990001'), 'o número inteiro não pode aparecer no arquivo');
});

test('o log gira ao passar do limite e guarda só 3 arquivos antigos', async () => {
  for (let i = 0; i < 150; i++) await logger.info('teste', `linha ${i} ${'x'.repeat(60)}`);
  const names = (await fs.readdir(DIR)).sort();
  assert.deepEqual(names, ['dispatcher.log', 'dispatcher.log.1', 'dispatcher.log.2', 'dispatcher.log.3']);
  const atual = (await fs.stat(LOG)).size;
  assert.ok(atual < 1500 + 250, `o arquivo atual deveria estar perto do limite, está com ${atual} bytes`);
});
