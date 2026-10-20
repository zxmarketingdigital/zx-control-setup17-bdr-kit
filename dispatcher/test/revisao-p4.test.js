import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const PIPELINE = await fs.mkdtemp(path.join(os.tmpdir(), 'zxc7-p4-'));
process.env.PIPELINE_DIR = PIPELINE;
const { isLeadSendable } = await import('../src/master.js');
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
