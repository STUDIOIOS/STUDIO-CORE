# Studio IOS — Lead Outreach System: Session Handoff

_Date: 2026-05-08 | Branch: `claude/lead-outreach-system-3ul1i`_

---

## 1. Project Overview

**Goal:** Personal outbound campaign — 500 leads × 5-email sequences, iPhone PWA CRM, morning Pushover alerts, GitHub Actions cron.

**Stack:** Static PWA (GitHub Pages), Node ESM scripts, Apollo MCP (enrichment), GitHub MCP (commits/deploy), Pushover (iOS push).

**Key files:**
| Path | Purpose |
|---|---|
| `data/leads.json` | Lead records (id, tier, signals, custom_hook, email) |
| `data/sequences.json` | 15 email templates (T1/T2/T3 × 5 steps) |
| `data/config.json` | G-Drive links, sender info, cadences, bank holidays |
| `data/schedule.json` | Date → [{lead_id, step, priority}] |
| `data/activity.json` | Append-only sent/opened log |
| `web/app.js` | All PWA logic — routes, render, copy, mark-sent |
| `web/styles.css` | Mobile-first + light/dark theme via `data-theme` |
| `scripts/source_leads.mjs` | Apollo lead sourcing |
| `scripts/build_schedule.mjs` | Business-day schedule spreader |
| `scripts/generate_hooks.mjs` | Claude API per-lead custom_hook |
| `.github/workflows/` | deploy-pages, morning-push, signals-refresh, log-activity |

**Live URL:** `https://studioios.github.io/studio-core/`

---

## 2. Current Status

### Leads
- **25/500** populated (target: 50 T1, 300 T2, 150 T3)
- Current: 1 T1, 19 T2, 5 T3
- **24/25 missing email** — T1 lead (ONE Championship) has email; all T2/T3 blank
- ~11 leads missing `first_name` (company-only records): Hyperfly, Moya Brand, Engage, Gaidama, War Tribe, NoGi Industries, Askari, etc.

### Branch state
- `main` → `b518ac6` (reverted copy dashboard — user requested rollback to 07:31 BST state)
- Feature branch `claude/lead-outreach-system-3ul1i` → `a5e6bf0` (has copy dashboard, light/dark theme, full nav)
- **Direct push to `main` returns HTTP 403** — all main merges must go via PR using `mcp__github__create_pull_request` + `mcp__github__merge_pull_request`

### What's working on Pages (main)
Light/dark theme toggle, 3-tab nav (Today/Pipeline/Settings), preview.html, service worker v2 offline cache, boost-to-today, week-ahead view, Apple Mail `mailto:` compose, company-grouped scheduling.

### What's on feature branch but NOT on main
Copy review dashboard (`/copy.html`) — removed by user today; exists in `a5e6bf0` and can be re-merged.

---

## 3. Key Decisions

- **Apollo free plan**: `mixed_companies_search` and `mixed_people_api_search` → HTTP 403. Only `apollo_people_match` and `apollo_organizations_enrich` work (1 credit each). **Never run enrichment without explicit per-batch user approval.**
- **Lead sourcing strategy**: Switched to curated hand-qualified list + per-record Apollo enrichment (Path 2) after bulk search confirmed blocked.
- **Email sending**: Manual — Apple Mail + Mailbutler. PWA provides one-tap copy + `mailto:` prefill only.
- **G-Drive links**: 3 per tier (placeholder in `config.json`; replace `REPLACE_WITH_*` before going live).
- **Theme**: CSS custom properties on `:root[data-theme="light"]`; flash-of-dark prevented by inline `<head>` script on every HTML page.
- **localStorage namespace**: `studio.*` keys (`studio.theme`, `studio.sent.*`, `studio.copy_status`, `studio.copy_notes`).

---

## 4. Next Steps (prioritised)

1. **Email enrichment** — 24 leads need emails. Options: Hunter.io manual lookup, or `apollo_people_match` (1 credit each, explicit approval per batch). Start with highest-priority T2 leads.
2. **Fill missing `first_name`** — 11 company records need a contact name. LinkedIn manual lookup or Apollo people search per company.
3. **Replace G-Drive placeholder links** in `data/config.json` → `gdrive_links.T1/T2/T3`.
4. **Set GitHub Secrets** → `PUSHOVER_USER_KEY`, `PUSHOVER_APP_TOKEN`, `ANTHROPIC_API_KEY` (Settings → Secrets → Actions).
5. **Run `generate_hooks.mjs`** once emails are populated and ANTHROPIC_API_KEY is set — generates per-lead `custom_hook` + `signal_phrase`.
6. **Rebuild schedule** (`node scripts/build_schedule.mjs`) after lead data is complete.
7. **Tom's copy review** — 15 sequence templates in `data/sequences.json` awaiting Tom's edits. Re-merge copy dashboard from `a5e6bf0` when ready to review.
8. **CRM CSV merge** — `scripts/import_csv.mjs` is ready; needs Tom's existing CRM export file path.
9. **Expand lead count** toward 500 — T2 is priority (revenue engine). Apollo search blocked; use manual research + `organizations_enrich` per domain.

---

## 5. Context Notes

- **PR-only merges**: HTTP 403 on `git push origin ...:main`. Pattern: push branch → `mcp__github__create_pull_request` → `mcp__github__merge_pull_request`. Already done twice successfully.
- **Apollo credits**: Treat each `people_match` / `organizations_enrich` call as costing real money. Ask Tom before any batch run.
- **Tier 1 realism**: Brief is explicit — T1 is won through warm intros, not volume. System supports 50 slow-cadence emails as credibility touches, not closeable opportunities. Reflect this in any UI copy.
- **Service worker cache version**: Currently `studio-ios-v2` in `web/sw.js`. Bump to `v3` if new shell files are added.
- **Copy dashboard**: Tom reverted it today — it may need further refinement before going live. Don't re-merge without asking.
- **`import_csv.mjs`**: Reads `id,first_name,last_name,email,company,tier` CSV; merges into `leads.json` preserving signals + hooks. Ready to run.
