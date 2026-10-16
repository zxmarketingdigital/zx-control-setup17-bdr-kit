// dispatcher/src/tz.js
// Fuso horário do aluno. Usado pelo dispatcher e pelo CRM (agenda, modo automático,
// janela de envio, follow-ups) para não assumir mais São Paulo (UTC-3).
//
// O fuso vem de TIMEZONE no .env (nome IANA: America/Sao_Paulo, Europe/Lisbon...).
// Funciona com horário de verão: o deslocamento é calculado pela data, não fixo.

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Fuso configurado; se vier vazio ou inválido, cai no padrão.
export function getTimezone() {
  const tz = (process.env.TIMEZONE || '').trim();
  return isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE;
}

const pad = (n) => String(n).padStart(2, '0');

// Relógio de parede (ano, mês, dia, hora...) de um instante, no fuso dado.
export function zonedParts(date, tz = getTimezone()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour'), minute: get('minute'), second: get('second'),
  };
}

// Minutos a leste do UTC que o fuso tem naquele instante (Lisboa no verão: +60).
export function offsetMinutes(date, tz = getTimezone()) {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - truncated) / 60_000);
}

// "2026-10-20" + "10:00" no fuso dado → o instante (Date) correspondente.
// Duas passadas pra acertar nas viradas de horário de verão.
export function localToDate(ymd, hm, tz = getTimezone()) {
  const [y, mo, d] = ymd.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const first = guess - offsetMinutes(new Date(guess), tz) * 60_000;
  const second = guess - offsetMinutes(new Date(first), tz) * 60_000;
  return new Date(second);
}

// Instante → "YYYY-MM-DDTHH:mm:ss+01:00" no fuso dado.
export function toIso(date, tz = getTimezone()) {
  const p = zonedParts(date, tz);
  const off = offsetMinutes(date, tz);
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function ymdInTz(date, tz = getTimezone()) {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// 0 = domingo ... 6 = sábado, no fuso dado.
export function weekdayInTz(date, tz = getTimezone()) {
  const p = zonedParts(date, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

// Aceita ISO com deslocamento ("...-03:00", "...Z") ou horário "solto" no fuso
// configurado ("2026-10-20T10:00" ou "2026-10-20T10:00:00"), que é o que a tela de
// agendar manda. Devolve um Date, ou null se for inválido.
export function parseScheduledAt(value, tz = getTimezone()) {
  const s = String(value ?? '').trim();
  const naive = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/.exec(s);
  if (naive) {
    const d = localToDate(naive[1], naive[2], tz);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
