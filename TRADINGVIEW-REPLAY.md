# TradingView-style replay workspace

Copy everything in this folder over your `ox-test` project (same paths), then **delete** the three
files it replaces:

    src/components/backtesting/trading-panel.tsx
    src/components/backtesting/playback-controls.tsx
    src/components/backtesting/bottom-bar.tsx

No new npm packages. Run `npm run dev`, open a backtest session.

## What changed
- **Layout** like TradingView: top toolbar, 52px left drawing toolbar, chart, bottom range bar, "Paper Trading" panel.
- **Chart**: OHLC status line with change %, on-chart SELL / qty / BUY pill, last-price line, chart types
  (candles, hollow, bars, line, area, baseline), %/log/auto/invert scales, right-click menu, snapshot, settings.
- **Drawing tools** (real, draggable, undoable): trend line, ray, info line, extended line, horizontal line/ray,
  vertical line, cross line, parallel channel, arrow, fib retracement, long/short position, price range,
  date range, date & price range, measure, brush, rectangle, ellipse, triangle, text, emoji, eraser, box-zoom.
  Magnet (weak/strong), stay-in-drawing, lock all, hide all, floating properties bar, undo/redo, copy/paste.
- **Replay**: floating bar (Jump to, step back/forward, play, speed, previous/next day), context bars to the left
  of the replay start, alerts that pause the replay, forward-only "Jump to bar".
- **Trading**: market/limit/stop from the pill, right-click menu, order ticket (Trade button) or Shift+B / Shift+S.

## Shortcuts
Alt+T trend line · Alt+H horizontal line · Alt+J horizontal ray · Alt+V vertical line · Alt+C cross line ·
Alt+F fib · Alt+S snapshot · Alt+I invert · Alt+P percent · Alt+L log · Alt+R reset view ·
Ctrl+Z / Ctrl+Y undo/redo · Ctrl+C / Ctrl+V copy/paste drawing · Del remove · Esc cancel ·
Shift while drawing = lock to horizontal/vertical · Ctrl+Alt+H hide drawings · Shift+F fullscreen ·
Shift+B / Shift+S buy / sell at market · Space play/pause · ← → step · ↑ ↓ switch instrument.

## Notes
- Indicators are intentionally not included.
- Stepping back does not undo fills (unchanged engine behaviour).
- Context bars are fetched with one extra data request per symbol; if the provider rate-limits, they are
  silently skipped and the replay still works.
- Tests: `node --experimental-strip-types --import ./tests/_alias-loader.mjs --no-warnings tests/backtesting/drawings.test.ts`
