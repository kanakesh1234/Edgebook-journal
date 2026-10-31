# EdgeBook Update — Minato Memory Upgrade, Apple HIG UI & Desktop Calendar

## 1. Summary of Changes & Architectural Decisions

### Part 1: Minato Multi-Layer Memory System & Deterministic Math Tools
- **Problem Fixed**: Previously, asking *"with this win rate, what's the maximum longest losing streak possible, and the position size for NQ micro or mini with exact numbers"* matched generic `mnq|nq` and `streak` regexes in `respond.ts` in the wrong priority order, returning an unrelated directional/instrument breakdown.
- **Separate Memory Layers (`supabase/migrations/003_minato_memory_layers.sql` + Client/Drive Store)**:
  - **Working Memory (`minato_working_memory`)**: Tracks current conversation turns, pending missing-input questions (`stop_points` / `risk_per_trade`), and automatically summarizes older turns (`summarizeWorkingMemory` in `src/lib/minato/extract.ts`) when a thread exceeds 10 verbatim messages.
  - **Semantic Memory (`minato_semantic_memory`)**: Durable user facts (`risk_per_trade`, `stop_points`, `daily_loss_limit`, `drawdown_limit`, `profit_target`, `instruments_traded`, `account_type`, `strategy_rules`, `session_times`, `goals`, `psychology_notes`).
  - **Episodic Memory (`minato_episodic_memory`)**: Per-session / per-day summaries (what happened, lessons, mistakes, emotions) linked to trade/journal IDs with importance scores and exponential time decay.
  - **Live Data Memory**: Never cached in stale memory — always computed directly from the live `entries` journal database via deterministic tools.
- **Post-Turn Extraction Write Path (`src/lib/minato/extract.ts`)**:
  - Outputs structured JSON `{ id, type, category, fact_key, content, short, structured_value, entities, confidence, importance, source_message_id, trade_ids, created_at }`.
  - Deduplicates identical facts, merges evidence, and **supersedes contradicting facts** on the same `fact_key` axis (marking the older record `status: "superseded"` with `supersededBy` pointing to the new item ID, preserving audit history).
- **Intent Classification & Hybrid Retrieval Read Path (`src/lib/minato/router.ts`, `src/lib/minato/retrieve.ts`)**:
  - Classifies every query into high-level categories (`calculation`, `stats_question`, `journal_reflection`, `strategy_advice`, `small_talk`) and granular plans.
  - Combines BM25 keyword scoring + signed feature-hash embeddings via Reciprocal Rank Fusion (RRF), reranked by confidence, recency/retention decay, importance/pin boost, and diversified with Maximal Marginal Relevance (MMR) strictly inside a per-intent token budget (`tokenBudget`).
- **Deterministic Math Tools (`src/lib/minato/tools.ts`)**:
  - **Streak Probability (`computeStreakTool`)**: Computes exact Markov-chain DP probability $P(\text{losing streak} \ge k \text{ in } n \text{ trades})$, closed-form expected maximum losing streak, and a seeded **10,000-run Monte Carlo simulation** (`mulberry32`, `seed=42`) reporting mean, median, 90th, 95th, and 99th percentile max streaks, explicit assumptions, and sample-size caveats.
  - **Position Sizing (`computePositionSizingTool`)**: Computes $\text{contracts} = \lfloor \text{risk\_\$} / (\text{stop\_points} \times \text{point\_value}) \rfloor$ for `NQ` ($20/pt), `MNQ` ($2/pt), `ES` ($50/pt), `MES` ($5/pt), etc., using the trader's stored semantic risk limits and remaining drawdown cushion, showing the full formula working.
  - **Missing Input Prompt & Auto-Save**: When stop size (`stop_points`) or risk per trade (`risk_per_trade`) is missing from both the query and semantic memory, Minato shows baseline working, asks **once** for the missing parameter, and automatically extracts & saves the user's reply into semantic memory on the next turn.
  - **Expectancy, Profit Factor, Average R & Drawdown (`computeExpectancyStatsTool`)**: Computes exact dollar and R expectancy, profit factor, payoff ratio, average R, and drawdown room.
