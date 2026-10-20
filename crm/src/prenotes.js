// crm/src/prenotes.js
// Pré-notas de serviços prestados, em formato Markdown.
// Cliente + mês de referência → markdown formatado pronto pra mandar ao contador.
// Histórico salvo em pipeline/prenotes.json.

import * as store from './store.js';
import * as clients from './clients.js';
import * as packages from './packages.js';
import * as team from './team.js';

const FILE = 'prenotes.json';

function brl(value) {
  return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function monthLabel(ref) {
  const [y, m] = ref.split('-');
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${months[parseInt(m,10)-1]} de ${y}`;
}

export async function generate({ client_id, ref_month, custom_description = null, custom_amount = null }) {
  const client = await clients.get(client_id);
  if (!client) throw new Error('Cliente não encontrado');
  if (!ref_month || !/^\d{4}-\d{2}$/.test(ref_month)) throw new Error('Mês de referência inválido (formato YYYY-MM)');

  const pkg = client.package_id ? await packages.get(client.package_id) : null;
  const seller = client.seller_id ? await team.get(client.seller_id) : null;

  const amount = custom_amount ?? (
    client.billing_type === 'mensal' || client.billing_type === 'personalizado'
      ? (client.monthly_value || 0)
      : client.total_value || 0
  );

  const description = custom_description || (
    pkg ? `${pkg.name} — ${pkg.scope || pkg.description || 'serviços de marketing digital'}`
        : 'Serviços de marketing digital'
  );

  const today = new Date().toISOString().slice(0, 10);

  const markdown = `# PRÉ-NOTA DE SERVIÇOS

**ZX LAB**
${seller ? `Responsável: ${seller.name}` : ''}
Documento gerado em ${today}

---

## TOMADOR

| Campo | Valor |
|---|---|
| **Razão Social** | ${client.name} |
| **CNPJ** | ${client.cnpj || '—'} |
| **E-mail** | ${client.email || '—'} |

---

## SERVIÇO PRESTADO

**Mês de referência:** ${monthLabel(ref_month)}
**Descrição:** ${description}

${client.notes ? `\n**Observações do contrato:** ${client.notes}\n` : ''}

---

## VALOR

| Item | Valor |
|---|---|
| Serviços de marketing digital — ${monthLabel(ref_month)} | ${brl(amount)} |
| **TOTAL** | **${brl(amount)}** |

---

## INSTRUÇÕES PARA EMISSÃO DA NFS-E

- **Discriminação sugerida:** "Serviços de marketing digital e estratégia de comunicação — ${monthLabel(ref_month)} — referente a contrato firmado com ${client.name}."
- **Código de serviço (LC 116/03):** 17.06 — Propaganda e publicidade ou 17.20 — Pesquisas de mercado (conforme sua tipificação).
- **ISS:** verificar alíquota municipal aplicável.

---

*Documento gerado automaticamente pelo CRM ZX LAB.*
`;

  // Salva no histórico
  await store.addEntity(FILE, {
    client_id,
    client_name: client.name,
    ref_month,
    amount,
    description,
    markdown,
  }, 'prn');

  return { markdown, amount, description, ref_month, client_name: client.name };
}

export async function list({ clientId } = {}) {
  const items = await store.loadCollection(FILE);
  if (clientId) return items.filter(p => p.client_id === clientId);
  return items;
}

export async function get(id) {
  return store.getEntity(FILE, id);
}

export async function remove(id) {
  return store.deleteEntity(FILE, id);
}
