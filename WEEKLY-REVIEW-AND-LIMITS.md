# Daily loss limit · AI mistake sorting · More feelings · Weekly Review

Copy each file into the SAME path in your project (overwrite). No new packages, no env changes
(uses your existing OPENROUTER_API_KEY; without it the local sorter is used).
Then: `npx tsc --noEmit` and `npm test` (both pass here).

NEW
- src/lib/mistakes.ts, feelings.ts, risk.ts, weekly.ts
- src/app/api/journal/classify-mistake/route.ts
- src/components/journal/risk-meter.tsx
- src/components/practice/weekly-review.tsx, weekly-charts.tsx
- src/app/(workspace)/practice/weekly/page.tsx
- tests/journal/weekly-review.test.ts

REPLACE
- src/lib/types.ts (maxLoss, newsEvents, emotionAfter, mistakeCategory*, weeklyReviews)
- src/components/journal/plan-trade-flow.tsx, autopsy.tsx, entry-detail-modal.tsx, review-model.ts
- src/components/journal/journal-model.ts, journal-views.tsx, journal-sidebar.tsx, journal-toolbar.tsx
- src/app/(workspace)/journal/page.tsx, practice/page.tsx, dashboard/page.tsx
- src/components/dashboard/today-panel.tsx
- tests/run-all.ts

## Update 2 — Trade audit
NEW: src/lib/audit.ts, src/app/api/journal/audit-trade/route.ts
CHANGED: types.ts, mistakes.ts, autopsy.tsx, plan-trade-flow.tsx, journal-views.tsx, weekly-review.test.ts
