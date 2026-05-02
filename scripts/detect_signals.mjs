#!/usr/bin/env node
// Refreshes signal data on every lead. Sets lead.priority (0-3) and lead.signals.
// Triggered weekly by .github/workflows/signals-refresh.yml.
//
// Env: APOLLO_API_KEY
// Reads:  data/leads.json
// Writes: data/leads.json (in place)

import { loadJSON, saveJSON, env } from './lib/io.mjs';

const ENRICH = 'https://api.apollo.io/v1/organizations/enrich';
const JOBS = 'https://api.apollo.io/v1/mixed_companies/job_postings';

async function fetchOrg(domain) {
  const apiKey = env('APOLLO_API_KEY');
  const url = `${ENRICH}?api_key=${apiKey}&domain=${encodeURIComponent(domain)}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  return j.organization || null;
}

async function fetchJobs(orgId) {
  const apiKey = env('APOLLO_API_KEY');
  const r = await fetch(JOBS, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({ organization_ids: [orgId] }),
  });
  if (!r.ok) return [];
  const j = await r.json();
  return j.job_postings || [];
}

function priorityFromSignals(signals) {
  let p = 0;
  if (signals.funding) p++;
  if (signals.leadership_change) p++;
  if (signals.rebrand) p++;
  if (signals.season_launch) p++;
  if (signals.category_expansion) p++;
  if (signals.job_postings) p++;
  return Math.min(3, p);
}

function detectFromOrg(org) {
  const out = {};
  if (org.last_funding_round_date) {
    const d = new Date(org.last_funding_round_date);
    if (Date.now() - d.getTime() < 1000 * 60 * 60 * 24 * 270) {
      out.funding = `${org.last_funding_round_type || 'round'} ${org.last_funding_round_date.slice(0,7)}`;
    }
  }
  if (org.estimated_num_employees && org.previous_estimated_num_employees) {
    const growth = org.estimated_num_employees - org.previous_estimated_num_employees;
    if (growth > 5) out.team_growth = `+${growth}`;
  }
  return out;
}

function detectFromJobs(jobs) {
  const designy = jobs.filter(j => /design|brand|merchandis|creative|art direct/i.test(j.title || ''));
  if (designy.length) {
    return { job_postings: designy.slice(0, 3).map(j => j.title).join(', ') };
  }
  return {};
}

async function main() {
  const leads = await loadJSON('leads');
  let updated = 0;
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    if (!lead.domain && !lead.apollo?.org_id) continue;

    const signals = { ...(lead.signals || {}) };
    try {
      if (lead.domain) {
        const org = await fetchOrg(lead.domain);
        if (org) Object.assign(signals, detectFromOrg(org));
        if (org?.id && !lead.apollo?.org_id) {
          lead.apollo = { ...(lead.apollo || {}), org_id: org.id };
        }
      }
      if (lead.apollo?.org_id) {
        const jobs = await fetchJobs(lead.apollo.org_id);
        if (jobs.length) Object.assign(signals, detectFromJobs(jobs));
      }
    } catch (e) {
      console.error(`signals: ${lead.id}: ${e.message}`);
    }

    const priority = priorityFromSignals(signals);
    if (JSON.stringify(signals) !== JSON.stringify(lead.signals) || priority !== lead.priority) {
      lead.signals = signals;
      lead.priority = priority;
      updated++;
    }
    if ((i + 1) % 25 === 0) {
      await saveJSON('leads', leads);
      console.log(`progress ${i + 1}/${leads.length} (${updated} updated)`);
    }
    await new Promise(r => setTimeout(r, 250)); // gentle pacing
  }
  await saveJSON('leads', leads);
  console.log(`Done. ${updated}/${leads.length} leads updated.`);
}

main().catch(e => { console.error(e); process.exit(1); });
