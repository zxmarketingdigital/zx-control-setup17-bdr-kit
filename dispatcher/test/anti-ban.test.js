import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Este arquivo roda num processo só dele (node --test isola por arquivo), então dá pra
// apontar o pipeline pra uma pasta temporária e limitar o teto antes dos imports.
const PIPELINE = await fs.mkdtemp(path.join(os.tmpdir(), 'zxc7-antiban-'));
process.env.PIPELINE_DIR = PIPELINE;
process.env.DAILY_NEW_CAP = '50';
process.env.EVOLUTION_API_URL = 'http://127.0.0.1:9';
process.env.EVOLUTION_API_KEY = 'chave-de-teste-123456789012345678';

const { detectOptOut } = await import('../src/opt-out-detector.js');
const { config, DAILY_NEW_CAP_MAX } = await import('../src/config.js');
const { filterDispatchableQueue } = await import('../src/queue.js');
const { getOptOut, isLeadSendable } = await import('../src/master.js');

test.after(async () => { await fs.rm(PIPELINE, { recursive: true, force: true }); });

// ── Pedido de parar, por regra ──────────────────────────────────────────────
test('detecta pedido explícito de parar', () => {
  const sim = [
    'PARE', 'Pare.', 'sair', 'Stop', 'remover', 'descadastrar',
    'pare de me mandar mensagem', 'Para de me ligar por favor', 'chega de me mandar isso',
    'não me mande mais', 'Não me chame mais', 'nao me procure',
    'não quero mais receber', 'Não quero receber mensagem de vocês', 'não quero mais contato',
    'Não quero.', 'não quero mais, obrigado',
    'remove meu número da lista', 'me tire da lista', 'exclua meu contato',
    'tire meu número daí', 'quero me descadastrar', 'Unsubscribe', 'please remove me', "don't contact me",
  ];
  for (const t of sim) assert.equal(detectOptOut(t).optOut, true, t);
});

test('conversa normal e recusa simples não são opt-out', () => {
  const nao = [
    'oi, tudo bem?', 'quanto custa?', 'pode ser quinta às 15h', 'me manda mais detalhes',
    'não tenho interesse no momento', 'agora não é prioridade', 'não quero perder tempo, qual o preço?',
    'preciso parar a loja amanhã, me liga depois', 'vou sair de férias semana que vem',
    'pode remover o item do orçamento?', 'como faço pra parar o anúncio que já roda?',
    '', null, undefined,
  ];
  for (const t of nao) assert.equal(detectOptOut(t).optOut, false, String(t));
});

// ── Opt-out nunca reabordado ────────────────────────────────────────────────
test('fila: lead com opt-out (por id ou por telefone) é pulado, os outros seguem', async () => {
  await fs.writeFile(path.join(PIPELINE, 'leads-master.json'), JSON.stringify({
    'lead-parou': { phone: '+5511999990001', status: 'cold', opt_out: true, history: [] },
    'lead-ok': { phone: '+5511999990002', status: 'active', history: [] },
  }));
  const queue = [
    { lead_id: 'lead-parou', phone: '+5511999990001', copy: 'oi' },
    { lead_id: 'outro-id-mesmo-telefone', phone: '+5511999990001', copy: 'oi' },
    { lead_id: 'lead-ok', phone: '+5511999990002', copy: 'oi' },
    { lead_id: 'lead-novo', phone: '+5511999990003', copy: 'oi' },
  ];
  const out = await filterDispatchableQueue(queue);
  assert.deepEqual(out.map((e) => e.lead_id), ['lead-ok', 'lead-novo']);
});

test('opt-out não é sendable e aparece em getOptOut', async () => {
  assert.equal(await isLeadSendable('lead-parou'), false);
  assert.equal(await isLeadSendable('lead-ok'), true);
  const o = await getOptOut();
  assert.ok(o.ids.has('lead-parou') && o.phones.has('+5511999990001'));
  assert.ok(!o.ids.has('lead-ok'));
});

// ── Teto de leads novos por dia ─────────────────────────────────────────────
test('DAILY_NEW_CAP acima do máximo é limitado a 20', () => {
  assert.equal(DAILY_NEW_CAP_MAX, 20);
  assert.equal(config.dailyNewCapRequested, 50);
  assert.equal(config.dailyNewCap, 20);
});

test('a fila respeita o teto', async () => {
  await fs.writeFile(path.join(PIPELINE, 'leads-master.json'), '{}');
  const queue = Array.from({ length: 30 }, (_, i) => ({ lead_id: `l${i}`, phone: `+55119999${String(i).padStart(5, '0')}`, copy: 'oi' }));
  assert.equal((await filterDispatchableQueue(queue)).length, 20);
});

// ── Número que não deu pra validar: não envia ───────────────────────────────
test('se a validação do número falha, o envio é pulado (nada vai pro sendText)', async () => {
  const chamadas = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    chamadas.push(`${opts.method || 'GET'} ${u.replace(/^https?:..[^/]+/, '')}`);
    if (u.includes('/instance/connectionState')) {
      return new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.includes('/chat/whatsappNumbers')) throw new Error('rede caiu');
    return new Response(JSON.stringify({ key: { id: 'X' } }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  };
  const { initWhatsApp, sendMessage, destroyClient } = await import('../src/whatsapp.js');
  try {
    await initWhatsApp();
    await assert.rejects(() => sendMessage('+5511999990009', 'oi'), /envio pulado/);
    assert.ok(!chamadas.some((c) => c.includes('/message/sendText')), `não podia enviar: ${chamadas.join(' | ')}`);
  } finally {
    globalThis.fetch = realFetch;
    await destroyClient();
  }
});

// ── Lead de demonstração nunca é enviado ────────────────────────────────────
test('lead de demonstração (no_send) não é sendable, mesmo ativo e com follow-up vencido', async () => {
  await fs.writeFile(path.join(PIPELINE, 'leads-master.json'), JSON.stringify({
    'demo-01': { phone: '+551155500001', status: 'active', no_send: true, demo: true, next_touch_due_at: '2020-01-01T13:00:00.000Z', history: [] },
    'demo-teste': { phone: '+5527999990000', status: 'active', demo: true, history: [] },
  }));
  assert.equal(await isLeadSendable('demo-01'), false);
  assert.equal(await isLeadSendable('demo-teste'), true, 'o lead de teste (número do operador) pode receber');
});
