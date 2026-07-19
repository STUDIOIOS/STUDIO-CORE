---
name: studio-ios-voice
description: Write, rewrite, or review copy for STUDIO IOS client PDFs, decks, and presentation pages so it reads in the Studio IOS voice — confident creative rationale, evidence over adjectives, UK spelling, zero AI tone. Use whenever you are drafting or editing the words that go into a Studio IOS deliverable: intro/overview copy, feature and application descriptions, product captions, divider and section language, asset captions, cover lockup lines, or a spec.json's text fields. Also trigger on "write the deck copy", "make this sound like Studio IOS", "on-brand copy", "de-AI this", "review the wording", or when the studio-ios-pdf skill needs body copy. This is the copy authority; studio-ios-pdf owns layout and geometry.
---

# STUDIO IOS Voice

The house voice for every word that lands in a Studio IOS client deliverable. Use it to **write** deck copy from scratch, **rewrite** copy that sounds generic or AI-generated, and **review** a finished spec before it ships.

This skill governs *words*. The `studio-ios-pdf` skill governs *layout* (geometry, fonts, layers, page types). They are used together: build the deck structure with `studio-ios-pdf`, write every text field with this skill.

---

## The one-line test

> **Studio IOS copy states the creative decision, ties it to the brief, and proves it with something specific — never with an adjective.**

If a sentence would survive a senior creative director asking *"says who, and so what?"*, it's on-brand. If it leans on "stunning", "dynamic", "innovative", "elevate", or "vibrant" to do the work, it isn't.

---

## Who Studio IOS is (context the voice assumes)

A Bristol creative-direction studio working in **combat sports, action sports, motorsport, and licensed apparel** — graphic language, trend intelligence, seasonal direction, style-guide architecture. Credibility sits in real work: **FUJI Sports**, **Phalanx**. The reader is a founder, creative lead, brand or licensing director who is allergic to fluff and decides fast. Write to a peer who knows the category, not to a stranger you're impressing.

---

## Five principles

