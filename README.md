# Studio IOS — Lead Outreach System

A personal mini-CRM and outbound campaign engine for [Studio IOS](https://studioios.com).

500 hand-qualified leads across 3 ICP tiers, each with a 5-email sequence. Daily Pushover reminder lands on the iPhone every weekday morning at 07:00 UTC with the day's 5–10 leads, priority-ordered by fresh signals. Tap → static PWA mini-CRM renders the lead's tier-appropriate email body with a one-tap **Copy** button → paste into Apple Mail → Mailbutler tracks the open. Tap **Mark sent** to log the touch and watch the week's progress chart fill up.

## Architecture

- **Hosting:** GitHub Pages (static, free)
- **Notifications:** Pushover triggered by GitHub Actions cron
- **Email sending:** Manual via Apple Mail + Mailbutler — better deliverability, opens land in your existing Mailbutler dashboard
- **Lead sourcing:** Apollo HTTP API (paid plan) **or** any CSV (LinkedIn Sales Nav export, Hunter, manual research) — no Apollo dependency required
- **Per-lead bespoke hook:** Anthropic API (Sonnet 4.6 with prompt caching) — one runtime cost across the 500-lead build, then static
- **Activity logging:** GitHub `repo_dispatch` from "Mark sent" → workflow appends to `data/activity.json`

## ICP tiers

| Tier | Volume | Cadence (business days) | Tone |
|---|---|---|---|
| **T1** Licensing infrastructure | 50  | 0 / 14 / 30 / 60 / 90 | Senior, restrained, sector-specific |
| **T2** Growth-stage DTC         | 300 | 0 / 3 / 7 / 12 / 18   | Direct, founder-to-founder, evidence-led |
| **T3** Emerging founder brands  | 150 | 0 / 5 / 10 / 17 / 24  | Personal, community-credibility-led |

Volumes are deliberate: Tier 1 is explicitly NOT a volume play (the brief says they're won through warm intros, not cold email), so we use a slow credibility-first cadence on a small set. Tier 2 is the engine. Tier 3 is portfolio breadth + warm referral pathways.

## Repo layout

```
data/         JSON: config, leads, sequences, schedule, activity
web/          Static PWA — index (Today), lead, all (pipeline), settings
scripts/      Node ESM — source_leads, import_csv, detect_signals, generate_hooks, build_schedule, render_email, morning_push, log_activity
.github/workflows/   morning-push, signals-refresh, log-activity, deploy-pages
```

## Filling in the 500 leads

The repo ships with **4 demo leads** so the system is fully demonstrable end-to-end. Replace them via either path:

### Path A — Apollo (paid plan required)

Apollo's People API needs a paid plan; the free-tier MCP can't run people search. With an API key:

```bash
export APOLLO_API_KEY=xxx
node scripts/source_leads.mjs --tier=T2 --target=300
node scripts/source_leads.mjs --tier=T3 --target=150
node scripts/source_leads.mjs --tier=T1 --target=50
```

People search returns name/title/company/LinkedIn but **not emails** — Apollo's enrichment is a separate per-record cost. Use Apollo's UI to enrich in bulk once sourced, then re-import.

### Path B — CSV import (no Apollo needed)

Export leads from LinkedIn Sales Navigator, Hunter, ZoomInfo, or a manual research spreadsheet. Then:

```bash
node scripts/import_csv.mjs path/to/tier2-leads.csv --tier=T2
node scripts/import_csv.mjs path/to/tier3-leads.csv --tier=T3
```

Recognised columns (case-insensitive, any superset is fine):

```
first_name, last_name, email, title, company, domain, linkedin,
priority, funding, leadership_change, rebrand, season_launch,
category_expansion, job_postings, notes
```

Existing leads (matched by email) are merged, not overwritten — your hand-written hooks are preserved.

### After sourcing

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node scripts/generate_hooks.mjs        # one bespoke 1-2 sentence opener per lead
node scripts/build_schedule.mjs        # spread across UK business days
git commit -am "leads: sourced + hooks + schedule" && git push
```

The `deploy-pages.yml` workflow re-publishes the PWA on every push to `main`.

## First-run iPhone setup

1. Repo settings → Secrets → add:
   - `PUSHOVER_USER_KEY`, `PUSHOVER_APP_TOKEN` (get from pushover.net, $5 one-time)
   - `ANTHROPIC_API_KEY` (for hook generation; only used during build)
   - `APOLLO_API_KEY` (only if using Path A or weekly signal refresh)
2. Edit `data/config.json` → replace the three `gdrive_links.T1/T2/T3` placeholders with your portfolio links.
3. Visit the GitHub Pages URL on iPhone → Share → Add to Home Screen.
4. Open the app → Settings → paste a fine-grained GitHub PAT (repo scope on this repo only) → grants the "Mark sent" button permission to log via `repo_dispatch`. The PAT stays in iOS Keychain — never uploaded.
5. First weekday at 07:00 UTC: morning push lands. Tap. Begin.

## Daily loop

Push notification → tap → today list → tap a lead → **Copy email** → paste into Apple Mail → send → Mailbutler tracks → **Mark sent** in the CRM → progress ring advances.

## Out of scope (v1)

- Auto-sending — intentional; manual paste preserves Mail-from-you deliverability and Mailbutler open tracking.
- Inbound replies — they land in your normal Mail inbox.
- Server-side Mailbutler open mirroring — manual in v1.
- Per-lead unique G-drive links — one shared link per tier in v1.

## Local dev

```bash
npm run serve     # http://localhost:8000 — copies data/ into web/data/, then serves
npm run schedule  # rebuild data/schedule.json from leads + cadence
```

To preview on iPhone over the local network: find your machine's LAN IP (e.g. `192.168.1.42`), serve, then open `http://192.168.1.42:8000` on the phone.

## Editing email copy

`data/sequences.json` is the single source of truth — 15 templates (3 tiers × 5 steps), each with `subject` and `body`, both supporting these tokens:

```
{{first_name}}  {{company}}  {{custom_hook}}  {{signal_phrase}}
{{tier_proof}}  {{gdrive_link}}  {{sender_name}}  {{signature}}
```

Edit, commit, push → next deploy reflects the change for every future render.

## Verification checklist

1. `node scripts/build_schedule.mjs` → schedule populates with no orphan IDs.
2. `npm run serve` → walk through Today / Lead / Pipeline / Settings on iPhone via LAN.
3. Tap **Copy email** on a lead → paste into Notes → tokens fully resolved.
4. Pick one real Tier 2 lead → send via Mail → confirm Mailbutler tracker fires on open.
5. Tap **Mark sent** → confirm new commit on `data/activity.json` → progress ring advances.
6. Manually dispatch `morning-push.yml` → Pushover lands within 30s → tap deep-links into today's view.
