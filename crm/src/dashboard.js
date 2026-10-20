// crm/src/dashboard.js
// Métricas agregadas pro Dashboard executivo e Dashboard financeiro.

import * as clients from './clients.js';
import * as costs from './costs.js';
import * as invoices from './invoices.js';
import { readJson } from './store.js';

export async function executive() {
  // Leads
  const master = await readJson('leads-master.json', {});
  let leadsActive = 0, leadsResponded = 0, leadsMeeting = 0, leadsExhausted = 0;
  for (const lead of Object.values(master)) {
    if (lead.status === 'active') leadsActive++;
    if (lead.status === 'responded') leadsResponded++;
    if (lead.status === 'meeting_scheduled') leadsMeeting++;
    if (lead.status === 'exhausted') leadsExhausted++;
  }

  // Clientes
  const cli = await clients.list();
  let cliActive = 0, cliAtRisk = 0, cliPaused = 0, cliChurn = 0;
  let mrr = 0;
  for (const c of cli) {
    if (c.status === 'ativo') cliActive++;
    if (c.status === 'em_risco') cliAtRisk++;
    if (c.status === 'pausado') cliPaused++;
    if (c.status === 'churn') cliChurn++;
    mrr += clients.clientMRR(c);
  }

  // Financeiro
  const totalCostMonthly = await costs.totalMonthly();
  const invStats = await invoices.stats();
  const ebitda = mrr - totalCostMonthly;
  const cac = cliActive > 0 ? totalCostMonthly / cliActive : 0;

  return {
    leads: { active: leadsActive, responded: leadsResponded, meeting_scheduled: leadsMeeting, exhausted: leadsExhausted, total: Object.keys(master).length },
    clients: { active: cliActive, at_risk: cliAtRisk, paused: cliPaused, churn: cliChurn, total: cli.length },
    finance: {
      mrr,
      total_cost_monthly: totalCostMonthly,
      ebitda_estimated: ebitda,
      cac_estimated: cac,
      pending_revenue: invStats.total_pending,
      overdue_revenue: invStats.total_overdue,
    },
  };
}

export async function financial({ monthRef = null } = {}) {
  const month = monthRef || new Date().toISOString().slice(0, 7);

  const cli = await clients.list();
  const mrr = cli.reduce((s, c) => s + clients.clientMRR(c), 0);
  const contractedTotal = cli.reduce((s, c) => s + clients.clientContractValue(c), 0);

  const invStats = await invoices.stats({ monthRef: month });
  const costsByCategory = await costs.statsByCategory();
  const totalCostMonthly = await costs.totalMonthly();

  return {
    month_ref: month,
    mrr,
    contracted_total: contractedTotal,
    cost_monthly: totalCostMonthly,
    ebitda_estimated: mrr - totalCostMonthly,
    margin: mrr > 0 ? ((mrr - totalCostMonthly) / mrr) * 100 : 0,
    costs_by_category: costsByCategory,
    invoices: invStats,
    clients_count: cli.length,
    clients_active: cli.filter(c => c.status === 'ativo').length,
  };
}
