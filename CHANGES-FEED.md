# Edgebook — Feed, responsive fixes, Supabase keepalive

## What's new

### Feed (`/feed`) — a vertical, swipeable study feed
- **Phone:** full-screen cards, one per swipe (scroll-snap). Feed replaces **Lessons** in the phone tab bar (Lessons stays in the menu and on tablet/desktop; lesson cards also appear in the Feed).
- **Tablet:** centred card column. **Desktop:** card column + side panel (today's stats, keyboard shortcuts). **Landscape phone:** chart left, controls right.
- **Cards are built from data you already have:**
  - *Trades* from your journal: the chart screenshot, and an **interactive replay** for any trade with entry time + direction. It uses the same planner and candle loader as your full replay (`planJournalReplay`, `loadSymbolCandles`), with play/pause, step, scrub, 1×/2×/4×, and your real entry/stop/target/exit. "Open full replay" launches the existing workspace.
  - *Setups* from your playbook, with win rate and avg R from your linked trades.
  - *Lessons*, yours and your friends' (same `/api/lessons`; like uses the existing action).
- **Personalised, explainable, deterministic:** every card shows why it's there ("Because you saved Opening range reclaim", "A recent loss, worth a second look"). Saving things lifts similar cards. No randomness; the order is frozen for the visit so it never reshuffles under your thumb.
- **Favorites, collections** (create / rename / delete / add), **progress** (cards, replays, lessons, 14-day chart) and **milestones**.
- **Community = friends' lessons only.** Your friends API deliberately shares only competition-safe aggregates, so no one's trades or charts ever appear.

### Healthy-use design (deliberately no dark patterns)
- The feed is **finite** (max 20 cards + a "You're all caught up" card). No infinite scroll, no pull-to-refresh, no "load more".
- **Daily time reminder** (default 20 min; 10/20/30/45/off). It's a prompt, not a lock: take a break, or 5 more minutes. After two extensions the copy suggests stopping. Time counts only while the tab is visible.
- **No streaks.** Milestones are cumulative and can't be lost ("seven days of study" counts *any* seven days).
- Replays **never autoplay** unless you turn that on; reduced-motion is respected; haptics can be turned off.

### Music (optional, off by default)
- **Edgebook ships no songs.** Two sources: (1) built-in ambience synthesised in the browser (original, no licence question); (2) **your own audio files** (e.g. Telugu tracks you own or are licensed to use).
- Adding a file requires ticking "I own this audio or have a licence to use it"; an optional licence note is stored with it.
- Files live **only in this browser** (IndexedDB). They are never uploaded and never go to Drive, so they won't appear on other devices (the Drive copy of your settings remembers only *which* source you chose; if the file is missing it falls back to ambience).
- Music plays only while a replay is playing, stops when you pause, leave the card, or hide the tab, and never starts by itself.

### Persistence (Google Drive preserved)
- Feed data lives at `settings.feed` and is saved through the existing guarded `updateSettings` → `/api/drive/data` path. **No server changes.**
- Saves are **debounced (1.5 s)** and flushed when the tab is hidden, because every save uploads the whole journal. Per-card "seen" markers and the session timer stay on-device.
- If the Drive load failed, nothing is written (existing guard, plus an explicit check). Saved lessons are never auto-pruned from a failed lesson fetch.
- State is bounded (≤400 favorites, ≤24 collections × 150 items, 60 days of history) and validated on load. At every cap it's well under 400 KB (limit test included).

## Fixes to existing screens
| Where | Problem found | Fix |
|---|---|---|
| Journal (phone) | Header buttons overflowed the screen by up to 106 px, pushing the tab bar off-screen | Header stacks on phones |
| All pages, phones | Small buttons below 40 px | `pointer-coarse:` sizes only on touch devices (Button `sm`, icon buttons, segmented controls, month nav, presets, logo link); desktop unchanged |
| Tablet rail, landscape phone | Only ~1.5 nav items visible | Whole rail scrolls on short screens |
| Calendar | 9 px text | 10 px |
| Minato | Edge handle would sit under the Feed's action buttons | Hidden on the phone Feed only |

## Supabase (your inactivity warning)
Supabase is only an **advisory** layer in Edgebook (draft recovery, tab presence); Drive is the source of truth, so a pause costs recovery features but **no trades**. It also isn't on the load path, so it can't make pages faster, and moving data into it would risk stale data overwriting Drive. Instead I added a **keepalive**:
1. Run `supabase/migrations/002_keepalive.sql` once in the Supabase SQL editor (a one-row read-only table).
2. In Vercel → Settings → Environment Variables add **`CRON_SECRET`** (any long random string), then deploy. `vercel.json` calls `/api/cron/supabase-keepalive` every 3 days.
3. After deploying, trigger it once to confirm: `curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-domain>/api/cron/supabase-keepalive` → `{"ok":true,"status":200}`.
Using the app also generates activity. If it does pause, restore it from the dashboard within 90 days. Pro plan avoids pausing.
**Security note:** `.env.local` in the zip you sent contains live keys. I didn't use or print them, but consider rotating them since the archive was shared.

## Merge note (update 2)
This build is based on **your newer upload (`ox-test_2.zip`)**, not the original. Of the files you changed, two also had small touch-target edits from me (`src/components/dashboard/today-panel.tsx`, `src/components/journal/flow-ui.tsx`); they were **three-way merged with no conflicts**, so your changes there are kept (your daily-limit / risk-companion work is untouched). Your other changed and added files are not in this zip and must not be replaced.
Your `setDayLimit` / `settings.dayLimits` and the Feed's `settings.feed` both ride the same `updateSettings` path and don't interfere. Your new global rule hiding the outline on text inputs doesn't remove keyboard focus visibility in the Feed (inputs show a gold border; sliders and checkboxes are excluded from your rule).
Also fixed: rapid keyboard stepping (J/K) could repeat a card while a smooth scroll was still in flight; it now tracks the intended destination (stress-tested with 40 presses 40 ms apart).

## How it was tested (and what wasn't)
Run here: `tsc --noEmit` clean · existing 62 assertions + **30 new Feed checks** (mutation-checked: deliberately breaking three behaviours made the tests fail) · **47 end-to-end checks** driving the real UI (replay playback, debounced Drive writes, collections, reload-hydration, keyboard, session prompt, audio gate) · **147 page × screen-size renders** (21 routes × 7 sizes from 360 px phone to 1440 px desktop): 0 console errors, 0 horizontal overflow, 0 page-scroll behind the Feed.

**Not verified** (couldn't be, here): a real `next build` / `next dev` (the bundled compilers are macOS-only; I used a harness that renders your real components with Next shims) · real Google Drive and Supabase network calls (mocked) · the new cron route (typechecked, not executed) · real market-data responses (deterministic mock candles) · real devices, iOS Safari audio, haptics · actual speed gains (I made structural choices, lazy-loaded chart library, debounced writes, but didn't measure on production).

**Known leftovers:** some touch targets remain under 40 px (calendar day cells, landing marketing links, the TradingView attribution link, Minato's edge handle, which are intentional or licence-required); 10 px tab-bar labels are intentional. Backtest sessions are device-only (IndexedDB), so they aren't in the Feed. Please run `npm run build` and click through `/feed` on a real phone before shipping.
