// crm/src/team.js
// Equipe: vendedores, gestores de conta, tráfego, edição etc.

import * as store from './store.js';

const FILE = 'team.json';

export const ROLES = ['vendedor', 'conta', 'trafego', 'edicao', 'social', 'gestor', 'outro'];

function validate(payload) {
  const errors = [];
  if (!payload.name || !payload.name.trim()) errors.push('Nome obrigatório');
  if (payload.role && !ROLES.includes(payload.role)) errors.push(`Função deve ser uma de: ${ROLES.join(', ')}`);
  if (payload.email && !/^\S+@\S+\.\S+$/.test(payload.email)) errors.push('E-mail inválido');
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
    role: payload.role || 'outro',
    email: payload.email?.trim() || null,
    phone: payload.phone?.trim() || null,
    active: payload.active !== false,
  }, 'mbr');
}

export async function update(id, patch) {
  if (patch.role && !ROLES.includes(patch.role)) throw new Error(`Função inválida`);
  if (patch.email && !/^\S+@\S+\.\S+$/.test(patch.email)) throw new Error('E-mail inválido');
  return store.updateEntity(FILE, id, patch);
}

export async function remove(id) {
  return store.deleteEntity(FILE, id);
}
