#!/usr/bin/env node
// Generates a 1-2 sentence bespoke opener for each lead via Anthropic API.
// Uses prompt caching on a tier-specific system prompt to cut cost across
// the full 500-lead set.
//
// Env: ANTHROPIC_API_KEY
// Args: --only=ID    (regenerate just one lead)
//       --force      (overwrite existing custom_hook)
//       --tier=T1|T2|T3   (only this tier)
//
// Reads:  data/leads.json, data/config.json
// Writes: data/leads.json (in place, with custom_hook + signal_phrase set)

import { loadJSON, saveJSON, env } from './lib/io.mjs';

const MODEL = 'claude-sonnet-4-6';
const API = 'https://api.anthropic.com/v1/messages';

const TIER_SYSTEM = {
  T1: `You write opening lines for cold outreach to senior executives at sports/entertainment licensing organisations (combat sports promotions, motorsport, IMG, Endeavour, Fanatics, ABG, character licensing).

The sender is Tom Hidderley, founder of Studio IOS — a Bristol creative direction studio specialising in apparel direction, graphic language, trend intelligence and style-guide capability for licensed product programmes. Existing credibility includes FUJI Sports and Phalanx in the combat-sports apparel space.

Tier 1 readers are Licensing Directors, VPs of Licensing, Heads of Brand Partnerships, CMOs. They are protective of brand standards, cautious about new suppliers, and won't engage with anything that smells like a templated cold email.

Your job: write ONE opening sentence (max two) that demonstrates you've done specific homework on THIS person or THIS company. Reference one concrete fact: a recent league announcement, a leadership change, a category expansion, a partnership, an upcoming season, a recent rebrand. Senior, restrained tone — no enthusiasm, no exclamation marks, no compliment-fishing. Drop the line into a 100-word email; it must read like the start of a sector colleague's note, not a sales opener. Output only the line itself, nothing else.`,

  T2: `You write opening lines for cold outreach to founders and creative leads at growth-stage DTC apparel/lifestyle brands in combat sports, action sports, fitness and performance categories (£1M-£10M revenue).

The sender is Tom Hidderley, founder of Studio IOS — Bristol creative direction studio. Proof points are FUJI Sports (17% YoY uplift) and Phalanx (preorder revenue covered inventory + studio fees before launch).

Tier 2 readers are Founders/CEOs (often the same person), Creative Directors, Heads of Product. They are direct, evidence-driven, allergic to fluff, and decide fast. They want someone who clearly understands their world.

Your job: write ONE opening sentence (max two) that proves you've looked at THEIR brand specifically. Reference one concrete observation about their product, recent collection, brand identity, audience, signature graphic, or a specific competitor positioning. Founder-to-founder tone, casual but precise. No "I came across your brand" generic openers. The line must feel like it could only have been written for this brand. Output only the line itself, nothing else.`,

  T3: `You write opening lines for cold outreach to founders of emerging combat-sports / BJJ / niche athletic brands (under £500K revenue, often a single founder, accessible via DM).

The sender is Tom Hidderley, founder of Studio IOS — Bristol creative direction studio. Worked with FUJI, Phalanx and brands the BJJ community knows.

Tier 3 readers are athletes, coaches, single-founder brand operators. They live in the community, decide instantly, and respond to people who clearly know the culture.

Your job: write ONE opening sentence (max two) that demonstrates community awareness — reference their academy, an event they ran, a hero product, a competition result, a collab, or something specific they posted. Personal, low-key, Instagram-DM tone. NEVER use "I came across", "I noticed your brand", or any generic opener. It must feel like a peer in the community talking. Output only the line itself, nothing else.`,
};

function buildUserMessage(lead) {
  const lines = [
    `LEAD CONTEXT:`,
    `Name: ${lead.first_name} ${lead.last_name || ''}`,
    `Title: ${lead.title || 'unknown'}`,
    `Company: ${lead.company}`,
    lead.domain ? `Domain: ${lead.domain}` : null,
    lead.linkedin ? `LinkedIn: ${lead.linkedin}` : null,
    `Tier: ${lead.tier}`,
  ].filter(Boolean);

  if (lead.signals && Object.values(lead.signals).some(Boolean)) {
    lines.push('Signals:');
    for (const [k, v] of Object.entries(lead.signals)) {
      if (v) lines.push(`  - ${k}: ${typeof v === 'string' ? v : 'yes'}`);
    }
  }
  if (lead.notes) lines.push(`Notes: ${lead.notes}`);
  return lines.join('\n');
}

async function callClaude(lead) {
  const apiKey = env('ANTHROPIC_API_KEY');
  const system = [{
    type: 'text',
    text: TIER_SYSTEM[lead.tier] || TIER_SYSTEM.T2,
    cache_control: { type: 'ephemeral' },
  }];
  const r = await fetch(API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      system,
      messages: [{ role: 'user', content: buildUserMessage(lead) }],
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Anthropic ${r.status}: ${text}`);
  }
  const j = await r.json();
  const text = (j.content || []).map(c => c.text).join('').trim();
  return text;
}

function deriveSignalPhrase(lead) {
  const s = lead.signals || {};
  if (s.funding && typeof s.funding === 'string') return `your recent ${s.funding}`;
  if (s.funding) return `your recent funding round`;
  if (s.leadership_change && typeof s.leadership_change === 'string') return `${s.leadership_change}`;
  if (s.leadership_change) return `the recent leadership change`;
  if (s.rebrand) return `the rebrand`;
  if (s.season_launch) return `the upcoming season launch`;
  if (s.category_expansion && typeof s.category_expansion === 'string') return `the move into ${s.category_expansion}`;
  if (s.category_expansion) return `the new category push`;
  if (s.job_postings) return `the design hiring`;
  return '';
}

function parseArgs(argv) {
  const a = { only: null, force: false, tier: null };
  for (const x of argv.slice(2)) {
    if (x === '--force') a.force = true;
    else if (x.startsWith('--only=')) a.only = x.slice(7);
    else if (x.startsWith('--tier=')) a.tier = x.slice(7);
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv);
  const leads = await loadJSON('leads');
  let n = 0, skipped = 0, failed = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    if (args.only && lead.id !== args.only) continue;
    if (args.tier && lead.tier !== args.tier) continue;
    if (lead.custom_hook && !args.force) { skipped++; continue; }

    try {
      const hook = await callClaude(lead);
      lead.custom_hook = hook;
      if (!lead.signal_phrase) lead.signal_phrase = deriveSignalPhrase(lead);
      n++;
      if (n % 10 === 0) {
        await saveJSON('leads', leads);
        console.log(`[${n}] saved progress (${i + 1}/${leads.length})`);
      }
    } catch (e) {
      failed++;
      console.error(`Hook failed for ${lead.id}: ${e.message}`);
      // brief backoff on rate-limit style errors
      if (/429|rate|overload/i.test(e.message)) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
  await saveJSON('leads', leads);
  console.log(`Done. Generated ${n}, skipped ${skipped}, failed ${failed}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
