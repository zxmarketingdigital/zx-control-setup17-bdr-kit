import { phoneKey } from './phone.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './log.js';
import { addWorkingDays, todayStr } from './window.js';
import { localToDate, toIso } from './tz.js';
import { writeJsonAtomic } from './fs-atomic.js';

const MOD = 'master';
const MASTER_FILE = () => path.join(config.pipelineDir, 'leads-master.json');

const TOUCH_OFFSETS = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };

function _buildAnnotationText(crm_notes) {
  const lines = [];
  if (crm_notes.decisor_nome) {
    const papel = crm_notes.decisor_papel ? ` (${crm_notes.decisor_papel})` : '';
    const ig = crm_notes.decisor_instagram ? ` — ${crm_notes.decisor_instagram}` : '';
    lines.push(`**Decisor**\n${crm_notes.decisor_nome}${papel}${ig}`);
  }
  if (crm_notes.sinais_observados) lines.push(`**Sinais observados**\n${crm_notes.sinais_observados}`);
  if (crm_notes.pontos_de_melhoria) lines.push(`**Pontos de melhoria**\n${crm_notes.pontos_de_melhoria}`);
  if (crm_notes.direcao_sugerida)   lines.push(`**Direção sugerida**\n${crm_notes.direcao_sugerida}`);
  return lines.join('\n\n');
}

