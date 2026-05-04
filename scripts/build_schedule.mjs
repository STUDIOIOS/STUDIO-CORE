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

// Group leads by company so multi-contact accounts (Scramble's Matt+Ben,
// Tatami's Gareth+Lee, etc.) get hit on the same day or consecutive days.
// Returns an array of company-groups, each ordered by lead priority within.
function groupByCompany(leads) {
  const groups = new Map();
  for (const l of leads) {
    const key = (l.company || 'unknown').trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  return [...groups.values()];
}

// Sort group internally (priority desc), then sort the array of groups by
// max-priority within group, then T2 first (engine tier), T3, T1.
function orderGroups(groups) {
  groups.forEach(g => g.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)));
  const tierOrder = { T2: 0, T3: 1, T1: 2 };
  return groups.sort((a, b) => {
    const aMax = Math.max(...a.map(l => l.priority ?? 0));
    const bMax = Math.max(...b.map(l => l.priority ?? 0));
    if (bMax !== aMax) return bMax - aMax;
    return (tierOrder[a[0].tier] ?? 0) - (tierOrder[b[0].tier] ?? 0);
  });
}

export function buildSchedule(leads, config) {
  const holidays = holidaysFromConfig(config);
  const start = config.campaign_start_date;
  const minPerDay = config.daily_target_min ?? 5;
  const maxPerDay = config.daily_target_max ?? 10;

  const leadsById = Object.fromEntries(leads.map(l => [l.id, l]));
  const groups = orderGroups(groupByCompany(leads));

  const schedule = {};
  function add(date, item) {
    (schedule[date] ??= []).push(item);
  }
  function firstTouchCountOn(date) {
    return (schedule[date] || []).filter(s => s.step === 1).length;
  }
  function placeLead(lead, dayIso) {
    const cadence = config.cadence_business_days[lead.tier] || [0, 3, 7, 12, 18];
    cadence.forEach((offset, i) => {
      const stepDate = addBusinessDays(dayIso, offset, holidays);
      add(stepDate, { lead_id: lead.id, step: i + 1, tier: lead.tier });
    });
  }

  let cursor = isBusinessDay(start, holidays) ? start : nextBusinessDay(start, holidays);

  for (const group of groups) {
    let placed = 0;
    while (placed < group.length) {
      // advance if the current day is full
      while (firstTouchCountOn(cursor) >= maxPerDay) {
        cursor = nextBusinessDay(cursor, holidays);
      }
      const room = maxPerDay - firstTouchCountOn(cursor);
      const fitting = Math.min(room, group.length - placed);
      for (let i = 0; i < fitting; i++) {
        placeLead(group[placed + i], cursor);
      }
      placed += fitting;
      // if the group spilled over, push the remainder onto the next business day
      if (placed < group.length) {
        cursor = nextBusinessDay(cursor, holidays);
      }
    }
    // If we hit the daily floor, advance; otherwise let the next group share the day.
    if (firstTouchCountOn(cursor) >= minPerDay) {
      cursor = nextBusinessDay(cursor, holidays);
    }
  }

  // Per-day sort: tier order (T2, T3, T1), then company (keeps multi-contact
  // accounts visually grouped in the day's list), then step.
  for (const k of Object.keys(schedule)) {
    schedule[k].sort((a, b) => {
      const aLead = leadsById[a.lead_id];
      const bLead = leadsById[b.lead_id];
      const tierOrder = { T2: 0, T3: 1, T1: 2 };
      return (tierOrder[a.tier] ?? 0) - (tierOrder[b.tier] ?? 0)
        || (aLead?.company || '').localeCompare(bLead?.company || '')
        || a.step - b.step;
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
