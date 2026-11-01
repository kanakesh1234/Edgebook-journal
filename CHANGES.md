# EdgeBook Update — Minato Memory, Jarvis/Siri Task Execution, Apple HIG Reminder Pop-ups, ForexFactory Major News Autofill & Desktop Calendar

## 1. Summary of Changes & Architectural Decisions

### Part 1: Minato Multi-Layer Memory System, Jarvis/Siri Task Engine, Apple HIG Reminder Pop-ups & ForexFactory Major News
- **Problems Fixed**:
  1. **Streak & Position Sizing Bug**: Asking *"with this win rate, what's the maximum longest losing streak possible, and the position size for NQ micro or mini with exact numbers"* previously returned an unrelated directional/instrument breakdown. It now calls deterministic math tools (`computeStreakTool`, `computePositionSizingTool`) and reports exact numbers, formula working, assumptions, and sample-size caveats.
  2. **Trader First Name (`Nandigam`, never `kanakesh939264`)**: `resolveTraderFirstName` (`src/lib/minato/blueprint.ts`) prioritizes `settings.fullName` / `settings.traderName`, strips email domains and trailing numeric IDs, and formats the trader's real first name (`"Nandigam"`).
  3. **Jarvis / Siri / Bixby Task & Action Engine (`src/lib/minato/actions.ts`)**:
     - **Launch Trade Replay Directly (`replay_trade`)**: Saying *"can you take me to play of this trade now from here"*, *"replay this trade"*, *"play my last trade"*, *"replay my 2026-10-15 trade"*, or *"replay my longest hold trade"* resolves the exact trade (from date, superlative, or recent conversation history), builds the replay session via `planJournalReplay`, initializes `useBacktest`, and immediately routes to `/backtesting/session?id=<sessionId>`.
     - **Open Trade in Journal or Quick Autopsy (`open_trade_journal`, `open_trade_autopsy`)**: Saying *"open this trade in journal"* or *"take me to autopsy of this trade"* navigates directly to `/journal?trade=<id>` or `/review/<id>` (never outputting placeholder strings like `/journal/review/[id]`).
     - **Contextual & Direct Navigation (`navigate`)**: Saying *"where can I see that navigate me to there"*, *"take me there"*, *"open Trading Lab"*, *"start The Matrix"*, *"launch ICT Lab"*, or *"open Math Duel"* resolves the target route (either from the current command or what Minato just mentioned in the previous turn) and navigates the app immediately.
     - **Workspace Mutations**: Supports *"set my daily loss limit to $300"*, *"set consecutive loss stop to 3"*, *"set max trades per day to 3"*, *"mark today as a no-trade day"*, *"log a new trade"*, *"switch primary challenge to Paper"*, and *"switch to dark/light mode"*.
  4. **Minato "Remember & Apple HIG Reminder Pop-up" System (`src/lib/minato/reminders.ts`, `src/components/ai/minato-reminder-popup.tsx`)**:
     - Telling Minato *"remember to wait for the 9:45 candle close"*, *"minato remember no trading during CPI"*, *"remind me not to chase the first 5m candle"*, or *"remind me in 15 minutes to check NQ"* saves the rule to both Semantic Memory and Minato's active Reminder Store.
     - Surfaces a **translucent Apple HIG Notification Banner (`MinatoReminderPopup`)** with frosted material (`backdrop-blur-2xl backdrop-saturate-180`), concentric `22px` corners, spring motion (`cubic-bezier(0.32, 0.72, 0, 1)`), and **minimal, straight-to-the-point text** (`<= 72 chars`), complete with `15m` snooze and `Got it` actions.
     - Automatically pops up **when needed**: immediately as a confirmation preview when saved, at the scheduled timestamp for timed reminders, and right before planning or logging a trade (`PlanTradeFlow` & `EntryFormModal`).
  5. **Everyday Major-Impact News Autofill from ForexFactory & Trade News Profiling (`src/lib/minato/forexfactory.ts`, `src/app/api/minato/news/route.ts`, `src/components/journal/use-forexfactory-news.ts`)**:
     - Live server endpoint (`/api/minato/news?date=YYYY-MM-DD`) fetches ForexFactory's weekly economic calendar feeds (`nfs.faireconomy.media/ff_calendar_thisweek.json` & `ff_calendar_nextweek.json`) and filters **strictly for Major-Impact (`impact === "High"` / Red-Folder) events** converted to New York trading time (`America/New_York`, `HH:MM` 24h + `hh:mm AM/PM NY`).
     - In **Plan a Trade (`PlanTradeFlow`) → News Events**, Minato automatically checks ForexFactory and **autofills the News Events list and exact NY times ONLY if there are Major-Impact (Red-Folder) events** (or selects `No news` if there are no major events), alongside an **"Ask Minato · ForexFactory"** pill button and status banner.
     - **Profiled in Every Trade**: Every trade in `PlanTradeFlow` (Log trade step), `EntryFormModal` (Timing step), and `EntryDetailModal` (Journal Trade Sheet) displays a **ForexFactory Major News** profile card listing that date's high-impact releases and exact NY times, plus an automatic warning if the trade entry was taken within `±15 min` of a red-folder release.

