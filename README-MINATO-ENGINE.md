# MINATO AI: INTELLIGENCE ENGINE OVERHAUL — Architecture & Deployment Guide

## 1. Root Causes Identified & Fixed

1. **Reasoning Model Token Starvation (`src/lib/minato/lean.ts` & `src/app/api/minato/chat/route.ts`)**:
   - `.env.local` configures `MINATO_MODEL=nvidia/nemotron-3-super-120b-a12b:free` (a reasoning model). Previously, `leanLane` called `callModel` with `maxTokens: 320`, so the model's internal reasoning tokens (`<think>`) exhausted the 320-token ceiling before emitting visible `content`, returning `null`!
   - When `leanLane` returned `{ fallback: true, text: "" }`, the client fell back to `DeterministicMinatoProvider` (`respond.ts`), which had no handler for conversational openings like `"I had a doubt can I ask"` or `"Arey I am saying I had a doubt can I ask"`, falling through to the canned refusal (`"I can't answer that one reliably right now..."`).
   - **Fix**: Increased the `leanLane` token budget (`1000–1200` tokens) and added conversational meta-opening support across `lane.ts`, `router.ts`, and `respond.ts`.
2. **Single-Pass Static Context Instead of LLM-First Multi-Step Tool Retrieval**:
   - Previously, `POST /api/minato/chat` ran a single static pass and could not let the LLM dynamically request specific database slices, compare two trading periods (`compare_trading_periods`), or run multi-step analysis.
   - **Fix**: Built the **Minato Intelligence Engine (`src/lib/minato/engine.ts`)**, **11 Schema-Validated Backend Database Tools (`src/lib/minato/db-tools.ts`)**, and the **Continuous Learning Context (`src/lib/minato/knowledge.ts`)**.

---

## 2. Files Added & Files Replaced (Exact Paths)

### Files Added (New Files)
| File Path | Purpose |
| :--- | :--- |
| `src/lib/minato/db-tools.ts` | Implements 11 schema-validated, allowlisted backend tools (`get_trader_profile`, `get_trading_history`, `get_trade_details`, `get_journal_entries`, `get_performance_metrics`, `get_rule_violations`, `get_psychology_patterns`, `get_account_statistics`, `compare_trading_periods`, `search_trader_memory`, `calculate_trading_math`) with pagination and fast aggregation over 3,000+ trades. |
| `src/lib/minato/knowledge.ts` | Builds the live-reconciled `TraderKnowledgeSnapshot` (`buildContinuousKnowledgeSnapshot`) synthesizing account overview, data freshness, strengths/weaknesses, repeated mistakes, emotional & habit profiles, longitudinal progress over time, configured preferences, and active memory highlights. Fresh database records always supersede stale cache. |
| `src/lib/minato/engine.ts` | Implements `runMinatoIntelligenceEngine`: bounded multi-step tool-calling loop (`MAX_TOOL_ROUNDS = 3`, `MAX_TOOLS_PER_ROUND = 4`), supporting both native OpenAI/OpenRouter `tool_calls` and inline `[[TOOL:name(args)]]` directives, plus `planInitialToolsForQuery` and in-flight request deduplication (`deduplicateEngineRequest`). |
| `tests/minato/intelligence-engine.test.ts` | Comprehensive 12-scenario test suite (71 assertions) verifying general/conversational questions, multi-query diagnostics, historical period comparisons, missing-input prompts, 3,200-trade performance, immediate reflection of new journal entries & updated rules, API failure recovery, malformed data resilience, duplicate request deduplication, invalid tool call rejection, and 36-turn working memory summarization. |

### Files Replaced / Updated (Existing Files)
| File Path | Changes Made |
| :--- | :--- |
| `src/lib/minato/provider.ts` | Added native `tools` / `toolCalls` (`RawToolCall[]`) support in `callChat` and `ModelResult`, with automatic fallback retry if a free model rejects `reasoning` or `tools` parameters. |
| `src/app/api/minato/chat/route.ts` | Wired `runMinatoIntelligenceEngine`, `buildContinuousKnowledgeSnapshot`, and `TraderDatabaseContext` into `POST /api/minato/chat`; included multi-step tool outputs in `verifyReply` numeric verification; raised `leanLane` token ceiling so reasoning models never starve. |
| `src/lib/minato/lane.ts` | Added conversational meta-opening recognition (`"I had a doubt can I ask"`, `"can I ask a question"`, `"Arey I am saying..."`) and period-comparison routing to the `data` lane. |
| `src/lib/minato/router.ts` | Added conversational meta-openings to `chitchat` intent routing. |
| `src/lib/minato/respond.ts` | Added conversational meta-opening replies, longitudinal period comparisons (`"Am I improving psychologically?"`), and multi-factor loss diagnostics (`"Why am I consistently losing?"`). |
| `src/lib/minato/extract.ts` | Extended `UserSemanticParams` with `sessionTimes` / `sessionWindow` for profile and knowledge snapshot integration. |
| `src/components/ai/minato-message.tsx` | Added smooth 60fps progressive word-boundary text reveal (`useProgressiveText`) on newly generated replies without altering any visual styling, colors, layout, or typography. |
| `src/components/ai/minato.tsx` | Passed `plans`, `dayLogs`, and `settings` (playbook, guardrail rules, daily loss limits) in the `data` lane request payload so backend tools have complete access to the trader's database. |
| `tests/run-all.ts` | Registered `./minato/intelligence-engine.test.ts` in the master test runner. |

