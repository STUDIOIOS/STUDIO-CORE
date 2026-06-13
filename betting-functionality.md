# Face-Off Duels — Betting System Functionality

## Overview
Head-to-head, token-based betting between managers. When one manager's team
plays another manager's team, they can bet tokens against each other on the
result. Bets settle automatically from the live score. Final token balances
decide each manager's share of a real-money prize pot.

## Tokens
- Every manager starts with the same bankroll (default **1,000 tokens**).
- Tokens are **zero-sum** — they only move between managers, never created or
  destroyed, so the pool total is always constant.
- A manager's tokens are split into **free** (available to bet) and **staked**
  (locked in open/active bets).

## Placing a bet (a "duel")
- A duel is between **two managers** on **one fixture**, with an **equal stake**
  each, where each owns a team on opposite sides of that match.
- The **challenger** picks a rival and a stake and backs their own team; their
  stake is locked immediately.
- The **opponent** can **Accept** (their stake locks too) or **Decline** (the
  challenger is refunded).
- The challenger can **Cancel** a challenge while it's still pending.

## Settlement (automatic)
When the match finishes, the final score settles every accepted duel on it:
- **Win** (your team's side wins) → you take the opponent's stake.
- **Draw** → push: both stakes returned.
- **Lose** → the opponent takes your stake.
Settlement is automatic and can be corrected by an admin if a score was wrong.

## Rules & locks
- **Bets lock at kick-off** — no creating or accepting once the match starts.
- **Minimum stake** applies (default 10 tokens).
- You can't stake more than your free balance.
- **Ownership handling (many-to-many):**
  - You can bet only on matches where you own a team on exactly one side.
  - If two managers co-own the same team, they can each bet separately against
    an opponent on the other side, but not against each other.
  - If you own teams on **both** sides of a match, you can't bet on it.
  - If you own no team in a match, you can't bet on it.

## Identity / login
- No preset passwords. On first sign-in each manager **picks their name and
  sets their own PIN**; that PIN is required to place, accept, or cancel bets.
- PINs are stored securely and seen by no one else.

## Prize money
- Tokens map to a real-money prize pot (default **£100**).
- Because tokens are zero-sum, each token is worth `pot ÷ total tokens`.
- The pot is split **in proportion to each manager's final token balance** —
  more tokens = a bigger share of the cash.
- A live **standings leaderboard** shows everyone's tokens and projected
  winnings at any time.
