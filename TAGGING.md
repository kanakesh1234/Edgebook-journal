# Mistake tagging — how it works and why

Goal: every trade's mistake is tagged **correctly**, using **everything the trader wrote**, and a wrong tag is treated as worse than a missing one.

## What was wrong before

| Problem | Example |
|---|---|
| Only the "Others" name + one note were read. `wentPoorly`, `cause`, `lesson`, `improve`, `watchNext`, `deviations`, post-loss thoughts and the plan were never used. | Trader writes the real cause under "What didn't go well"; the tagger never sees it. |
| The keyword fallback ignored negation and tense. | "I did **NOT** chase" → *Chased* at 0.8 confidence. "No FOMO today" → *FOMO*. |
| One tag per trade. | "Chased because I was afraid to miss it" is two behaviours. |
| One model answer was trusted outright, and a wrong guess was filed silently. | Every written-in mistake got a category, right or wrong. |
| Practice grouped free-text mistakes by their exact wording. | "Ignored news" and "Traded CPI" never formed a recurring pattern. |

## The pipeline

```
 autopsy fields ─┐
 reflection      │            ┌── rules (offline, negation/tense/role-aware) ──┐
 notes, lessons  ├─► EVIDENCE ├── 2 models in parallel, quotes verified ───────┤─► POLICY ─► filed tags
 plan, news      │   BUNDLE   └── measured facts (news window, size, limit…) ──┘            ├─► suggestions
 trade data     ─┘                                                                          └─► nothing (unsure)
```

**Evidence bundle** (`lib/tagging/evidence.ts`) — 12 kinds of trader-written text, each labelled with its *role*, plus measured facts (planned risk/target, % of target reached, unconfirmed pre-trade rules, news window, loss limit, size spike, quick re-entry). `went-well` text is kept but can only ever **cancel** a mistake.

**Rules engine** (`rules.ts`) — reads each sentence for negation ("did not chase"), regret ("should NOT have moved my stop" keeps the mistake), and tense (in lesson/improve fields "never chase again" or "wait for the sweep next time" means that mistake happened). Every hit carries the exact sentence as a quote.

**Models** (`prompt.ts`, `/api/journal/tag-trade`) — primary *and* fallback model are both asked, in parallel. They must return a **verbatim quote** for every tag. Quotes are verified against the trader's real words (case/spacing-insensitive); a tag with no verifiable quote is discarded. A quote the rules read as a denial cannot support its tag. Models are **not asked for a confidence number**.

**Policy** (`policy.ts`) — voters are `you`, `data`, `ai:<model>`, `rules`:

| Outcome | Condition |
|---|---|
| **Filed** | The trader picked it, **or** ≥ 2 independent voters agree and nothing in their own words contradicts it. |
| **Suggested** | One voter, voters disagree, or the trader's words contradict it. Shown for one-tap confirm. **Not counted** in Journal/Weekly/Practice until confirmed. |
| **Nothing** | Too weak to bother the trader with ("unsure"). |

Also: the trader's own pick is final and never overridden; a mis-tap (pick unsupported by their own words while ≥ 2 voters agree on another tag) raises a "Did you tap the wrong one?" prompt; "No mistake" is the trader's call — the tagger can only ask; a concrete behaviour (early, size…) always outranks a "why" (tilt, fomo, plan) for the primary slot; max 3 filed tags.

## Why these choices (research)

* **No self-reported confidence.** Verbalized LLM confidence is systematically over-confident and tracks the model's *willingness to answer* more than correctness; in one 2026 study abstention was predicted ~0.16 AUROC better than correctness by verbal confidence. The practical guidance in the same literature: use **agreement across independent runs/models** and route disagreement to a human. That is exactly the policy above. (arXiv 2606.29490; calibration-in-production write-ups.)
* **Weaker models tend to be the worst calibrated**, which is why a single model (especially a small or free-tier one) is never allowed to file a tag alone.
* **Verifiable evidence.** Requiring a copied quote turns "plausible" into "checkable" and makes every tag explainable in the UI ("Because you wrote…").

