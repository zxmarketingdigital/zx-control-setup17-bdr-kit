import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { crmPassword, crmAuthHeaders } from '../src/crm-auth.js';

// Processo próprio (node --test isola por arquivo): dá pra mexer em process.env à vontade.
const DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'zxc7-crmauth-'));
test.after(async () => { await fs.rm(DIR, { recursive: true, force: true }); });

const envFile = (conteudo) => fs.writeFile(path.join(DIR, '.env'), conteudo).then(() => path.join(DIR, '.env'));

test('a senha do CRM vem do crm/.env e vira cabeçalho Bearer', async () => {
  delete process.env.CRM_PASSWORD;
  const file = await envFile('CRM_PORT=3001\nCRM_PASSWORD=Xk3m-Pq9R-tW4n-Jd7s\nTIMEZONE=Europe/Lisbon\n');
  assert.equal(crmPassword({ envFile: file }), 'Xk3m-Pq9R-tW4n-Jd7s');
  assert.deepEqual(crmAuthHeaders({ envFile: file }), { Authorization: 'Bearer Xk3m-Pq9R-tW4n-Jd7s' });
});

test('aceita valor entre aspas e arquivo com CRLF', async () => {
  delete process.env.CRM_PASSWORD;
  const file = await envFile('CRM_PASSWORD="uma-senha-com-aspas-1"\r\nOUTRA=1\r\n');
  assert.equal(crmPassword({ envFile: file }), 'uma-senha-com-aspas-1');
});

test('a variável de ambiente tem prioridade sobre o arquivo', async () => {
  const file = await envFile('CRM_PASSWORD=do-arquivo-do-arquivo\n');
  process.env.CRM_PASSWORD = '  do-ambiente-do-ambiente ';
  try {
    assert.equal(crmPassword({ envFile: file }), 'do-ambiente-do-ambiente');
  } finally { delete process.env.CRM_PASSWORD; }
});

test('sem senha (CRM em modo demonstração ou sem arquivo), não manda cabeçalho', async () => {
  delete process.env.CRM_PASSWORD;
  assert.deepEqual(crmAuthHeaders({ envFile: path.join(DIR, 'nao-existe.env') }), {});
  const file = await envFile('CRM_PORT=3001\n');
  assert.deepEqual(crmAuthHeaders({ envFile: file }), {});
});
