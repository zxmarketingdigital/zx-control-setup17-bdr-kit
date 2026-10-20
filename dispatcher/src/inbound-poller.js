// dispatcher/src/inbound-poller.js
// Polling de mensagens novas na Evolution API pros leads ativos.
//
// Sem webhook: o kit roda local, na máquina do comprador, sem URL pública pra
// receber callback — então polling é o único jeito que funciona no self-install.
// Só entra em ação quando o modo automático está ligado (ver auto-mode-config.js).

import path from 'node:path';
import { config } from './config.js';
import { logger } from './log.js';
import { readJson, writeJsonAtomic } from './fs-atomic.js';
import { detectAutoReply } from './auto-reply-detector.js';
import { fetchInboundMessages, transcribeEvolutionAudio, transcriptionSettings } from './audio-transcriber.js';

const MOD = 'inbound';
const CURSOR_FILE = () => path.join(config.pipelineDir, 'inbound-cursor.json');
const RESPONSES_FILE = () => path.join(config.pipelineDir, 'responses.json');
const FLAGGED_FILE = () => path.join(config.pipelineDir, 'flagged-auto-replies.json');

const evoCfg = () => ({ apiUrl: config.evolutionApiUrl, apiKey: config.evolutionApiKey, instance: config.evolutionInstance });

// Lead brasileiro manda muito áudio. Com TRANSCRIBE_AUDIO=true o áudio é
// transcrito aqui, localmente, e a transcrição vai junto da resposta. Sem isso
// (ou com imagem/arquivo), a mensagem entra marcada e vai pro humano
// (ver runAutoModeCycle no index.js). Nunca some em silêncio.

// Retorna só as respostas NOVAS e genuínas (já filtradas de auto-resposta) —
// o chamador decide o que fazer com elas (marcar respondido, acionar o
// modo automático etc). Auto-respostas detectadas vão só pra flagged-auto-replies.json.
export async function pollInbound(activeLeads) {
  const cursor = (await readJson(CURSOR_FILE(), {})) ?? {};
  const responses = (await readJson(RESPONSES_FILE(), [])) ?? [];
  const flagged = (await readJson(FLAGGED_FILE(), [])) ?? [];
  let cursorDirty = false;
  let responsesDirty = false;
  let flaggedDirty = false;
  const newResponses = [];
  const transcription = transcriptionSettings();

  for (const lead of activeLeads) {
    if (!lead.phone) continue;

    let msgs;
    try {
      msgs = await fetchInboundMessages(evoCfg(), lead.phone);
    } catch (err) {
      logger.warn(MOD, `Falha ao buscar mensagens de ${lead.phone}: ${err.message.slice(0, 120)}`);
      continue;
    }

    const seen = new Set(cursor[lead.id] || []);
    const lastOutbound = (lead.history || [])[lead.history.length - 1];

    for (const m of msgs) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      cursorDirty = true;

      // Mídia nunca é away-message; o filtro de padrão só vale pra texto.
      const det = m.media
        ? { isAutoReply: false, reasons: [] }
        : detectAutoReply({ message: m.text, sentAt: lastOutbound?.sent_at, receivedAt: m.timestamp });
      if (det.isAutoReply) {
        flagged.push({
          lead_id: lead.id, phone: lead.phone, message: m.text,
          received_at: m.timestamp, reasons: det.reasons,
        });
        flaggedDirty = true;
        logger.info(MOD, `Provável auto-resposta de ${lead.id}: ${det.reasons.join('; ')}`);
        continue;
      }

      const entry = { lead_id: lead.id, phone: lead.phone, received_at: m.timestamp, message: m.text, message_id: m.id };
      if (m.media) entry.media = m.media;
      if (m.media === 'audio') {
        entry.media_key = m.key;
        if (transcription.enabled) {
          entry.transcript = await transcribeEvolutionAudio(evoCfg(), m.key, transcription);
          logger.info(MOD, `Áudio de ${lead.id} transcrito (${entry.transcript.reliable ? 'confiável' : entry.transcript.reason}): "${entry.transcript.text.slice(0, 60)}"`);
        }
      }
      responses.push(entry);
      responsesDirty = true;
      newResponses.push(entry);
    }

    cursor[lead.id] = [...seen].slice(-50);
  }

  if (cursorDirty) await writeJsonAtomic(CURSOR_FILE(), cursor);
  if (responsesDirty) await writeJsonAtomic(RESPONSES_FILE(), responses);
  if (flaggedDirty) await writeJsonAtomic(FLAGGED_FILE(), flagged);

  return newResponses;
}
