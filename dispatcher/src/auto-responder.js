// dispatcher/src/auto-responder.js
// Motor de continuidade do "modo automático" — depois de uma resposta genuína
// do lead (já filtrada de auto-resposta pelo inbound-poller), decide a próxima
// mensagem chamando o Claude Code headless (claude -p, SEM --bare, pra carregar
// a skill do projeto), no mesmo padrão usado no bdr-agent de produção.
// A regra de condução está na seção 9 da skill; este arquivo só monta o
// contexto, valida a decisão e executa.
//
// ⚠️ Pré-requisito ADICIONAL, só pra quem liga o modo automático: precisa do
// Claude Code CLI instalado separado do app Desktop (`npm install -g
// @anthropic-ai/claude-code` + `claude login` uma vez). O app Desktop sozinho
// não expõe `claude` como processo chamável — checkClaudeCli() falha cedo e
// com mensagem clara se faltar, em vez de errar silenciosamente lead a lead.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './log.js';
import { sendMessage } from './whatsapp.js';
import { humanizeGuard } from './humanize-guard.js';
import { recordQualification } from './master.js';
import { resolveClaudeBin } from './claude-cli.js';
import {
  loadBookingRules, validateQualificationUpdate, qualificationStatus, looksLikeSlotOffer, formatBRL,
} from './qualification.js';

const execFileAsync = promisify(execFile);
const MOD = 'auto-responder';
const MAX_AUTO_TURNS = 8; // trava de segurança — depois disso, sempre passa pro humano
// 90s não é sempre suficiente: a 1ª chamada de uma sessão claude -p paga o
// custo de criar o cache do prompt (projeto + skill inteiros). Chamadas
// seguintes tendem a ser bem mais rápidas (cache hit), mas o limite tem que
// cobrir a pior hora.
const CLAUDE_TIMEOUT_MS = 180_000;
const ACTIONS = ['reply', 'book_meeting', 'handoff_human', 'close'];

const crmBase = () => `http://localhost:${process.env.CRM_PORT || 3001}`;

let claudeCliChecked = false;
let claudeCliOk = false;

export async function checkClaudeCli() {
  if (claudeCliChecked) return claudeCliOk;
  claudeCliChecked = true;
  try {
    const bin = await resolveClaudeBin();
    if (!bin) throw new Error('binário não resolvido');
    await execFileAsync(bin, ['--version'], { timeout: 10_000 });
    claudeCliOk = true;
  } catch {
    claudeCliOk = false;
    logger.error(MOD, 'Claude Code CLI não encontrado — modo automático desativado até instalar.');
    logger.error(MOD, '  Instale: npm install -g @anthropic-ai/claude-code   (depois rode "claude login" uma vez)');
    logger.error(MOD, '  O app Claude Desktop sozinho NÃO é suficiente pro modo automático — ele roda o Code só dentro da janela do app.');
  }
  return claudeCliOk;
}