## Why screenshots cannot create a tag

You asked about analysing the saved screenshots. Decision: **not in v1, and never as the sole source of a tag.**

* Vision models hallucinate on charts. On the ChartHal benchmark, GPT-5 and o4-mini reached only ~34% and ~23% on hallucination-prone chart questions; they fabricate answers rather than say the chart can't answer them (arXiv 2509.17481).
* On candlestick charts specifically, an audit found models tend to **extrapolate past trend instead of reading the candles** (arXiv 2606.17423). That is precisely the failure that would mis-tag "chased" vs "early".
* The facts a screenshot would give are already captured as structured data (entry/exit time, price, stop, target, size), which are used as measured facts.

If you want a v2: add **observations only** ("a printed clock reads 09:31"), never judgements; let them *corroborate* a tag that text already supports, never create or change one; and require an eval on your own screenshots first. The bundle's `sources` model has room for it; the policy would count it as a non-voting note.

## Using it

* **Autopsy**: after the lesson step a *Mistake tags* card appears (≈1 s after typing stops), showing the tags, the trader's quote behind each, and who agreed. Never blocks **Complete**.
* **Saved trade → Review tab**: confirm leftover suggestions, or *Re-read my notes* / *Check tags with AI* for trades finished before this existed (trader-owned tags are preserved).
* **Stored** on `review.followUp`: `tags[]` (filed), `tagging` (verdict, suggestions, conflict, models). `mistakeCategory` always equals the primary tag, so Journal filters, Weekly Review and Practice keep working unchanged.
* `mistakeOf()` returns `pending: true` for written-in mistakes the tagger could not file, rather than guessing. `needsTagReview(entry)` lists them.

## Measuring accuracy (do this before trusting a model)

```
npm run eval:tagging                            # offline: rules + data
OPENROUTER_API_KEY=… npm run eval:tagging       # live: your MINATO_MODEL + MINATO_FALLBACK_MODEL
```

Reports precision of *filed* tags (the number to protect), wrong tags filed (must be 0), how many are left as one-tap suggestions, and clean trades falsely tagged. The golden set is `tests/journal/tagging-golden.ts`.

**Honest caveats.** The golden set is 47 hand-written cases, so its scores are optimistic. Grow it from reality: whenever you correct a tag in the app, add that trade's wording as a case. Aim for ~200 cases before changing any threshold.

## Knobs (all in `policy.ts`)

| Constant | Effect |
|---|---|
| `RULES_SUGGEST_MIN` (2) | How strong a keyword hit must be to even be suggested. |
| `RULES_SUGGEST_MIN_AI_SILENT` (3) | Stricter when every model declined to tag. |
| ≥ 2 voters to file | The core precision rule. Lowering it to 1 is exactly what produced the old wrong tags. |

**Offline trade-off.** With no AI answering, a single keyword hit is one voter, so most written-in mistakes become one-tap *suggestions* (offline eval: 2 of 37 filed, 89% right tag offered). If that is too much tapping when AI is off, the lever is to let one explicit hit in the trader's own mistake name file on its own. Decide that with eval numbers from your real trades, not on a hunch.

## Evolving the taxonomy

Keys are stable (stored on trades): only **add** keys, never rename. Watch the `other` bucket: when many trades land there with a shared theme (e.g. *averaging down*, currently filed under `risk`), that's the signal for a new key. Add it to `MISTAKE_CATEGORIES` and `GUIDE` (with *use* and *not this*), then add golden cases.

## Not verified in this environment

Live OpenRouter calls and `next build` could not be run (no network). The model prompt, route and UI are covered by type-checking and by tests of everything around them (grounding, consensus, policy, storage). Run `npm run eval:tagging` with your key, and click through the autopsy once.
