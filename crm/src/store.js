// crm/src/store.js
// Helpers genéricos de I/O de JSON no diretório pipeline.
// Writes atômicos (temp+rename) pra evitar corrupção quando dispatcher e CRM escrevem ao mesmo tempo.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PIPELINE_DIR = path.resolve(__dirname, '..', '..', 'pipeline');

export async function readJson(file, fallback = null) {
  try {
    const raw = await fs.readFile(path.join(PIPELINE_DIR, file), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function writeJsonAtomic(file, data) {
  await fs.mkdir(PIPELINE_DIR, { recursive: true });
  const full = path.join(PIPELINE_DIR, file);
  const tmp = `${full}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, full);
}

// gera ID curto deterministicamente fora de colisão razoável
export function newId(prefix = '') {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}${prefix ? '-' : ''}${ts}${rand}`;
}

// Helper genérico de CRUD em arquivo JSON que armazena array de entidades com `id`
export async function loadCollection(file) {
  const data = await readJson(file, []);
  return Array.isArray(data) ? data : [];
}

export async function saveCollection(file, items) {
  await writeJsonAtomic(file, items);
}

export async function addEntity(file, entity, prefix = '') {
  const items = await loadCollection(file);
  const newEntity = { id: entity.id || newId(prefix), created_at: new Date().toISOString(), ...entity };
  items.push(newEntity);
  await saveCollection(file, items);
  return newEntity;
}

export async function updateEntity(file, id, patch) {
  const items = await loadCollection(file);
  const idx = items.findIndex(e => e.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, updated_at: new Date().toISOString() };
  await saveCollection(file, items);
  return items[idx];
}

export async function deleteEntity(file, id) {
  const items = await loadCollection(file);
  const before = items.length;
  const filtered = items.filter(e => e.id !== id);
  if (filtered.length === before) return false;
  await saveCollection(file, filtered);
  return true;
}

export async function getEntity(file, id) {
  const items = await loadCollection(file);
  return items.find(e => e.id === id) || null;
}
