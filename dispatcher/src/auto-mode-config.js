// dispatcher/src/auto-mode-config.js
// Estado do "modo automático" — ligar/desligar global + pausa por lead.
// Arquivo compartilhado entre CRM (liga/desliga na aba Abordagens) e
// dispatcher (lê a cada ciclo). Fica em pipeline/ como todo o resto do estado.

import path from 'node:path';
import { config } from './config.js';
import { readJson, writeJsonAtomic } from './fs-atomic.js';

const FILE = () => path.join(config.pipelineDir, 'auto-mode.json');

// audio_auto_reply: com a transcrição ligada (TRANSCRIBE_AUDIO), deixa o modo
// automático responder a partir do áudio transcrito. Desligado, áudio sempre
// vai pro humano (com a transcrição anexada, se houver).
const DEFAULTS = { enabled: false, paused_leads: [], audio_auto_reply: false };

export async function getAutoModeState() {
  const state = await readJson(FILE(), null);
  if (!state) return { ...DEFAULTS, paused_leads: [] };
  return {
    enabled: !!state.enabled,
    paused_leads: Array.isArray(state.paused_leads) ? state.paused_leads : [],
    audio_auto_reply: !!state.audio_auto_reply,
  };
}

export async function setAutoModeEnabled(enabled) {
  const state = await getAutoModeState();
  state.enabled = !!enabled;
  await writeJsonAtomic(FILE(), state);
  return state;
}

export async function setLeadPaused(leadId, paused) {
  const state = await getAutoModeState();
  const set = new Set(state.paused_leads);
  if (paused) set.add(leadId); else set.delete(leadId);
  state.paused_leads = [...set];
  await writeJsonAtomic(FILE(), state);
  return state;
}

export async function isLeadInAutoMode(leadId) {
  const state = await getAutoModeState();
  return state.enabled && !state.paused_leads.includes(leadId);
}
