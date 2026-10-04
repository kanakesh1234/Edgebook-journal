# edgebook update 2 — chart questions, Compare view, Matrix mix, no-repeat ledger

Copy each file into the SAME path in your project (folders are already laid out).
This update builds on update 1 (it replaces practice/page.tsx and types.ts with versions that include update 1's changes).

NEW (6):
- src/lib/practice/qbuild.ts            shared question helpers
- src/lib/practice/chart-questions.ts   the new per-trade question engine (notes, behaviour, repeated mistakes, timing, chart maths)
- src/lib/practice/ledger.ts            no-repeat ledger (correct = retired, wrong = comes back)
- src/lib/practice/session.ts           builds one round: ledger filter, retries first, spread across trades, Time Machine/math/Duel mix
- src/lib/practice/duel-questions.ts    Math Duel questions inside Matrix / Boss rounds
- src/components/practice/ChartPanel.tsx  saved screenshot + Compare button + full-screen vertical compare view

REPLACE (6):
- src/lib/practice/engine.ts
- src/lib/practice/ai-validate.ts       (blocks weekday trivia and "answer already in the question")
- src/lib/practice/ai-client.ts         (sends your review answers to the AI as evidence)
- src/components/practice/DrillRunner.tsx
- src/lib/types.ts                      (adds practiceProgress.ledger)
- src/app/(workspace)/practice/page.tsx

No new packages, no env changes. `npx tsc --noEmit` passes with everything in place.
