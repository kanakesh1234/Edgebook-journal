# EJ workspace — Apple-grade pass (REPLACE_GUIDE)

Copy the ZIP contents over the project root (paths preserved). This file replaces the previous pass's `REPLACE_GUIDE.md`.

## Files
**Replace (30):** `session/page.tsx`, `chart.tsx`, `context-menu.tsx`, `drawing-toolbar.tsx`, `ej-mark.tsx`, `ej.css`, `floating-tools.tsx`, `indicators-layer.tsx`, `indicators-menu.tsx`, `left-toolbar.tsx`, `order-ticket.tsx`, `paper-panel.tsx`, `range-bar.tsx`, `replay-toolbar.tsx`, `replay-trade-banner.tsx`, `risk-handles.tsx`, `session-results.tsx`, `settings-dialog.tsx`, `top-toolbar.tsx`, `tv-icons.tsx`, `tv-ui.tsx`, `tv.css`, `use-draggable.ts` (all under `src/components/backtesting/`, page under `src/app/(workspace)/backtesting/session/`).

**Add (11):** `ej-tools.css`, `ej-tooltip.tsx`, `tip-parse.ts`, `ej-toast.tsx`, `ej-number.tsx`, `favorites-bar.tsx`, `fav-geometry.ts`, `tool-catalog.ts` (components/backtesting), `src/lib/backtesting/ui-prefs.ts`, `tests/backtesting/favorites.test.ts`.

No new dependencies. Trading engine, store logic, data structures and shortcuts untouched.

## Migration
New localStorage keys (all optional, safe defaults):
| key | value |
|---|---|
| `ej.backtest.favorites` | `{v:1,tools:[toolIds]}` — default: crosshair, trend-line, horizontal-line, fib-retracement, rectangle, long-position, measure, text |
| `ej.backtest.favorites.ui` | `{visible,autoHide,compact,vertical,pos}` — **bar is hidden by default** |
| `ej.backtest.rail` | `"open"` \| `"hidden"` |
| `ej.backtest.lastTools` | `{groupId: toolId}` last-used sub-tool per flyout |

Existing appearance / drawings / session data: unchanged. Optional: add `import "./backtesting/favorites.test.ts"` to `tests/run-all.ts`.

## Notes / decisions
- In this ZIP the old floating palette only existed in panels-hidden (focus) mode (`floating-tools.tsx`). The new **Favorites bar** is a separate, editable component shown in normal mode; focus mode keeps the restyled `FloatingTools`.
- Flyouts use the 16px panel radius (system scale 8/12/16/20) instead of 14px, to stay on-grid.
- Native `title` tooltips are gone: use `data-tip="Label (Alt+T)"` (auto-splits the shortcut into key chips) on any element.
- Old watermark over candles removed. Old gold accent replaced by EJ blue (`--tv-active`); red/green kept for trading meaning only.
- Rail collapse animates width, so the chart's existing ResizeObserver fires during the 280ms transition (no effect on data).

## Before → after, per surface
- **Left toolbar** — mixed hand-drawn glyphs, flat buttons → one 24-grid / 1.6px icon set with filled active variant; 40×40 buttons, spring press, leading accent bar; sections (Cursors·Draw·Measure·Annotate·Utilities) with hairlines; last-used sub-tool + hover-only chevron; collapsible rail.
- **Flyouts** — web dropdown → 16px material panel, spring-in, small-caps headers, icon+label+kbd pill, star per row, ↑↓ ←→ Enter Esc, viewport-clamped.
- **Favorites bar** — new: hidden by default, star-to-add, drag-reorder (FLIP), hover ×, right-click remove, reset, compact/labels, horizontal/vertical, draggable with 8px edge/corner snap + haptics, avoids legend/replay/ticket/price scale, auto-dims to 35%, persisted.
- **Top toolbar / dropdowns** — title tooltips, no a11y → data-tip, aria-haspopup/expanded, menu roles + arrow nav, checkmarks on selected, count-up balance/P&L.
- **Chart-type & indicators menus** — checkmarks, search labelled, icon-only actions with names, empty state with EJ mark.
- **Alert popover** — loose inline styles → tokenised input, toast on create, Undo on remove.
- **Replay bar** — flat → 16px floating panel, gradient play button (breathing while playing), speed/formation radio menus with checks.
- **Trade pill / position tags** — hard edges → 12px radius, soft shadow, tabular numerals, symbol ✕ → icon.
- **Order ticket** — dialog roles, segmented control with pressed states, focus-glow inputs, spring open.
- **SL/TP handles** — preserved (rAF); weights/sizes on the shared scale, native titles → tooltips.
- **Context menu** — roles + keyboard path, auto-focus, truncation tooltip; copy/alert/remove give toasts (remove has Undo).
- **Drawing properties** — selected colour/width/style show a ring/check; Clone/Hide/Remove toasts (Undo/Show).
- **Color pickers** — 28px swatches, selected ring, labelled custom input.
- **Settings dialog** — aria-modal, focus in/out, Esc, solid 20px modal (single blur layer), reset has Undo.
- **Range bar** — ALL-CAPS status → pill with live dot; labelled toggles with aria-pressed.
- **Paper panel / tables / tabs** — numeric columns right-aligned tabular, tablist roles, gradient tab indicator, animated stats, empty states with EJ mark + hint.
- **Session results** — EJ monogram header, Net P&L counts up (≤250ms), name wraps instead of truncating.
- **Toasts / banners** — two ad-hoc toasts → one toast system (EJ badge, action, hover-pause); banners restyled.
- **Loading / empty / error** — spinner → candle skeleton shimmer + EJ mark; empty & error cards with icons/actions.
- **Scrollbars / focus / cursors** — thin rounded scrollbars; accent focus ring on every control; accent caret/selection/`accent-color`; grab/grabbing on grips.

## Validation run
- `tsc --noEmit`: only the pre-existing `landing/*` gsap/lenis errors remain.
- `tests/backtesting/favorites.test.ts` (snap, clamp, edge persistence across resize, obstacle avoidance, reorder, tooltip parsing) passes; existing suite passes.
- Icon sheet rendered at 18/20/22px, regular + filled, light + dark; all glyphs legible.
- Not verified here: in-browser visual QA (no browser in my sandbox) — please eyeball rail flyouts and the favorites bar on your hardware.
