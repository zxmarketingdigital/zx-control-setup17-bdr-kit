import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTimezone, isValidTimezone, localToDate, toIso, ymdInTz, weekdayInTz, parseScheduledAt, zonedParts,
} from '../src/tz.js';
import { validateBooking } from '../src/auto-responder.js';

const LIS = 'Europe/Lisbon';
const SP = 'America/Sao_Paulo';

test('10h local vira o instante certo em cada fuso (com horário de verão)', () => {
  // Lisboa: verão (WEST, +01:00) até 25/10/2026; depois inverno (WET, +00:00)
  assert.equal(localToDate('2026-10-20', '10:00', LIS).toISOString(), '2026-10-20T09:00:00.000Z');
  assert.equal(localToDate('2026-10-25', '10:00', LIS).toISOString(), '2026-10-25T10:00:00.000Z'); // dia da virada
  assert.equal(localToDate('2026-12-10', '10:00', LIS).toISOString(), '2026-12-10T10:00:00.000Z');
  // São Paulo: UTC-3 o ano todo
  assert.equal(localToDate('2026-10-20', '10:00', SP).toISOString(), '2026-10-20T13:00:00.000Z');
  assert.equal(localToDate('2026-01-15', '10:00', SP).toISOString(), '2026-01-15T13:00:00.000Z');
});

test('toIso escreve o deslocamento do fuso naquela data', () => {
  assert.equal(toIso(new Date('2026-10-20T09:00:00Z'), LIS), '2026-10-20T10:00:00+01:00');
  assert.equal(toIso(new Date('2026-12-10T09:00:00Z'), LIS), '2026-12-10T09:00:00+00:00');
  assert.equal(toIso(new Date('2026-10-20T09:00:00Z'), SP), '2026-10-20T06:00:00-03:00');
  assert.equal(toIso(new Date('2026-06-01T12:00:00Z'), 'Asia/Kolkata'), '2026-06-01T17:30:00+05:30');
});

test('ida e volta: localToDate e toIso concordam', () => {
  for (const tz of [LIS, SP, 'America/New_York', 'Asia/Kolkata', 'Pacific/Auckland']) {
    for (const [ymd, hm] of [['2026-03-10', '09:00'], ['2026-07-04', '17:30'], ['2026-11-30', '00:00']]) {
      const d = localToDate(ymd, hm, tz);
      assert.equal(toIso(d, tz).slice(0, 16), `${ymd}T${hm}`, `${tz} ${ymd} ${hm}`);
    }
  }
});

test('dia e dia da semana dependem do fuso', () => {
  const d = new Date('2026-10-19T23:30:00Z'); // segunda 23h30 UTC
  assert.equal(ymdInTz(d, LIS), '2026-10-20'); // 00h30 de terça em Lisboa
  assert.equal(weekdayInTz(d, LIS), 2);
  assert.equal(ymdInTz(d, SP), '2026-10-19'); // 20h30 de segunda em São Paulo
  assert.equal(weekdayInTz(d, SP), 1);
  assert.equal(zonedParts(d, LIS).hour, 0);
});

test('parseScheduledAt: horário solto vale no fuso configurado; com deslocamento vale o dele', () => {
  assert.equal(parseScheduledAt('2026-10-20T10:00', LIS).toISOString(), '2026-10-20T09:00:00.000Z');
  assert.equal(parseScheduledAt('2026-10-20T10:00:00', LIS).toISOString(), '2026-10-20T09:00:00.000Z');
  assert.equal(parseScheduledAt('2026-10-20T10:00:00', SP).toISOString(), '2026-10-20T13:00:00.000Z');
  assert.equal(parseScheduledAt('2026-10-20T10:00:00-03:00', LIS).toISOString(), '2026-10-20T13:00:00.000Z');
  assert.equal(parseScheduledAt('2026-10-20T09:00:00Z', LIS).toISOString(), '2026-10-20T09:00:00.000Z');
  assert.equal(parseScheduledAt('lixo', LIS), null);
  assert.equal(parseScheduledAt('', LIS), null);
});

test('TIMEZONE inválido ou ausente cai em São Paulo', () => {
  const old = process.env.TIMEZONE;
  try {
    process.env.TIMEZONE = 'Marte/Olympus';
    assert.equal(getTimezone(), SP);
    delete process.env.TIMEZONE;
    assert.equal(getTimezone(), SP);
    process.env.TIMEZONE = LIS;
    assert.equal(getTimezone(), LIS);
  } finally {
    if (old === undefined) delete process.env.TIMEZONE; else process.env.TIMEZONE = old;
  }
  assert.equal(isValidTimezone('Europe/Lisbon'), true);
  assert.equal(isValidTimezone('Lisboa'), false);
});

test('modo automático valida o horário no fuso do aluno (TIMEZONE=Europe/Lisbon)', () => {
  const old = process.env.TIMEZONE;
  process.env.TIMEZONE = LIS;
  try {
    // 2030-10-15 é terça-feira em qualquer fuso
    assert.equal(validateBooking({ date: '2030-10-15', time: '10:00', duration_minutes: 30 }, [9, 18]), null);
    assert.match(validateBooking({ date: '2030-10-19', time: '10:00' }, [9, 18]), /fim de semana/); // sábado
    assert.match(validateBooking({ date: '2030-10-15', time: '17:45', duration_minutes: 30 }, [9, 18]), /fora do horário/);
    assert.match(validateBooking({ date: '2030-10-15', time: '08:00' }, [9, 18]), /fora do horário/);
  } finally {
    if (old === undefined) delete process.env.TIMEZONE; else process.env.TIMEZONE = old;
  }
});
