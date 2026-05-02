#!/usr/bin/env node
// Appends a single send event to data/activity.json.
// Triggered by .github/workflows/log-activity.yml on repo_dispatch.
// Reads the event payload from $EVENT_PAYLOAD (JSON string).

import { loadJSON, saveJSON } from './lib/io.mjs';

function valid(e) {
  return e && typeof e.lead_id === 'string'
    && typeof e.step === 'number'
    && typeof e.sent_at === 'string';
}

async function main() {
  const raw = process.env.EVENT_PAYLOAD;
  if (!raw) throw new Error('EVENT_PAYLOAD env not set');
  const event = JSON.parse(raw);
  if (!valid(event)) throw new Error(`Invalid event: ${raw}`);

  const activity = await loadJSON('activity');
  const events = activity.events || [];

  // dedupe by (lead_id, step) — keep the earliest sent_at
  const key = `${event.lead_id}::${event.step}`;
  const existingIdx = events.findIndex(e => `${e.lead_id}::${e.step}` === key);
  if (existingIdx >= 0) {
    if (event.sent_at < events[existingIdx].sent_at) events[existingIdx] = event;
    console.log(`Event already logged for ${key}; kept earliest.`);
  } else {
    events.push(event);
    console.log(`Logged ${key} at ${event.sent_at}.`);
  }
  events.sort((a, b) => a.sent_at.localeCompare(b.sent_at));

  await saveJSON('activity', { events });
}

main().catch(e => { console.error(e); process.exit(1); });
