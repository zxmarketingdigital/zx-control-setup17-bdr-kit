import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSlotCandidates, buildEventBody, pickFreeSlots } from '../src/calendar.js';
import { parseScheduledAt, toIso } from '../../dispatcher/src/tz.js';

const LIS = 'Europe/Lisbon';
const SP = 'America/Sao_Paulo';

test('reunião marcada às 10h em Lisboa vai pro Google às 10h de Lisboa', () => {
  // A tela manda "2026-10-20T10:00:00" (sem deslocamento) e o servidor aplica o fuso.
  const when = parseScheduledAt('2026-10-20T10:00:00', LIS);
  const body = buildEventBody({ lead: { id: 'x', marca: 'Clínica Teste' }, startTime: toIso(when, LIS), durationMinutes: 30, timezone: LIS });
  assert.equal(body.start.dateTime, '2026-10-20T09:00:00.000Z'); // 10h em Lisboa (WEST, +01:00)
  assert.equal(body.start.timeZone, LIS);
  assert.equal(body.end.dateTime, '2026-10-20T09:30:00.000Z');
  assert.equal(body.end.timeZone, LIS);
});

test('com o fuso de São Paulo nada muda: 10h local é 13h UTC', () => {
  const when = parseScheduledAt('2026-10-20T10:00:00', SP);
  const body = buildEventBody({ lead: { id: 'x' }, startTime: toIso(when, SP), timezone: SP });
  assert.equal(body.start.dateTime, '2026-10-20T13:00:00.000Z');
  assert.equal(body.start.timeZone, SP);
});

test('horários livres são gerados no fuso do aluno, com o deslocamento dele', () => {
  // Lisboa, 20/10/2026 08h00 local (07h00 UTC). Antecedência de 2h: primeiro horário 10h.
  const lis = buildSlotCandidates({
    nowMs: Date.parse('2026-10-20T07:00:00Z'), days: 1, startHour: 9, endHour: 11, timezone: LIS,
  });
  assert.deepEqual(lis, ['2026-10-20T10:00:00+01:00', '2026-10-20T10:30:00+01:00']);

  // São Paulo, 20/10/2026 09h00 local (12h00 UTC). Primeiro horário 11h.
  const sp = buildSlotCandidates({
    nowMs: Date.parse('2026-10-20T12:00:00Z'), days: 1, startHour: 9, endHour: 12, timezone: SP,
  });
  assert.deepEqual(sp, ['2026-10-20T11:00:00-03:00', '2026-10-20T11:30:00-03:00']);
});

test('"hoje" é o dia do fuso do aluno, não o do UTC nem o de São Paulo', () => {
  // 23h30 UTC de segunda: já é terça em Lisboa (WEST), ainda é segunda em São Paulo
  const nowMs = Date.parse('2026-10-19T23:30:00Z');
  const lis = buildSlotCandidates({ nowMs, days: 1, startHour: 9, endHour: 10, timezone: LIS, minLeadMinutes: 0 });
  assert.ok(lis[0].startsWith('2026-10-20T09:00:00'), lis[0]); // terça
  // days: 2 porque "hoje" (segunda, 20h30 em São Paulo) conta como um dos dias, mesmo sem horário sobrando
  const sp = buildSlotCandidates({ nowMs, days: 2, startHour: 9, endHour: 10, timezone: SP, minLeadMinutes: 0 });
  assert.equal(sp[0], '2026-10-20T09:00:00-03:00'); // as 9h de segunda já passaram: o primeiro é terça
});

test('pickFreeSlots continua funcionando com ISO de qualquer fuso', () => {
  const candidates = buildSlotCandidates({
    nowMs: Date.parse('2026-10-20T07:00:00Z'), days: 1, startHour: 9, endHour: 18, timezone: LIS, minLeadMinutes: 0,
  });
  const free = pickFreeSlots(candidates, [], { max: 6 });
  assert.equal(free.length, 2); // no máximo 2 por dia, com 3h entre eles
  assert.ok(free.every((s) => s.endsWith('+01:00')));
});
