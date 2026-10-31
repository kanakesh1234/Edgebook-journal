# REPLACE_GUIDE — EdgeJournal Backtesting Mobile

Generated: 2026-10-31  
Scope: `src/components/backtesting/` and `src/app/(workspace)/backtesting/session/`  
Desktop: **unchanged** — all mobile rules are behind `@media (max-width: 820px)` / `(pointer: coarse)` guards.

---

## Files Modified / Added

| File | Status | Notes |
|------|--------|-------|
| `src/components/backtesting/tv.css` | **Modified** (appended) | Mobile layout shell, safe-area vars, sheet base classes, paper panel peek, toasts repositioned |
| `src/components/backtesting/ej.css` | **Modified** (appended) | Input font-size ≥16px, ticket button heights, SL/TP remove visibility |
| `src/components/backtesting/ej-tools.css` | **Modified** (appended) | Flyouts → bottom sheets, favorites bar repositioned, loupe, dock, toasts above dock |
| `src/components/backtesting/mobile-sheet.tsx` | **NEW** | Reusable bottom sheet with swipe-to-dismiss, snap math, loupe/hitarea utilities |
| `src/components/backtesting/top-toolbar.tsx` | **Modified** | `useMobileUI()` hook, mobile `•••` overflow sheet, P&L chip, dropdowns → `MobileSheet` |
| `src/components/backtesting/left-toolbar.tsx` | **Modified** | `MobileDock` bottom bar, `MobileSheet` for full tool list, mobile-aware `openFly()` |
| `src/components/backtesting/replay-toolbar.tsx` | **Modified** | Speed/formation → `MobileSheet` on touch; prev/next day → `•••` sheet; `touchAction` |
| `src/components/backtesting/order-ticket.tsx` | **Modified** | `inputMode="decimal"`, `fontSize: 16` on all inputs, drag handle, 44px close button |
| `src/components/backtesting/paper-panel.tsx` | **Modified** | Drag handle, `data-label` on all `<td>` (card view), 44px action buttons, `touchAction` |
| `src/components/backtesting/__tests__/mobile-utils.test.ts` | **NEW** | Unit tests: `nearestSnapPoint`, `loupeOffset`, `isWithinHitArea` |

---

## New localStorage Keys

**None.** All existing keys are preserved and unchanged:
- `ej-ui-prefs` (ui-prefs.ts) — no new keys added
- `ej-backtest-*` (store.ts) — unchanged
- No new persistent state was introduced.

---

## Before → After Per Surface

### Top Bar

| | Before | After (≤820px / touch) |
|-|--------|------------------------|
| Height | 44px, full-width scrollable | 44px single row, `overscroll-behavior: none` |
| Undo/Redo | Always visible | Hidden on mobile → moved to `•••` sheet |
| Settings/Theme/Fullscreen/Screenshot | Always visible | Hidden on mobile → moved to `•••` sheet |
| Account stats (Balance/P&L/Trades) | Always visible inline block | Collapsed to single tappable **P&L chip**; tap shows toast with full stats |
| Overflow | None | `•••` button opens `MobileSheet` with: Screenshot, Undo, Redo, Theme, Settings, Focus mode |
| Symbol dropdown | Inline `tv-menu` | `MobileSheet` (searchable) with ≥48px rows |
| Timeframe dropdown | Inline `tv-menu` | `MobileSheet` (searchable) with grouped rows |
| Chart-type dropdown | Inline `tv-menu` | `MobileSheet` with icon rows |
| Alert dropdown | Inline popover | `MobileSheet`; input has `inputMode="decimal"`, `fontSize: 16` |
| Trade button | 28px height | `touchAction: manipulation`, `font-size ≥ 16px` (via CSS) |

### Dropdowns (symbol, TF, chart type, alert)

| | Before | After (≤820px / touch) |
|-|--------|------------------------|
| Rendering | `position: relative` inline `tv-menu` (can clip off-screen) | `MobileSheet`: fixed bottom sheet, 20px top radius, drag handle, backdrop dismiss |
| Items | 36px height | ≥48px via `.ej-sheet-row` |
| Search | None (TF) | Searchable sheet (`searchable` prop) |
| Dismiss | Click outside | Swipe-down ≥80px, backdrop tap, Escape key |

### Rail / Flyouts

| | Before | After (≤820px / touch) |
|-|--------|------------------------|
| Left rail | 56px fixed column | Hidden on phones (≤480px or `pointer:coarse`+≤820px) |
| Flyouts | `position: fixed` with JS top/left coordinates | Bottom sheet via CSS override; no JS coordinate calc on mobile |
| Flyout items | 40px | 52px with `touchAction: manipulation` |
| Flyout star | Hover-only visible | Always visible on `(hover: none)` |
| Caret button | Hover-only visible | 0.7 opacity always on `(hover: none)` |
| Dock | None | **New** `.ej-mobile-dock`: 64px bottom bar with Cursor, TrendLine, HLine, LongPos, ShortPos, More (full tool list sheet) |
| Active tool indicator | Left-edge 2px accent | Same on desktop; dock button `.is-on` on mobile |

