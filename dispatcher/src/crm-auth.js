// dispatcher/src/crm-auth.js
// O modo automático chama o CRM (horários livres da agenda e marcar reunião). O CRM pede
// login; o dispatcher se identifica com a mesma senha (CRM_PASSWORD), no cabeçalho
// Authorization. A senha vem da variável de ambiente ou do crm/.env, ao lado desta pasta.
// Sem senha (CRM em modo demonstração), não manda cabeçalho nenhum.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CRM_ENV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'crm', '.env');

export function crmPassword({ envFile = CRM_ENV } = {}) {
  const fromEnv = (process.env.CRM_PASSWORD ?? '').trim();
  if (fromEnv) return fromEnv;
  try {
    const m = /^\s*CRM_PASSWORD\s*=\s*(.*?)\s*$/m.exec(fs.readFileSync(envFile, 'utf8'));
    return m ? m[1].replace(/^(['"])(.*)\1$/, '$2') : '';
  } catch {
    return '';
  }
}

export function crmAuthHeaders(opts) {
  const senha = crmPassword(opts);
  return senha ? { Authorization: `Bearer ${senha}` } : {};
}