// Horários livres reais (Google Calendar via CRM). Sem agenda conectada,
// o prompt proíbe book_meeting.
async function fetchFreeSlots() {
  try {
    const res = await fetch(`${crmBase()}/api/calendar/free-slots?days=4&duration=30`);
    if (!res.ok) return { connected: false, slots: [], meeting_hours: [9, 18] };
    return await res.json();
  } catch {
    return { connected: false, slots: [], meeting_hours: [9, 18] };
  }
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function humanSlot(iso) {
  const d = new Date(iso);
  const sp = new Date(d.getTime() - 3 * 3600 * 1000);
  const dd = String(sp.getUTCDate()).padStart(2, '0');
  const mm = String(sp.getUTCMonth() + 1).padStart(2, '0');
  return `${WEEKDAYS[sp.getUTCDay()]} ${dd}/${mm} ${iso.slice(11, 16)} (date=${iso.slice(0, 10)} time=${iso.slice(11, 16)})`;
}

function qualificationBlock(lead, rules) {
  if (!rules?.require_qualification) {
    return `Qualificação: opcional nesta instalação. Mesmo assim, se o lead disser faturamento ou quem decide, registre em "qualificacao" (formato abaixo).`;
  }
  const st = qualificationStatus(lead.qualification, rules);
  const have = [
    st.revenue_ok ? `faturamento ✓ (${st.revenue_label}, lead disse: "${lead.qualification.revenue.quote}")` : 'faturamento ✗',
    st.authority_ok ? `autoridade ✓ (${lead.qualification.authority.kind}, lead disse: "${lead.qualification.authority.quote}")` : `autoridade ✗${lead.qualification?.authority?.kind === 'nao_decisor' ? ' (quem responde NÃO decide)' : ''}`,
  ].join(' · ');
  return `QUALIFICAÇÃO OBRIGATÓRIA ANTES DE AGENDAR (opção ligada no CRM): só proponha horário e só agende depois de saber o FATURAMENTO do negócio e QUEM DECIDE, ditos pelo próprio lead.${rules.min_annual_revenue ? ` Faturamento mínimo pra call: ${formatBRL(rules.min_annual_revenue)}.` : ''}
Estado agora: ${have}.
${st.ready ? 'Qualificado: pode propor os 2 horários e agendar.' : `Falta: ${st.missing.join(' e ')}. NÃO proponha horário ainda. Faça UMA pergunta natural pro que falta (ver seção 9.3.1 da skill), por exemplo em faixa: "a empresa fatura mais perto de X, Y ou Z por ano?" ou "essa decisão é só sua ou tem sócio junto?".`}${st.below_min ? '\nO faturamento dito está ABAIXO do mínimo: não proponha call. Use handoff_human com o motivo.' : ''}
Se o lead não quiser dizer o faturamento, não insista: use handoff_human.`;
}

// Quantas mensagens seguidas do lead terminam a conversa, sem nenhuma resposta
// nossa no meio (a rajada que o dispatcher esperou assentar antes de decidir).
export function trailingLeadMessages(timeline) {
  let n = 0;
  for (let i = timeline.length - 1; i >= 0 && timeline[i].text.startsWith('[Lead]'); i--) n++;
  return n;
}

function buildPrompt(lead, timeline, agenda, rules) {
  const convo = timeline.map((t) => t.text).join('\n');
  const burst = trailingLeadMessages(timeline);
  const burstBlock = burst > 1
    ? `\nO lead mandou ${burst} mensagens seguidas, sem resposta sua no meio (as ${burst} últimas linhas [Lead]). Leia as ${burst} em conjunto, como uma mensagem só, e responda uma vez só. Não responda cada uma separado; se uma corrige ou completa a anterior, vale a versão mais recente.\n`
    : '';
  const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const agendaBlock = agenda.connected && agenda.slots.length
    ? `Horários LIVRES reais na agenda (ofereça no máximo 2, em dias diferentes quando der):\n${agenda.slots.map((s) => `- ${humanSlot(s)}`).join('\n')}\nHorário de reuniões aceito: dias úteis, ${agenda.meeting_hours[0]}h às ${agenda.meeting_hours[1]}h.`
    : 'A agenda NÃO está conectada ou não tem horário livre: NÃO use book_meeting. Se o lead topar a call, use handoff_human pro humano confirmar o horário.';

  return `Você está no "modo automático" do BDR. Siga a seção 9 da skill deste projeto (condução da conversa) e passe a mensagem pelo checklist anti-IA da seção 10 antes de responder.

Hoje é ${today} (fuso America/Sao_Paulo).
Lead: ${lead.marca || lead.name || lead.id}
Contato: ${lead.name && lead.name !== lead.marca ? lead.name : '(nome da pessoa não identificado — não invente)'}
Categoria: ${lead.category || '—'}

${agendaBlock}

${qualificationBlock(lead, rules)}

Conversa até agora (mais antiga primeiro):
${convo}
${burstBlock}
Decida a PRÓXIMA ação e responda em UMA linha de JSON, sem markdown, sem texto fora do JSON:
{"action":"reply","message":"..."}
  — continue a qualificação, trate a objeção ou proponha a call com 2 horários da lista.
{"action":"book_meeting","message":"...","date":"YYYY-MM-DD","time":"HH:MM","duration_minutes":30}
  — SÓ quando o lead confirmou dia E hora exatos. "message" confirma dia e hora em 1 frase; o link do Meet é anexado pelo sistema.
{"action":"close","message":"...","reason":"opt_out|sem_interesse|anti_fit|adiado:YYYY-MM-DD"}
  — recusa, pedido de parar, irritação, anti-fit revelado ou adiamento. "message" é UMA frase educada (pode ser vazia em opt_out hostil).
{"action":"handoff_human","reason":"...","message":"..."}
  — pediu proposta/e-mail/contrato, passou outro contato, pergunta fora da skill, ou qualquer dúvida real. Na dúvida, esta. "message" é opcional: 1 frase de cortesia pro lead não ficar sem resposta, sem prometer prazo e sem assumir compromisso novo que o lead não pediu.

Em QUALQUER ação, se o lead disse o faturamento ou quem decide, inclua também:
"qualificacao":{"faturamento_trecho":"<trecho EXATO que o lead escreveu ou falou, copiado da conversa>","autoridade_trecho":"<trecho EXATO>","autoridade":"decisor|decisor_na_call|nao_decisor"}
Copie o trecho literalmente, sem resumir. Trecho que não estiver na conversa é descartado pelo sistema. Omita o campo que o lead não disse.

Regras duras: nunca passe preço, nunca prometa resultado, nunca invente horário fora da lista, uma pergunta por mensagem no máximo, mensagem curta (espelhe o tamanho da mensagem do lead).${convo.includes('transcrição automática') ? `

Áudio: linhas marcadas "[áudio ..., transcrição automática]" são o que o lead FALOU, transcrito por máquina. Pode ter palavra trocada. Responda ao conteúdo como faria depois de ouvir (sem dizer "ouvi seu áudio", sem citar a transcrição). Áudio costuma ser mais longo que texto: responda curto mesmo assim, ao ponto principal. Se um dado essencial pra decisão (dia, hora, nome, número) estiver estranho ou ambíguo na transcrição, NÃO assuma: pergunte de novo em 1 frase ou use handoff_human. Nunca agende a partir de dia/hora que veio só de um trecho duvidoso.` : ''}`;
}

async function callClaudeHeadless(prompt, cwd) {
  const bin = await resolveClaudeBin();
  if (!bin) throw new Error('Claude Code CLI não encontrado');
  // Restrito a leitura (Read/Glob/Grep): o modelo só precisa consultar a
  // skill do projeto pra tom/regras — a conversa e os horários livres já vão
  // inteiros no prompt. O output esperado é uma linha de JSON com a decisão;
  // sem Edit/Write/Bash, não tem como o modelo alterar nada no disco por
  // conta própria no meio da decisão.
  const result = await execFileAsync(bin, [
    '-p', prompt,
    '--output-format', 'json',
    '--permission-mode', 'dontAsk',
    '--allowedTools', 'Read,Glob,Grep',
  ], { cwd, timeout: CLAUDE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 });
  return result.stdout;
}

export function parseAction(stdout, leadId = '?') {
  let outer;
  try {
    outer = JSON.parse(stdout);
  } catch {
    logger.error(MOD, `Saída do claude -p não é JSON válido pra ${leadId}`);
    return { action: 'handoff_human', reason: 'Resposta headless não interpretável' };
  }
  const text = outer.result ?? outer.output ?? '';
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) {
    logger.error(MOD, `Sem bloco de ação na resposta do Claude pra ${leadId}`);
    return { action: 'handoff_human', reason: 'Resposta sem JSON de ação' };
  }
  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return { action: 'handoff_human', reason: 'JSON de ação malformado' };
  }
  if (!ACTIONS.includes(parsed.action)) {
    return { action: 'handoff_human', reason: `Ação desconhecida: ${parsed.action}` };
  }
  if (parsed.action === 'reply' && !String(parsed.message || '').trim()) {
    return { action: 'handoff_human', reason: 'reply sem mensagem' };
  }
  return parsed;
}

