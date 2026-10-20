// crm/src/invoices.js
// Cobranças geradas automaticamente ao cadastrar/converter cliente.
// Status: pendente | pago | atrasado | cancelado
// Geração por billing_type:
//   - mensal: 12 cobranças mensais (vence dia 5 de cada mês)
//   - unico: 1 cobrança no início (vence em 7 dias)
//   - personalizado: N cobranças mensais conforme num_installments

import * as store from './store.js';

const FILE = 'invoices.json';

export const STATUSES = ['pendente', 'pago', 'atrasado', 'cancelado'];

function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  return dt.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Helper: marca atrasadas as pendentes que passaram da data de vencimento
function markOverdue(items) {
  const tStr = today();
  for (const inv of items) {
    if (inv.status === 'pendente' && inv.due_date < tStr) {
      inv.status = 'atrasado';
    }
  }
}

export async function list({ clientId = null, monthRef = null } = {}) {
  const items = await store.loadCollection(FILE);
  markOverdue(items);
  let filtered = items;
  if (clientId) filtered = filtered.filter(i => i.client_id === clientId);
  if (monthRef) filtered = filtered.filter(i => i.due_date.slice(0, 7) === monthRef);
  return filtered;
}

export async function get(id) {
  return store.getEntity(FILE, id);
}

export async function update(id, patch) {
  if (patch.status && !STATUSES.includes(patch.status)) throw new Error('Status inválido');
  const updates = { ...patch };
  if (patch.status === 'pago' && !updates.paid_at) updates.paid_at = new Date().toISOString();
  if (patch.status !== 'pago') updates.paid_at = null;
  return store.updateEntity(FILE, id, updates);
}

export async function generateForClient(client) {
  const items = await store.loadCollection(FILE);
  const newItems = buildInvoicesFor(client);
  items.push(...newItems);
  await store.saveCollection(FILE, items);
  return newItems;
}

// Apaga apenas cobranças PENDENTES de um cliente; mantém pagas e atrasadas históricas
export async function deletePendingForClient(clientId) {
  const items = await store.loadCollection(FILE);
  const filtered = items.filter(i => !(i.client_id === clientId && i.status === 'pendente'));
  await store.saveCollection(FILE, filtered);
}

// Regenera cobranças após mudança de billing: mantém pagas, apaga pendentes futuras, gera novo conjunto
export async function regenerateForClient(client) {
  const items = await store.loadCollection(FILE);
  const kept = items.filter(i => !(i.client_id === client.id && ['pendente','atrasado'].includes(i.status)));
  const newItems = buildInvoicesFor(client, kept.filter(i => i.client_id === client.id).length);
  kept.push(...newItems);
  await store.saveCollection(FILE, kept);
  return newItems;
}

function buildInvoicesFor(client, startIndex = 0) {
  const start = client.start_date || today();
  const newItems = [];

  if (client.billing_type === 'mensal') {
    // 12 cobranças mensais
    const total = 12;
    for (let i = 0; i < total; i++) {
      newItems.push({
        id: store.newId('inv'),
        created_at: new Date().toISOString(),
        client_id: client.id,
        installment_number: startIndex + i + 1,
        total_installments: total,
        amount: client.monthly_value || 0,
        due_date: addMonths(start, i),
        ref_month: addMonths(start, i).slice(0, 7),
        status: 'pendente',
        paid_at: null,
        description: `Mensalidade ${addMonths(start, i).slice(0, 7)} — ${client.name}`,
      });
    }
  } else if (client.billing_type === 'unico') {
    // 1 cobrança no início (vence em 7 dias)
    const due = addMonths(start, 0);
    const dueDate = new Date(due);
    dueDate.setDate(dueDate.getDate() + 7);
    newItems.push({
      id: store.newId('inv'),
      created_at: new Date().toISOString(),
      client_id: client.id,
      installment_number: 1,
      total_installments: 1,
      amount: client.total_value || 0,
      due_date: dueDate.toISOString().slice(0, 10),
      ref_month: start.slice(0, 7),
      status: 'pendente',
      paid_at: null,
      description: `Pagamento único — ${client.name} (${client.service_months} meses de serviço)`,
    });
  } else if (client.billing_type === 'personalizado') {
    const total = client.num_installments || 0;
    for (let i = 0; i < total; i++) {
      newItems.push({
        id: store.newId('inv'),
        created_at: new Date().toISOString(),
        client_id: client.id,
        installment_number: startIndex + i + 1,
        total_installments: total,
        amount: client.monthly_value || 0,
        due_date: addMonths(start, i),
        ref_month: addMonths(start, i).slice(0, 7),
        status: 'pendente',
        paid_at: null,
        description: `Parcela ${i + 1}/${total} — ${client.name}`,
      });
    }
  }

  return newItems;
}

// Stats agregadas
export async function stats({ monthRef } = {}) {
  const items = await list();
  const t = today();
  const month = monthRef || t.slice(0, 7);

  const result = {
    total_pending: 0,
    total_overdue: 0,
    total_paid_month: 0,
    total_due_month: 0,
    count_pending: 0,
    count_overdue: 0,
    count_paid_month: 0,
  };
  for (const i of items) {
    if (i.status === 'pendente') {
      result.total_pending += i.amount;
      result.count_pending++;
    } else if (i.status === 'atrasado') {
      result.total_overdue += i.amount;
      result.count_overdue++;
    }
    if (i.ref_month === month) {
      result.total_due_month += i.amount;
      if (i.status === 'pago') {
        result.total_paid_month += i.amount;
        result.count_paid_month++;
      }
    }
  }
  return result;
}
