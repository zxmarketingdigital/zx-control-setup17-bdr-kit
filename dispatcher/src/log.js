import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = process.env.DISPATCHER_LOG_FILE || path.resolve(__dirname, '..', 'dispatcher.log');
// O arquivo gira ao passar de 5 MB: dispatcher.log vira .1, o .1 vira .2, o .2 vira .3 e o .3 é apagado.
// (As variáveis de ambiente só existem pra teste.)
const MAX_BYTES = Number(process.env.DISPATCHER_LOG_MAX_BYTES) || 5 * 1024 * 1024;
const KEEP = 3;

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
let configuredLevel = 'info';

export function setLogLevel(level) {
  configuredLevel = level;
}

function maskPhone(str) {
  return str.replace(/\+?\d{10,15}/g, (m) => m.slice(0, 4) + '****' + m.slice(-2));
}

function timestamp() {
  return new Date().toISOString();
}

async function rotateIfNeeded() {
  let size = 0;
  try {
    size = (await fs.stat(LOG_FILE)).size;
  } catch {
    return; // ainda não existe
  }
  if (size < MAX_BYTES) return;
  for (let i = KEEP; i >= 1; i--) {
    const from = i === 1 ? LOG_FILE : `${LOG_FILE}.${i - 1}`;
    const to = `${LOG_FILE}.${i}`;
    try {
      if (i === KEEP) await fs.rm(to, { force: true });
      await fs.rename(from, to);
    } catch {
      // arquivo intermediário não existe: segue
    }
  }
}

async function writeToFile(line) {
  try {
    await rotateIfNeeded();
    await fs.appendFile(LOG_FILE, line + '\n', 'utf8');
  } catch {
    // file write failure must never crash the dispatcher
  }
}

function format(level, module, message) {
  return `[${timestamp()}] [${level.toUpperCase().padEnd(5)}] [${module}] ${message}`;
}

async function log(level, module, message) {
  if (LEVELS[level] > LEVELS[configuredLevel]) return;

  // O telefone do lead é dado pessoal: mascarado no terminal E no arquivo de log.
  const fileLine = format(level, module, maskPhone(message));
  const consoleLine = fileLine;

  const colors = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m' };
  const reset = '\x1b[0m';
  const color = colors[level] ?? '';

  if (level === 'error') {
    process.stderr.write(color + consoleLine + reset + '\n');
  } else {
    process.stdout.write(color + consoleLine + reset + '\n');
  }

  await writeToFile(fileLine);
}

export const logger = {
  error: (module, msg) => log('error', module, msg),
  warn:  (module, msg) => log('warn',  module, msg),
  info:  (module, msg) => log('info',  module, msg),
  debug: (module, msg) => log('debug', module, msg),
};
