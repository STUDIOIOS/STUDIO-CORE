# STUDIO IOS Copy — Pre-Delivery Checklist

Run this before any deck ships, or when reviewing a `spec.json`. Score each text field (`intro.body`, `feature.description`, `asset.caption`, `product.description`, `divider.accent_word`, etc.). Flag specific lines — never a blanket "sounds AI".

## Gate 1 — Voice (must pass all)

- [ ] **Decision-led.** Does the first sentence state the creative choice, not scene-set? No "In today's…", no rhetorical question, no throat-clearing.
- [ ] **Tied to the brief.** Is it clear what client problem this answers?
- [ ] **Proved with a specific.** Is there at least one concrete detail (number, placement, material, scale, mechanic) — not an adjective — carrying the claim?
- [ ] **No hype adjectives.** Zero instances of stunning / striking / dynamic / vibrant / bold / premium / elevated / bespoke / iconic doing argument work.
- [ ] **Confident, not promotional.** No exclamation marks, no "we're excited/thrilled", no hype stacking.

## Gate 2 — Anti-AI (must pass all)

- [ ] No empty rule-of-three (triads only if all three are real specifics).
- [ ] No "-ing" clauses of fake depth ("…symbolising…", "…reflecting…").
- [ ] No copula avoidance ("serves as" / "stands as" → "is").
- [ ] No negative parallelism ("not just X, it's Y").
- [ ] No AI vocabulary (delve, leverage, showcase, testament, tapestry, underscore, boasts…).
- [ ] No weasel attribution — only FUJI / Phalanx / the studio's own work is cited.
- [ ] Rhythm varies — no three same-shape sentences in a row.

## Gate 3 — Mechanics (must pass all)

- [ ] **UK spelling throughout** — colour, organisation, programme, specialise, centre. Grep the whole spec for American spellings before shipping.
- [ ] **Dash discipline** — spaced en/em dash used, but ≤ ~1 per paragraph and never 2 in a sentence.
- [ ] **Numbers concrete and real** — no invented precision.
- [ ] **Product/feature spec lines** use ` / ` slash separators in caps where placements are listed.
- [ ] **No emoji, no mechanical boldface** inside body copy.
- [ ] Cover / product / divider names are set nouns, not sentences.

## Final pass

- [ ] Read the whole deck's copy end to end aloud. Ask: *"what still reads as AI or as filler here?"* Name the remaining tells and fix them before delivery.
- [ ] Confirm every adjective that survived is one you couldn't replace with a specific — if you could, you didn't finish.

---

### Quick grep before shipping

```bash
# American spellings that shouldn't be in a Studio IOS deck
grep -nEi 'color|organiz|specializ|optimiz|\bcenter\b|catalog\b|\bfavor|recogniz' spec.json

# Common hype / AI tells
grep -nEi 'stunning|striking|dynamic|vibrant|elevate|leverage|showcase|seamless|testament|delve|pivotal|robust|bespoke' spec.json
```

A clean grep isn't a pass on its own — it just catches the obvious. The gates above are the real bar.
