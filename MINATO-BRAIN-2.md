# Minato Brain 2.0 — audit, root causes, fixes

Unzip at the project root (the folder with `package.json`) and overwrite. No new dependencies, no database changes, no UI files touched (`src/components/**` is byte-identical).

## What was actually wrong (reproduced on your original code)

Your screenshot question, "What was the best A+ setup I took…", reproduces exactly on the original `respond()`: the generic *Recent momentum / Biggest mistake / Ask me about losing streak* text. Five separate defects stacked up to produce it:

| # | Defect | Where | Effect |
|---|---|---|---|
| 1 | **"A+" is a review verdict** (`review.outcome.processVerdict === "a-plus"`), but nothing could rank by it. The setup branch only knew setup *names*, and its regex needed the literal phrase `best setup`. | `respond.ts` | The question matched no branch → fell to the catch-all. |
| 2 | **The catch-all printed a generic overview for ANY unmatched question.** | `respond.ts` | Every different question looked like the same answer. |
| 3 | **Model failures were swallowed.** Any non-OK response did `break` with no log, then fell to the deterministic path. Three separate copies of this logic existed. The configured models are all OpenRouter free tier (`openrouter/free`, `:free`), which rate-limit constantly. | `chat/route.ts`, `lean.ts` | A rate-limited model was indistinguishable from "Minato only knows one answer". |
| 4 | **Lane classifier sent the question to `chat`**: no "my", no data pattern matched. | `lane.ts` | The journal was not read on the first hop. |
| 5 | **Entry order was never enforced.** `recentTrades` is documented newest-first, but the route passed entries in whatever order the client held them. | `chat/route.ts` | Same journal, same question → +$110 one time, +$97.5 the next (your screenshot). Reproduced: 5 client orderings → **3 different answers**. |

Found by the new tests while fixing the above:

| # | Defect | Effect |
|---|---|---|
| 6 | A single `null` in `entries` threw inside `computeStats`; the route had no error boundary. | Unhandled 500. |
| 7 | Router/lane treated a leading `help` + up to 4 words as small talk. | "Help me reset after today" → chitchat. This was also the cause of the **pre-existing `mind-engine` test failure** that the Fast Lanes update left behind. |
| 8 | (my own, caught before shipping) the R-multiple regex rejected "−0.4R and…"; a fallback metric row exceeded the card parser's 72-char limit. | Fixed + covered. |

## What changed

**New modules (`src/lib/minato/`)**
- `provider.ts` — the single model caller. Every attempt recorded (model, outcome, status, ms); failures classified (auth / credits / rate_limited / timeout / network / server / bad_request / bad_response / empty); one back-off retry for 429/5xx; 401/403 stop at once; 400/422 retried without `reasoning`; hard time budget; the API key is only ever sent as the auth header and never logged or returned.
- `setup-analytics.ts` — deterministic setup and A+ ranking (net P&L, win rate excluding breakeven, avg R, thin-sample flag), `newestFirst()`, and `wantsSetupAnalysis()`.
- `verify.ts` — every `$`, `%` and `R` figure in a model reply must trace to the facts, tool output, or the trader's own words. One corrective retry; if still unsupported, the answer is kept and one honest `> Not found in your journal data: …` line is added. It never claims a figure is wrong, only that it is not in the data.
- `sanitize.ts` — drops entries that cannot be analysed (non-objects, no date, non-finite P&L), counts them, repairs nothing.

**Changed**
- `chat/route.ts` — error boundary; sanitised + newest-first entries; `setupPerformance` tool computed server-side and given to the model; provider + verification; `meta.degraded`, `meta.verification`, `meta.diagnostics`, `meta.droppedEntries` (the client ignores `meta`, so no UI change).
- `respond.ts` — enforces order; real setup/A+ answer (and an honest "none are marked A+ yet" with a clearly labelled alternative); the catch-all now says it cannot answer and why, instead of a fake overview.
- `lane.ts`, `router.ts` — A+, "best/worst setup", and first-person trade verbs → data lane; bare `help` only is small talk.
- `lean.ts` — delegates to the provider.

**Server logs now say why.** After deploying, a failing model prints one line in Vercel logs, e.g.
`[minato:data] model unavailable (rate_limited): openrouter/free:rate_limited(429) → …`
Look for `[minato:` — that line is how you will know whether your free models are the problem.

## Files — REPLACE
`src/app/api/minato/chat/route.ts` · `src/lib/minato/{lane,lean,respond,router}.ts` · `tests/run-all.ts` · `tests/_alias-loader.mjs`

## Files — ADD
`src/lib/minato/{provider,setup-analytics,verify,sanitize}.ts` · `tests/minato/{brain2.test.ts,brain2-fixtures.ts,route.test.ts}` · `tests/_shims/{next-server.mjs,empty.mjs}`

## Verify
`npm test` and `npm run typecheck`.
Measured in my copy (`node_modules` was not in the upload, so `zustand` was stubbed locally; the stub is not shipped): `lane` 52, `format` 13, `mind-engine` 86 (was failing before), `evals` 25/25, **`brain2` 97**, **`route` 89**. Unrelated suites I spot-checked (tagging, plan-intervention, csv-import, friends, coach) still pass.

The new tests include your screenshot question, the 3-answers-for-one-journal ordering bug, rate-limited / out-of-credits / bad-key / network / timeout / empty / malformed-JSON model failures, hallucinated-then-corrected and hallucinated-and-flagged numbers, empty and hostile journals, a 5,000-trade journal, duplicate ids, the 31st request being rate-limited, and that the key never appears in any response. I confirmed the regression tests fail on your original code.

## Not done, and why (please read)

- **Not run in a browser; `next build` not run.** No UI changed, but I have not seen it render.
- **I cannot see your production.** I believe free-tier rate limiting is behind the repeated answers, but that is inferred from the code. The new log line will confirm it. If it does, the real fix is a paid, reliable `MINATO_MODEL`; no amount of code makes a free model dependable. With a working model the data lane already receives the full routed context and the new setup tool.
- **Model-driven tool calling was not added.** Free models call tools unreliably. The existing design (a deterministic router picks tools, the server runs them, the model only phrases results) is safer, and I kept it. I would revisit this with a paid model.
- **No context cache was added, on purpose.** Your brief says responses must not rely on stale financial data, and the journal arrives fresh with each request. Caching would add risk for little gain at current sizes.
- **No background processing added.** Nothing here is slow enough to justify it.
- **Chart-screenshot analysis untouched** (`MINATO_VISION_MODEL` is still optional and unset in the example env).
- **Supabase RLS / migrations were not audited.** Journal data lives in Drive; Supabase holds working memory. I did not review the SQL policies.
- **Duplicate requests** (your screenshot shows the same message sent twice) are not de-duplicated server-side.
- **The rate limiter is in-memory per server instance**, so on serverless it is a soft limit.
- **Verification is narrow by design**: only `$`, `%` and `R` figures, only on the data lane. A legitimately derived figure (a difference) is flagged as "not found in your data" rather than recomputed.
- **Trades with no A+ verdict**: Minato says so and offers a clearly labelled all-trades alternative. It will not guess which trades were A+.
- **Synthetic tests.** Real journals will differ.
- **Pre-existing, not mine:** `tsc` reports missing `gsap`/`lenis` types in your upload; the docs already noted this.
