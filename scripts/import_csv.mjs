#!/usr/bin/env node
// Import leads from a CSV file. Works with any source — LinkedIn Sales Navigator
// export, Hunter, ZoomInfo, manual research spreadsheet, etc.
//
// Usage:
//   node scripts/import_csv.mjs path/to/file.csv --tier=T2
//
// CSV columns recognised (any superset is fine; case-insensitive):
//   first_name, last_name, email, title, company, domain, linkedin
//   priority (0-3), funding, leadership_change, rebrand, season_launch,
//   category_expansion, job_postings, notes
//
// All other columns are dropped. Existing leads (matched by email)
// are merged, not overwritten.

import { loadJSON, saveJSON } from './lib/io.mjs';
import { readFile } from 'node:fs/promises';

function parseCSV(text) {
  // Minimal RFC-4180 parser (handles quoted fields with commas + escaped quotes).
  const rows = [];
  let row = [], cell = '', i = 0, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (c === '"') { inQ = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(cell); cell = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += c; i++;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

function slug(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function parseArgs() {
  const a = { csv: null, tier: 'T2', force: false };
  for (const x of process.argv.slice(2)) {
    if (x.startsWith('--tier=')) a.tier = x.slice(7);
    else if (x === '--force') a.force = true;
    else if (!a.csv && !x.startsWith('--')) a.csv = x;
  }
  if (!a.csv) {
    console.error('Usage: node scripts/import_csv.mjs path/to/file.csv [--tier=T2] [--force]');
    process.exit(1);
  }
  if (!['T1', 'T2', 'T3'].includes(a.tier)) {
    console.error('--tier must be T1, T2, or T3');
    process.exit(1);
  }
  return a;
}

async function main() {
  const args = parseArgs();
  const csv = await readFile(args.csv, 'utf8');
  const rows = parseCSV(csv);
  if (rows.length < 2) { console.error('CSV has no data rows'); process.exit(1); }

  const headers = rows[0].map(h => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'));
  const data = rows.slice(1).map(r => Object.fromEntries(r.map((v, i) => [headers[i], v.trim()])));

  const leads = await loadJSON('leads');
  const byEmail = new Map(leads.filter(l => l.email).map(l => [l.email.toLowerCase(), l]));
  const seenIds = new Set(leads.map(l => l.id));

  let added = 0, merged = 0, skipped = 0;

  for (const r of data) {
    const email = (r.email || '').toLowerCase().trim();
    const company = r.company || r.organization || r.organisation || '';
    const first = r.first_name || r.firstname || '';
    const last = r.last_name || r.lastname || r.surname || '';
    if (!company || (!first && !email)) { skipped++; continue; }

    const signals = {};
    for (const k of ['funding', 'leadership_change', 'rebrand', 'season_launch', 'category_expansion', 'job_postings']) {
      if (r[k]) signals[k] = r[k] === 'true' || r[k] === '1' ? true : r[k];
    }

    const baseId = `csv:${args.tier.toLowerCase()}:${slug(company)}-${slug(first || email.split('@')[0] || 'lead')}`;
    let id = baseId, n = 2;
    while (seenIds.has(id)) id = `${baseId}-${n++}`;

    const incoming = {
      id,
      first_name: first,
      last_name: last,
      email: r.email || '',
      title: r.title || r.role || '',
      company,
      domain: r.domain || (r.email ? r.email.split('@')[1] : '') || '',
      linkedin: r.linkedin || r.linkedin_url || '',
      tier: args.tier,
      priority: r.priority ? parseInt(r.priority, 10) : 0,
      signals,
      custom_hook: r.custom_hook || '',
      signal_phrase: r.signal_phrase || '',
      notes: r.notes || '',
    };

    if (email && byEmail.has(email)) {
      const existing = byEmail.get(email);
      if (!args.force) {
        // merge: only fill empty fields, preserve hand-written hooks
        for (const k of Object.keys(incoming)) {
          if ((existing[k] == null || existing[k] === '') && incoming[k] !== '') {
            existing[k] = incoming[k];
          }
        }
        existing.signals = { ...incoming.signals, ...(existing.signals || {}) };
        merged++;
      } else {
        Object.assign(existing, incoming, { id: existing.id });
        merged++;
      }
    } else {
      leads.push(incoming);
      seenIds.add(id);
      if (email) byEmail.set(email, incoming);
      added++;
    }
  }

  await saveJSON('leads', leads);
  console.log(`Imported ${args.csv}: +${added} new, ~${merged} merged, ${skipped} skipped. Total leads: ${leads.length}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
