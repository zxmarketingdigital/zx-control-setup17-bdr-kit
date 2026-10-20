// crm/src/calendar.js
// Integração Google Calendar via OAuth2 (googleapis)
// Cria, atualiza, deleta eventos. Token persistido em google-token.json.

import { google } from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const CRM_ROOT = path.resolve(path.dirname(__filename), '..');
const CREDENTIALS_PATH = path.join(CRM_ROOT, 'google-credentials.json');
const TOKEN_PATH = path.join(CRM_ROOT, 'google-token.json');
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback';
const TIMEZONE = 'America/Sao_Paulo';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

let oauth2Client = null;
let calendarClient = null;

async function loadCredentials() {
  try {
    const raw = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function loadToken() {
  try {
    const raw = await fs.readFile(TOKEN_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function saveToken(token) {
  await fs.writeFile(TOKEN_PATH, JSON.stringify(token, null, 2), 'utf8');
}

async function getOAuth2Client() {
  if (oauth2Client) return oauth2Client;
  const creds = await loadCredentials();
  if (!creds) {
    throw new Error('google-credentials.json não encontrado em crm/. Veja CALENDAR-SETUP.md.');
  }
  const cfg = creds.web || creds.installed;
  if (!cfg) throw new Error('Formato inválido de google-credentials.json (esperado "web" ou "installed").');

  oauth2Client = new google.auth.OAuth2(cfg.client_id, cfg.client_secret, REDIRECT_URI);

  const token = await loadToken();
  if (token) {
    oauth2Client.setCredentials(token);
    oauth2Client.on('tokens', (newToken) => {
      // refresh_token vem só na primeira vez — preservar
      saveToken({ ...token, ...newToken }).catch(() => {});
    });
  }
  return oauth2Client;
}

async function getCalendar() {
  if (calendarClient) return calendarClient;
  const auth = await getOAuth2Client();
  calendarClient = google.calendar({ version: 'v3', auth });
  return calendarClient;
}

// --- Public API ---

export async function isCalendarConnected() {
  try {
    const creds = await loadCredentials();
    if (!creds) return { connected: false, reason: 'credentials_missing' };
    const token = await loadToken();
    if (!token?.refresh_token) return { connected: false, reason: 'token_missing' };
    return { connected: true };
  } catch (err) {
    return { connected: false, reason: err.message };
  }
}

export async function getAuthUrl() {
  const client = await getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function handleAuthCallback(code) {
  const client = await getOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  await saveToken(tokens);
  // forçar reload do calendar client
  calendarClient = null;
  return true;
}

function buildEventDescription(lead, notes) {
  const lines = [];
  lines.push(`Reunião BDR — ${lead.marca || lead.name || lead.id}`);
  if (lead.phone) lines.push(`WhatsApp: ${lead.phone}`);
  if (lead.category) lines.push(`Categoria: ${lead.category}`);
  if (lead.crm_notes?.angle) lines.push(`Ângulo: ${lead.crm_notes.angle}`);
  if (lead.crm_notes?.direcao_sugerida) {
    lines.push('');
    lines.push('Direção sugerida:');
    lines.push(lead.crm_notes.direcao_sugerida);
  }
  if (notes) {
    lines.push('');
    lines.push('Notas:');
    lines.push(notes);
  }
  return lines.join('\n');
}

export async function createMeeting({ lead, startTime, durationMinutes = 30, notes = '', addMeet = true }) {
  const calendar = await getCalendar();
  const startMs = new Date(startTime).getTime();
  if (Number.isNaN(startMs)) throw new Error(`startTime inválido: ${startTime}`);
  const endMs = startMs + durationMinutes * 60_000;

  const event = {
    summary: `Call BDR — ${lead.marca || lead.name || lead.id}`,
    description: buildEventDescription(lead, notes),
    start: { dateTime: new Date(startMs).toISOString(), timeZone: TIMEZONE },
    end: { dateTime: new Date(endMs).toISOString(), timeZone: TIMEZONE },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 10 },
      ],
    },
  };

  const params = {
    calendarId: 'primary',
    requestBody: event,
  };

  if (addMeet) {
    event.conferenceData = {
      createRequest: {
        requestId: `bdr-${lead.id || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
    params.conferenceDataVersion = 1;
  }

  const res = await calendar.events.insert(params);
  const created = res.data;
  return {
    calendar_event_id: created.id,
    calendar_html_link: created.htmlLink,
    google_meet_url: created.hangoutLink || null,
    start_time: created.start?.dateTime || event.start.dateTime,
    end_time: created.end?.dateTime || event.end.dateTime,
  };
}

export async function updateMeeting({ eventId, startTime, durationMinutes, notes, lead }) {
  const calendar = await getCalendar();
  const patch = {};

  if (startTime) {
    const startMs = new Date(startTime).getTime();
    if (Number.isNaN(startMs)) throw new Error(`startTime inválido: ${startTime}`);
    const dur = durationMinutes || 30;
    patch.start = { dateTime: new Date(startMs).toISOString(), timeZone: TIMEZONE };
    patch.end = { dateTime: new Date(startMs + dur * 60_000).toISOString(), timeZone: TIMEZONE };
  }

  if (lead) {
    patch.summary = `Call BDR — ${lead.marca || lead.name || lead.id}`;
    patch.description = buildEventDescription(lead, notes ?? '');
  }

  const res = await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    requestBody: patch,
  });
  return res.data;
}

export async function deleteMeeting(eventId) {
  const calendar = await getCalendar();
  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  });
}

// ── Disponibilidade ───────────────────────────────────────────────────────────
// Usa events.list (coberto pelo escopo calendar.events que o CRM já pede) em
// vez de freebusy.query, que exigiria reautorizar o OAuth. Evento marcado
// como "livre" (transparent) não bloqueia; dia inteiro "ocupado" bloqueia o dia.
const SP_OFFSET_MS = 3 * 3600 * 1000; // America/Sao_Paulo sem horário de verão desde 2019

async function listBusy(timeMinISO, timeMaxISO) {
  const calendar = await getCalendar();
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });
  return (res.data.items || [])
    .filter((e) => e.status !== 'cancelled' && e.transparency !== 'transparent')
    .map((e) => (e.start?.dateTime
      ? { start: new Date(e.start.dateTime).getTime(), end: new Date(e.end.dateTime).getTime() }
      : { start: new Date(`${e.start.date}T00:00:00-03:00`).getTime(), end: new Date(`${e.end.date}T00:00:00-03:00`).getTime() }));
}

export async function isSlotFree(startISO, durationMinutes = 30) {
  const start = new Date(startISO).getTime();
  const end = start + durationMinutes * 60_000;
  const busy = await listBusy(new Date(start).toISOString(), new Date(end).toISOString());
  return !busy.some((b) => b.start < end && b.end > start);
}

// Candidatos de :00 e :30 nos próximos `days` dias úteis, a partir de
// `nowMs + minLeadMinutes`. Puro — separado pra dar pra testar sem Google.
export function buildSlotCandidates({
  nowMs = Date.now(), days = 4, durationMinutes = 30, startHour = 9, endHour = 18,
  workingDays = [1, 2, 3, 4, 5], minLeadMinutes = 120,
} = {}) {
  const earliest = nowMs + minLeadMinutes * 60_000;
  const spToday = new Date(nowMs - SP_OFFSET_MS); // relógio de SP nos getters UTC
  const candidates = [];
  let checkedDays = 0;
  for (let d = 0; checkedDays < days && d < days + 7; d++) {
    const day = new Date(Date.UTC(spToday.getUTCFullYear(), spToday.getUTCMonth(), spToday.getUTCDate() + d));
    if (!workingDays.includes(day.getUTCDay())) continue;
    checkedDays++;
    const ymd = day.toISOString().slice(0, 10);
    for (let minutes = startHour * 60; minutes + durationMinutes <= endHour * 60; minutes += 30) {
      const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
      const mm = String(minutes % 60).padStart(2, '0');
      const iso = `${ymd}T${hh}:${mm}:00-03:00`;
      if (new Date(iso).getTime() >= earliest) candidates.push(iso);
    }
  }
  return candidates;
}

// Tira o que conflita com a agenda e espalha: no máximo 2 por dia, com pelo
// menos 3h entre eles (um de manhã, outro à tarde quando der). Puro.
export function pickFreeSlots(candidates, busy, { durationMinutes = 30, max = 6 } = {}) {
  const perDay = {};
  const free = [];
  for (const iso of candidates) {
    const s = new Date(iso).getTime();
    const e = s + durationMinutes * 60_000;
    if (busy.some((b) => b.start < e && b.end > s)) continue;
    const day = iso.slice(0, 10);
    const prev = free[free.length - 1];
    if ((perDay[day] || 0) >= 2) continue;
    if (perDay[day] === 1 && prev?.slice(0, 10) === day && Number(iso.slice(11, 13)) - Number(prev.slice(11, 13)) < 3) continue;
    perDay[day] = (perDay[day] || 0) + 1;
    free.push(iso);
    if (free.length >= max) break;
  }
  return free;
}

// Próximos horários livres de verdade na agenda do Google. ISO com -03:00.
export async function getFreeSlots({ durationMinutes = 30, max = 6, ...opts } = {}) {
  const candidates = buildSlotCandidates({ durationMinutes, ...opts });
  if (!candidates.length) return [];
  const first = new Date(candidates[0]).getTime();
  const last = new Date(candidates[candidates.length - 1]).getTime() + durationMinutes * 60_000;
  const busy = await listBusy(new Date(first).toISOString(), new Date(last).toISOString());
  return pickFreeSlots(candidates, busy, { durationMinutes, max });
}

export async function getMeeting(eventId) {
  const calendar = await getCalendar();
  const res = await calendar.events.get({
    calendarId: 'primary',
    eventId,
  });
  return res.data;
}
