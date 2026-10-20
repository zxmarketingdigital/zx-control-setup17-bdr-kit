import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Revisão do Setup 17: teto diário, envio sem duplicar, número sem confirmação,
// pedido de parar no modo manual. Tudo isolado num pipeline temporário e com o
// WhatsApp trocado por stub (nenhum teste aqui alcança rede ou número real).
const PIPELINE = await fs.mkdtemp(path.join(os.tmpdir(), 'zxc7-revisao-'));
process.env.PIPELINE_DIR = PIPELINE;
process.env.DAILY_NEW_CAP = '20';
process.env.EVOLUTION_API_URL = 'http://127.0.0.1:9';
process.env.EVOLUTION_API_KEY = 'chave-de-teste-123456789012345678';

const { config } = await import('../src/config.js');
const { filterDispatchableQueue } = await import('../src/queue.js');
const { readDispatchLog, attemptedKeys } = await import('../src/dispatch-log.js');
const { dispatchTouch } = await import('../src/dispatch.js');
const { clearToFollowUp } = await import('../src/followup-guard.js');
const { detectOptOut } = await import('../src/opt-out-detector.js');
const { addWorkingDays } = await import('../src/window.js');

const LOG = path.join(PIPELINE, 'log-disparos.json');
const MASTER = path.join(PIPELINE, 'leads-master.json');

test.after(async () => { await fs.rm(PIPELINE, { recursive: true, force: true }); });

test('isolamento: o pipeline do teste é a pasta temporária', () => {
  assert.equal(config.pipelineDir, PIPELINE);
});

const fila = (n) => Array.from({ length: n }, (_, i) => ({ lead_id: `q${i}`, phone: `+55119888${String(i).padStart(5, '0')}`, copy: 'oi' }));
const envioHoje = (i, status = 'sent') => ({ timestamp: new Date().toISOString(), lead_id: `ja${i}`, touch: 1, phone: `+55119777${String(i).padStart(5, '0')}`, status });

// ── Teto: conta o que já saiu hoje ──────────────────────────────────────────
test('teto diário desconta os envios de hoje (20 já enviados → fila vazia; 5 → sobram 15)', async () => {
  await fs.writeFile(MASTER, '{}');
  await fs.writeFile(LOG, JSON.stringify(Array.from({ length: 20 }, (_, i) => envioHoje(i))));
  assert.equal((await filterDispatchableQueue(fila(30))).length, 0);
  await fs.writeFile(LOG, JSON.stringify(Array.from({ length: 5 }, (_, i) => envioHoje(i))));
  assert.equal((await filterDispatchableQueue(fila(30))).length, 15);
});

test('tentativa sem confirmação ou em andamento conta no teto e bloqueia o mesmo lead', async () => {
  await fs.writeFile(MASTER, '{}');
  await fs.writeFile(LOG, JSON.stringify([
    { ...envioHoje(0, 'ambiguous'), lead_id: 'q0' },
    { ...envioHoje(1, 'sending'), lead_id: 'q1' },
    { ...envioHoje(2, 'failed'), lead_id: 'q2' },
  ]));
  const out = (await filterDispatchableQueue(fila(30))).map((e) => e.lead_id);
  assert.ok(!out.includes('q0') && !out.includes('q1'), 'q0/q1 já tiveram tentativa');
  assert.ok(out.includes('q2'), 'falha antes do envio não bloqueia');
  assert.equal(out.length, 18, '20 - 2 tentativas que podem ter saído');
});

// ── Envio: registro antes, nunca duplica ────────────────────────────────────
test('timeout/5xx depois do envio grava "ambiguous" e bloqueia o reenvio daquele toque', async () => {
  await fs.writeFile(MASTER, '{}');
  await fs.writeFile(LOG, '[]');
  const lead = { lead_id: 'lead-x', phone: '+5511999990100', copy: 'oi', touch: 1 };
  let enviou = 0;
  const status = await dispatchTouch(lead, 1, {
    sendMessage: async () => { enviou++; const e = new Error('timeout'); e.sendAttempted = true; throw e; },
    recordTouchSent: async () => assert.fail('não pode gravar como enviado'),
  });
  assert.equal(enviou, 1);
  assert.equal(status, 'ambiguous');
  const log = await readDispatchLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].status, 'ambiguous');
  assert.ok(attemptedKeys(log).has('lead-x:1'));
  assert.ok(!(await filterDispatchableQueue([lead])).length, 'não volta pra fila');
});

