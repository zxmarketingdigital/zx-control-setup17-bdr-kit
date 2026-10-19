import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './log.js';
import { todayStr } from './window.js';
import { getOptOut } from './master.js';

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

  if (entries.length === 0) {
    logger.info(MOD, `No queue file for ${dateStr} or file is empty`);
    return [];
  }

  logger.info(MOD, `Loaded ${entries.length} entries from queue-${dateStr}.json`);
  return entries;
}

export async function loadAlreadySentToday() {
  const logPath = path.join(config.pipelineDir, 'log-disparos.json');
  const log = await readJson(logPath, []);
  const today = todayStr();

  const sentToday = new Set(
    log
      .filter((e) => e.timestamp?.startsWith(today) && e.status === 'sent' && e.touch === 1)
      .map((e) => e.lead_id)
  );
  return sentToday;
}

export async function filterDispatchableQueue(queueEntries) {
  const alreadySent = await loadAlreadySentToday();
  const optOut = await getOptOut();

  const pending = queueEntries.filter((entry) => {
    if (!entry.lead_id || !entry.phone || !entry.copy) {
      logger.warn(MOD, `Skipping malformed entry: ${JSON.stringify(entry)}`);
      return false;
    }
    // Pediu pra parar: nunca mais recebe nada, nem se voltar a aparecer numa fila.
    if (optOut.ids.has(entry.lead_id) || optOut.phones.has(entry.phone)) {
      logger.warn(MOD, `Skip ${entry.lead_id} — lead pediu pra parar (opt-out)`);
      return false;
    }
    if (alreadySent.has(entry.lead_id)) {
      logger.debug(MOD, `Skip ${entry.lead_id} — touch 1 already sent today`);
      return false;
    }
    return true;
  });

  if (pending.length > config.dailyNewCap) {
    logger.warn(MOD, `Queue has ${pending.length} entries; capping at ${config.dailyNewCap}`);
    return pending.slice(0, config.dailyNewCap);
  }

  return pending;
}