// Segunda barreira (a primeira é o prompt): data/hora têm que ser válidas,
// no futuro, em dia útil e dentro do horário de reuniões.
export function validateBooking(decision, meetingHours = [9, 18]) {
  const { date, time } = decision;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) {
    return 'data ou hora em formato inválido';
  }
  const iso = `${date}T${time}:00-03:00`;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return 'data inválida';
  if (when.getTime() < Date.now() + 30 * 60_000) return 'horário no passado ou em menos de 30 min';
  const sp = new Date(when.getTime() - 3 * 3600 * 1000);
  if ([0, 6].includes(sp.getUTCDay())) return 'fim de semana';
  const hour = Number(time.slice(0, 2)) + Number(time.slice(3, 5)) / 60;
  const dur = (decision.duration_minutes || 30) / 60;
  if (hour < meetingHours[0] || hour + dur > meetingHours[1]) return `fora do horário de reuniões (${meetingHours[0]}h-${meetingHours[1]}h)`;
  return null;
}

async function bookMeeting(leadId, decision) {
  const res = await fetch(`${crmBase()}/api/leads/${leadId}/meeting`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scheduled_at: `${decision.date}T${decision.time}:00-03:00`,
      duration_minutes: decision.duration_minutes || 30,
      notes: 'Agendado automaticamente pelo modo automático do BDR.',
      add_google_meet: true,
      require_free: true,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `CRM recusou o agendamento (${res.status})`);
    err.code = body.code;
    throw err;
  }
  return body; // lead atualizado, com meeting.google_meet_url
}