1. **Lead with the decision.** Open on what was chosen, not on scene-setting or a rhetorical question. *"Three graphic anchors carry the collection"* — not *"In today's competitive market, brands must…"*.
2. **Answer the brief out loud.** Every rationale connects back to what the client asked for. Name the problem it solves (range inconsistency, undifferentiated product, a price point the design can't yet justify).
3. **Sell with specifics, not adjectives.** Replace "bold, striking design" with the actual move: *"the badge reads at 3 metres and survives a single-colour embroidery"*. Numbers, placements, materials, mechanics — not intensifiers.
4. **Confident, not promotional.** Restrained authority. No exclamation marks, no hype stacking, no "we're excited to". State it plainly and let the specificity carry the confidence.
5. **Natural runs, human rhythm.** Vary sentence length. One short declarative, then a longer one that earns its length. Never three sentences of identical shape in a row.

---

## Non-negotiable mechanics

- **UK spelling, always.** colour, organisation, programme, specialise, centre, licence (noun) / license (verb), catalogue, favour, recognise. A single American spelling breaks the brand.
- **Dashes are the house connective — used sparingly.** Studio IOS uses a **spaced en/em dash** ( — ) to attach a specific to a claim: *"a single buyable identity — the audience recognises it instantly"*. This is on-brand. The failure mode is *every* sentence pivoting on one; cap it at roughly one dash per paragraph, and only where it's carrying a real specific.
- **Numbers stay concrete.** "17% YoY uplift", "three anchors, not nine", "9 months ahead of the buying cycle". Round, real, and attributable — never invented precision.
- **No title case in headings/section labels beyond the deck's existing all-caps convention.** Section labels are set in caps by the layout (`OVERVIEW`, `APPLICATION`); don't Capitalise Every Word inside sentences.
- **No emoji, ever.**

---

## Anti-AI guardrails (the tells that get copy rejected)

Studio IOS copy must not read as machine-generated. Scan every draft for these and rewrite. The full pattern library with before/after fixes is in **`references/anti-ai.md`** — load it whenever you're doing a de-AI pass or a review.

The high-frequency offenders, in order of how often they sneak in:

- **Empty rule-of-three.** "innovation, inspiration, and industry insight." Keep triads only when all three are load-bearing specifics ("graphic language, trend framework and seasonal direction"). Otherwise cut to the one that matters.
- **-ing tails of fake depth.** "…the palette references the Gulf, symbolising heritage and reflecting the brand's roots." Delete the participle clause; state the fact.
- **AI vocabulary.** delve, elevate, leverage, robust, seamless, testament, tapestry, underscore, showcase, boasts, vibrant, pivotal, crucial, "in the heart of", "nestled", "stands as", "serves as". Banned list in `references/lexicon.md`.
- **Copula avoidance.** "The badge serves as the anchor" → "The badge is the anchor."
- **Negative parallelism.** "It's not just a logo, it's a statement." Cut it. Say what it is.
- **Promotional adjectives doing the argument's job.** stunning, striking, dynamic, cutting-edge, elevated, bespoke (when unearned), premium. Replace each with the concrete reason it's true.
- **Weasel attributions.** "studies show", "it's widely known". Studio IOS cites its *own* work (FUJI, Phalanx) or says nothing.
- **Symmetrical, sing-song rhythm.** If three sentences share the same length and shape, break one.

Final pass, every time: read the draft and ask *"what makes this read as AI?"* — name the remaining tells, then fix them.

---

## Copy by page type

Each Studio IOS deck page type has text fields (see `studio-ios-pdf`). Here's how the voice lands in each. Worked before/after rewrites for every one are in **`references/examples.md`**.

**`cover`** — `project`, `collection`, `stage`. Nouns only, no copy. Project and collection names are set language, not sentences. Keep them tight and typographic.

**`intro`** (concept overview, 3–4 sentences of body): the most important copy in the deck. Open on the concept's central idea, state what the collection is built around, connect to the brief, close on the intended outcome. No throat-clearing first sentence.

**`divider`** — `section`, `subsection`, `accent_word`. Section titles are plain and structural (`GRAPHIC ASSETS`, `PRODUCT`). `accent_word` is a single earned word (`EXPLORATORY`, `WILDCARD`) — never a filler adjective.

**`asset`** — `title` + per-item `caption`. Title names the direction (`BADGE LOCKUP DIRECTIONS`). Each caption describes *what the artwork will be and why*, in one specific sentence — it's a creative instruction the client can evaluate, not a label. "Woven-edge badge, single-colour, built to survive hem embroidery" beats "A cool badge design."

**`feature`** (application / sell-it page — `kicker`, `product_name`, `description` of 2–3 lines): lead sentence states the application decision, middle line gives the specific (placement, material, scale), final line points to the outcome or the next board. This is where rationale sells hardest — earn it with specifics.

**`product`** — `product_name`, `caption`, `description`. Product name is set language. Description is a tight spec line, often slash-separated placements (`RIGHT-CHEST LOGO / WOVEN HEM BADGE / ACCENT MARK`). Caption is one plain sentence.

---

## Workflow

**Writing new copy:**
1. Read the brief and the collection concept. Note the client's actual ask.
2. For each text field, draft leading with the decision (principle 1), then attach one specific (principle 3).
3. Pass over it for UK spelling, dash discipline, and the anti-AI tells above.
4. Run `references/checklist.md` before handing back.

**Rewriting / de-AI-ing existing copy:**
1. Load `references/anti-ai.md` and `references/lexicon.md`.
2. Rewrite each flagged pattern; preserve the client's factual content and any real numbers.
3. Keep meaning intact — this is voice work, not a rewrite of the creative argument.
4. Show the before/after if the user is reviewing.

**Reviewing a `spec.json`:** read every `body`, `description`, `caption`, `kicker`, `accent_word` field and score it against `references/checklist.md`. Flag specific lines; don't just say "sounds AI".

---

## Reference files

- **`references/lexicon.md`** — approved vocabulary, the banned-word list, and the UK-spelling reference.
- **`references/anti-ai.md`** — the full AI-pattern catalogue with Studio-IOS-specific before/after fixes.
- **`references/examples.md`** — real Studio IOS copy samples plus worked rewrites for every deck page type.
- **`references/checklist.md`** — the pre-delivery QA gate. Run it before any deck ships.

Load a reference file when the task calls for it; don't pull all of them for a one-line fix.
