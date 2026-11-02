# MINATO — LLM-first intelligence architecture

This update replaces the "router decides what the model may see" design with an agent: the LLM reads the
trader's question, decides what data it needs, calls validated backend tools, analyses what comes back, repeats
only if necessary, and then streams one final answer. Nothing else answers the trader.

## Why MINATO felt dumb (root causes found in the code)

| # | Root cause | Evidence |
|---|-----------|----------|
| 1 | **Regex lanes decided before the model saw the question.** `lane.ts` / `lean.ts` / `respond.ts` classified messages with keyword patterns and gave the model a tiny context for "chat" and "calc". | "ok nice so how much can I risk per trade…" was not recognised as a follow-up and went down the thin chat lane. |
| 2 | **Canned fallback fired whenever the free model failed.** `quickReply` matched `^ok…` and returned **"Got it."** | This is exactly the "Got it." in your screenshot. |
| 3 | **The model was never given real tools.** `engine.ts` called the provider without a `tools` parameter and relied on free models typing `[[TOOL:…]]` text tags. | `callChat` in `engine.ts` has no `tools` field. |
| 4 | **Tool-decision was a hard-coded regex planner** (`planInitialToolsForQuery`), not the model. | Wrong or irrelevant data pulled; "nothing relevant" answers. |
| 5 | **Stored memory was dead on the server.** `search_trader_memory` read a `memoryStore` that the route never set. | Always empty. |
| 6 | **Hard-coded 9:33 rule** was reported as "premature entries" even if the trader never configured it. | `db-tools.ts` |
| 7 | **No real streaming.** The route returned one JSON blob; the UI faked the reveal and restarted it from zero whenever text changed. | `useProgressiveText` |
| 8 | **Answers capped at ~90 words / 3 rounds** with a free-model chain that silently degraded quality. | `prompt` and `provider.ts` |

## The new flow

```
message ─► /api/minato/chat ─► LLM (system prompt + LIVE brief + conversation)
                                 │ needs more? ─► tool_calls ─► schema-validated, allow-listed, read-only
                                 │                              retrieval from THIS trader's records
                                 ◄──────────── results ─────────┘   (bounded loop, invisible)
                                 ▼
                  final answer streams token-by-token ─► every $ / % / R figure verified against
                  retrieved data ─► `done` ─► (background) checkpoint + memory update
```

* **One path, no lanes.** Greetings, calculations, diagnostics and follow-ups all go to the model with the real conversation.
* **Native tool calling** with 16 tools, plus an automatic **text-tool fallback** for models that reject native tools.
* **Tools**: `get_trader_profile`, `get_trading_history` (filters, sorting, paging), `get_trade_details`, `get_journal_entries`,
  `get_performance_metrics` (choose `sections`, so unrelated figures are never dumped), `get_rule_violations`,
  `get_psychology_patterns`, `get_account_statistics`, `compare_trading_periods`, `search_trader_memory`,
  `calculate_trading_math`, and new: `get_daily_summaries`, `get_risk_profile` (your real stop distances, drawdown room, streak odds → risk-per-trade ceilings and max contracts),
  `get_data_coverage` (what the journal lacks), `calculate` (exact arithmetic — the model never does maths in its head), `save_trader_insight`.
* **Live brief every turn** (account, today, data freshness, configured limits, remembered notes) so the model is never ignorant of the basics and never asks things it can look up.
* **Grounding:** the model must state only figures from the brief, tool results, the calculator or your own words; a verifier checks every $, % and R figure after the stream and adds an honest note if one cannot be traced.
* **Clarifying questions:** at most one, only when data/memory/conversation truly cannot answer.

## Persistent trader knowledge (contextual memory, not model training)

* New table `minato_trader_knowledge` (RLS, same identity bridge as migrations 001/003).
* Written by: the model via `save_trader_insight`; a small post-answer reflection call (goals, rules, decisions, data-verified patterns); a deterministic **daily progress checkpoint**; a per-day **conversation note**.
* Every note carries `as_of` and a confirmation count. The prompt states: **stored notes are context, live data wins**.
* The live journal is never copied into memory as a source of truth. Each request recomputes from current records.
* **Freshness guarantee:** client and server share a content revision (`computeDataRev`). The server reuses its copy only when the revision matches; any new trade, edit, note or rule change alters it, and the server asks for the data again (`need_data`). The server recomputes the revision from what it receives.

## Streaming / UI

* The UI is visually unchanged. The server streams NDJSON; only the **final** answer's text is sent as `delta` events. Tool rounds are silent. If a model writes text and then calls a tool, that text is retracted (`reset`) before it can matter.
* `useProgressiveText` now follows text that is still growing (it no longer restarts from zero); same 18 ms cadence, whitespace-boundary reveal, same classes.
* The typing dots show until the first word arrives, then the answer appears live with the existing reveal.
* If the model can't be reached, the trader sees a plain honest message — **never a canned or generic answer**.

## Safety and limits