// Qualificação + trava de agendamento. Exportada pra teste; `record` grava a
// qualificação aceita no leads-master (substituível no teste).
export async function applyQualificationGate(decision, lead, timeline, rules, record = recordQualification) {
  // Só entra o que tem trecho real nas mensagens do lead (texto ou áudio transcrito).
  const leadTexts = timeline.filter((t) => t.text.startsWith('[Lead]')).map((t) => t.text);
  if (decision.qualificacao) {
    const { accepted, rejected } = validateQualificationUpdate(decision.qualificacao, leadTexts);
    if (rejected.length) logger.warn(MOD, `Qualificação descartada em ${lead.id}: ${rejected.join('; ')}`);
    const merged = await record(lead.id, accepted);
    if (merged) lead.qualification = merged;
  }
  const qual = qualificationStatus(lead.qualification, rules);
  decision.qualification_status = qual;
  if (!rules.require_qualification || qual.ready) return decision;

  // Com a opção ligada: nada de horário sem faturamento e autoridade confirmados
  // pelo lead. Vale pra agendar e pra propor horário.
  const why = qual.below_min
    ? `faturamento abaixo do mínimo (${qual.revenue_label} < ${formatBRL(rules.min_annual_revenue)})`
    : `falta ${qual.missing.join(' e ')}`;
  if (decision.action === 'book_meeting') {
    logger.warn(MOD, `Agendamento barrado em ${lead.id}: ${why}`);
    return { action: 'handoff_human', gate_blocked: true, reason: `Lead quis agendar, mas a qualificação obrigatória não fechou (${why}). Decida você.`, qualification_status: qual };
  }
  if (decision.action === 'reply' && looksLikeSlotOffer(decision.message)) {
    logger.warn(MOD, `Proposta de horário barrada em ${lead.id}: ${why}`);
    return { action: 'handoff_human', gate_blocked: true, reason: `O agente ia propor horário antes de qualificar (${why}). Sugestão era: "${String(decision.message).slice(0, 160)}"`, qualification_status: qual };
  }
  return decision;
}