### Part 2: Apple HIG-Inspired Responsive UI & Docked Minato Chat
- **Docked Minato Panel (`src/components/ai/minato.tsx`, `src/components/ai/minato.css`, `src/lib/ui-store.ts`)**:
  - **Desktop**: Docked right-side panel (`--minato-dock-w`) that pushes `.app-main` content left so it never covers the calendar or dashboard. Includes a left-edge drag handle (`400–640px`), **Expand-to-Focus** button (`720px`), `max-w-[70ch]` line length, and a single close button.
  - **Mobile**: Full-height bottom sheet with a drag handle, `visualViewport` keyboard-aware sticky composer, and safe-area padding.

### Part 3: Apple Calendar-Inspired Desktop & Mobile Calendar
- **Fixed 6-Row Grid & Silky Transitions (`src/lib/stats.ts`, `src/components/calendar/calendar-view.tsx`, `src/app/(workspace)/calendar/page.tsx`)**:
  - Fixed 42-cell (6-row × 7-day) grid + 8th **Weekly P&L Summary** column (`Wk 1` – `Wk 6`) on desktop.
  - Automatically scoped to the active **Primary Challenge** (removed the square `<select>` dropdown and footer shortcuts text).
  - Unhurried, choreographed month transitions (`AnimatePresence mode="wait"`, exit `220ms`, enter `460ms`, `cubic-bezier(0.22, 1, 0.36, 1)`) with a cascading per-row (`42ms`) and per-cell (`14ms`) stagger and count-up animated monthly P&L hero total.

---

## 2. Database Migrations & Order to Run Them

1. `supabase/migrations/001_working_memory.sql` *(existing)*
2. `supabase/migrations/002_keepalive.sql` *(existing)*
3. **`supabase/migrations/003_minato_memory_layers.sql`** *(NEW — creates `minato_working_memory`, `minato_semantic_memory`, `minato_episodic_memory`, and `minato_retrieval_logs` with indexes and RLS policies)*

---

## 3. Complete List of New & Modified Files

### New Files
- `supabase/migrations/003_minato_memory_layers.sql` — SQL schema and RLS policies for Working, Semantic, and Episodic memory layers plus retrieval debug logs.
- `src/lib/minato/forexfactory.ts` — ForexFactory High-Impact (Red-Folder) news parser, `America/New_York` time converter, deterministic US macro schedule fallback, and `findNearbyMajorNews` (±15m trade entry detector).
- `src/app/api/minato/news/route.ts` — Server GET endpoint (`/api/minato/news`) that queries ForexFactory's calendar feeds and returns strictly Major-Impact (`High`) events and NY times.
- `src/components/journal/use-forexfactory-news.ts` — Client hook `useForexFactoryNews` & `fetchMajorForexFactoryNews` with client caching and live refresh.
- `src/lib/minato/reminders.ts` — Minimal-text condenser (`<= 72 chars`), natural-language `"remember"` / `"remind me"` parser, and `useMinatoReminders` store.
- `src/components/ai/minato-reminder-popup.tsx` — Apple HIG translucent Notification Banner pop-up with minimal text, `15m` snooze, `Got it` dismiss, and background timer.
- `src/lib/minato/actions.ts` — Jarvis / Siri / Bixby task & action execution engine (`resolveMinatoTasks`, `save_reminder`, `check_forexfactory_news`, `replay_trade`, `navigate`, etc.).
- `src/lib/minato/blueprint.ts` — Complete EdgeBook Website Blueprint and `resolveTraderFirstName`.
- `src/lib/minato/tools.ts` — Deterministic trading math tools: exact + 10,000-run seeded Monte Carlo losing streak calculator, NQ/MNQ/ES/MES position sizing calculator, expectancy/profit factor/average R calculator.
- `src/lib/minato/extract.ts` — Post-turn structured JSON memory extractor, deduplicator, contradiction superseding engine, semantic parameter reader, and working memory summarizer.
- `tests/minato/evals.test.ts` — 25-case evaluation and regression suite covering math tools, memory layers, contradiction superseding, name resolution, website blueprint, Jarvis task execution, Apple HIG reminder pop-ups, and ForexFactory major news filtering (25/25 PASS).
- `CHANGES.md` — This documentation file.

