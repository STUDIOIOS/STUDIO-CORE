#!/usr/bin/env node
// Sends the daily Pushover notification with today's lead list.
// Triggered by .github/workflows/morning-push.yml on cron.
// Env: PUSHOVER_USER_KEY, PUSHOVER_APP_TOKEN
// Optional: TARGET_DATE=YYYY-MM-DD to override (default: today UTC)

import { loadJSON, env } from './lib/io.mjs';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const config = await loadJSON('config');
  const leads = await loadJSON('leads');
  const schedule = await loadJSON('schedule');
  const date = process.env.TARGET_DATE || todayISO();

  const items = (schedule[date] || [])
    .map(s => ({ ...s, lead: leads.find(l => l.id === s.lead_id) }))
    .filter(s => s.lead)
    .sort((a, b) => (b.lead.priority ?? 0) - (a.lead.priority ?? 0));

  if (items.length === 0) {
    console.log(`Nothing scheduled for ${date}. Skipping push.`);
    return;
  }

  const tierCount = items.reduce((a, x) => (a[x.lead.tier] = (a[x.lead.tier] || 0) + 1, a), {});
  const tierSummary = Object.entries(tierCount).map(([t, n]) => `${n} ${t}`).join(', ');
  const title = `${items.length} ${items.length === 1 ? 'lead' : 'leads'} today — ${tierSummary}`;

  const lines = items.slice(0, 8).map(i => {
    const sig = i.lead.signal_phrase ? ` · ${shortSignal(i.lead)}` : '';
    return `${i.lead.company} (${i.lead.tier}${sig})`;
  });
  if (items.length > 8) lines.push(`+${items.length - 8} more`);
  const message = lines.join('\n');

  const url = `${(config.push?.deep_link_base || '').replace(/\/$/, '')}/index.html?d=${date}`;

  const body = new URLSearchParams({
    token: env('PUSHOVER_APP_TOKEN'),
    user: env('PUSHOVER_USER_KEY'),
    title,
    message,
    url,
    url_title: 'Open Studio IOS CRM',
    priority: '0',
    sound: 'cosmic',
  });

  const r = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const json = await r.json();
  if (!r.ok || json.status !== 1) {
    console.error('Pushover failed:', json);
    process.exit(1);
  }
  console.log(`Pushed ${items.length} leads for ${date}.`);
}

function shortSignal(lead) {
  const s = lead.signals || {};
  if (s.funding) return 'funded';
  if (s.leadership_change) return 'new lead';
  if (s.rebrand) return 'rebrand';
  if (s.season_launch) return 'season';
  if (s.category_expansion) return 'expanding';
  if (s.job_postings) return 'hiring';
  return 'signal';
}

main().catch(e => { console.error(e); process.exit(1); });