// Processa UM lead que acabou de responder de verdade. Retorna a decisão
// (com `sent` = texto efetivamente enviado, quando houver) pra index.js registrar.
export async function processAutoTurn(lead, timeline) {
  const autoTurnsSoFar = (lead.history || []).filter((h) => h.touch === 'auto').length;
  if (autoTurnsSoFar >= MAX_AUTO_TURNS) {
    logger.warn(MOD, `${lead.id} atingiu o limite de ${MAX_AUTO_TURNS} turnos automáticos — passando pro humano`);
    return { action: 'handoff_human', reason: `Limite de ${MAX_AUTO_TURNS} turnos automáticos atingido` };
  }

  const agenda = await fetchFreeSlots();
  const rules = await loadBookingRules(config.pipelineDir);
  const cwd = path.resolve(config.pipelineDir, '..');
  const prompt = buildPrompt(lead, timeline, agenda, rules);

  let stdout;
  try {
    stdout = await callClaudeHeadless(prompt, cwd);
  } catch (err) {
    logger.error(MOD, `claude -p falhou pra ${lead.id}: ${err.message.slice(0, 200)}`);
    return { action: 'handoff_human', reason: 'Falha ao chamar Claude Code headless' };
  }

  const gated = await applyQualificationGate(parseAction(stdout, lead.id), lead, timeline, rules);
  if (gated.action === 'handoff_human' && gated.gate_blocked) return gated;
  const decision = gated;

  // Checklist anti-IA determinístico antes de qualquer envio (ver humanize-guard.js)
  if (String(decision.message || '').trim()) {
    const guard = humanizeGuard(decision.message);
    if (guard.fixes.length) logger.info(MOD, `Ajuste anti-IA em ${lead.id}: ${guard.fixes.join(', ')}`);
    if (!guard.ok) {
      logger.warn(MOD, `Mensagem pra ${lead.id} barrada: ${guard.reason}`);
      return { action: 'handoff_human', reason: `Mensagem gerada barrada no checklist anti-IA: ${guard.reason}. Sugestão era: "${guard.text.slice(0, 160)}"` };
    }
    decision.message = guard.text;
  }

  if (decision.action === 'reply') {
    await sendMessage(lead.phone, decision.message);
    decision.sent = decision.message;
    logger.info(MOD, `Modo automático respondeu ${lead.id}: "${decision.message.slice(0, 60)}…"`);
  } else if (decision.action === 'book_meeting') {
    if (!agenda.connected) {
      return { action: 'handoff_human', reason: 'Lead topou a call, mas a agenda não está conectada — confirme o horário você' };
    }
    const invalid = validateBooking(decision, agenda.meeting_hours);
    if (invalid) {
      return { action: 'handoff_human', reason: `Horário proposto recusado (${invalid}): ${decision.date} ${decision.time}` };
    }
    let updated;
    try {
      updated = await bookMeeting(lead.id, decision);
    } catch (err) {
      const why = err.code === 'slot_busy' ? 'horário ficou ocupado na agenda' : err.message;
      return { action: 'handoff_human', reason: `Não agendou ${decision.date} ${decision.time}: ${why}` };
    }
    const meet = updated?.meeting?.google_meet_url;
    const text = [decision.message, meet ? `Link da call: ${meet}` : ''].filter(Boolean).join('\n\n');
    if (text) {
      await sendMessage(lead.phone, text);
      decision.sent = text;
    }
    logger.info(MOD, `Modo automático agendou reunião pra ${lead.id} em ${decision.date} ${decision.time}`);
  } else if (decision.action === 'close') {
    if (String(decision.message || '').trim()) {
      await sendMessage(lead.phone, decision.message);
      decision.sent = decision.message;
    }
    logger.info(MOD, `Modo automático encerrou ${lead.id}: ${decision.reason || '—'}`);
  } else {
    if (String(decision.message || '').trim()) {
      await sendMessage(lead.phone, decision.message);
      decision.sent = decision.message;
    }
    logger.info(MOD, `Modo automático passou ${lead.id} pro humano: ${decision.reason || '—'}`);
  }

  return decision;
}
