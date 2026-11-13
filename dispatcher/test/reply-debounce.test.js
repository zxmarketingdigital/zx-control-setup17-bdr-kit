import test from 'node:test';
import assert from 'node:assert/strict';
import { settleBatch, pickDelayMs } from '../src/reply-debounce.js';
import { settleConsumed } from '../src/consumed-guard.js';

const sleepNada = async () => {};
const msg = (message) => ({ phone: '5511999990001', message });

// fetchMore que devolve, em ordem, cada item de `respostas`; um Error vira exceção.
function fonte(respostas) {
  let i = 0;
  return async () => {
    const r = respostas[i++] ?? [];
    if (r instanceof Error) throw r;
    return r;
  };
}

test('lead que emenda mensagens: o lote cresce até um intervalo sem nada novo', async () => {
  const lote = await settleBatch([msg('oi')], {
    fetchMore: fonte([[msg('tudo bem?')], [msg('queria saber o preço')], []]),
    nextDelayMs: () => 9000,
    sleep: sleepNada,
  });
  assert.deepEqual(lote.map((m) => m.message), ['oi', 'tudo bem?', 'queria saber o preço']);
});

test('teto de espera: lead que não para de escrever não segura o ciclo', async () => {
  let agora = 0;
  let chamadas = 0;
  const lote = await settleBatch([msg('1')], {
    fetchMore: async () => { chamadas++; return [msg(String(chamadas + 1))]; },
    nextDelayMs: () => 20_000,
    sleep: async (ms) => { agora += ms; },
    now: () => agora,
    maxWaitMs: 60_000,
  });
  assert.equal(chamadas, 3);
  assert.equal(lote.length, 4);
});

test('fetchMore lança no meio da espera: o erro sobe e o que já tinha chegado fica com o chamador', async () => {
  const guardado = [];
  await assert.rejects(
    settleBatch([msg('oi')], {
      fetchMore: fonte([[msg('pode parar de me mandar mensagem')], new Error('Evolution fora do ar')]),
      nextDelayMs: () => 9000,
      sleep: sleepNada,
      onMore: (parcial) => { guardado.length = 0; guardado.push(...parcial); },
    }),
    /Evolution fora do ar/,
  );
  // o "pare" que chegou antes do erro não se perde
  assert.deepEqual(guardado.map((m) => m.message), ['oi', 'pode parar de me mandar mensagem']);

  // e é isso que o settleConsumed recebe: o lead fecha como opt-out, sem resposta
  const feitos = [];
  await settleConsumed([['L1', guardado]], {
    markResponded: async (id) => feitos.push(['responded', id]),
    markClosed: async (id, why) => feitos.push(['closed', id, why]),
  });
  assert.deepEqual(feitos, [['responded', 'L1'], ['closed', 'L1', 'opt_out']]);
});

test('fetchMore lança já na primeira espera: nada novo, a mensagem inicial segue com o chamador', async () => {
  const inicial = [msg('oi')];
  let chamadasOnMore = 0;
  await assert.rejects(
    settleBatch(inicial, {
      fetchMore: fonte([new Error('rede')]),
      nextDelayMs: () => 9000,
      sleep: sleepNada,
      onMore: () => { chamadasOnMore++; },
    }),
    /rede/,
  );
  assert.equal(chamadasOnMore, 0);
  assert.deepEqual(inicial.map((m) => m.message), ['oi']);
});

test('desligamento durante a espera: devolve o que tem, sem buscar mais', async () => {
  let parar = false;
  let buscas = 0;
  const lote = await settleBatch([msg('oi')], {
    fetchMore: async () => { buscas++; return []; },
    nextDelayMs: () => 9000,
    sleep: async () => { parar = true; },
    shouldStop: () => parar,
  });
  assert.equal(buscas, 0);
  assert.equal(lote.length, 1);
});

test('pickDelayMs aceita min e max invertidos', () => {
  assert.equal(pickDelayMs(12, 8, () => 0), 8000);
  assert.equal(pickDelayMs(12, 8, () => 1), 12000);
});
