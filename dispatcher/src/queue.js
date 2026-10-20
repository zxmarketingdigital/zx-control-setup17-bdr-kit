import { phoneKey } from './phone.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './log.js';
import { todayStr } from './window.js';
import { getOptOut } from './master.js';
import { readDispatchLog, attemptedKeys, newLeadsOn, BLOCKING_STATUSES } from './dispatch-log.js';
import { ymdInTz } from './tz.js';

const MOD = 'queue';

function queueFilePath(dateStr) {
  return path.join(config.pipelineDir, `queue-${dateStr}.json`);
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function loadTodayQueue() {
  const dateStr = todayStr();
  const filePath = queueFilePath(dateStr);
  const entries = await readJson(filePath, []);
  if (!Array.isArray(entries)) {
    throw new Error(`queue-${dateStr}.json não é uma lista. Corrija ou mova o arquivo antes de seguir.`);
  }

  if (entries.length === 0) {
    logger.info(MOD, `No queue file for ${dateStr} or file is empty`);
    return [];
  }

  logger.info(MOD, `Loaded ${entries.length} entries from queue-${dateStr}.json`);
  return entries;
}

// Leads novos que já saíram (ou podem ter saído) hoje. Conta tentativas "sending" e
// "ambiguous" também: no teto de risco do número, o que pode ter saído conta como saído.
export async function loadAlreadySentToday() {
  return newLeadsOn(await readDispatchLog(), todayStr());
}

export async function filterDispatchableQueue(queueEntries) {
  const log = await readDispatchLog();
  const sentToday = newLeadsOn(log, todayStr());
  const attempted = attemptedKeys(log);
  const today = todayStr();
  const triedToday = new Set(log.filter((e) => e?.touch === 1 && e.timestamp && ymdInTz(new Date(e.timestamp)) === today).map((e) => e.lead_id));
  // Mesmo número com lead_id diferente ("11 9..." e "+55 11 9...") é a mesma pessoa.
  const digits = phoneKey;
  const touchedPhones = new Set(log.filter((e) => e?.touch === 1 && e.phone
    && (BLOCKING_STATUSES.has(e.status) || (e.timestamp && ymdInTz(new Date(e.timestamp)) === today))).map((e) => digits(e.phone)));
  const phonesInBatch = new Set();
  const optOut = await getOptOut();

  const pending = queueEntries.filter((entry) => {
    if (!entry.lead_id || !entry.phone || !entry.copy) {
      logger.warn(MOD, `Skipping malformed entry: ${JSON.stringify(entry)}`);
      return false;
    }
    // Pediu pra parar: nunca mais recebe nada, nem se voltar a aparecer numa fila.
    if (optOut.ids.has(entry.lead_id) || optOut.phones.has(phoneKey(entry.phone))) {
      logger.warn(MOD, `Skip ${entry.lead_id} — lead pediu pra parar (opt-out)`);
      return false;
    }
    // Falhou hoje (número sem WhatsApp, validação fora, 4xx): não ocupa a vez de quem vem depois.
    if (triedToday.has(entry.lead_id)) {
      logger.debug(MOD, `Skip ${entry.lead_id} — já tentado hoje sem sucesso, fica pra amanhã`);
      return false;
    }
    if (attempted.has(`${entry.lead_id}:1`)) {
      logger.debug(MOD, `Skip ${entry.lead_id} — toque 1 já saiu (ou pode ter saído)`);
      return false;
    }
    const ph = digits(entry.phone);
    if (touchedPhones.has(ph) || phonesInBatch.has(ph)) {
      logger.warn(MOD, `Skip ${entry.lead_id} — esse número já recebeu (ou vai receber) o primeiro contato por outro lead`);
      return false;
    }
    phonesInBatch.add(ph);
    return true;
  });

  // O teto é por DIA, não por ciclo: o ciclo roda a cada 60s, então desconta o que já saiu hoje.
  const room = Math.max(0, config.dailyNewCap - sentToday.size);
  if (pending.length > room) {
    if (room === 0) logger.info(MOD, `Teto de ${config.dailyNewCap} leads novos hoje atingido — o resto fica pra amanhã`);
    else logger.warn(MOD, `Queue has ${pending.length} entries; ${sentToday.size} already today, capping at ${room}`);
    return pending.slice(0, room);
  }

  return pending;
}
