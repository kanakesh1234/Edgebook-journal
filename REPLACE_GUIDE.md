# EJ Backtesting Upgrade — Replace Guide

No new npm dependencies. No data-structure, API, engine, store or persistence changes.

## Replace (4 existing files)
| Path | What changed |
|---|---|
| `src/components/backtesting/chart.tsx` | Progressive candle formation, new SL/TP/order drag (magnet, Esc-cancel, grab offset), overlay + watermark wiring |
| `src/components/backtesting/replay-toolbar.tsx` | "Candle formation" (Natural / Smooth / Instant) in the speed menu, playing state on the play button |
| `src/components/backtesting/top-toolbar.tsx` | EJ monogram next to the back button |
| `src/app/(workspace)/backtesting/session/page.tsx` | One line: `import "@/components/backtesting/ej.css"` |

## Add (5 new files)
- `src/components/backtesting/ej.css` — EJ layer, loaded after `tv.css`
- `src/components/backtesting/risk-handles.tsx` — floating SL / TP / order handles
- `src/components/backtesting/candle-animator.ts` — rAF candle former
- `src/components/backtesting/ej-mark.tsx` — EJ monogram
- `src/lib/backtesting/playback-fx.ts` — formation setting (localStorage `ej.backtest.formation`) + intra-bar path maths

## Migration
None. `npm run typecheck` shows no errors in these files (the existing `gsap`/`lenis` errors in `landing/*` are unrelated and come from missing installs).

## Behaviour notes
- **SL/TP**: hover a level (cursor becomes ns-resize), drag it. The label shows price, projected P&L and points live. Levels pull to visible highs/lows, entry, last price and round numbers within 7px; hold **Alt** for tick-only movement. **Esc** cancels a drag. A dotted ghost line marks the original level. SL/TP stay on their valid side of price, as before. Hover the label for a × to remove it.
- **Candle formation**: only the *visual* bar is animated (open → wicks → close over ~82% of the bar interval, scaled by playback speed). The engine, fills, stops and P&L still use the final bar, so results are identical with animation on or off. Skipped automatically for background tabs, `prefers-reduced-motion`, jumps, step-back and data reloads.
- The live BUY/SELL pill prices follow the forming candle.
- Price lines for SL/TP/orders now render only the axis label (`lineVisible: false`); the overlay draws the line, zone and label.
- Chart-side visuals keep your existing candle colours/appearance settings; the EJ accent applies to chrome only.

## Not verified here
I typechecked and unit-checked the candle path maths (forming bar never exceeds the final high/low and ends exactly on the final OHLC) but did not run the app in a browser, so please eyeball the SL/TP label placement and animation feel in `npm run dev`.
