#!/usr/bin/env node
// Spreads each lead's 5-email sequence across UK business days.
// Targets 5-10 first-touches/day with follow-ups stacked on top.
// Reads:  data/leads.json, data/config.json
// Writes: data/schedule.json

import { loadJSON, saveJSON } from './lib/io.mjs';
import { addBusinessDays, isBusinessDay, nextBusinessDay, toISO, fromISO } from './lib/dates.mjs';

function holidaysFromConfig(config) {
  return [
    ...(config.uk_bank_holidays_2026 || []),
    ...(config.uk_bank_holidays_2027 || []),
  ];
}

// Sort leads so the daily mix has variety: round-robin priority then tier.
function orderForFirstTouch(leads) {
  const buckets = { 3: [], 2: [], 1: [], 0: [] };
  for (const l of leads) {
    const p = l.priority ?? 0;
    buckets[p].push(l);
  }
  // Within each priority, round-robin tiers so each day has a healthy mix.
  const out = [];
  for (const p of [3, 2, 1, 0]) {
    const byTier = { T1: [], T2: [], T3: [] };
    for (const l of buckets[p]) (byTier[l.tier] ?? byTier.T2).push(l);
    let pushed = true;
    while (pushed) {
      pushed = false;
      for (const t of ['T2', 'T3', 'T1']) { // T2 first since it's the engine
        if (byTier[t].length) {
          out.push(byTier[t].shift());
          pushed = true;
        }
      }
    }
  }
  return out;
}

export function buildSchedule(leads, config) {
  const holidays = holidaysFromConfig(config);
  const start = config.campaign_start_date;
  const minPerDay = config.daily_target_min ?? 5;
  const maxPerDay = config.daily_target_max ?? 10;

  const ordered = orderForFirstTouch(leads);

  const schedule = {};
  function add(date, item) {
    (schedule[date] ??= []).push(item);
  }
  function firstTouchCountOn(date) {
    return (schedule[date] || []).filter(s => s.step === 1).length;
  }

  let cursor = isBusinessDay(start, holidays) ? start : nextBusinessDay(start, holidays);

  for (const lead of ordered) {
    // advance cursor while today's first-touch count is at max
    while (firstTouchCountOn(cursor) >= maxPerDay) {
      cursor = nextBusinessDay(cursor, holidays);
    }
    const cadence = config.cadence_business_days[lead.tier] || [0, 3, 7, 12, 18];
    cadence.forEach((offset, i) => {
      const stepDate = addBusinessDays(cursor, offset, holidays);
      add(stepDate, { lead_id: lead.id, step: i + 1, tier: lead.tier });
    });
    if (firstTouchCountOn(cursor) >= minPerDay) {
      cursor = nextBusinessDay(cursor, holidays);
    }
  }

  // sort each day's items by tier priority (T1 last for relationship pacing)
  for (const k of Object.keys(schedule)) {
    schedule[k].sort((a, b) => {
      const order = { T2: 0, T3: 1, T1: 2 };
      return (order[a.tier] ?? 0) - (order[b.tier] ?? 0) || a.step - b.step;
    });
  }

  return schedule;
}

async function main() {
  const config = await loadJSON('config');
  const leads = await loadJSON('leads');
  if (!leads.length) {
    console.warn('leads.json is empty — schedule will be empty.');
  }
  const schedule = buildSchedule(leads, config);
  await saveJSON('schedule', schedule);
  const dates = Object.keys(schedule).sort();
  const totalTouches = Object.values(schedule).reduce((a, x) => a + x.length, 0);
  console.log(`schedule.json: ${dates.length} weekdays, ${totalTouches} touches total.`);
  if (dates.length) {
    console.log(`  first day: ${dates[0]}  (${schedule[dates[0]].length} touches)`);
    console.log(`  last day:  ${dates.at(-1)}  (${schedule[dates.at(-1)].length} touches)`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