- **Transparency & Settings UI (`src/components/settings/minato-memory.tsx`, `src/lib/minato/bridge.ts`)**:
  - Added full **Memory** management in `Settings → MINATO`: view active semantic parameters (`Risk / Trade`, `Default Stop`, `Daily Loss Limit`, `Account Type`), add new facts, inline edit existing memories, pin/unpin, delete/forget, restore superseded/retired history, and toggle **Retrieval Debug Mode** (which logs classified intent, deterministic tools called, hybrid retrieval scores, and token usage per answer).
  - Added a subtle `"Saved to memory"` confirmation banner in the Minato chat header and inline on messages when facts are learned.

### Part 2: Apple HIG-Inspired Responsive UI & Docked Minato Chat
- **Preserved Existing Theme, Colors & Fonts**: Kept all warm paper/dark tokens (`--canvas`, `--surface`, `--ink`, `--gold`, `--profit`, `--loss`) and fonts untouched while refining layout, spacing, and motion (`cubic-bezier(0.32, 0.72, 0, 1)`, `prefers-reduced-motion` support, `dvh` units, `>= 44px` touch targets, `env(safe-area-inset-*)`).
- **Responsive Navigation (`src/components/shell/nav.tsx`, `src/app/globals.css`)**:
  - Mobile (`< 768px`): Translucent bottom tab bar + top bar.
  - Tablet (`768px – 1279px`): Collapsible icon/label sidebar rail (`data-tablet-expanded`).
  - Desktop (`>= 1280px`): Full sidebar with collapse toggle (`data-sidebar-collapsed`) and 4-column KPI strip.
- **Docked Minato Panel (`src/components/ai/minato.tsx`, `src/components/ai/minato.css`, `src/lib/ui-store.ts`)**:
  - **Desktop**: Replaced the floating overlay with a **docked right-side panel** (`--minato-dock-w`) that smoothly pushes `.app-main` content left so it never covers the calendar or dashboard. Includes a left-edge drag handle to resize between `400px` and `640px`, plus an **Expand-to-Focus** button (`720px`).
  - **Readability**: Enforced `max-w-[70ch]` line length, full paragraphs with no truncation, `1.58` line height, and spacious numbered finding cards.
  - **Mobile**: Full-height bottom sheet (`calc(100dvh - var(--safe-top) - 0.5rem)`) with a drag handle, `visualViewport` keyboard-aware sticky composer, and safe-area padding.
  - **Single Close Button**: The floating launcher hides when Minato is open so there is only ever one close button in the panel header.

### Part 3: Apple Calendar-Inspired Desktop & Mobile Calendar
- **Fixed 6-Row Grid (`src/lib/stats.ts`, `src/components/calendar/calendar-view.tsx`, `src/app/(workspace)/calendar/page.tsx`)**:
  - `monthGrid` now generates a fixed 42-cell (6-row × 7-day) grid so switching between any months produces zero vertical layout shift.
  - **Desktop Layout**: Full-width 7-day grid plus an 8th **Weekly P&L Summary** column (`Wk 1` – `Wk 6`) showing weekly net P&L and trade count. Day number is top-left (`Today` highlighted with a filled gold circle), review status dot top-right, and tabular P&L at the bottom with proportional soft green/red surface tints.
  - **Smooth GPU-Accelerated Transitions**: Direction-aware horizontal slide + fade (`transform` and `opacity` only), staggered per-row/cell cascade (`~28ms` per row + `8ms` per column), count-up animated monthly P&L hero total (`useCountUp`), adjacent month prefetching (`prev`, `cur`, `next` memoized), and rapid-click debounce queueing.
  - **Keyboard & Controls**: `ArrowLeft` / `ArrowRight` switch months, `T` jumps to Today, `Escape` closes the day inspector, alongside an always-available `Today` button.
  - **Day Inspector & Mobile Experience**: Clicking a day opens a translucent Apple Calendar-style inspector popover on desktop or a draggable bottom sheet on mobile with that day's trades, notes/lessons, mistake badges, and quick actions (`Replay`, `Autopsy`, `Add trade`). Mobile cells display compact colored dots/markers and support horizontal left/right swipe gestures to change months.

---

## 2. Database Migrations & Order to Run Them

Run the SQL migrations in `supabase/migrations/` in sequential order:

1. `supabase/migrations/001_working_memory.sql` *(existing — `working_drafts`, `active_sessions`, `processing_queue`)*
2. `supabase/migrations/002_keepalive.sql` *(existing — keepalive ping table/function)*
3. **`supabase/migrations/003_minato_memory_layers.sql`** *(NEW — creates `minato_working_memory`, `minato_semantic_memory`, `minato_episodic_memory`, and `minato_retrieval_logs` with indexes and Row-Level Security policies)*

