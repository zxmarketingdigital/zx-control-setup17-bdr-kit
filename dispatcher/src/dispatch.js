// dispatcher/src/dispatch.js
// Um envio de toque (1 a 6), com registro ANTES do envio para nunca mandar duas vezes.
// Ver dispatch-log.js para o que cada status significa.

import { logger } from './log.js';
import { sendMessage as realSendMessage } from './whatsapp.js';
import { recordTouchSent as realRecordTouchSent, markNeedsReview as realMarkNeedsReview, loadMaster } from './master.js';
import { markSending, finishAttempt } from './dispatch-log.js';

const MOD = 'dispatch';

// deps só existe para os testes trocarem o envio real.
export async function dispatchTouch(lead, touch, deps = {}) {
  const sendMessage = deps.sendMessage ?? realSendMessage;
  const recordTouchSent = deps.recordTouchSent ?? realRecordTouchSent;
  const markNeedsReview = deps.markNeedsReview ?? realMarkNeedsReview;

  let attemptId;
  try {
    attemptId = await markSending(lead, touch);
  } catch (err) {
    // Sem registro prévio não há como impedir um reenvio depois: não envia.
    logger.error(MOD, `Não consegui registrar a tentativa para ${lead.lead_id} (${err.message}): envio não feito`);
    return 'failed';
  }

  let status = 'failed';
  let error = null;
  let delivery = null;
  try {
    const res = await sendMessage(lead.phone, lead.copy);
    status = 'sent';
    // Aceita pela Evolution, mas sem confirmação do WhatsApp no prazo (aparelho do lead offline é o caso comum).
    // Conta como enviada para NÃO reenviar: mandar duas vezes é pior que uma mensagem atrasada.
    if (res && res.ack == null) delivery = 'unconfirmed';
    logger.info(MOD, `Dispatched touch ${touch} to ${lead.lead_id}`);
  } catch (err) {
    error = err.message;
    if (err.sendAttempted && !err.notSent) status = 'ambiguous';
    else if (err.sendAttempted) status = 'rejected';
    logger.error(MOD, `Failed dispatch touch ${touch} to ${lead.lead_id} (${status}): ${err.message}`);
  }

  if (status === 'sent') {
    try {
      await recordTouchSent(lead.lead_id, touch, lead.copy, lead);
    } catch (err) {
      // A mensagem saiu; o log abaixo continua bloqueando o reenvio.
      logger.error(MOD, `Mensagem saiu mas não consegui gravar no leads-master (${lead.lead_id}): ${err.message}`);
    }
  }

  try {
    await finishAttempt(attemptId, status, error, delivery);
  } catch (err) {
    // A tentativa fica como "sending", que também bloqueia o reenvio.
    logger.error(MOD, `Não consegui fechar o registro da tentativa de ${lead.lead_id}: ${err.message}`);
  }

  if (status === 'ambiguous') {
    const master = await loadMaster().catch(() => ({}));
    if (master[lead.lead_id]) {
      await markNeedsReview(lead.lead_id, `O toque ${touch} pode ter saído sem confirmação (${String(error).slice(0, 80)}). Confira no WhatsApp antes de mandar de novo.`).catch(() => {});
    } else {
      logger.warn(MOD, `${lead.lead_id}: toque ${touch} pode ter saído sem confirmação — não será reenviado automaticamente`);
    }
  }

  return status;
}
