import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const PIPELINE = await fs.mkdtemp(path.join(os.tmpdir(), 'zxc7-p4-'));
process.env.PIPELINE_DIR = PIPELINE;
const { isLeadSendable, markClosed } = await import('../src/master.js');
const { phoneKey } = await import('../src/phone.js');

test('follow-up não sai para número que pediu pra parar em outro lead_id', async () => {
  await fs.writeFile(path.join(PIPELINE, 'leads-master.json'), JSON.stringify({
    velho: { phone: '+55 11 98765-4321', opt_out: true, status: 'cold' },
    novo: { phone: '11987654321', status: 'active' },
    outro: { phone: '11911112222', status: 'active' },
  }));
  assert.equal(await isLeadSendable('novo'), false);
  assert.equal(await isLeadSendable('outro'), true);
});

test('phoneKey trata o tronco 0 e o 00 internacional', () => {
  assert.equal(phoneKey('011 98765-4321'), '5511987654321');
  assert.equal(phoneKey('00351 912 345 678'), '351912345678');
  assert.equal(phoneKey('(11) 98765-4321'), '5511987654321');
});

test('encerramento pelo modelo com motivo fora do enum vira opt-out; sem_interesse não', async () => {
  const f = path.join(PIPELINE, 'leads-master.json');
  await fs.writeFile(f, JSON.stringify({ a: { phone: '11900000001', status: 'active' }, b: { phone: '11900000002', status: 'active' } }));
  await markClosed('a', 'pedido de parar');
  await markClosed('b', 'sem_interesse');
  const m = JSON.parse(await fs.readFile(f, 'utf8'));
  assert.equal(m.a.opt_out, true);
  assert.notEqual(m.b.opt_out, true);
});

test('lead novo (fora do master) com número que pediu pra parar não recebe o 1º toque', async () => {
  await fs.writeFile(path.join(PIPELINE, 'leads-master.json'), JSON.stringify({
    velho: { phone: '5511987654321', opt_out: true, status: 'cold' },
  }));
  assert.equal(await isLeadSendable('novo-sem-master', '(11) 98765-4321'), false);
  assert.equal(await isLeadSendable('outro-sem-master', '11911112222'), true);
});

test('master apagado com o dispatcher rodando: para em vez de gravar um master vazio', async () => {
  const { markClosed: mc, loadMaster } = await import('../src/master.js');
  const f = path.join(PIPELINE, 'leads-master.json');
  await fs.writeFile(f, JSON.stringify({ a: { phone: '11900000001', status: 'active' }, z: { opt_out: true } }));
  await loadMaster();
  await fs.rm(f);
  await assert.rejects(loadMaster(), /sumiu/);
  await assert.rejects(mc('a', 'sem_interesse'));
  await assert.rejects(fs.access(f));
});
