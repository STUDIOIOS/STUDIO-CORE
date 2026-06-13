# Face-Off Duels — Head-to-Head Betting Feature

A portable spec for adding **token-based, head-to-head betting** to a World Cup
fantasy/pool app where managers own teams and those teams play each other.
Written so it can be re-implemented on a different existing app. Reference
implementation: a single static HTML file + Supabase (`worldcup.html` +
`worldcup-betting-schema.sql`).

---

## 1. Concept (what it does)

When one manager's team plays another manager's team, the two managers can bet
**play-tokens** against each other on the match result. Bets settle
automatically from the live score. Tokens are zero-sum, and each manager's
**final token balance maps to a proportional share of a real-money prize pot.**

- Everyone starts with the **same token bankroll** (default **1,000**).
- A **duel** = two managers, opposite sides of one fixture, equal stake.
- **Win** → take the opponent's stake · **Draw** → stakes returned (push) ·
  **Lose** → opponent takes yours.
- Bets **lock at kick-off** and **settle automatically at full time**.
- Tokens never enter or leave the system (zero-sum), so the pool total is
  constant (`starting_tokens × number_of_managers`). Each token is therefore
  worth `pot ÷ total_tokens` in real cash.

---

## 2. Prerequisites in the host app

The feature plugs into any app that already has:

| Needs | In the reference app |
|---|---|
| A fixed list of **managers/players** | `MANAGERS` array |
| **Team ownership** (which manager owns which team) — may be many-to-many | `SQUADS` / `ownersByTeam` |
| A list of **fixtures** with a stable **fixture id**, **home/away teams**, and **kick-off time** | `FIXTURES` → `buildFixtures()` (`f.id`, `f.home`, `f.away`, `f.utc`) |
| A **live results feed** giving final score + a FINISHED status | TheSportsDB poll → `applyLiveScores()` |

> The fixture id must be **stable and identical** between the betting layer and
> the results layer (the reference uses `homeId + awayId`).

---

## 3. Architecture

```
Static client (browser)                 Supabase (Postgres)
─────────────────────────               ───────────────────────────
- renders fixtures + duels               managers, manager_secrets,
- signs in (name + PIN)         RPC       duels, results, ledger
- creates/accepts/cancels  ───────────▶  SECURITY DEFINER functions
- reports final scores                   (PIN-gated, atomic transfers)
- realtime subscription    ◀──────────  postgres_changes broadcasts
```

- **Reads** are public (anon key + row-level security `SELECT` policies).
- **Writes** happen *only* through `SECURITY DEFINER` RPCs that verify a
  per-manager PIN. The anon key cannot touch balances directly.
- **Realtime**: client subscribes to `duels` and `managers` changes so every
  device updates live.
- **Graceful degradation**: if the backend is unreachable, the host app keeps
  working; betting just shows "offline".

Any equivalent backend (Firebase, a serverless function + KV, etc.) works as
long as it provides: shared storage, atomic balance transfers, and light auth.

---

## 4. Data model

```
managers(name PK, balance int=1000, locked int=0, claimed bool=false, created_at)
manager_secrets(name PK→managers, pin_hash)          -- no read policy; functions only
results(fixture_id PK, home_score, away_score, source 'feed'|'admin', reported_at)
duels(id PK, fixture_id, kickoff, challenger, opponent,
      challenger_side 'home'|'away', stake, status, outcome, created_at, settled_at)
   status:  pending | accepted | declined | cancelled | settled
   outcome: challenger | opponent | push   (set on settle)
ledger(id PK, manager, delta, reason, duel_id, created_at)   -- realised P&L audit
```

**Balances split into two columns:** `balance` (free to bet) and `locked`
(escrowed in open/active duels). A manager's **equity = balance + locked**, and
total equity across all managers is invariant.

---

## 5. Token / escrow lifecycle

```
create duel   → challenger: balance −stake, locked +stake   (status pending)
accept        → opponent:   balance −stake, locked +stake   (status accepted)
decline/cancel/expire → challenger refunded (locked −stake, balance +stake)
settle:
  push        → each: locked −stake, balance +stake          (stakes returned)
  winner      → winner: balance +2·stake, locked −stake
                loser:  locked −stake
                ledger: winner +stake 'duel_win', loser −stake 'duel_loss'
```

Net equity change at settlement: winner **+stake**, loser **−stake** (zero-sum).
Escrow prevents over-committing the same tokens across multiple open challenges.

---

## 6. Server functions (RPCs)

