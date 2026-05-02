// Business-day helpers for the schedule builder.

export function toISO(d) {
  return d.toISOString().slice(0, 10);
}

export function fromISO(iso) {
  return new Date(iso + 'T00:00:00Z');
}

export function isWeekend(d) {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

export function isBusinessDay(iso, holidays = []) {
  const d = fromISO(iso);
  return !isWeekend(d) && !holidays.includes(iso);
}

export function addBusinessDays(startISO, n, holidays = []) {
  if (n <= 0) {
    // even step 0 must land on a business day
    let d = fromISO(startISO);
    while (isWeekend(d) || holidays.includes(toISO(d))) {
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return toISO(d);
  }
  let d = fromISO(startISO);
  // first ensure start is a business day
  while (isWeekend(d) || holidays.includes(toISO(d))) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!isWeekend(d) && !holidays.includes(toISO(d))) added++;
  }
  return toISO(d);
}

export function nextBusinessDay(iso, holidays = []) {
  let d = fromISO(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  while (isWeekend(d) || holidays.includes(toISO(d))) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return toISO(d);
}
