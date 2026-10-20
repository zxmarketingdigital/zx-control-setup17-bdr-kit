import 'dotenv/config';
import { getTimezone } from './tz.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Teto de leads NOVOS por dia: acima disso o risco de restrição do número sobe muito.
export const DAILY_NEW_CAP_MAX = 20;
const requestedCap = parseInt(process.env.DAILY_NEW_CAP ?? '10', 10);
const safeCap = Number.isFinite(requestedCap) && requestedCap > 0 ? requestedCap : 10;

// Número inteiro do .env; vazio, texto ou abaixo do mínimo cai no padrão.
function intEnv(name, fallback, min = 0) {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}
const intervalMin = intEnv('INTERVAL_MIN_SECONDS', 120, 1);
const intervalMax = Math.max(intEnv('INTERVAL_MAX_SECONDS', 180, 1), intervalMin);
// Lista vazia ou inválida travaria a contagem de dias úteis: volta para seg-sex.
const parsedDays = (process.env.WORKING_DAYS ?? '1,2,3,4,5').split(',').map((d) => d.trim()).filter(Boolean).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
const workingDays = parsedDays.length ? [...new Set(parsedDays)] : [1, 2, 3, 4, 5];
const replyMin = intEnv('AUTO_REPLY_DELAY_MIN_SECONDS', 9, 0);
const replyMax = Math.max(intEnv('AUTO_REPLY_DELAY_MAX_SECONDS', 9, 0), replyMin);

export const config = {
  timezone: getTimezone(),
  windowStartHour: intEnv('WINDOW_START_HOUR', 10, 0),
  windowEndHour: intEnv('WINDOW_END_HOUR', 18, 1),
  workingDays,
  intervalMinSeconds: intervalMin,
  intervalMaxSeconds: intervalMax,
  dailyNewCap: Math.min(safeCap, DAILY_NEW_CAP_MAX),
  dailyNewCapRequested: safeCap,
  // Modo automático: espera o lead terminar de mandar mensagens seguidas antes de responder.
  autoReplyDelayMinSeconds: replyMin,
  autoReplyDelayMaxSeconds: replyMax,
  pipelineDir: path.resolve(__dirname, '..', process.env.PIPELINE_DIR ?? '../pipeline'),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  // Evolution API (WhatsApp)
  evolutionApiUrl: (process.env.EVOLUTION_API_URL ?? 'http://localhost:8080').replace(/\/$/, ''),
  evolutionApiKey: process.env.EVOLUTION_API_KEY ?? '',
  evolutionInstance: process.env.EVOLUTION_INSTANCE ?? 'bdr-instance',
};
