# Phase 2 — data pipeline fix (drop-in)

Copy `src/` and `tests/` over your project (same paths, overwrite). No new packages, no env changes.
Restart `npm run dev` and hard-refresh the browser once (the IndexedDB candle cache upgrades itself to v2 and wipes old entries).

## NEW
- src/lib/backtesting/data/timeframes.ts   pure helpers: timeframe→LSE mapping, tick rounding, cache key, day-chunk planner
- src/lib/backtesting/data/loader.ts       the single loader (cache → LSE → local aggregation), explains every empty result
- tests/backtesting/data.test.ts

## CHANGED
- src/lib/backtesting/instruments.ts       MNQ→NQ.F, MES→ES.F (LSE has no micros; micro specs kept for P&L)
- src/app/api/market-data/route.ts         day-chunking, tick rounding, exclusive end, clear error codes, `meta` block
- src/lib/backtesting/data/lse-provider.ts getCandlesWithMeta + human error messages
- src/lib/backtesting/data/types.ts        CandleFetchMeta
- src/lib/backtesting/data/cache.ts        DB v2, window-aware keys, old entries purged
- src/lib/backtesting/store.ts             dataWarning; next/prev day use the loader; failed navigation keeps current day
- src/app/(workspace)/backtesting/session/page.tsx   loader, keeps replay position, error overlay with Retry, warning banner
- src/components/backtesting/chart.tsx     New York time axis/crosshair; empty data clears the chart
- tests/run-all.ts                         registers the new test

## Verify
Create a session: MNQ, New York 09:30–16:00, Thu 2026-10-08 → expect 390 candles, first bar 09:30 ET.
Pick a Saturday → expect the message "…start falls on a weekend — futures are closed."
