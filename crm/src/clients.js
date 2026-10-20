// crm/src/clients.js
// Clientes ativos da sua operação. Schema com tipo de cobrança (mensal/único/personalizado),
// vínculo com pacote, vendedor responsável e membros de equipe alocados.
// Conversão a partir de lead: pré-popula campos com dados do lead.

import * as store from './store.js';
import { readJson, writeJsonAtomic } from './store.js';
import * as invoices from './invoices.js';

const FILE = 'clients.json';

export const STATUSES = ['ativo', 'em_risco', 'pausado', 'churn'];
export const BILLING_TYPES = ['mensal', 'unico', 'personalizado'];

function validate(payload) {
  const errors = [];
  if (!payload.name?.trim()) errors.push('Nome obrigatório');
  if (payload.email && !/^\S+@\S+\.\S+$/.test(payload.email)) errors.push('E-mail inválido');
  if (payload.cnpj && !/^[\d./-]{14,18}$/.test(payload.cnpj.replace(/\s/g, ''))) errors.push('CNPJ inválido (formato esperado: 00.000.000/0000-00)');
  if (payload.status && !STATUSES.includes(payload.status)) errors.push(`Status deve ser um de: ${STATUSES.join(', ')}`);
  if (payload.billing_type && !BILLING_TYPES.includes(payload.billing_type)) errors.push(`Tipo de cobrança deve ser um de: ${BILLING_TYPES.join(', ')}`);

  // Validações por tipo de cobrança
  if (payload.billing_type === 'mensal') {
    if (typeof payload.monthly_value !== 'number' || payload.monthly_value <= 0) errors.push('Valor mensal obrigatório (mensal)');
  }
  if (payload.billing_type === 'unico') {
    if (typeof payload.total_value !== 'number' || payload.total_value <= 0) errors.push('Valor total obrigatório (pagamento único)');
    if (typeof payload.service_months !== 'number' || payload.service_months <= 0) errors.push('Tempo de serviço em meses obrigatório (pagamento único)');
  }
  if (payload.billing_type === 'personalizado') {
    if (typeof payload.num_installments !== 'number' || payload.num_installments <= 0) errors.push('Número de parcelas obrigatório (personalizado)');
    if (typeof payload.monthly_value !== 'number' || payload.monthly_value <= 0) errors.push('Valor por parcela obrigatório (personalizado)');
  }
  return errors;
}

// Calcula MRR (receita mensal recorrente) do cliente conforme tipo de cobrança
export function clientMRR(client) {
  if (!client) return 0;
  if (client.status === 'churn' || client.status === 'pausado') return 0;
  if (client.billing_type === 'mensal') return client.monthly_value || 0;
  if (client.billing_type === 'unico') return client.service_months > 0 ? (client.total_value || 0) / client.service_months : 0;
  if (client.billing_type === 'personalizado') return client.monthly_value || 0;
  return 0;
}

// Valor total contratado
export function clientContractValue(client) {
  if (!client) return 0;
  if (client.billing_type === 'mensal') return (client.monthly_value || 0) * 12; // assume anual
  if (client.billing_type === 'unico') return client.total_value || 0;
  if (client.billing_type === 'personalizado') return (client.monthly_value || 0) * (client.num_installments || 0);
  return 0;
}

export async function list() {
  return store.loadCollection(FILE);
}

export async function get(id) {
  return store.getEntity(FILE, id);
}

export async function create(payload, { generateInvoices = true } = {}) {
  const errors = validate(payload);
  if (errors.length) throw new Error(errors.join('; '));

  const client = await store.addEntity(FILE, {
    name: payload.name.trim(),
    email: payload.email?.trim() || null,
    cnpj: payload.cnpj?.trim() || null,
    package_id: payload.package_id || null,
    seller_id: payload.seller_id || null,
    team_member_ids: payload.team_member_ids || [],
    status: payload.status || 'ativo',
    billing_type: payload.billing_type || 'mensal',
    monthly_value: payload.monthly_value ?? null,
    total_value: payload.total_value ?? null,
    num_installments: payload.num_installments ?? null,
    service_months: payload.service_months ?? null,
    auto_renew: payload.auto_renew !== false,
    start_date: payload.start_date || new Date().toISOString().slice(0, 10),
    end_date: payload.end_date || null,
    source_lead_id: payload.source_lead_id || null,
    notes: payload.notes?.trim() || null,
  }, 'cli');

  if (generateInvoices) {
    await invoices.generateForClient(client);
  }
  return client;
}

export async function update(id, patch) {
  const existing = await get(id);
  if (!existing) return null;
  // validar com merge
  const merged = { ...existing, ...patch };
  const errors = validate(merged);
  if (errors.length) throw new Error(errors.join('; '));

  const updated = await store.updateEntity(FILE, id, patch);

  // Se billing_type ou valores mudaram, regenera invoices pendentes (mantém as já pagas)
  const billingChanged = ['billing_type','monthly_value','total_value','num_installments','service_months','start_date'].some(k => k in patch);
  if (billingChanged) {
    await invoices.regenerateForClient(updated);
  }
  return updated;
}

export async function remove(id) {
  // Soft delete = mark churn? Por enquanto, hard delete + remove invoices pendentes
  const removed = await store.deleteEntity(FILE, id);
  if (removed) await invoices.deletePendingForClient(id);
  return removed;
}

// Converte lead em cliente
export async function fromLead(leadId, payload) {
  const master = await readJson('leads-master.json', {});
  const lead = master[leadId];
  if (!lead) throw new Error(`Lead ${leadId} não encontrado`);

  // Pré-popula com dados do lead se não vieram no payload
  const merged = {
    name: payload.name || lead.marca || lead.name || leadId,
    email: payload.email || null,
    cnpj: payload.cnpj || null,
    notes: payload.notes || (lead.crm_notes?.direcao_sugerida || null),
    source_lead_id: leadId,
    start_date: payload.start_date || new Date().toISOString().slice(0, 10),
    ...payload,
  };

  const client = await create(merged);

  // Marca lead com outcome convertido + status
  lead.outcome = 'cliente_convertido';
  lead.outcome_set_at = new Date().toISOString();
  lead.client_id = client.id;
  lead.status = 'responded'; // mantém responded mas com outcome cliente_convertido
  master[leadId] = lead;
  await writeJsonAtomic('leads-master.json', master);

  return client;
}
