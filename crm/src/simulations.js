// crm/src/simulations.js
// Lê docs/simulacoes-atendimento.md e devolve as conversas estruturadas pra aba
// Simulações do CRM. O markdown continua sendo a única fonte: editou o doc,
// o painel mostra na próxima leitura.
//
// Cada mensagem do agente sai com uma análise de copy:
// - checklist anti-IA da skill (seção 10), item por item, com o trecho marcado;
// - o que a trava do modo automático (dispatcher/src/humanize-guard.js) faria;
// - tamanho, tamanho em relação à mensagem do lead e número de perguntas.

import fs from 'node:fs/promises';
import path from 'node:path';
import { humanizeGuard } from '../../dispatcher/src/humanize-guard.js';

// Itens do checklist anti-IA que dá pra detectar por padrão de texto. Os demais
// (regra de três, ritmo, justificativa longa) pedem leitura humana.
const CHECKLIST = [
  { item: 1,  label: 'Travessão', re: /[—–]/g },
  { item: 2,  label: 'Emoji', re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu },
  { item: 3,  label: 'Abertura de atendente', re: /(^|[.!?]\s+)(ótima pergunta|entendo perfeitamente|com certeza|perfeito|que bom que|espero que esteja bem|olá)(?=[\s,.!?]|$)/gi },
  { item: 5,  label: 'Fecho de robô', re: /fico [àa] disposi[çc][ãa]o|qualquer d[úu]vida,? estou|espero ter ajudado|tenha um [óo]timo (dia|fim de semana)/gi },
  { item: 9,  label: 'Vocabulário de IA', re: /além disso|vale ressaltar|é importante destacar|\bjornada\b|potencializ\w*|alavanc\w*|impulsion\w*|\bsoluç(ão|ões)\b|ecossistema|sinergia|\binsights?\b|\bestratégic[oa]s?\b|\bespecialista\b/gi },
  { item: 10, label: 'Formalidade de e-mail', re: /prezad[oa]s?|cordialmente|venho por meio desta/gi },
  { item: 11, label: 'Hedge', re: /\btalvez\b|de certa forma|pode ser que|em certa medida/gi },
  { item: 14, label: 'Elogio genérico', re: /\badorei\b|\bparabéns\b|trabalho incrível|excelentes avaliações/gi },
];

const words = (s) => (String(s).match(/[\p{L}\p{N}]+/gu) || []).length;

export function analyzeCopy(text, leadText = null) {
  const hits = [];
  for (const c of CHECKLIST) {
    c.re.lastIndex = 0;
    let m;
    while ((m = c.re.exec(text))) {
      // no item 3 o grupo 1 é o separador antes da abertura; marca só a expressão
      const start = m.index + (c.item === 3 ? m[1].length : 0);
      hits.push({ item: c.item, label: c.label, start, end: m.index + m[0].length, match: text.slice(start, m.index + m[0].length) });
      if (m[0].length === 0) c.re.lastIndex++;
    }
  }
  hits.sort((a, b) => a.start - b.start);

  const guard = humanizeGuard(text);
  const w = words(text);
  const lw = leadText != null ? words(leadText) : null;
  const questions = (text.match(/\?/g) || []).length;
  const ratio = lw ? Math.round((w / lw) * 10) / 10 : null;

  const warnings = [];
  if (questions > 1) warnings.push('Mais de 1 pergunta na mesma mensagem (seção 9.2)');
  // 40 palavras: cabe um ponto + a proposta de horário completa ("Essa semana tenho
  // horário na terça 10h e na quinta 14h. Qual você prefere?"), que é estrutural.
  if (lw != null && w > 40 && w > lw * 4) warnings.push(`Mensagem ${ratio}× maior que a do lead (checklist item 6: espelhe o tamanho)`);

  return {
    words: w,
    lead_words: lw,
    ratio,
    questions,
    ends_with_question: /\?\s*$/.test(text),
    hits,
    guard: { ok: guard.ok, fixes: guard.fixes, reason: guard.reason },
    warnings,
    clean: hits.length === 0 && guard.ok && warnings.length === 0,
  };
}

// ---------------------------------------------------------------- parser

function quoteBlock(lines, i) {
  // Junta um blockquote ("> ...") em parágrafos. Linha ">" vazia separa parágrafo.
  const paras = [[]];
  while (i < lines.length && lines[i].startsWith('>')) {
    const content = lines[i].replace(/^>\s?/, '');
    if (content.trim() === '') paras.push([]);
    else paras[paras.length - 1].push(content.trim());
    i++;
  }
  const text = paras.filter((p) => p.length).map((p) => p.join(' ')).join('\n\n');
  return { text, next: i };
}

