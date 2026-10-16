import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './log.js';
import { todayStr, addWorkingDays } from './window.js';
import { localToDate, toIso } from './tz.js';
import { loadMaster, alreadySentTouch, isLeadSendable } from './master.js';
import { getAutoModeState } from './auto-mode-config.js';

const MOD = 'scheduler';

const TOUCH_OFFSETS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };

// Dois jogos de template: "manual" (você conduz a resposta) e "auto" (o modo
// automático conduz). Qual jogo usar é decidido no MOMENTO DO ENVIO, pelo
// estado atual do modo automático (não no dia do toque 1) — então ligar ou
// desligar o modo automático no meio da cadência de um lead já muda o tom do
// próximo toque, sem precisar reinstalar nada.
async function readTemplates() {
  const filePath = path.join(config.pipelineDir, 'followup-templates.json');
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    // Formato antigo (v1.0.10 pré-modo-automático-na-cadência): touch_N direto
    // na raiz. Trata como o jogo manual, pra não quebrar quem já instalou.
    if (!parsed.manual && !parsed.auto && parsed.touch_2) return { manual: parsed, auto: parsed };
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      logger.warn(MOD, 'followup-templates.json not found — follow-ups will not be sent until file is created');
      return null;
    }
    throw err;
  }
}

export async function rebuildSchedule() {
  const master = await loadMaster();
  const today = todayStr();
  const schedule = [];

  for (const [leadId, lead] of Object.entries(master)) {
    if (lead.status !== 'active') continue;
    if (!lead.first_contact_date) continue;

    for (const [touch, offset] of Object.entries(TOUCH_OFFSETS)) {
      const touchNum = parseInt(touch, 10);
      if (lead.current_touch >= touchNum) continue;

      const dueDate = addWorkingDays(lead.first_contact_date, offset);
      schedule.push({
        lead_id: leadId,
        next_touch: touchNum,
        due_at: toIso(localToDate(dueDate, '10:00')),
      });
      break; // only the immediately next touch per lead
    }
  }

  const filePath = path.join(config.pipelineDir, 'followup-schedule.json');
  await fs.mkdir(config.pipelineDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(schedule, null, 2), 'utf8');
  logger.debug(MOD, `Rebuilt schedule: ${schedule.length} pending follow-ups`);
  return schedule;
}

// "[nome]" sem nome de pessoa viraria "Oi, ." — cara de robô na hora.
// Quando `name` é a própria empresa (acontece quando não há decisor
// identificado), não existe pessoa: o "Oi" fica sem vocativo.
function personVocative(lead) {
  const name = String(lead.name || '').trim();
  const marca = String(lead.marca || '').trim();
  if (!name || name.toLowerCase() === marca.toLowerCase()) return '';
  const parts = name.split(/\s+/);
  if (/^dra?\.?$/i.test(parts[0]) && parts[1]) return `${parts[0]} ${parts[1]}`;
  return parts[0];
}

export function fillPlaceholders(rawCopy, lead) {
  const empresa = String(lead.marca || '').trim();
  const vocativo = personVocative(lead);
  let copy = rawCopy.replace(/\[(empresa|marca)\]/gi, empresa || 'sua empresa');
  if (vocativo) {
    copy = copy.replace(/\[nome\]/gi, vocativo);
  } else {
    copy = copy.replace(/,\s*\[nome\]/gi, '').replace(/\[nome\],?\s*/gi, '');
  }
  return copy;
}

export async function getDueFollowUps() {
  const templates = await readTemplates();
  if (!templates) return [];

  // Estado do modo automático agora, não o de quando o toque 1 foi enviado.
  const autoState = await getAutoModeState();
  const activeSet = templates[autoState.enabled ? 'auto' : 'manual'];
  if (!activeSet) {
    logger.warn(MOD, `Jogo de templates "${autoState.enabled ? 'auto' : 'manual'}" ausente em followup-templates.json`);
    return [];
  }

  const schedule = await rebuildSchedule();
  const today = todayStr();
  const master = await loadMaster();

  const due = [];
  for (const entry of schedule) {
    const dueDate = entry.due_at.slice(0, 10);
    if (dueDate > today) continue;

    const lead = master[entry.lead_id];
    if (!lead) continue;
    if (!(await isLeadSendable(entry.lead_id))) continue;
    if (await alreadySentTouch(entry.lead_id, entry.next_touch)) continue;

    // One touch per lead per calendar day — prevents cascade when a touch is overdue
    const todayUTC = new Date().toISOString().slice(0, 10);
    const lastSent = lead.history[lead.history.length - 1]?.sent_at;
    if (lastSent && lastSent.slice(0, 10) === todayUTC) continue;

    const templateKey = `touch_${entry.next_touch}`;
    const rawCopy = activeSet[templateKey];
    if (!rawCopy) {
      logger.warn(MOD, `No template for ${templateKey}`);
      continue;
    }

    const copy = fillPlaceholders(rawCopy, lead);
    due.push({
      lead_id: entry.lead_id,
      phone: lead.phone,
      name: lead.name,
      marca: lead.marca,
      copy,
      touch: entry.next_touch,
    });
  }

  return due;
}