* API key: server-side only (`OPENROUTER_API_KEY`), never logged or returned (tested).
* No AI-generated SQL anywhere. Tools are allow-listed, schema-validated (coercion, clamping, unknown keys dropped, bad enums/dates rejected back to the model), read-only, size-bounded.
* Loop bounds: 8 rounds, 24 tool calls, 6 per round, 50 s budget, context compaction, duplicate-call detection. On any limit the model is forced to answer from what it has.
* Per-call timeouts (first-byte 30 s, idle 25 s), one retry per model, model fallback, no retries on bad key.
* Rate limit 60 / 5 min per trader, max 3 concurrent, duplicate-message protection (409), 8 MB request ceiling (gzip supported for large journals), 40-turn / 8,000-char conversation bounds.
* Screenshots are never uploaded to the chat endpoint.

## Files

### REPLACE (exact paths)
```
src/app/api/minato/chat/route.ts
src/components/ai/minato.tsx
src/components/ai/minato-message.tsx
src/lib/minato/db-tools.ts          (additive: paging offset, exported filterEntries, 9:33 rule only when configured)
tests/run-all.ts
.env.example
```
### ADD
```
src/lib/minato/agent/safe-math.ts       src/lib/minato/agent/schema.ts
src/lib/minato/agent/stream-clean.ts    src/lib/minato/agent/llm.ts
src/lib/minato/agent/tools.ts           src/lib/minato/agent/extra-tools.ts
src/lib/minato/agent/brief.ts           src/lib/minato/agent/prompt.ts
src/lib/minato/agent/loop.ts            src/lib/minato/agent/data-source.ts
src/lib/minato/agent/guards.ts          src/lib/minato/agent/knowledge-store.ts
src/lib/minato/agent/memory-update.ts   src/lib/minato/agent/client.ts
supabase/migrations/004_minato_trader_knowledge.sql
tests/minato/agent.test.ts
README-MINATO-AGENT.md
```
### DELETE
```
tests/minato/route.test.ts     (tested the retired lane/canned-reply route; superseded by agent.test.ts)
```
Left in place but no longer on the request path (safe to delete later): `lane.ts`, `lean.ts`, `engine.ts`, `respond.ts`, `provider.ts`, `task-engine` is still used by the client for direct commands.

## Deploy

1. Copy the files above over the project (delete the one listed).
2. Run `supabase/migrations/004_minato_trader_knowledge.sql` in the Supabase SQL editor (after 001/003).
3. Environment variables (Vercel → Settings → Environment Variables), then redeploy:
   * `OPENROUTER_API_KEY` — already set.
   * **`MINATO_MODELS`** — set a strong tool-calling model chain, best first. Free models are the main remaining quality limit.
     Example (verify the slugs on openrouter.ai/models, filter "tools"): `~anthropic/claude-sonnet-latest,anthropic/claude-sonnet-4.6`.
   * Optional: `MINATO_MAX_OUTPUT_TOKENS` (default 8000), `MINATO_REASONING_EFFORT` (`low|medium|high`), `MINATO_AGENT_BUDGET_MS` (default 50000).
   * Supabase variables already used by the identity bridge: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_RLS_JWT_PRIVATE_KEY`, `SUPABASE_RLS_JWT_KEY_ID`.
4. `git add -A && git commit && git push`.
5. Smoke test: ask "with my win rate what is the max losing streak", then "ok nice so how much can I risk per trade and position sizing in mnq". The second must continue the first (using your real stops/drawdown room), not reply "Got it."

## Tests performed
* `npm test` — all suites green, including the new **174-assertion** `tests/minato/agent.test.ts`, which runs the real POST handler against a scripted OpenAI-compatible model (native tool calls, SSE, failures):
  general question; multi-tool questions; period comparison; missing information; the position-sizing follow-up; 3,200 trades (paging, gzip upload, speed); new trade / edited trade / changed rule invalidating cached data; 429/503/401/402 model failures and fallback; database failure and RLS headers; 6 concurrent traders, duplicate submit (409), concurrency cap (429); unknown tools, bad JSON, SQL-looking parameters, runaway loops, repeated calls; 60-turn histories; retracted pre-tool text; hidden `<think>` blocks; text-tool fallback; invented-figure detection; auth/validation/oversize; client `need_data` handshake.
* `tsc --noEmit` — no errors in any changed or added file. Remaining output is pre-existing: missing `gsap`/`lenis` packages in the zipped `node_modules` (landing page) and one old typing error in `intelligence-engine.test.ts`.

## Remaining limitations (honest list)
* **`next build` could not be run in my sandbox** (no network: the SWC binary and `gsap`/`lenis` are absent from the uploaded node_modules). Type-checking passed; please run `npm run build` once on your machine / Vercel.
* **Not tested against a live LLM** (no network/API access here). The model is simulated; real-model behaviour depends on the model you choose. Use a strong tool-calling model.
* Vercel Hobby limits functions to 60 s (`maxDuration = 60`). Very deep multi-round questions are cut to a forced answer at ~50 s. On a plan allowing longer functions, raise `maxDuration` in `route.ts` and `MINATO_AGENT_BUDGET_MS`.
* Server snapshot cache is per serverless instance (20 min); a cold instance simply re-requests the journal once.
* The numeric verifier checks $, % and R figures only, and adds a note rather than rewriting text that has already streamed.
* Reflection/checkpoint memory writes are best-effort and invisible; if Supabase is down MINATO still answers and does not claim to have remembered anything.
* Screenshot (chart) analysis is out of scope here and unchanged.