test('4xx da Evolution grava "rejected" (nada saiu) e libera nova tentativa', async () => {
  await fs.writeFile(LOG, '[]');
  const status = await dispatchTouch({ lead_id: 'lead-y', phone: '+5511999990101', copy: 'oi' }, 1, {
    sendMessage: async () => { const e = new Error('400'); e.sendAttempted = true; e.notSent = true; throw e; },
  });
  assert.equal(status, 'rejected');
  assert.ok(!attemptedKeys(await readDispatchLog()).has('lead-y:1'));
});

test('se não der pra registrar a tentativa antes, não envia', async () => {
  await fs.rm(LOG, { force: true });
  await fs.mkdir(LOG); // log ocupado por uma pasta: a gravação falha
  let enviou = 0;
  try {
    const status = await dispatchTouch({ lead_id: 'lead-z', phone: '+5511999990102', copy: 'oi' }, 1, {
      sendMessage: async () => { enviou++; },
    });
    assert.equal(status, 'failed');
    assert.equal(enviou, 0);
  } finally {
    await fs.rm(LOG, { recursive: true, force: true });
  }
});

// ── WhatsApp: erro depois do pedido sai marcado; número sem confirmação não envia ──
async function comEvolution(handler, fn) {
  const realFetch = globalThis.fetch;
  const chamadas = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    chamadas.push(u.replace(/^https?:..[^/]+/, ''));
    if (u.includes('/instance/connectionState')) return Response.json({ instance: { state: 'open' } });
    return handler(u);
  };
  const { initWhatsApp, sendMessage, destroyClient } = await import('../src/whatsapp.js');
  try { await initWhatsApp(); await fn(sendMessage, chamadas); }
  finally { globalThis.fetch = realFetch; await destroyClient(); }
}

test('validação sem "exists: true" não envia', async () => {
  await comEvolution((u) => (u.includes('/chat/whatsappNumbers') ? Response.json([{ jid: '5511999990103@s.whatsapp.net' }]) : Response.json({ key: { id: 'X' } }, { status: 201 })),
    async (sendMessage, chamadas) => {
      await assert.rejects(() => sendMessage('+5511999990103', 'oi'), /sem WhatsApp/);
      assert.ok(!chamadas.some((c) => c.includes('/message/sendText')));
    });
});

test('5xx no sendText sai como "pode ter saído"; 4xx sai como "não saiu"', async () => {
  for (const [code, notSent] of [[502, false], [400, true]]) {
    await comEvolution((u) => (u.includes('/chat/whatsappNumbers') ? Response.json([{ exists: true, jid: '5511999990104@s.whatsapp.net' }]) : new Response('erro', { status: code })),
      async (sendMessage) => {
        const err = await sendMessage('+5511999990104', 'oi').then(() => null, (e) => e);
        assert.ok(err, `HTTP ${code} tinha que falhar`);
        assert.equal(err.sendAttempted, true, `HTTP ${code}`);
        assert.equal(!!err.notSent, notSent, `HTTP ${code}`);
      });
  }
});

// ── Follow-up no modo manual: lead que pediu pra parar não recebe ───────────
const leadMaster = { phone: '+5511999990105', status: 'active', history: [{ touch: 1, sent_at: '2026-10-19T13:00:00.000Z' }] };

function stubs(msgs) {
  const calls = { responded: [], closed: [], polled: 0 };
  return {
    calls,
    deps: {
      fetchInboundMessages: async () => msgs,
      pollInbound: async () => { calls.polled++; return []; },
      markResponded: async (id) => { calls.responded.push(id); },
      markClosed: async (id, reason) => { calls.closed.push([id, reason]); },
    },
  };
}

