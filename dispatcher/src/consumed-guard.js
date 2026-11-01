// dispatcher/src/consumed-guard.js
// Mensagens que o modo automático leu (e tirou do cursor) mas não chegou a tratar.
// Sem este registro, o lead continuaria "active" e o follow-up sairia por cima da
// resposta dele. Só regra, sem modelo: marca como respondido e, se pediu pra parar,
// fecha como opt-out.

import { logger } from './log.js';
import { markResponded as realMarkResponded, markClosed as realMarkClosed, markNeedsReview as realMarkNeedsReview } from './master.js';
import { responseText } from './audio-transcriber.js';
import { detectOptOut } from './opt-out-detector.js';

const MOD = 'consumed';

// Passa o lead pro humano e só DEPOIS da gravação o tira do "lido e não tratado" (handled).
// Se o needs_review não gravar, o erro sobe, o lead continua fora de handled e o
// settleConsumed do fim do ciclo ainda registra a resposta dele.
export async function handOffToHuman(leadId, reason, handled, deps = {}) {
  const markNeedsReview = deps.markNeedsReview ?? realMarkNeedsReview;
  await markNeedsReview(leadId, reason);
  handled.add(leadId);
}

export async function settleConsumed(entries, deps = {}) {
  const markResponded = deps.markResponded ?? realMarkResponded;
  const markClosed = deps.markClosed ?? realMarkClosed;
  for (const [leadId, msgs] of entries) {
    if (!msgs?.length) continue;
    try {
      await markResponded(leadId, msgs[0].phone);
      if (msgs.some((r) => detectOptOut(responseText(r)).optOut)) {
        await markClosed(leadId, 'opt_out');
        logger.info(MOD, `${leadId} pediu pra parar: marcado como opt-out`);
      } else {
        logger.info(MOD, `${leadId} respondeu e ficou pra próxima rodada: marcado como respondido, cadência pausada`);
      }
    } catch (err) {
      logger.error(MOD, `${leadId}: não consegui registrar a resposta lida (${err.message.slice(0, 100)})`);
    }
  }
}
