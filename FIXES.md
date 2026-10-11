# What was fixed

## Build-breaking (npm run typecheck / next build failed with 16 errors)
- src/lib/types.ts: added missing fields the code already used
  - TradePlan: maxLoss, newsEvents, watchMistakes
  - JournalSettings: weeklyReviews
  - ExecutionReview followUp: audit {...}, and mistakeCategorySource now allows "you"
- src/components/journal/journal-model.ts: added MistakeFilter type and the "mistake" sort key (+ sorting logic)
- src/app/(workspace)/journal/page.tsx: mistake filter now handles "any" / "none" (toolbar offered them, page ignored them) and is typed

## Deployment
- 5 AI API routes had no maxDuration (would time out on Vercel): minato/chat, minato/matrix, minato/questions, journal/audit-trade, journal/classify-mistake -> 60s
- package.json: "lint" was `next lint` with no ESLint installed (hangs/prompts) -> tsc; added "typecheck"; added engines (Node >= 22.6, needed by `npm test`)
- tests/run-all.ts: backtesting data test was never registered -> now runs
- .gitignore: ignore __MACOSX/ and *.bak
- README.md: real setup/deploy instructions

## Removed by APPLY.sh (stale, broken)
- apply.sh, APPLY.md, INSTALL.md, INTEGRATION.md, DELETED.txt, src/README.md: old patch notes (Vite/React-Router instructions, copy a lessons-next/ folder that doesn't exist)
- scripts/migrate-lessons.mjs: imports @upstash/redis and @vercel/blob which aren't installed; lessons now live in Drive

## Kept on purpose
- .data/lessons.json: used at runtime as the seed for Drive lessons - keep it committed.
