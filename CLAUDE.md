# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this is

**Studio IOS — Lead Outreach System.** A personal mini-CRM and outbound
campaign engine for [Studio IOS](https://studioios.com), a Bristol creative
direction studio. It manages a 500-lead cold-outreach campaign across three ICP
tiers, each with a 5-email sequence, and drives a daily habit loop:

> 07:00 UTC weekday **Pushover** notification → tap → **static PWA CRM** on the
> iPhone → **Copy** the tier-appropriate email body → paste into Apple Mail
> (Mailbutler tracks opens) → **Mark sent** → progress ring advances.

Everything is static and free-to-host. There is no backend server: GitHub Pages
serves the app, GitHub Actions crons drive notifications and data refreshes, and
the "Mark sent" button writes activity back via GitHub `repository_dispatch`.

## Tech stack & ground rules

- **Node ≥ 20, ES modules only** (`"type": "module"`). Scripts use `.mjs`.
- **Zero dependencies.** `package.json` has no `dependencies`/`devDependencies`
  and there is no lockfile. Scripts use only Node built-ins and global `fetch`.
  **Do not add npm packages** without a strong reason — keeping the build
  dependency-free is a deliberate design constraint.
- **No test framework, no linter, no bundler.** The web app is hand-written
  vanilla JS/CSS/HTML with no build step. Match the existing style; don't
  introduce tooling.
- **Plain JSON files are the database.** Everything in `data/` is the source of
  truth. Edit → commit → push → redeploy.

## Repo layout

```
data/                JSON "database" — config, leads, sequences, schedule, activity
web/                 Static PWA (the deployed site)
  index.html         Today view (route: today)
  lead.html          Single-lead view (route: lead)
  all.html           Pipeline view (route: all)
  copy.html          Copy review dashboard (route: copy)
  settings.html      Settings (route: settings)
  app.js             ALL PWA logic — routing, render, copy, mark-sent, boosts
  styles.css         Mobile-first CSS, light/dark via [data-theme]
  sw.js              Service worker (offline cache; has a version constant)
  manifest.webmanifest
  icons/             PWA icon (SVG)
scripts/             Node ESM build/runtime scripts (see below)
  lib/               Shared helpers: io.mjs, dates.mjs, render.mjs
.github/workflows/   deploy-pages, morning-push, signals-refresh, log-activity
preview.html         Standalone marketing/preview page (deployed alongside app)
README.md            Product-facing overview + setup
HANDOFF.md           Point-in-time session handoff (may be stale — see note)
```

## Data model (`data/*.json`)

| File | Shape | Purpose |
|---|---|---|
| `config.json` | object | Sender info, G-Drive links (per tier), `tier_proof` copy, cadences, tier targets, campaign start date, UK bank holidays, Pushover cron/deep-link. |
| `leads.json` | array of lead objects | The lead records. |
| `sequences.json` | `{ tokens_supported, T1, T2, T3 }` | 15 email templates (3 tiers × 5 `steps`), each with `subject` + `body`. **Single source of truth for email copy.** |
| `schedule.json` | `{ "YYYY-MM-DD": [{lead_id, step, tier}] }` | Generated map of send dates → touches. **Do not hand-edit — regenerate.** |
| `activity.json` | `{ events: [{lead_id, step, sent_at}] }` | Append-only sent log. Written by the `log-activity` workflow; deduped by `(lead_id, step)`. |

**Lead object** (see `data/leads.json`):
```jsonc
{
  "id": "demo:t1-acme",           // stable unique id (source-prefixed)
  "first_name": "Alex", "last_name": "Reed",
  "email": "alex@example.com",
  "title": "VP Licensing",
  "company": "ACME Promotions", "domain": "acme.com", "linkedin": "",
  "tier": "T1",                    // T1 | T2 | T3
  "priority": 1,                   // 0-3, derived from signals
  "signals": { "leadership_change": "new CMO appointed Q1" },
  "custom_hook": "...",            // 1-2 sentence bespoke opener (Claude-generated)
  "signal_phrase": "...",          // short signal fragment used in templates
  "notes": "...",
  "apollo": { "org_id": "..." }    // optional, present on Apollo-sourced leads
}
```

**ICP tiers** (volumes are deliberate — T1 is a slow credibility play, not a
volume play; T2 is the revenue engine):

| Tier | Meaning | Target | Cadence (business days) |
|---|---|---|---|
| T1 | Licensing infrastructure | 50 | 0 / 14 / 30 / 60 / 90 |
| T2 | Growth-stage DTC | 300 | 0 / 3 / 7 / 12 / 18 |
| T3 | Emerging founder brands | 150 | 0 / 5 / 10 / 17 / 24 |

**Email template tokens** (resolved identically in `web/app.js#renderEmail` and
`scripts/lib/render.mjs` — keep the two in sync if you change token logic):
```
{{first_name}} {{company}} {{custom_hook}} {{signal_phrase}}
{{tier_proof}} {{gdrive_link}} {{sender_name}} {{signature}}
```

## Scripts (`scripts/*.mjs`)

Run with `node scripts/<name>.mjs` or via the npm aliases in `package.json`.
All read/write `data/*.json` through `scripts/lib/io.mjs`.

| Script | npm alias | Env | What it does |
|---|---|---|---|
| `source_leads.mjs` | `source` | `APOLLO_API_KEY` | Source leads per tier from Apollo REST search. `--tier=` (required), `--target=`, `--pages=`, `--dry`. |
| `import_csv.mjs` | `import` | — | Import/merge leads from any CSV (LinkedIn/Hunter/manual). `--tier=`, `--force`. Merges by email; **preserves hand-written hooks**. |
| `detect_signals.mjs` | `signals` | `APOLLO_API_KEY` | Refresh `signals` + `priority` on every lead (funding, hiring, growth). Run weekly by cron. |
| `generate_hooks.mjs` | `hooks` | `ANTHROPIC_API_KEY` | Generate per-lead `custom_hook` via Claude (model `claude-sonnet-4-6`, prompt-cached tier system prompts). `--only=ID`, `--tier=`, `--force`. |
| `build_schedule.mjs` | `schedule` | — | Rebuild `schedule.json`: spreads sequences across UK business days, groups multi-contact companies, targets 5–10 first-touches/day. |
| `morning_push.mjs` | `push` | `PUSHOVER_USER_KEY`, `PUSHOVER_APP_TOKEN` | Send the daily Pushover notification for today's leads. `TARGET_DATE=` to override. |
| `log_activity.mjs` | `log` | `EVENT_PAYLOAD` | Append one send event to `activity.json` (called by the `log-activity` workflow). |

`npm run build` = `signals → hooks → schedule`. Regenerate `schedule.json`
whenever leads or cadences change — never edit it by hand.

## Web app (`web/app.js`)

Single vanilla-JS file. Multi-page app: each HTML shell sets
`<body data-route="...">`; `boot()` dispatches to the matching render function
in the `routes` map (`today`, `lead`, `all`, `copy`, `settings`).

Key behaviours:
- **Data loading:** fetches `./data/*.json` (no-cache) via `loadAll()`.
- **Mark sent:** `markSent()` writes optimistically to `localStorage`, then
  fires a GitHub `repository_dispatch` (`event_type: lead_sent`) using the
  user's PAT. If offline / no PAT, it queues in `localStorage` and
  `flushPendingDispatches()` retries on next boot.
- **Boosts:** users can manually pull a lead into today; stored locally.
- **localStorage namespace — always `studio.*`:** `studio.pat`,
  `studio.theme`, `studio.activity`, `studio.pending_dispatch`,
  `studio.boosted`, `studio.copy_status`, `studio.copy_notes`,
  `studio.pushover_user`. Use the `LS` map at the top of `app.js`; don't scatter
  raw key strings.
- **The PAT never leaves the device** — it lives in iOS Keychain / localStorage
  and is used only for client-side `repository_dispatch`.

**Theme:** light/dark via `document.documentElement.dataset.theme = 'light'`
plus CSS custom properties. Every HTML shell has an inline `<head>` script that
applies the saved theme before first paint (prevents flash-of-dark). If you add
a new page, copy that inline script.

**Service worker:** `web/sw.js` has a `CACHE` version constant (currently
`studio-ios-v2`). **Bump it whenever you add/rename a shell file** in the
`SHELL` array, or clients will serve stale assets. Add any new shell file to
that array too.

## Workflows (`.github/workflows/`)

| Workflow | Trigger | Effect |
|---|---|---|
| `deploy-pages.yml` | push to **`main`** touching `web/**`, `data/**`, `preview.html`; or manual | Assembles `_site` (copies `web/`, mirrors `data/*.json` into `_site/data/`, adds `preview.html`) and deploys to GitHub Pages. |
| `morning-push.yml` | cron `0 7 * * 1-5`; or manual (`target_date` input) | Runs `morning_push.mjs`. Needs `PUSHOVER_*` secrets. |
| `signals-refresh.yml` | cron `0 6 * * 1` (Mon); or manual | Runs `detect_signals.mjs` then `build_schedule.mjs`, commits changes to `main`. Needs `APOLLO_API_KEY`. |
| `log-activity.yml` | `repository_dispatch` type `lead_sent` | Runs `log_activity.mjs`, commits the appended `activity.json` to `main`. |

**Secrets** (repo → Settings → Secrets → Actions): `PUSHOVER_USER_KEY`,
`PUSHOVER_APP_TOKEN`, `ANTHROPIC_API_KEY`, `APOLLO_API_KEY`. Missing secrets
make the corresponding workflow no-op or fail loudly — they're not needed for
local UI work.

## Local development

```bash
npm run serve      # copies data/*.json → web/data/, serves web/ at :8000
npm run schedule   # rebuild data/schedule.json after editing leads/cadence
```

`web/data/` is **git-ignored** — it's a build artifact populated by `serve` and
by the deploy workflow. Never commit it; edit the canonical files in `data/`.
To test on an iPhone over LAN, serve and open `http://<your-LAN-IP>:8000`.

## Conventions & guardrails

- **Deploy branch is `main`.** The Pages site and the commit-back workflows all
  target `main`. Historically **direct `git push` to `main` has returned HTTP
  403** — merges to `main` go through a PR (`create_pull_request` +
  `merge_pull_request`). Do your work on a feature branch and open a PR unless
  told otherwise. **Never open a PR unless explicitly asked.**
- **Apollo calls cost real credits** (`people_match`, `organizations_enrich`,
  search). Treat every call as money. **Do not run enrichment or bulk sourcing
  without explicit per-batch approval from the user.** On the free plan, bulk
  people/company search returns 403 — only per-record match/enrich works.
- **Anthropic hook generation costs money too** — `generate_hooks.mjs` skips
  leads that already have a `custom_hook` unless `--force`. Don't blow away
  hand-written hooks; the CSV import and hook generator both preserve them.
- **`config.json` ships with placeholders** — the three `gdrive_links.T1/T2/T3`
  are `REPLACE_WITH_*` until the real portfolio links are in. Don't invent them.
- **Email copy lives in `data/sequences.json` only.** To change what an email
  says, edit the template there; both the app and the Node renderer read it.
- **Keep `renderEmail` in `web/app.js` and `scripts/lib/render.mjs` aligned** —
  they implement the same token substitution for browser and CLI respectively.
- **`schedule.json` and `web/data/` are generated** — regenerate, don't
  hand-edit.
- **The repo ships with demo/seed leads** (currently ~25 records, mostly T2)
  so the system is demonstrable end-to-end before the real 500 are loaded.

## Note on HANDOFF.md

`HANDOFF.md` is a dated snapshot from an earlier session (lead counts, branch
names, next-steps). Treat it as historical context, not current truth — verify
against the actual `data/` files and git state before acting on it. This
`CLAUDE.md` and `README.md` are the durable references.