---

## 3. Database Migrations & Environment Variables

### Database Migrations
- **None required.** EdgeBook stores user journal data in Google Drive (`journal.json` via `src/lib/server/drive.ts`) and client-side Zustand/IndexedDB synced storage (`src/lib/store.ts`). All 11 database tools in `src/lib/minato/db-tools.ts` and the continuous learning layer in `src/lib/minato/knowledge.ts` operate directly on the existing `JournalEntry`, `TradePlan`, `NoTradeLog`, `Challenge`, `JournalSettings`, and `MinatoBrain` schemas with zero breaking changes.

### Environment Variables (`.env.local`)
- `OPENROUTER_API_KEY` — Server-only OpenRouter API key (already configured in `.env.local`; never exposed to the client).
- `MINATO_MODEL` — Primary LLM model identifier (e.g., `nvidia/nemotron-3-super-120b-a12b:free` or `z-ai/glm-4.5-air:free`).
- `MINATO_FALLBACK_MODEL` — Optional secondary fallback model (automatically backed up by `openrouter/free` and `google/gemma-3-27b-it:free` in `src/lib/minato/provider.ts`).

---

## 4. Deployment Steps

1. **Install dependencies** (if deploying to a fresh environment):
   ```bash
   npm install
   ```
2. **Run the verification test suite**:
   ```bash
   npm test
   ```
3. **Build for production**:
   ```bash
   npm run build
   ```
4. **Start or deploy**:
   - Local production server: `npm start`
   - Local development server: `npm run dev`
   - Vercel / Cloud deployment: Push the updated files or deploy with `vercel --prod` ensuring `OPENROUTER_API_KEY` and `MINATO_MODEL` are set in project environment variables.

---

## 5. Tests Performed & Results

All test suites pass 100%:
- `tests/minato/intelligence-engine.test.ts`: **71 / 71 assertions passed** across all 12 required scenarios:
  1. General trading questions & conversational openings (*"I had a doubt can I ask"*, *"Arey I am saying I had a doubt can I ask"*).
  2. Multi-query diagnostic questions (*"Why am I consistently losing?"* → `get_performance_metrics` + `get_rule_violations` + `get_psychology_patterns` + `get_journal_entries`).
  3. Historical period comparisons (*"Am I improving psychologically?"* → `compare_trading_periods` + `get_psychology_patterns`).
  4. Missing input detection (`calculate_trading_math` prompts once for missing `stop_points` / `risk_per_trade`).
  5. High-volume dataset performance (3,200+ trades filtered, paginated, and aggregated in `<150ms`).
  6. Immediate reflection of newly added journal entries in `buildContinuousKnowledgeSnapshot` and `get_journal_entries`.
  7. Immediate reflection of updated Trading Lab rules in `get_trader_profile` and `get_rule_violations`.
  8. Multi-step LLM tool-calling loop (Round 1 tool request → backend execution → Round 2 synthesis) & 429/503 API failure recovery.
  9. Corrupted/malformed database entry sanitization (`sanitizeEntries`) and empty-journal resilience across all 11 tools.
  10. Concurrent duplicate request deduplication (`deduplicateEngineRequest`).
  11. Hallucinated tool name rejection (`isValidToolName`) and malformed JSON argument recovery (`parseInlineToolCalls`, `normalizeRawToolCalls`).
  12. Long conversation history compression (36 turns summarized into working memory while preserving key figures and recent 10 verbatim turns).
- `tests/minato/evals.test.ts`: **25 / 25 eval cases passed**
- `tests/minato/route.test.ts`: **89 / 89 assertions passed**
- `tests/minato/brain2.test.ts`: **97 / 97 assertions passed**
- `tests/minato/mind-engine.test.ts`: **86 / 86 assertions passed**
- `tests/minato/lane.test.ts`: **52 / 52 assertions passed**
- `tests/minato/format.test.ts`: **13 / 13 assertions passed**

---

## 6. Remaining Limitations

- **Free-Tier OpenRouter Rate Limits**: When using `:free` models on OpenRouter (`nvidia/nemotron-3-super-120b-a12b:free`, `z-ai/glm-4.5-air:free`), upstream providers occasionally enforce burst rate limits (`HTTP 429`). `provider.ts` automatically retries across the fallback chain (`primary → fallback → openrouter/free → google/gemma-3-27b-it:free`), and if all upstream models are simultaneously exhausted, Minato falls back to its deterministic engine (`respond.ts`) so the trader still gets an accurate, data-grounded answer.
- **Bounded Tool Loop (`MAX_TOOL_ROUNDS = 3`)**: To guarantee fast response times within serverless timeouts (`maxDuration = 60s`), the multi-step reasoning loop is capped at 3 rounds and 4 tools per round, with common multi-factor tools pre-fetched in Round 1.