function paragraph(lines, i, first) {
  // Linha inicial + continuação até linha vazia ou início de outro bloco.
  const parts = [first];
  i++;
  while (i < lines.length && lines[i].trim() !== '' && !/^(\*\*|>|#|---|\|)/.test(lines[i])) {
    parts.push(lines[i].trim());
    i++;
  }
  return { text: parts.join(' ').trim(), next: i };
}

const ACTION_RE = /`([a-z_]+)(?:\s*\(([^)]*)\))?`\s*$/;

function agentStep(text, touch1 = false) {
  let action = null, actionDetail = null;
  const m = text.match(ACTION_RE);
  if (m) { action = m[1]; actionDetail = m[2] || null; text = text.slice(0, m.index).trim(); }
  // "Link da call: ..." é anexado pelo sistema, não escrito pelo agente
  let system = null;
  const linkIdx = text.search(/(^|\n)Link da call:/);
  if (linkIdx >= 0) { system = text.slice(linkIdx).trim(); text = text.slice(0, linkIdx).trim(); }
  return { type: 'agent', touch1, text, action: touch1 ? 'touch_1' : action, action_detail: actionDetail, system };
}

function parseTable(lines, i) {
  const rows = [];
  while (i < lines.length && lines[i].startsWith('|')) {
    const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim());
    if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
    i++;
  }
  return { rows, next: i };
}

