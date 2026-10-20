// dispatcher/src/dispatch-log.js
// Registro de cada tentativa de envio (pipeline/log-disparos.json).
//
// Por que o registro nasce ANTES do envio: o sendText pode chegar no WhatsApp e o
// processo cair (ou a rede estourar o timeout) antes de alguém gravar "enviado".
// Sem o registro prévio, o próximo ciclo manda a mesma mensagem de novo. Com ele,
// a tentativa fica como "sending" e bloqueia o reenvio daquele toque.
//
// Status que BLOQUEIAM reenvio do mesmo (lead, toque):
//   sending   — envio começou e não terminou (processo caiu no meio)
//   sent      — confirmado
//   ambiguous — o pedido foi feito mas não deu pra saber se saiu (timeout, 5xx)
// "failed" (falhou antes de mandar: número sem WhatsApp, validação fora do ar)
// e "rejected" (a Evolution recusou com 4xx) não bloqueiam: nada saiu.

import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { readJson, writeJsonAtomic } from './fs-atomic.js';
import { ymdInTz } from './tz.js';

export const BLOCKING_STATUSES = new Set(['sending', 'sent', 'ambiguous']);

const LOG_FILE = () => path.join(config.pipelineDir, 'log-disparos.json');

export async function readDispatchLog() {
  const log = await readJson(LOG_FILE(), []);
  return Array.isArray(log) ? log : [];
}

// Grava a tentativa antes do envio. Se não conseguir gravar, lança: quem chama
// NÃO envia (sem registro não há como impedir o reenvio).
export async function markSending(lead, touch) {
  const log = await readDispatchLog();
  const attempt_id = crypto.randomUUID();
  log.push({
    attempt_id,
    timestamp: new Date().toISOString(),
    lead_id: lead.lead_id,
    touch,
    phone: lead.phone,
    status: 'sending',
    error: null,
  });
  await writeJsonAtomic(LOG_FILE(), log);
  return attempt_id;
}

export async function finishAttempt(attemptId, status, error = null) {
  const log = await readDispatchLog();
  const entry = log.find((e) => e.attempt_id === attemptId);
  if (!entry) return false;
  entry.status = status;
  entry.error = error;
  entry.finished_at = new Date().toISOString();
  await writeJsonAtomic(LOG_FILE(), log);
  return true;
}

// "lead_id:toque" de tudo que já saiu ou pode ter saído.
export function attemptedKeys(log) {
  const keys = new Set();
  for (const e of log) {
    if (e && BLOCKING_STATUSES.has(e.status)) keys.add(`${e.lead_id}:${e.touch}`);
  }
  return keys;
}

// Leads novos (toque 1) que já saíram ou podem ter saído HOJE, no fuso do aluno.
// É o que conta para o teto diário.
export function newLeadsOn(log, ymd, tz = config.timezone) {
  const ids = new Set();
  for (const e of log) {
    if (!e || e.touch !== 1 || !BLOCKING_STATUSES.has(e.status) || !e.timestamp) continue;
    const d = new Date(e.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    if (ymdInTz(d, tz) === ymd) ids.add(e.lead_id);
  }
  return ids;
}