### Modified Files
- `src/components/journal/plan-trade-flow.tsx` — Triggers pre-trade Apple HIG reminders on open, autofills Major-Impact ForexFactory news events & times in the News section (`Yes` + events when major news exists, `No news` otherwise), adds an **"Ask Minato · ForexFactory"** button + status banner, and profiles major news on the Log Trade step.
- `src/components/journal/entry-form-modal.tsx` — Triggers pre-trade Apple HIG reminders on open and profiles the trade date's Major-Impact ForexFactory news & times (`ForexFactoryFormProfile`) on the Timing step.
- `src/components/journal/entry-detail-modal.tsx` — Profiles every trade's Major-Impact ForexFactory news events, exact NY times, and `±15 min` entry proximity warning (`TradeNewsProfile`) inside the Journal trade sheet.
- `src/lib/minato/evolve.ts` — Broadened `applyDirectives` to capture all `"remember"` / `"remind me"` phrasings into durable semantic memory.
- `src/lib/holdtime.ts` — Added `longestHoldTrade`, `shortestHoldTrade`, `longestWinTrade`, and `longestLossTrade` summaries with exact trade IDs and formatted durations.
- `src/lib/minato/facts.ts` — Included `holdMin` on every trade row in `buildTradeRows`.
- `src/lib/minato/context-pack.ts` — Preserved trade `id`, `exitTime`, and `holdMin` in `compactRow` so the model never outputs `[id]` or `[trade-id]` placeholders.
- `src/lib/minato/router.ts` — Added `calculation` intent, `IntentCategory` classifier, automatic deterministic tool routing, and per-intent memory `tokenBudget`.
- `src/lib/minato/retrieve.ts` — Enhanced hybrid retrieval (BM25 + feature-hash embeddings + RRF + reranking + MMR) with `tokenBudget` enforcement and `debug` telemetry.
- `src/lib/minato/respond.ts` — Integrated Jarvis task commands, exact `longestHoldTrade` reporting, greeting/blueprint handlers, and deterministic math tools.
- `src/lib/minato/context.ts` — Preserved full chronological trade history in `buildContext`.
- `src/lib/minato/bridge.ts` — Added `edit`, `add`, `delete`, `pin`, and retrieval debug log actions.
- `src/app/api/minato/chat/route.ts` — Integrated `resolveMinatoTasks`, `enrichActionsFromReplyText`, `longestHoldTrade` facts, `resolveTraderFirstName`, and `SITE_BLUEPRINT_PROMPT_TEXT`.
- `src/components/settings/minato-memory.tsx` — Upgraded `Settings → MINATO` memory view with semantic parameter cards, inline editing, adding, pinning, deleting, and retrieval debug mode.
- `src/components/ai/minato.tsx` — Added `executeMinatoAction` handlers for `save_reminder` and `check_forexfactory_news` and mounted `<MinatoReminderPopup />` globally.
- `src/components/ai/minato.css` — Styling for docked panel, left-edge resize handle, and `>= 44px` touch targets.
- `src/lib/ui-store.ts` — Added `minatoWidth`, `minatoFocused`, and `sidebarCollapsed` state actions.
- `src/app/globals.css` — Added `--minato-dock-w` and collapsible sidebar layout rules.
- `src/components/shell/nav.tsx` — Added collapsible sidebar support on desktop and tablet.
- `src/lib/stats.ts` — Updated `monthGrid` to return a fixed 6-row (42-cell) grid.
- `src/components/calendar/calendar-view.tsx` — Redesigned calendar with fixed 6-row height, weekly P&L summary column, primary challenge scoping, choreographed slide+fade with cascading row/cell stagger, and day inspector.
- `src/app/(workspace)/calendar/page.tsx` — Scoped `/calendar` directly to the active Primary Challenge.
- `src/app/(workspace)/journal/page.tsx` — Added `edgebook:open-trade` event listener so Minato can open any trade sheet instantaneously even when already on `/journal`.
- `tests/run-all.ts` — Registered `./minato/evals.test.ts`.
