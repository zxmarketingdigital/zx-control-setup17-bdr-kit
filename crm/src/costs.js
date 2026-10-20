// crm/src/costs.js
// Custos operacionais da sua operação. Categorias: equipe, assinatura, imposto, marketing, outro.
// Recorrência: mensal | anual | unico
// Para anual, calcula valor mensalizado pra dashboard MRR/EBITDA.

import * as store from './store.js';

const FILE = 'costs.json';

export const CATEGORIES = ['equipe', 'assinatura', 'imposto', 'marketing', 'infraestrutura', 'outro'];
export const RECURRENCES = ['mensal', 'anual', 'unico'];

function validate(payload) {
  const errors = [];
  if (!payload.name?.trim()) errors.push('Nome obrigatório');
  if (typeof payload.amount !== 'number' || payload.amount < 0) errors.push('Valor obrigatório (número não-negativo)');
  if (payload.category && !CATEGORIES.includes(payload.category)) errors.push('Categoria inválida');
  if (payload.recurrence && !RECURRENCES.includes(payload.recurrence)) errors.push('Recorrência inválida');
  return errors;
}

export function monthlyValue(cost) {
  if (!cost.active) return 0;
  if (cost.recurrence === 'mensal') return cost.amount || 0;
  if (cost.recurrence === 'anual') return (cost.amount || 0) / 12;
  if (cost.recurrence === 'unico') return 0; // único não conta no recorrente
  return 0;
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
    category: payload.category || 'outro',
    recurrence: payload.recurrence || 'mensal',
    amount: payload.amount,
    notes: payload.notes?.trim() || null,
    active: payload.active !== false,
  }, 'cost');
}

export async function update(id, patch) {
  if (patch.amount != null && (typeof patch.amount !== 'number' || patch.amount < 0)) throw new Error('Valor inválido');
  if (patch.category && !CATEGORIES.includes(patch.category)) throw new Error('Categoria inválida');
  if (patch.recurrence && !RECURRENCES.includes(patch.recurrence)) throw new Error('Recorrência inválida');
  return store.updateEntity(FILE, id, patch);
}

export async function remove(id) {
  return store.deleteEntity(FILE, id);
}

export async function totalMonthly() {
  const items = await list();
  return items.reduce((sum, c) => sum + monthlyValue(c), 0);
}

export async function statsByCategory() {
  const items = await list();
  const out = {};
  for (const c of items) {
    if (!c.active) continue;
    const mv = monthlyValue(c);
    if (!out[c.category]) out[c.category] = 0;
    out[c.category] += mv;
  }
  return out;
}
