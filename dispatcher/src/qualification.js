// dispatcher/src/qualification.js
// "Qualificar antes de agendar": o BDR só marca call depois de saber o
// faturamento do negócio (orçamento) e quem decide (autoridade).
//
// Compartilhado entre dispatcher (modo automático) e CRM (botão na aba
// Prospecção Fria + registro manual). Sem config.js: tudo entra por parâmetro.
//
// Regra de ouro: qualificação só vale se veio das PALAVRAS DO LEAD. O agente
// cita o trecho; o código confere se o trecho existe na conversa e extrai o
// faturamento dele mesmo. Nada de "o modelo achou que fatura bem".

import fs from 'node:fs/promises';
import path from 'node:path';

const RULES_FILE = 'booking-rules.json';
export const RULES_DEFAULTS = { require_qualification: false, min_annual_revenue: null };

export async function loadBookingRules(pipelineDir) {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(pipelineDir, RULES_FILE), 'utf8'));
    const min = Number(raw.min_annual_revenue);
    return { require_qualification: !!raw.require_qualification, min_annual_revenue: Number.isFinite(min) && min > 0 ? min : null };
  } catch {
    return { ...RULES_DEFAULTS };
  }
}

export async function saveBookingRules(pipelineDir, rules) {
  const clean = {
    require_qualification: !!rules.require_qualification,
    min_annual_revenue: Number.isFinite(Number(rules.min_annual_revenue)) && Number(rules.min_annual_revenue) > 0 ? Number(rules.min_annual_revenue) : null,
  };
  const file = path.join(pipelineDir, RULES_FILE);
  const tmp = `${file}.tmp-${Date.now()}`;
  await fs.mkdir(pipelineDir, { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(clean, null, 2), 'utf8');
  await fs.rename(tmp, file);
  return clean;
}

// ---------------------------------------------------------------- texto

export function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// O trecho citado pelo agente existe no que o lead disse? Aceita diferença de
// acento, pontuação e maiúscula, mas não aceita paráfrase.
export function quoteFound(quote, leadTexts) {
  const q = normalizeText(quote);
  if (q.split(' ').filter(Boolean).length < 2) return false;
  return leadTexts.some((t) => normalizeText(t).includes(q));
}

// Lê faturamento em português de WhatsApp e devolve o valor ANUAL em reais.
// "uns 8 milhões por ano" → 8.000.000 · "120 mil por mês" → 1.440.000
// "1,5 mi" → 1.500.000 · "100k/mês" → 1.200.000 · "faturamos bem" → null
export function parseRevenueBR(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // unidade vem exata do regex: "bi", "bilhao", "milhoes", "mi", "mil", "k"
  const unitMult = (u) => (u.startsWith('bi') ? 1e9 : (u.startsWith('milh') || u === 'mi') ? 1e6 : (u === 'mil' || u === 'k') ? 1e3 : 1);
  const isMonthly = (after) => /^\s*(reais\s*)?(de\s*faturamento\s*)?(por|\/|ao|a|no)?\s*(mes|mensal|mensais)/.test(after);
  // Faixa ("entre 2 e 3 milhões", "50 a 60 mil por mês"): vale o limite de baixo.
  const range = t.match(/(\d+(?:,\d+)?)\s*(?:e|a|ate|-)\s*(\d+(?:,\d+)?)\s*(bilhoes|bilhao|bi\b|milhoes|milhao|mi\b|mil\b|k\b)/);
  if (range) {
    let value = Number(range[1].replace(',', '.')) * unitMult(range[3]);
    const monthly = isMonthly(t.slice(range.index + range[0].length, range.index + range[0].length + 25));
    if (monthly) value *= 12;
    return { annual: Math.round(value), monthly_basis: monthly, matched: range[0].trim() };
  }
  const re = /(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*(bilhoes|bilhao|bi\b|milhoes|milhao|mi\b|mil\b|k\b)?/g;
  let m;
  while ((m = re.exec(t))) {
    const rawNum = m[1];
    const num = /\.\d{3}/.test(rawNum) ? Number(rawNum.replace(/\./g, '')) : Number(rawNum.replace(',', '.'));
    if (!Number.isFinite(num)) continue;
    const mult = unitMult(m[2] || '');
    let value = num * mult;
    // número solto só conta se tiver cara de faturamento (evita "12h", "2 sócios")
    if (mult === 1 && value < 10_000) continue;
    const monthly = isMonthly(t.slice(m.index + m[0].length, m.index + m[0].length + 30));
    if (monthly) value *= 12;
    return { annual: Math.round(value), monthly_basis: monthly, matched: m[0].trim() };
  }
  return null;
}

export function formatBRL(n) {
  if (n == null) return '';
  if (n >= 1e6) return `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi/ano`;
  if (n >= 1e3) return `R$ ${Math.round(n / 1e3).toLocaleString('pt-BR')} mil/ano`;
  return `R$ ${n.toLocaleString('pt-BR')}/ano`;
}

// ---------------------------------------------------------------- estado

// Valida o que o agente diz ter descoberto. Só entra o que tem trecho real.
// update: { faturamento_trecho, autoridade_trecho, autoridade: "decisor"|"decisor_na_call"|"nao_decisor" }
export function validateQualificationUpdate(update, leadTexts) {
  const out = {};
  const rejected = [];
  if (!update || typeof update !== 'object') return { accepted: out, rejected };
  const now = new Date().toISOString();

  if (update.faturamento_trecho) {
    if (!quoteFound(update.faturamento_trecho, leadTexts)) rejected.push('faturamento: trecho não está na conversa');
    else {
      const rev = parseRevenueBR(update.faturamento_trecho);
      if (!rev) rejected.push('faturamento: trecho sem valor que dê pra ler');
      else out.revenue = { annual: rev.annual, quote: update.faturamento_trecho, source: 'lead', at: now };
    }
  }
  if (update.autoridade_trecho) {
    const kind = ['decisor', 'decisor_na_call', 'nao_decisor'].includes(update.autoridade) ? update.autoridade : null;
    if (!kind) rejected.push('autoridade: tipo inválido');
    else if (!quoteFound(update.autoridade_trecho, leadTexts)) rejected.push('autoridade: trecho não está na conversa');
    else out.authority = { kind, quote: update.autoridade_trecho, source: 'lead', at: now };
  }
  return { accepted: out, rejected };
}

export function mergeQualification(existing, accepted) {
  return { ...(existing || {}), ...accepted };
}

export function qualificationStatus(q, rules) {
  const revenue = q?.revenue || null;
  const authority = q?.authority || null;
  const revenueOk = !!revenue?.annual;
  const belowMin = revenueOk && rules?.min_annual_revenue ? revenue.annual < rules.min_annual_revenue : false;
  const authorityOk = !!authority && ['decisor', 'decisor_na_call'].includes(authority.kind);
  const missing = [];
  if (!revenueOk) missing.push('faturamento');
  if (!authorityOk) missing.push(authority?.kind === 'nao_decisor' ? 'decisor (quem respondeu não decide)' : 'autoridade');
  return {
    required: !!rules?.require_qualification,
    revenue_ok: revenueOk,
    below_min: belowMin,
    authority_ok: authorityOk,
    missing,
    ready: revenueOk && authorityOk && !belowMin,
    revenue_label: revenueOk ? formatBRL(revenue.annual) : null,
  };
}

// Mensagem que parece propor horário ("terça 10h", "às 14:30").
export function looksLikeSlotOffer(text) {
  return /\b\d{1,2}\s*h(\d{2})?\b|\b\d{1,2}:\d{2}\b/i.test(String(text || ''));
}
