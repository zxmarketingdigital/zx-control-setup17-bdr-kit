import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.resolve(__dirname, '..', 'dispatcher.log');

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

async function writeToFile(line) {
  try {
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

  const fileLine = format(level, module, message);
  const consoleLine = format(level, module, maskPhone(message));

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