test('modo manual: "Por favor, pare." antes do toque 2 vira opt-out e o follow-up não sai', async () => {
  await fs.writeFile(path.join(PIPELINE, 'inbound-cursor.json'), '{}');
  const { calls, deps } = stubs([{ id: 'm1', text: 'Por favor, pare.', timestamp: '2026-10-19T15:00:00.000Z' }]);
  assert.equal(await clearToFollowUp('lead-p', leadMaster, { autoMode: false }, deps), false);
  assert.deepEqual(calls.responded, ['lead-p']);
  assert.deepEqual(calls.closed, [['lead-p', 'opt_out']]);
});

test('modo manual: qualquer resposta pausa a cadência (sem opt-out)', async () => {
  const { calls, deps } = stubs([{ id: 'm2', text: 'Quanto custa?', timestamp: '2026-10-19T15:00:00.000Z' }]);
  assert.equal(await clearToFollowUp('lead-q', leadMaster, { autoMode: false }, deps), false);
  assert.deepEqual(calls.responded, ['lead-q']);
  assert.deepEqual(calls.closed, []);
});

test('sem mensagem nova o follow-up segue; mensagem já vista não conta', async () => {
  await fs.writeFile(path.join(PIPELINE, 'inbound-cursor.json'), JSON.stringify({ 'lead-r': ['velha'] }));
  const { calls, deps } = stubs([{ id: 'velha', text: 'oi', timestamp: '2026-10-19T15:00:00.000Z' }]);
  assert.equal(await clearToFollowUp('lead-r', leadMaster, { autoMode: false }, deps), true);
  assert.equal(calls.responded.length, 0);
});

test('não deu pra ler o WhatsApp: follow-up adiado; modo automático: pula sem consumir', async () => {
  const falha = { ...stubs([]).deps, fetchInboundMessages: async () => { throw new Error('evolution fora'); } };
  assert.equal(await clearToFollowUp('lead-s', leadMaster, { autoMode: false }, falha), false);
  const { calls, deps } = stubs([{ id: 'm3', text: 'pare', timestamp: '2026-10-19T15:00:00.000Z' }]);
  assert.equal(await clearToFollowUp('lead-t', leadMaster, { autoMode: true }, deps), false);
  assert.equal(calls.polled + calls.responded.length + calls.closed.length, 0, 'o ciclo automático é quem lê');
});

// ── Pedido de parar com cortesia ────────────────────────────────────────────
test('opt-out: frases educadas e variações comuns', () => {
  const sim = ['Por favor, pare.', 'pare, por favor', 'parem de mandar', 'cancelar', 'chega!', 'basta',
    'me remova dessa lista', 'não envie mais nada', 'não entre mais em contato', 'quero sair da lista',
    'isso é spam', 'vou denunciar', 'me deixa em paz', 'para com isso'];
  for (const t of sim) assert.equal(detectOptOut(t).optOut, true, t);
  for (const t of ['quero sair de férias', 'vou sair mais cedo hoje', 'não tenho interesse no momento'])
    assert.equal(detectOptOut(t).optOut, false, t);
});

// ── Fuso: dia útil seguinte certo em UTC+ ───────────────────────────────────
test('addWorkingDays: sexta + 1 dia útil = segunda, também em fuso UTC+ (Lisboa)', () => {
  const antes = process.env.TZ;
  process.env.TZ = 'Europe/Lisbon';
  try { assert.equal(addWorkingDays('2026-10-16', 1), '2026-10-19'); }
  finally { if (antes === undefined) delete process.env.TZ; else process.env.TZ = antes; }
});

// ── .env com número inválido não vira NaN ───────────────────────────────────
test('config: intervalo inválido no .env cai no padrão (nunca NaN)', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const r = spawnSync(process.execPath, ['-e', "import('../src/config.js').then(m=>console.log(JSON.stringify([m.config.intervalMinSeconds,m.config.intervalMaxSeconds,m.config.workingDays])))"], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, PIPELINE_DIR: PIPELINE, INTERVAL_MIN_SECONDS: 'abc', INTERVAL_MAX_SECONDS: '', WORKING_DAYS: 'x' },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').pop()), [120, 180, [1, 2, 3, 4, 5]]);
});