### Drawing on Touch

| | Before | After |
|-|--------|-------|
| Two-finger gestures | Could accidentally start a drawing | `openFly()` bails early on mobile; `touch-action: none` on canvas in tv.css |
| Hover-only affordances | Tooltips, caret, star only on `:hover` | `(hover: none)` block removes sticky hover states; star always visible; caret always visible |
| `-webkit-tap-highlight-color` | Default (blue flash) | `transparent` on all interactive elements |
| `touch-action: manipulation` | Missing on most buttons | Added to all dock, sheet, ticket, toolbar buttons |

### Replay Bar

| | Before | After (≤820px / touch) |
|-|--------|------------------------|
| Prev/Next day | Always visible | Hidden on mobile → `•••` sheet |
| Speed dropdown | Inline `tv-menu` | `MobileSheet` on touch |
| Formation mode | Inside speed menu | Same sheet, section-separated |
| Play button | 36px | 52px via CSS `.tv-play` rule |
| Secondary overflow | None | `•••` opens `MobileSheet` with Prev day, Next day |
| `touchAction` | Missing | `manipulation` on all buttons |

### Order Ticket

| | Before | After |
|-|--------|-------|
| Drag handle | None | 36×4px pill at top |
| Close button | 28px | 44px on touch |
| All numeric inputs | No `inputMode` | `inputMode="decimal"`, `style.fontSize = 16` (prevents iOS zoom) |
| Buy/Sell/Close buttons | Default height | 52px on touch (CSS), `touchAction: manipulation` |
| Segment (Market/Limit/Stop) | Default | `touchAction: manipulation` |

### SL/TP Handles (risk-handles.tsx)

| | Before | After |
|-|--------|-------|
| Remove (×) button | Hover-only visible | Always visible on `(hover: none)` (CSS in `ej.css` / `ej-tools.css`) |
| Haptic on snap | Not wired | `haptic.selection()` available in `src/lib/haptics.ts` — wire into rAF loop when `snap.is-on` toggles |

### Paper Trading Panel

| | Before | After |
|-|--------|-------|
| Position | `flex: none` at bottom of `.tv-main` | `position: fixed; bottom: 0` on mobile (CSS in tv.css) |
| Drag handle | None | 36×4px pill at top of `.tv-paper-bar` |
| Expand/Collapse | Click `.tv-paper-title` | Same + `touchAction: manipulation` |
| Tables | Horizontal-scroll `<table>` | Card rows on ≤820px via `[data-label]::before` CSS (all `<td>` now have `data-label`) |
| Tab buttons | Default | `touchAction: manipulation` |
| Action buttons (Close/Cancel) | Default `tv-linkbtn` | `minHeight: 44, minWidth: 44, touchAction: manipulation` |

### Settings Dialog

| | Before | After (≤820px / touch) |
|-|--------|------------------------|
| Position | Centered modal | Full-screen sheet via CSS in tv.css (`.tv-settings-wrap`) |

### Toasts

| | Before | After |
|-|--------|-------|
| Position | `right: 16px; bottom: 56px` | `left: 8px; right: 8px; bottom: calc(72px + env(safe-area-inset-bottom))` — above dock |
| Width | `max-width: 380px` | Full-width `stretch` on mobile |
| Swipe to dismiss | No | `touch-action: pan-x` on `.ej-toast` |

### Session Results

| | Before | After |
|-|--------|-------|
| Layout | Desktop grid | Single column on mobile (CSS in tv.css) |
| Actions | Inline | Sticky footer via CSS |

---

## What Could NOT Be Verified in a Real Browser

1. **LightweightCharts pinch-zoom** — `touch-action: none` on canvas delegates to library; two-finger pan+pinch must be validated on a real device.
2. **Paper panel drag snap** — Peek/half/full is CSS class-based; true spring-snap requires JS gesture (`touchstart`/`touchmove`/`touchend`) not yet wired on the panel element.
3. **Loupe rendering** — `.ej-loupe` CSS is complete; the DOM element and `loupeOffset()` call must be wired inside `drawings/controller.ts` on `touchmove` (not yet done).
4. **Haptic on SL/TP snap** — `haptic.selection()` is available; wiring into the `risk-handles.tsx` rAF loop when `.ej-rh-snap.is-on` toggles is pending.
5. **Drawing two-finger guard in controller.ts** — `openFly()` is guarded; the drawing stroke itself should also check `e.touches.length > 1` before initiating — not yet modified in `controller.ts`.
6. **iOS safe-area notch** — Requires physical device or accurate simulator; `viewport-fit=cover` is already set in `src/app/layout.tsx` ✅.
7. **Font scale 130%** — Layout at system-level large font not validated.
8. **Android 300ms delay** — `touch-action: manipulation` applied everywhere; verify no double-tap zoom remains on Chrome Android.
