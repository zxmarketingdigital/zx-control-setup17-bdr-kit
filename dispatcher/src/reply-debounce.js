// dispatcher/src/reply-debounce.js
// Lead brasileiro emenda várias mensagens curtas em sequência ("oi" / "tudo bem?"
// / "queria saber o preço"). Responder a primeira na hora gera 3 respostas
// picadas. Aqui o modo automático espera o lead parar de digitar: depois de
// detectar mensagem nova, aguarda alguns segundos; se chegou mais alguma, espera
// de novo; só quando passa a janela inteira sem mensagem nova é que o lote todo
// vai junto pra decisão.

// Teto de segurança: o ciclo do dispatcher é de uma linha só, então um lead que
// não para de mandar mensagem não pode segurar o envio dos outros indefinidamente.
export const MAX_SETTLE_MS = 60_000;

export function pickDelayMs(minSeconds, maxSeconds, rand = Math.random) {
  const lo = Math.min(minSeconds, maxSeconds);
  const hi = Math.max(minSeconds, maxSeconds);
  return Math.round((lo + rand() * (hi - lo)) * 1000);
}

// initial: mensagens do lead já detectadas.
// fetchMore: busca só o que chegou depois (cursor já avançado), devolve array.
// nextDelayMs: devolve a próxima espera em ms (9s por padrão, ver config.js).
export async function settleBatch(initial, {
  fetchMore,
  nextDelayMs,
  sleep,
  maxWaitMs = MAX_SETTLE_MS,
  now = Date.now,
  shouldStop = () => false,
}) {
  const batch = [...initial];
  const startedAt = now();

  while (!shouldStop()) {
    const remaining = maxWaitMs - (now() - startedAt);
    if (remaining <= 0) break;
    await sleep(Math.min(nextDelayMs(), remaining));
    if (shouldStop()) break;

    const more = await fetchMore();
    if (more.length === 0) break;
    batch.push(...more);
  }

  return batch;
}
