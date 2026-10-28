# edgebook fixes — copy each file to the SAME path in your project

NEW (3)
- src/app/api/drive/backtests/route.ts
- src/lib/plan-review.ts
- src/components/journal/plan-vs-trade.tsx

REPLACE (9)
- src/lib/backtesting/persistence.ts
- src/lib/backtesting/store.ts
- src/app/(workspace)/backtesting/session/page.tsx
- src/components/journal/replay-trade.tsx
- src/components/journal/entry-detail-modal.tsx
- src/components/journal/plan-trade-flow.tsx
- src/components/journal/win-odds-card.tsx
- src/components/journal/flow-ui.tsx
- src/lib/prediction/outlook.ts

DELETE (optional, as DELETED.txt already says): src/components/journal/outlook-card.tsx

No new packages, no env changes. `npx tsc --noEmit` and `npm test` pass with all of these in place.
If you edited any replaced file after zipping, merge instead of overwriting.