---

## 3. Complete List of New & Modified Files

### New Files
- `supabase/migrations/003_minato_memory_layers.sql` — SQL schema and RLS policies for Working, Semantic, and Episodic memory layers plus retrieval debug logs.
- `src/lib/minato/tools.ts` — Deterministic trading math tools: exact + 10,000-run seeded Monte Carlo losing streak calculator, NQ/MNQ/ES/MES contract position sizing calculator with formula working and drawdown room checks, expectancy/profit factor/average R calculator, and query parameter parser.
- `src/lib/minato/extract.ts` — Post-turn structured JSON memory extractor, deduplicator, contradiction superseding engine, semantic parameter reader, and working memory conversation summarizer.
- `tests/minato/evals.test.ts` — 18-case evaluation and regression suite testing the exact user prompt bug reproduction, streak probabilities, MNQ/NQ/ES/MES sizing, missing-input prompt & memory persistence, contradiction superseding, journal date recall, hybrid retrieval token budgeting, and working memory summarization (18/18 PASS).
- `CHANGES.md` — This documentation file.

### Modified Files
- `src/lib/minato/router.ts` — Added `calculation` intent, `IntentCategory` classifier (`stats_question` / `calculation` / `journal_reflection` / `strategy_advice` / `small_talk`), automatic deterministic tool routing (`toolsToCall`), and per-intent memory `tokenBudget`.
- `src/lib/minato/retrieve.ts` — Enhanced hybrid retrieval (BM25 + feature-hash embeddings + RRF + confidence/recency/importance reranking + MMR diversification), enforced `tokenBudget`, and added `debug` telemetry output.
- `src/lib/minato/respond.ts` — Prioritized deterministic streak, position sizing, and expectancy math tools before generic keyword branches; eliminated false-positive directional/instrument breakdown replies on sizing/streak questions; added single-turn missing-input prompt.
- `src/lib/minato/context.ts` — Preserved full chronological trade history in `buildContext` so live data tools and historical date lookups never miss older trades.
- `src/lib/minato/bridge.ts` — Added `edit`, `add`, `delete`, `pin`, and retrieval debug log actions to `applyMemoryOp` and `useMindView`.
- `src/app/api/minato/chat/route.ts` — Wired deterministic math tools (`streakProbability`, `positionSizing`, `expectancyStats`), working memory summarization, and strict answer-quality rules into the server chat endpoint.
- `src/components/settings/minato-memory.tsx` — Upgraded `Settings → MINATO` memory view with semantic parameter cards, inline editing, adding facts, pinning, deleting, restoring superseded history, and live retrieval debug logging.
- `src/components/ai/minato.tsx` — Redesigned Minato into a desktop docked right-side panel (resizable `400–640px` + expand-to-focus mode, pushes page content, `~70ch` line width, single close button) and a mobile full-height bottom sheet with drag handle, keyboard-aware sticky composer, post-turn memory extraction, and subtle `"Saved to memory"` confirmation.
- `src/components/ai/minato.css` — Styling for docked panel, left-edge resize handle, spacious finding cards, and `>= 44px` touch targets.
- `src/lib/ui-store.ts` — Added `minatoWidth`, `minatoFocused`, and `sidebarCollapsed` state actions.
- `src/app/globals.css` — Added `--minato-dock-w` and collapsible sidebar layout rules so `.app-main` smoothly shifts when Minato is docked on desktop, plus Apple HIG spring motion variables.
- `src/components/shell/nav.tsx` — Added collapsible sidebar support on desktop and tablet with `>= 44px` hit targets.
- `src/lib/stats.ts` — Updated `monthGrid` to return a fixed 6-row (42-cell) grid to prevent layout shift between months.
- `src/components/calendar/calendar-view.tsx` — Redesigned calendar with fixed 6-row height, 8th weekly P&L summary column on desktop, top-left day numbers with filled circle on Today, soft green/red tints, direction-aware slide+fade with per-row/cell stagger, count-up animated header total, adjacent month prefetching, debounced rapid clicks, `ArrowLeft`/`ArrowRight`/`T` keyboard shortcuts, desktop popover inspector, and mobile swipe + bottom sheet inspector.
- `src/app/(workspace)/calendar/page.tsx` — Unified the standalone `/calendar` route around the upgraded `CalendarView` with direct trade creation support.
- `tests/run-all.ts` — Registered `./minato/evals.test.ts` in the main test runner.
