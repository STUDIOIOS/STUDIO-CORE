# STC World Cup 2026 — Face-Off Tracker · Session Handoff

> Paste this into a new session to resume. Last updated: 2026-06-12.

## What this project is
A live tracker for a **World Cup 2026 betting pool**. Ten "managers" each drafted
8 national teams; between them the 10 squads cover **all 48 teams**, so **every
group-stage match is a face-off** between managers. The app shows when each
manager's teams play each other, in **UK time**, with **live scores** overlaid
once a match kicks off, plus a manager filter and a head-to-head meeting count.

User is **Tom** (tom@studio-ios.com), one of the managers, UK-based.

## Where the code lives (IMPORTANT)
- **Active file:** `worldcup.html` at the **root of the `STUDIOIOS/STUDIO-CORE` repo**,
  on branch **`claude/world-cup-app-data-fqmqw7`**. This is a single, self-contained
  HTML file (data + CSS + JS inline). No build, no server, no API key.
- **Parity copy:** `/home/user/stc-world-cup-2026/standalone.html` (local working dir,
  a separate scratch project). Keep it in sync with `worldcup.html` when editing.
- There is also a fuller multi-file Netlify version in `/home/user/stc-world-cup-2026/`
  (public/, netlify/functions/live.js) — an earlier iteration, **not** the one in use.
- **NOTE:** `STUDIO-CORE` is otherwise an unrelated lead-outreach PWA. We are only
  using it as a host for `worldcup.html` because this session **cannot create a new
  GitHub repo** (integration returns `403 Resource not accessible by integration`).

## Live URL (how it's served)
Served via **raw.githack.com**, pinned to a commit SHA (immutable). Current:
```
https://raw.githack.com/STUDIOIOS/STUDIO-CORE/<COMMIT_SHA>/worldcup.html
```
Latest known good SHA: **`32ea89d3f25d3cad2a599a91dd0108596d7d85e2`**.
After any new commit, regenerate the link with the new SHA (`git rev-parse HEAD`).
htmlpreview.github.io is a backup renderer.

## Environment constraints (learned the hard way)
- **Outbound network is allowlisted.** `WebFetch`/`curl` are **blocked** for general
  web (Netlify, Wikipedia, ESPN, TheSportsDB) → HTTP 403 `host_not_allowed`.
- **`WebSearch` works** (managed tool) and was the only data channel.
- **GitHub MCP file reads are scoped to `studioios/studio-core` only** — cannot read
  external repos (e.g. openfootball). `create_repository` is forbidden.
- **git push** works only via a local proxy locked to `STUDIOIOS/STUDIO-CORE`.
  Commits are server-signed; do **not** override `user.email/name` (breaks signing).
  Push: `git push origin claude/world-cup-app-data-fqmqw7` (retry w/ backoff on net err).
- The app itself runs in the **user's browser** (not sandboxed), so it CAN reach
  TheSportsDB live at runtime even though this sandbox can't.

## Architecture of `worldcup.html`
- `TEAMS` — 48 teams: `[id, name, flag, group, pos, [aliases]]`. Aliases handle feed
  name variants (Korea Republic, Türkiye, Côte d'Ivoire, Cabo Verde, DR Congo, etc.).
- `MANAGERS`, `COLORS`, `SQUADS` — the 10 managers and their 8-team squads (by team id).
- `FIXTURES` — **the source of truth for kick-off times**: all 72 group-stage matches
  as `[group, homeId, awayId, "ISO+01:00"]`. Times are **UK local (BST, +01:00)**.
- `buildFixtures()` builds fixture objects and derives matchday (chronological order
  within group, 2 per MD).
- `applyLiveScores(events, fixtures)` overlays TheSportsDB scores/status, matched by
  **unordered team pair**, score oriented to our home/away.
- Feed: `https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=4429&s=2026`
  (FIFA World Cup = league 4429, free public key `3`, CORS-OK). **Times come from
  FIXTURES, not the feed** — feed is scores/status only.
- Rendering pinned to `Europe/London` (auto BST in summer); zone label is dynamic.
- Polling: 20s when any match is LIVE, else 60s. Tap status pill to refresh.
- Two views originally (Schedule + Rivalries) in the multi-file version; the
  single-file `worldcup.html` has Schedule + a per-manager head-to-head summary.

## Data integrity (all validated, passing)
48 teams × 3 games each · 12 groups × 6 matches · matchday split 2/2/2 ·
**every group's Matchday-3 pair kicks off simultaneously** (FIFA rule — strong check) ·
72/72 matches are manager face-offs.

## Key decisions / history
1. Built single-file tracker (user wanted simpler than the Netlify version).
2. Times were wrong: first rendered in strict GMT → **1 hour behind**. Fixed to
   `Europe/London` (BST). User confirmed Mexico–S.Africa = **8PM BST**.
3. Because feed per-match timestamps were unverified, we **baked all 72 kick-offs**
   from official UK/ET listings (cross-checked ET→UK) as the source of truth.
4. User **confirmed the full baked schedule is correct** ("Yes").

## Schedule reference (UK/BST) — already baked into FIXTURES
Groups A–L, 72 matches. Anchor: **Thu 11 Jun 20:00 Mexico–S.Africa**. Final-round
(MD3) pairs are simultaneous. (Full list is in the `FIXTURES` array in the file.)
Lowest-confidence entries to re-verify if questioned: **Mexico-venue overnight games**
(Mexico–S.Korea, Czechia–Mexico, S.Africa–S.Korea, all 02:00 BST).

## The 10 squads (team ids)
- **Paul:** belgium, argentina, colombia, senegal, ecuador, canada, czechia, haiti
- **Matt:** germany, france, colombia, morocco, turkey, algeria, tunisia, south-africa
- **Kirk:** brazil, portugal, switzerland, usa, austria, egypt, czechia, ghana
- **Tom:** brazil, france, switzerland, usa, egypt, panama, dr-congo, saudi-arabia
- **Rory:** belgium, netherlands, mexico, uruguay, panama, australia, iraq, curacao
- **Omar:** england, germany, iran, morocco, algeria, australia, sweden, cape-verde
- **Jack:** croatia, spain, iran, south-korea, turkey, canada, uzbekistan, jordan
- **Gerry:** portugal, argentina, japan, south-korea, scotland, norway, paraguay, new-zealand
- **Mike:** croatia, netherlands, mexico, uruguay, ecuador, norway, qatar, jordan
- **Ben:** spain, england, japan, senegal, austria, scotland, ivory-coast, bosnia

## How to make common changes
- **Fix a kick-off time:** edit that match's ISO string in `FIXTURES` (one line),
  in BOTH `worldcup.html` and the standalone copy.
- **Change a squad:** edit `SQUADS` (team ids must exist in `TEAMS`).
- **Deploy update:** edit → validate → `git add worldcup.html && git commit` (no
  identity override) → push to the branch → give user new raw.githack SHA link.
- **Validate:** extract `<script>` and `node --check`; re-run the integrity checks
  (72 fixtures, each team 3 games, MD3 simultaneity).

## Open / possible next steps (offered, not started)
- Knockout bracket (squads are group-stage only).
- Points/leaderboard scoring for the pool.
- Real team badges instead of flag emojis.
- Clean permanent host: user creates an empty `stc-world-cup-2026` repo (this session
  can't create repos) → deploy to Netlify (`stc-world-cup-2026.netlify.app`).
- For true second-by-second live scores: keyed API-Football via a proxy (the
  multi-file Netlify version supports this; the single file uses free TheSportsDB,
  which can lag a minute or two).
