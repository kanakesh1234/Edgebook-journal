# P&L live-glide fix

Copy over the project root (paths preserved). 5 files replaced, nothing added, no new keys.

`src/components/backtesting/`: `chart.tsx`, `ej.css`, `ej-number.tsx`, `top-toolbar.tsx`, `paper-panel.tsx`

## What changed
- **Chart P&L tag now moves with the candle.** Before, it only updated when the engine committed a bar, so it jumped while the candle formed smoothly. Now the tag reads the forming candle's live price and shows `engine P&L + (live price − final close) × direction × point value × qty`, trailing a beat behind (300ms time-constant, 150ms once the candle is done). At rest and when the candle finishes it lands on the engine's exact number. Display only; fills/stops/P&L are untouched.
- **Same glide for Balance / Equity / Open P&L / Net P&L** in the top bar and Paper-Trading panel (`AnimatedNumber` got a `tau` chase mode; still writes straight to the DOM, no re-renders).
- **Font:** the whole workspace now uses the site's `--font-sans` (Inter Variable) with tabular figures, instead of an SF-first stack.
- **Tag redesign:** one quiet capsule — tinted P&L pill (green/red, colour cross-fades when the sign flips), muted "Long 1", SL / TP chips that tint when set (hover shows ×), round close button.
- **SL / TP labels:** calmer tinted kind chip instead of a solid block, hairline border that picks up the line colour on hover/drag, points-from-entry only on hover/drag. Drag, snap, ghost and zone behaviour unchanged.
- Respects `prefers-reduced-motion` (numbers jump straight to the true value).
