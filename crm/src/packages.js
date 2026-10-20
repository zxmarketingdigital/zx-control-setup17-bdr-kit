// crm/src/packages.js
// Catálogo de pacotes contratáveis

import * as store from './store.js';

const FILE = 'packages.json';

function validate(payload) {
  const errors = [];
  if (!payload.name || !payload.name.trim()) errors.push('Nome obrigatório');
  if (payload.base_price != null && typeof payload.base_price !== 'number') errors.push('Valor base deve ser número');
  return errors;
}

export async function list() {
  return store.loadCollection(FILE);
}

export async function get(id) {
  return store.getEntity(FILE, id);
}

export async function create(payload) {
  const errors = validate(payload);
  if (errors.length) throw new Error(errors.join('; '));
  return store.addEntity(FILE, {
    name: payload.name.trim(),
    description: payload.description?.trim() || null,
    scope: payload.scope?.trim() || null,
    base_price: payload.base_price ?? 0,
    active: payload.active !== false,
  }, 'pkg');
}

export async function update(id, patch) {
  if (patch.base_price != null && typeof patch.base_price !== 'number') throw new Error('Valor base deve ser número');
  return store.updateEntity(FILE, id, patch);
}

export async function remove(id) {
  return store.deleteEntity(FILE, id);
}
