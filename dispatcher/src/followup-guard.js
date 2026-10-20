// dispatcher/src/followup-guard.js
// Antes de cada follow-up (toques 2 a 6): o lead mandou alguma coisa desde o último toque?
//
// Sem isto, no modo manual um lead que respondeu "pare" continuava recebendo a cadência
// até alguém clicar "Puxar conversa" no CRM. Agora:
//   - modo manual: a mensagem nova é registrada (mesmo caminho do poller), o lead vira
//     "respondeu" e a cadência para; se for pedido de parar, vira opt-out.
//   - modo automático: só olha (não consome a mensagem) e pula o follow-up; o ciclo do
//     modo automático, logo depois, lê a mensagem e decide.
//   - se não der pra ler o WhatsApp: pula o follow-up (na dúvida, não manda).

import path from 'node:path';
import { config } from './config.js';
import { logger } from './log.js';
import { readJson } from './fs-atomic.js';
import { fetchInboundMessages as realFetch } from './audio-transcriber.js';
import { detectAutoReply } from './auto-reply-detector.js';
import { detectOptOut } from './opt-out-detector.js';
import { responseText } from './audio-transcriber.js';
import { pollInbound as realPoll } from './inbound-poller.js';
import { markResponded as realMarkResponded, markClosed as realMarkClosed } from './master.js';

const MOD = 'followup-guard';

const evoCfg = () => ({ apiUrl: config.evolutionApiUrl, apiKey: config.evolutionApiKey, instance: config.evolutionInstance });

// true = pode mandar o follow-up · false = não manda neste ciclo
// lead = entrada do leads-master (precisa de phone e history).
export async function clearToFollowUp(leadId, lead, { autoMode }, deps = {}) {
  const fetchInboundMessages = deps.fetchInboundMessages ?? realFetch;
  const pollInbound = deps.pollInbound ?? realPoll;
  const markResponded = deps.markResponded ?? realMarkResponded;
  const markClosed = deps.markClosed ?? realMarkClosed;

  if (!lead?.phone) return false;

  let msgs;
  try {
    msgs = await fetchInboundMessages(evoCfg(), lead.phone);
  } catch (err) {
    logger.warn(MOD, `${leadId}: não consegui ler o WhatsApp antes do follow-up (${err.message.slice(0, 80)}) — follow-up adiado`);
    return false;
  }

  const cursor = (await readJson(path.join(config.pipelineDir, 'inbound-cursor.json'), {})) ?? {};
  const seen = new Set(cursor[leadId] || []);
  const lastOutbound = (lead.history || [])[(lead.history || []).length - 1];
  const fresh = (msgs || []).filter((m) => !seen.has(m.id)).filter((m) => m.media
    || !detectAutoReply({ message: m.text, sentAt: lastOutbound?.sent_at, receivedAt: m.timestamp }).isAutoReply);

  if (fresh.length === 0) return true;

  if (autoMode) {
    logger.info(MOD, `${leadId}: respondeu desde o último toque — follow-up pulado, o modo automático lê a conversa`);
    return false;
  }

  // Modo manual: registra a resposta e para a cadência.
  const recorded = await pollInbound([{ id: leadId, ...lead }]).catch((err) => {
    logger.warn(MOD, `${leadId}: falha ao registrar resposta (${err.message.slice(0, 80)})`);
    return [];
  });
  const texts = [...recorded.map((r) => responseText(r)), ...fresh.map((m) => m.text)];
  await markResponded(leadId, lead.phone);
  if (texts.some((t) => detectOptOut(t).optOut)) {
    await markClosed(leadId, 'opt_out');
    logger.info(MOD, `${leadId} pediu pra parar: opt-out, sem follow-up`);
  } else {
    logger.info(MOD, `${leadId} respondeu: cadência pausada (veja a conversa no CRM)`);
  }
  return false;
}