const clean = (s) => s.replace(/\*\*/g, '').replace(/`/g, '').trim();

export function parseSimulations(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = { personas: [], scenarios: [], before_after: [], summary: [] };
  let part = null;        // 'agencia' | 'b2b' | 'antes_depois' | 'resumo' | null
  let partTitle = '';
  let sc = null;          // cenário atual
  let ba = null;          // par antes/depois atual
  let section = '';       // título "## " fora de cenário (ex.: Personas)

  const closeScenario = () => { if (sc) out.scenarios.push(sc); sc = null; };

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];

    if (/^# /.test(line)) {
      closeScenario();
      const t = line.slice(2).trim();
      partTitle = t.replace(/^Parte \d+\s*[—-]\s*/, '');
      part = /ag[êe]ncia/i.test(t) ? 'agencia' : /b2b/i.test(t) ? 'b2b' : /antes e depois/i.test(t) ? 'antes_depois' : /resumo/i.test(t) ? 'resumo' : null;
      i++; continue;
    }

    const h2 = line.match(/^## ([AB]\d+)\.\s*(.+)$/);
    if (h2 && (part === 'agencia' || part === 'b2b')) {
      closeScenario();
      sc = { id: h2[1], title: h2[2].trim(), kind: part, part_title: partTitle, context: null, angle: null, steps: [] };
      i++; continue;
    }
    if (/^## /.test(line)) { closeScenario(); section = line.slice(3).trim(); i++; continue; }

    if (line.startsWith('|')) {
      const { rows, next } = parseTable(lines, i);
      if (part === 'resumo') {
        out.summary = rows.slice(1).map((r) => ({ situacao: clean(r[0]), acao: clean(r[1]), mensagem: clean(r[2]) }));
      } else if (/personas/i.test(section)) {
        out.personas = rows.slice(1).map((r) => ({ campo: clean(r[0]), agencia: clean(r[1]), b2b: clean(r[2]) }));
      }
      i = next; continue;
    }

    if (line.trim() === '---') { closeScenario(); i++; continue; }

    // ---------------- Parte 3: antes e depois
    if (part === 'antes_depois') {
      const head = line.match(/^\*\*([^*]+)\*\*\s*$/);
      if (head) { ba = { title: head[1].trim(), ia: '', humano: '', notes: '' }; out.before_after.push(ba); i++; continue; }
      if (ba && /^Com cara de IA:/.test(line)) { const q = quoteBlock(lines, i + 1); ba.ia = q.text; i = q.next; continue; }
      if (ba && /^Depois do checklist:/.test(line)) { const q = quoteBlock(lines, i + 1); ba.humano = q.text; i = q.next; continue; }
      if (ba && /^O que (saiu|entrou)/.test(line)) { const p = paragraph(lines, i, line.trim()); ba.notes = ba.notes ? `${ba.notes} ${p.text}` : p.text; i = p.next; continue; }
      i++; continue;
    }

    if (!sc) { i++; continue; }

    // ---------------- dentro de um cenário
    let m;
    if ((m = line.match(/^\*\*Contexto:\*\*\s*(.*)$/))) {
      const p = paragraph(lines, i, m[1]); sc.context = p.text; i = p.next; continue;
    }
    if ((m = line.match(/^\*\*(Ângulo escolhido|Ângulo|Dor escolhida):\*\*\s*(.*)$/))) {
      const p = paragraph(lines, i, m[2]); sc.angle = { label: m[1], text: p.text }; i = p.next; continue;
    }
    if (/^\*\*Toque 1 \(Agente\):\*\*/.test(line)) {
      const q = quoteBlock(lines, i + 1); sc.steps.push(agentStep(q.text, true)); i = q.next; continue;
    }
    if (/^\*\*Agente:\*\*/.test(line)) {
      const q = quoteBlock(lines, i + 1); sc.steps.push(agentStep(q.text)); i = q.next; continue;
    }
    if ((m = line.match(/^\*\*Lead(?: \(([^)]*)\))?:\*\*\s*(.*)$/))) {
      const time = m[1] || null;
      if (m[2].trim() === '' && lines[i + 1]?.startsWith('>')) {
        const q = quoteBlock(lines, i + 1); sc.steps.push({ type: 'lead', text: q.text, time }); i = q.next;
      } else {
        const p = paragraph(lines, i, m[2]); sc.steps.push({ type: 'lead', text: p.text, time }); i = p.next;
      }
      continue;
    }
    if (/^> ⚡/.test(line)) {
      const q = quoteBlock(lines, i);
      const mm = q.text.match(/^⚡\s*\*\*Inflexão:\s*([^*]+?)\.?\*\*\s*([\s\S]*)$/);
      sc.steps.push({ type: 'inflexao', title: mm ? mm[1].trim() : 'Inflexão', text: mm ? mm[2].trim() : q.text.replace(/^⚡\s*/, '') });
      i = q.next; continue;
    }
    if ((m = line.match(/^\*\*Resultado:\*\*\s*(.*)$/))) {
      const p = paragraph(lines, i, m[1]); sc.steps.push({ type: 'result', text: p.text }); i = p.next; continue;
    }
    if ((m = line.match(/^\*\*([^*:]+):\*\*\s*(.*)$/))) {
      // rótulo livre, ex.: "Variação hostil": vira fala do lead com etiqueta
      const p = paragraph(lines, i, m[2]);
      sc.steps.push({ type: 'lead', text: p.text.replace(/^"|"$/g, ''), label: m[1].trim() });
      i = p.next; continue;
    }
    if (line.trim() !== '' && !line.startsWith('>')) {
      const p = paragraph(lines, i, line.trim()); sc.steps.push({ type: 'note', text: p.text }); i = p.next; continue;
    }
    i++;
  }
  closeScenario();

  // análise de copy + resumo por cenário
  for (const s of out.scenarios) {
    let lastLead = null;
    s.steps.forEach((st, idx) => {
      st.key = `${s.id}#${idx}`;
      if (st.type === 'lead') lastLead = st.text;
      if (st.type === 'agent') st.analysis = analyzeCopy(st.text, st.touch1 ? null : lastLead);
    });
    const agent = s.steps.filter((st) => st.type === 'agent');
    const final = [...agent].reverse().find((st) => st.action && st.action !== 'touch_1');
    s.stats = {
      agent_messages: agent.length,
      lead_messages: s.steps.filter((st) => st.type === 'lead').length,
      inflections: s.steps.filter((st) => st.type === 'inflexao').length,
      clean: agent.filter((st) => st.analysis.clean).length,
      ending_in_question: agent.filter((st) => !st.touch1 && st.analysis.ends_with_question).length,
      replies: agent.filter((st) => !st.touch1).length,
      outcome: final ? final.action : null,
      outcome_detail: final ? final.action_detail : null,
    };
  }
  for (const p of out.before_after) {
    p.ia_analysis = analyzeCopy(p.ia);
    p.humano_analysis = analyzeCopy(p.humano);
  }
  return out;
}

export async function loadSimulations(docsDir) {
  const md = await fs.readFile(path.join(docsDir, 'simulacoes-atendimento.md'), 'utf8');
  return parseSimulations(md);
}
