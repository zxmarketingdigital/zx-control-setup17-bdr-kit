import { config } from './config.js';

function nowInTZ() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour'), minute: get('minute'), second: get('second'),
    // 0=Sun, 1=Mon … 6=Sat — computed by reconstructing a local midnight
    weekday: new Date(get('year'), get('month') - 1, get('day')).getDay(),
  };
}

export function isWorkingDay(dt = nowInTZ()) {
  return config.workingDays.includes(dt.weekday);
}

export function isWithinWindow(dt = nowInTZ()) {
  return dt.hour >= config.windowStartHour && dt.hour < config.windowEndHour;
}

export function isOpenForBusiness() {
  const dt = nowInTZ();
  return isWorkingDay(dt) && isWithinWindow(dt);
}

export function addWorkingDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let current = new Date(y, m - 1, d);
  let added = 0;
  while (added < days) {
    current.setDate(current.getDate() + 1);
    const wd = current.getDay();
    if (config.workingDays.includes(wd)) added++;
  }
  return current.toISOString().slice(0, 10);
}

export function todayStr() {
  const dt = nowInTZ();
  return `${dt.year}-${String(dt.month).padStart(2, '0')}-${String(dt.day).padStart(2, '0')}`;
}

export function msUntilWindowOpens() {
  const now = new Date();
  const dt = nowInTZ();

  if (!isWorkingDay(dt)) {
    // sleep until next working-day open
    let next = new Date(dt.year, dt.month - 1, dt.day + 1);
    while (!config.workingDays.includes(next.getDay())) {
      next.setDate(next.getDate() + 1);
    }
    next.setHours(0, 0, 0, 0);
    // crude: add offset to reach WINDOW_START_HOUR in target TZ — 60s poll is fine
    return 60_000;
  }

  if (dt.hour < config.windowStartHour) {
    const secondsUntil = (config.windowStartHour - dt.hour) * 3600 - dt.minute * 60 - dt.second;
    return secondsUntil * 1000;
  }

  // after window — sleep 60s and recheck (next day logic handled above on recheck)
  return 60_000;
}