async function readMaster() {
  try {
    const raw = await fs.readFile(MASTER_FILE(), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function writeMaster(data) {
  await fs.mkdir(config.pipelineDir, { recursive: true });
  // Atômico: write em temp + rename. Evita race com o CRM.
  await writeJsonAtomic(MASTER_FILE(), data);
}

export async function loadMaster() {
  return readMaster();
}

export async function recordTouchSent(leadId, touch, copy, queueEntry) {
  const master = await readMaster();

  const sentAt = new Date().toISOString();
  const today = todayStr();

  const nextTouch = touch + 1;
  const nextTouchDueAt = nextTouch <= 6
    ? toIso(localToDate(addWorkingDays(today, TOUCH_OFFSETS[nextTouch] - TOUCH_OFFSETS[touch]), '10:00'))
    : null;

  if (!master[leadId]) {
    const entry = {
      name: queueEntry?.name ?? '',
      marca: queueEntry?.marca ?? '',
      phone: queueEntry?.phone ?? '',
      category: queueEntry?.category ?? '',
      first_contact_date: today,
      current_touch: touch,
      next_touch_due_at: nextTouchDueAt,
      responded: false,
      responded_at: null,
      status: 'active',
      history: [],
    };
    if (queueEntry?.crm_notes) {
      entry.crm_notes = queueEntry.crm_notes;
      entry.annotations = [{
        at: new Date().toISOString(),
        text: _buildAnnotationText(queueEntry.crm_notes),
      }];
    }
    master[leadId] = entry;
  } else {
    // If entry was pre-created (e.g. CRM notes) but never dispatched, initialize on first send
    if (!master[leadId].first_contact_date) {
      master[leadId].first_contact_date = today;
      master[leadId].status = 'active';
      master[leadId].responded = false;
    }
    if (queueEntry?.crm_notes && !master[leadId].crm_notes) {
      master[leadId].crm_notes = queueEntry.crm_notes;
      if (!master[leadId].annotations) master[leadId].annotations = [];
      master[leadId].annotations.push({
        at: new Date().toISOString(),
        text: _buildAnnotationText(queueEntry.crm_notes),
      });
    }
    master[leadId].current_touch = touch;
    master[leadId].next_touch_due_at = nextTouchDueAt;
    if (touch >= 6 && !master[leadId].responded) {
      master[leadId].status = 'exhausted';
      master[leadId].next_touch_due_at = null;
      logger.info(MOD, `Lead ${leadId} exhausted after touch 6`);
    }
  }

  master[leadId].history.push({ touch, sent_at: sentAt, copy });

  await writeMaster(master);
  logger.debug(MOD, `Recorded touch ${touch} for ${leadId}`);
  return master[leadId];
}

export async function markConfirmationSent(leadId, copy) {
  const master = await readMaster();
  if (!master[leadId]) {
    logger.warn(MOD, `markConfirmationSent: unknown lead_id ${leadId}`);
    return;
  }
  if (!master[leadId].meeting) {
    logger.warn(MOD, `markConfirmationSent: lead ${leadId} has no meeting`);
    return;
  }
  master[leadId].meeting.confirmation_sent_at = new Date().toISOString();
  if (copy) {
    if (!Array.isArray(master[leadId].meeting.confirmation_history)) {
      master[leadId].meeting.confirmation_history = [];
    }
    master[leadId].meeting.confirmation_history.push({
      sent_at: master[leadId].meeting.confirmation_sent_at,
      copy,
    });
  }
  await writeMaster(master);
  logger.info(MOD, `Lead ${leadId}: confirmation sent for meeting at ${master[leadId].meeting.scheduled_at}`);
}

export async function markResponded(leadId, phone) {
  const master = await readMaster();
  if (!master[leadId]) {
    logger.warn(MOD, `markResponded: unknown lead_id ${leadId}`);
    return;
  }
  master[leadId].responded = true;
  master[leadId].responded_at = new Date().toISOString();
  master[leadId].status = 'responded';
  master[leadId].next_touch_due_at = null;
  await writeMaster(master);
  logger.info(MOD, `Lead ${leadId} (${phone}) marked as responded`);
}

// Registra um turno do modo automático — não é toque 1-6 da cadência fixa,
// então NÃO mexe em current_touch/next_touch_due_at.
export async function recordAutoTurn(leadId, copy) {
  const master = await readMaster();
  if (!master[leadId]) {
    logger.warn(MOD, `recordAutoTurn: unknown lead_id ${leadId}`);
    return;
  }
  if (!Array.isArray(master[leadId].history)) master[leadId].history = [];
  master[leadId].history.push({ touch: 'auto', sent_at: new Date().toISOString(), copy });
  await writeMaster(master);
}

// Encerramento pedido pelo modo automático (recusa, pedido de parar, anti-fit
// revelado na conversa, adiamento). Status sai de 'active' → cadência para.
// opt_out fica gravado pra ninguém reabordar esse número.
export async function markClosed(leadId, reason) {
  const master = await readMaster();
  if (!master[leadId]) {
    logger.warn(MOD, `markClosed: unknown lead_id ${leadId}`);
    return;
  }
  const r = String(reason || 'sem_interesse');
  master[leadId].status = 'cold';
  master[leadId].next_touch_due_at = null;
  master[leadId].closed_reason = r;
  master[leadId].closed_at = new Date().toISOString();
  if (/^opt_?out/i.test(r)) master[leadId].opt_out = true;
  if (!Array.isArray(master[leadId].annotations)) master[leadId].annotations = [];
  master[leadId].annotations.push({ at: master[leadId].closed_at, text: `[Modo automático] Conversa encerrada: ${r}` });
  await writeMaster(master);
  logger.info(MOD, `Lead ${leadId} encerrado pelo modo automático: ${r}`);
}

// Qualificação (faturamento + autoridade) já validada contra as palavras do
// lead (ver qualification.js). Mescla com o que já havia.
export async function recordQualification(leadId, accepted) {
  if (!accepted || !Object.keys(accepted).length) return null;
  const master = await readMaster();
  if (!master[leadId]) return null;
  master[leadId].qualification = { ...(master[leadId].qualification || {}), ...accepted };
  await writeMaster(master);
  logger.info(MOD, `Lead ${leadId}: qualificação atualizada (${Object.keys(accepted).join(', ')})`);
  return master[leadId].qualification;
}

export async function markNeedsReview(leadId, reason) {
  const master = await readMaster();
  if (!master[leadId]) {
    logger.warn(MOD, `markNeedsReview: unknown lead_id ${leadId}`);
    return;
  }
  master[leadId].status = 'needs_review';
  master[leadId].next_touch_due_at = null;
  if (reason) {
    if (!Array.isArray(master[leadId].annotations)) master[leadId].annotations = [];
    master[leadId].annotations.push({ at: new Date().toISOString(), text: `[Modo automático] Passou pro humano: ${reason}` });
  }
  await writeMaster(master);
  logger.info(MOD, `Lead ${leadId} marcado needs_review pelo modo automático${reason ? `: ${reason}` : ''}`);
}

export async function getLeadIdByPhone(phone) {
  const master = await readMaster();
  for (const [id, lead] of Object.entries(master)) {
    if (lead.phone === phone) return id;
  }
  return null;
}

export async function alreadySentTouch(leadId, touch) {
  const master = await readMaster();
  const lead = master[leadId];
  if (!lead) return false;
  return lead.history.some((h) => h.touch === touch);
}

// Leads que pediram pra parar (opt_out). Nunca mais recebem mensagem nossa, em nenhum fluxo:
// nem toque 1 da fila, nem follow-up, nem reabordagem por novo dataset.
export async function getOptOut() {
  const master = await readMaster();
  const ids = new Set();
  const phones = new Set();
  for (const [id, lead] of Object.entries(master)) {
    if (!lead?.opt_out) continue;
    ids.add(id);
    if (lead.phone) { phones.add(lead.phone); phones.add(phoneKey(lead.phone)); }
  }
  return { ids, phones };
}

export async function isLeadSendable(leadId) {
  const master = await readMaster();
  const lead = master[leadId];
  if (!lead) return true; // new lead, not in master yet — OK to send touch 1
  if (lead.opt_out) return false; // pediu pra parar: nunca mais
  // O mesmo número cadastrado em outro lead pediu pra parar: é a mesma pessoa.
  if (lead.phone) {
    const key = phoneKey(lead.phone);
    for (const [id, other] of Object.entries(master)) {
      if (id !== leadId && other?.opt_out && other.phone && phoneKey(other.phone) === key) return false;
    }
  }
  if (lead.no_send) return false; // lead de demonstração (scripts/seed-demo.py): nunca é enviado
  // Any status other than 'active' immediately pauses all follow-ups.
  // Status is set manually in the CRM — no automatic detection.
  if (lead.status !== 'active') return false;
  return true;
}

// Lista leads com reunião agendada PRA AMANHÃ (D+1 working day).
// Usado pelo confirmation-scheduler na Parte 2.
export async function getMeetingsForTomorrow() {
  const master = await readMaster();
  const tomorrowStr = addWorkingDays(todayStr(), 1);
  const tomorrowDate = tomorrowStr.split('T')[0];
  const result = [];
  for (const [id, lead] of Object.entries(master)) {
    if (!lead.meeting) continue;
    if (lead.meeting.status !== 'scheduled') continue;
    const scheduledDate = (lead.meeting.scheduled_at || '').split('T')[0];
    if (scheduledDate === tomorrowDate) {
      result.push({ id, ...lead });
    }
  }
  return result;
}
