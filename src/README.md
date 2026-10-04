# edgebook update — Home ↔ Practise link, cascade challenge delete, bulk journal delete

Copy each file into the SAME path in your project (folders are already laid out).

NEW (3):
- src/lib/cleanup.ts
- src/lib/practice/daily.ts
- src/lib/practice/home-stats.ts

REPLACE (8):
- src/lib/store.ts
- src/lib/types.ts                      (adds optional practiceProgress.dailyStats)
- src/components/matrix/matrix-home.tsx (Home practice arcade card)
- src/components/journal/entry-card.tsx
- src/components/practice/MathDuel.tsx
- src/app/(workspace)/practice/page.tsx
- src/app/(workspace)/journal/page.tsx
- src/app/(workspace)/challenges/page.tsx

No new packages, no env changes. `npx tsc --noEmit` passes with all of these in place.
Note: if you have edited any of the 8 replaced files since you zipped the project, merge instead of overwriting.
