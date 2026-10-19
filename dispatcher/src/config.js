import 'dotenv/config';
import { getTimezone } from './tz.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Teto de leads NOVOS por dia: acima disso o risco de restrição do número sobe muito.
export const DAILY_NEW_CAP_MAX = 20;
const requestedCap = parseInt(process.env.DAILY_NEW_CAP ?? '10', 10);
const safeCap = Number.isFinite(requestedCap) && requestedCap > 0 ? requestedCap : 10;

export const config = {
  timezone: getTimezone(),
  windowStartHour: parseInt(process.env.WINDOW_START_HOUR ?? '10', 10),
  windowEndHour: parseInt(process.env.WINDOW_END_HOUR ?? '18', 10),
  workingDays: (process.env.WORKING_DAYS ?? '1,2,3,4,5').split(',').map(Number),
  intervalMinSeconds: parseInt(process.env.INTERVAL_MIN_SECONDS ?? '120', 10),
  intervalMaxSeconds: parseInt(process.env.INTERVAL_MAX_SECONDS ?? '180', 10),
  dailyNewCap: Math.min(safeCap, DAILY_NEW_CAP_MAX),
  dailyNewCapRequested: safeCap,
  // Modo automático: espera o lead terminar de mandar mensagens seguidas antes de responder.
  autoReplyDelayMinSeconds: parseInt(process.env.AUTO_REPLY_DELAY_MIN_SECONDS ?? '9', 10),
  autoReplyDelayMaxSeconds: parseInt(process.env.AUTO_REPLY_DELAY_MAX_SECONDS ?? '9', 10),
  pipelineDir: path.resolve(__dirname, '..', process.env.PIPELINE_DIR ?? '../pipeline'),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  // Evolution API (WhatsApp)
  evolutionApiUrl: (process.env.EVOLUTION_API_URL ?? 'http://localhost:8080').replace(/\/$/, ''),
  evolutionApiKey: process.env.EVOLUTION_API_KEY ?? '',
  evolutionInstance: process.env.EVOLUTION_INSTANCE ?? 'bdr-instance',
};