| Function | Who | Purpose |
|---|---|---|
| `claim_manager(name, pin)` | any | First call sets the PIN; later calls verify it (login). |
| `create_duel(challenger, pin, opponent, fixture, kickoff, side, stake)` | challenger | Validates PIN, stake ≥ min, not locked, sufficient balance; escrows stake; inserts pending duel. |
| `respond_duel(opponent, pin, duel_id, accept)` | opponent | Accept (escrow opponent's stake) or decline (refund challenger). Auto-cancels + refunds if kick-off passed. |
| `cancel_duel(challenger, pin, duel_id)` | challenger | Withdraw a still-pending challenge; refund. |
| `report_result(fixture, home, away)` | any client | First-write-wins record of final score, then `settle_fixture`. |
| `admin_set_result(pin, fixture, home, away)` | admin only | Override a wrong score and re-settle (verifies the admin's PIN). |
| `settle_fixture(fixture)` *(internal)* | — | Settles all accepted duels from the stored result. **Re-runnable**: if a result is corrected, it reverses the prior outcome and re-applies. |

Helpers (`_verify_pin`, `_adj`, `_apply_duel`, `_reverse_duel`) are **not**
granted to anon — only callable from inside the above.

---

## 7. Settlement rules

1. Determine winning side from the stored result: `home`, `away`, or draw.
2. For each `accepted` duel on that fixture:
   - draw → `push` (stakes returned),
   - winning side == `challenger_side` → challenger wins,
   - else → opponent wins.
3. Mark `settled` with `outcome`, move tokens, write ledger rows.
4. **Idempotent + correctable:** already-settled duels are skipped unless the
   stored result changed, in which case the prior outcome is reversed and the
   new one applied. The admin override is the trust backstop.

**Result trust model:** the in-browser feed reports the final score
(first-write-wins); the admin can override. Fine for a friendly pool — for
higher stakes, restrict `report_result` to a trusted reporter or require two
matching reports before settling.

---

## 8. Eligibility & edge cases (important with many-to-many ownership)

For a fixture, with `homeOwners` / `awayOwners`:

- **You can duel** only if you own a team on exactly one side. Your side is
  `home` or `away` accordingly.
- **Eligible opponents** = owners of the opposite team, excluding yourself and
  excluding anyone who owns **both** teams (conflicted).
- **Co-owners on the same side** can't duel each other; they can each duel an
  opposite-side owner separately (multiple independent duels per fixture).
- **Own both teams in a match** → excluded from duelling it.
- **Own no team in a match** → can't duel (duels require a stake in the result).
- **Kick-off lock**: no create/accept once `now ≥ kickoff` (enforced
  server-side against stored `kickoff`, not the client clock).
- **Insufficient balance**: create/accept rejected if free balance < stake.
- **Minimum stake** (default 10).

---

## 9. Prize-money mapping

- Real-money side pot of **£POT** (default £100).
- Because tokens are zero-sum, `total_tokens` is constant, so:
  `projected_cash(manager) = POT × equity(manager) ÷ total_tokens`.
- Shown live next to each balance and on the standings leaderboard.
- Final split = pot in proportion to each manager's **final token balance**
  (after all duels settle, `locked` is 0, so balance = equity).

Alternative mappings (swap freely): top-N placings (e.g. 50/30/20), or
bragging-rights-only with no cash.

---

## 10. Client UI surface

- **Identity bar**: pick manager + PIN to sign in; shows balance (free +
  staked), live projected £, Standings toggle, Sign out.
- **How-to card**: dismissible explainer (stored in `localStorage`).
- **Per-fixture duel block** (on each match card):
  - lists existing duels with status (pending/accepted/won/lost/push),
  - **Challenge** control (opponent select + stake input) when eligible & unlocked,
  - **Accept/Decline** on incoming pending challenges; **Cancel** on your own.
- **Standings panel**: token leaderboard with projected prize £.
- **Auto-report**: when a fixture is FINISHED with a score, the client calls
  `report_result` once (throttled via a seen-set) to trigger settlement.

---

## 11. Security notes

- Ship only the **anon/public** key in the client — never the service_role key.
- Enable **row-level security**; add `SELECT` policies only; **no** direct
  insert/update/delete policies (writes go through `SECURITY DEFINER` RPCs).
- PINs stored hashed (`pgcrypto crypt/gen_salt('bf')`); the secrets table has
  **no read policy**.
- This is a **lightweight, friendly-pool** auth model (name + PIN), not bank
  grade. Upgrade to real auth (magic-link/OAuth) if real money is at stake.

---

## 12. Tunable defaults

| Setting | Default | Where |
|---|---|---|
| Starting tokens | 1,000 | `START_TOKENS` / seed |
| Prize pot | £100 | `POT_GBP` |
| Minimum stake | 10 | `create_duel` check |
| Admin (override) | `Tom` | `admin_set_result` |

---

## 13. Port checklist

1. Provision a backend with shared storage + atomic transfers + light auth.
2. Create tables, RLS, and the RPCs (see `worldcup-betting-schema.sql`); seed
   managers with the starting bankroll.
3. Add the backend client + **public** key to the app.
4. Wire eligibility (own a team on one side, exclude conflicts), the duel
   controls, and the kick-off lock using your fixtures' ids/times.
5. On FINISHED + final score, call `report_result(fixture_id, home, away)`.
6. Add the identity bar, standings/leaderboard, and projected-cash display.
7. Subscribe to live changes so all devices update in real time.
