#!/usr/bin/env node
// Sources leads from Apollo's REST API per tier and merges into data/leads.json.
//
// Note: the initial 500-lead bootstrap was sourced via Apollo's MCP server during
// the first build. This script exists for top-ups, replacements, and weekly re-sourcing
// once an Apollo API key is in place.
//
// Env: APOLLO_API_KEY
// Args:
//   --tier=T1|T2|T3      (which tier to source — required)
//   --target=N           (how many leads to add for this tier; default uses config)
//   --pages=N            (max pages to walk; default 5)
//   --dry                (print without writing)
//
// Reads:  data/leads.json, data/config.json
// Writes: data/leads.json (appends new leads, dedupes by email)

import { loadJSON, saveJSON, env } from './lib/io.mjs';

const APOLLO = 'https://api.apollo.io/v1/mixed_people/search';

const TIER_FILTERS = {
  T1: {
    person_titles: [
      'Licensing Director', 'VP Licensing', 'Director of Consumer Products',
      'VP Merchandise', 'Head of Brand Partnerships', 'Chief Marketing Officer',
      'Director of Brand Strategy', 'Head of Licensed Products',
    ],
    organization_keywords: [
      'combat sports', 'MMA', 'boxing', 'jiu jitsu', 'wrestling',
      'motorsport', 'F1', 'esports', 'character licensing',
      'brand management', 'sports agency', 'IP licensing',
    ],
    organization_num_employees_ranges: ['101,500', '501,1000', '1001,5000', '5001,10000', '10001'],
  },
  T2: {
    person_titles: [
      'Founder', 'CEO', 'Creative Director', 'Head of Design',
      'Brand Manager', 'Head of Product', 'Marketing Director',
    ],
    organization_keywords: [
      'BJJ', 'jiu jitsu', 'no-gi', 'MMA', 'combat sports', 'grappling',
      'motorsport lifestyle', 'action sports', 'performance apparel',
      'gym apparel', 'fight wear',
    ],
    organization_num_employees_ranges: ['5,10', '11,20', '21,50'],
  },
  T3: {
    person_titles: ['Founder', 'Owner', 'Director'],
    organization_keywords: [
      'BJJ academy', 'jiu jitsu academy', 'fight gym', 'combat sports brand',
      'athlete brand', 'rashguard', 'kimono', 'no-gi apparel',
    ],
    organization_num_employees_ranges: ['1,10'],
  },
};

function parseArgs() {
  const a = { tier: null, target: null, pages: 5, dry: false };
  for (const x of process.argv.slice(2)) {
    if (x.startsWith('--tier=')) a.tier = x.slice(7);
    else if (x.startsWith('--target=')) a.target = parseInt(x.slice(9), 10);
    else if (x.startsWith('--pages=')) a.pages = parseInt(x.slice(8), 10);
    else if (x === '--dry') a.dry = true;
  }
  if (!a.tier) {
    console.error('Required: --tier=T1|T2|T3');
    process.exit(1);
  }
  return a;
}

async function searchPage(filters, page) {
  const apiKey = env('APOLLO_API_KEY');
  const r = await fetch(APOLLO, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({
      ...filters,
      page,
      per_page: 100,
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Apollo ${r.status}: ${text}`);
  }
  return r.json();
}

function normalize(person, tier) {
  const org = person.organization || {};
  return {
    id: `apollo:${person.id}`,
    first_name: person.first_name || '',
    last_name: person.last_name || '',
    email: person.email || '',
    title: person.title || '',
    company: org.name || '',
    domain: org.primary_domain || org.website_url || '',
    linkedin: person.linkedin_url || '',
    tier,
    priority: 0,
    signals: {},
    custom_hook: '',
    signal_phrase: '',
    apollo: {
      org_id: org.id || null,
      employees: org.estimated_num_employees || null,
      industry: org.industry || null,
    },
  };
}

async function main() {
  const args = parseArgs();
  const config = await loadJSON('config');
  const leads = await loadJSON('leads');
  const target = args.target ?? config.tier_targets[args.tier];
  const filters = TIER_FILTERS[args.tier];
  if (!filters) { console.error(`Unknown tier ${args.tier}`); process.exit(1); }

  const seenEmails = new Set(leads.filter(l => l.email).map(l => l.email.toLowerCase()));
  const seenIds = new Set(leads.map(l => l.id));

  const fresh = [];
  for (let page = 1; page <= args.pages && fresh.length < target; page++) {
    console.log(`${args.tier} page ${page}…`);
    const data = await searchPage(filters, page);
    const people = data.people || data.contacts || [];
    if (!people.length) { console.log('  no more results.'); break; }
    for (const p of people) {
      const n = normalize(p, args.tier);
      if (!n.email && !n.linkedin) continue;
      if (n.email && seenEmails.has(n.email.toLowerCase())) continue;
      if (seenIds.has(n.id)) continue;
      fresh.push(n);
      if (n.email) seenEmails.add(n.email.toLowerCase());
      seenIds.add(n.id);
      if (fresh.length >= target) break;
    }
    // gentle pacing
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`${args.tier}: sourced ${fresh.length} new leads (target ${target}).`);
  if (args.dry) {
    console.log(JSON.stringify(fresh.slice(0, 3), null, 2));
    return;
  }
  leads.push(...fresh);
  await saveJSON('leads', leads);
  console.log(`leads.json now has ${leads.length} leads total.`);
}

main().catch(e => { console.error(e); process.exit(1); });
