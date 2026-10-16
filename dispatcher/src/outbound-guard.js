// dispatcher/src/outbound-guard.js
// Filtro de saída: nada que pareça segredo ou caminho de arquivo sai pro lead.
//
// Segunda barreira contra prompt injection (a primeira é o modelo rodar sem
// ferramentas, ver claude-sandbox.js). Se o modelo for enganado a escrever uma
// chave, um token, um caminho ou o conteúdo de um .env, a mensagem é barrada e o
// lead vai pro humano, com nada enviado.
import fs from 'node:fs/promises';
import path from 'node:path';

const SECRET_KEY_NAME = /key|token|secret|pass|senha|apify|auth|credential/i;

function parseEnv(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

function stringValues(node, acc = []) {
  if (typeof node === 'string') acc.push(node);
  else if (node && typeof node === 'object') for (const v of Object.values(node)) stringValues(v, acc);
  return acc;
}

// Valores que NUNCA podem aparecer numa mensagem: o que está nos .env, no token
// da Meta e no token do Google, mais as variáveis de ambiente equivalentes.
export async function collectSecretValues(rootDir) {
  const secrets = new Set();
  const add = (v) => {
    const s = String(v ?? '').trim();
    if (s.length >= 8) secrets.add(s);
  };

  for (const rel of [['dispatcher', '.env'], ['crm', '.env']]) {
    try {
      const env = parseEnv(await fs.readFile(path.join(rootDir, ...rel), 'utf8'));
      for (const [k, v] of Object.entries(env)) {
        if (SECRET_KEY_NAME.test(k) || (v.length >= 24 && !/\s/.test(v) && !/^https?:\/\//.test(v))) add(v);
      }
    } catch { /* arquivo não existe */ }
  }
  try {
    const meta = await fs.readFile(path.join(rootDir, 'pipeline', '.meta_token'), 'utf8');
    meta.split('|').forEach(add);
  } catch { /* opcional */ }
  try {
    const g = JSON.parse(await fs.readFile(path.join(rootDir, 'crm', 'google-token.json'), 'utf8'));
    stringValues(g).filter((v) => v.length >= 16).forEach(add);
  } catch { /* opcional */ }
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(EVOLUTION_API_KEY|APIFY_TOKEN|ANTHROPIC_API_KEY|GOOGLE_CLIENT_SECRET)$/.test(k)) add(v);
  }
  return [...secrets];
}

const PATTERNS = [
  [/api[\s_-]?key|apikey/i, 'cita chave de API'],
  [/\btokens?\b|access[\s_-]?token|refresh[\s_-]?token|bearer\s+\S/i, 'cita token'],
  [/\bsk-[A-Za-z0-9_-]{6,}|apify_api_\w+|AIza[0-9A-Za-z_-]{20,}|ya29\.[\w-]+|GOCSPX-[\w-]+|\bgh[pousr]_\w{20,}|\bxox[abp]-[\w-]+/, 'tem formato de chave ou token'],
  [/\b[A-Fa-f0-9]{32,}\b/, 'tem sequência longa de caracteres que parece segredo'],
  [/(^|[\s"'`(/\\])\.env\b/i, 'cita o arquivo .env'],
  [/^\s*[A-Z][A-Z0-9_]{3,}\s*=\s*\S+/m, 'parece conteúdo de arquivo de configuração'],
  [/\b(?:dispatcher|crm|pipeline|setup|scripts|docs|node_modules|\.claude)[/\\][\w.\-/\\]+/i, 'cita caminho de arquivo do projeto'],
  [/\b[A-Za-z]:\\/, 'cita caminho de arquivo do Windows'],
  [/(^|\s)(?:~\/|\/(?:home|Users|etc|var|usr|root|opt|tmp)\/)/, 'cita caminho de arquivo'],
  [/\b(?:password|senha d[oa] (?:api|sistema|servidor)|secret)\b/i, 'cita senha ou segredo'],
];

// { ok: true } ou { ok: false, reason } (reason não repete o conteúdo barrado).
export function checkOutgoing(text, { secrets = [] } = {}) {
  const t = String(text ?? '');
  if (!t.trim()) return { ok: true };
  for (const s of secrets) {
    if (s && t.includes(s)) return { ok: false, reason: 'contém um valor de configuração secreto (chave ou token)' };
  }
  for (const [re, why] of PATTERNS) {
    if (re.test(t)) return { ok: false, reason: why };
  }
  return { ok: true };
}
