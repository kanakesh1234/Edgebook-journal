# Link a trade to a lesson

Copy each file into the SAME path in your project.
No new packages, no env changes, no database changes. `tsc --noEmit` and `next build` pass.

NEW (2)
- src/components/journal/lesson-links.tsx     (Link-a-lesson sheet, in-place lesson reader, Link-trades sheet)
- src/components/lessons/use-lesson-index.ts  (shared, cached, light list of lessons)

REPLACED (10)
- src/lib/types.ts                              JournalEntry.lessonIds?: string[]  (ids only, never lesson content)
- src/lib/store.ts                              setEntryLessons(), setLessonTrades()  (one save each)
- src/app/api/lessons/route.ts                  GET ?brief=1 returns the list without article bodies/comments
- src/components/journal/symbols.tsx            + link, unlink, plus glyphs
- src/components/journal/entry-detail-modal.tsx "Lessons" section on every trade
- src/components/journal/journal-model.ts       "lesson" lens
- src/components/journal/journal-sidebar.tsx    "Lessons" group in the navigator
- src/components/journal/journal-views.tsx      small lesson mark on linked trades
- src/app/(workspace)/journal/page.tsx          lesson lens, right-click "Link a lesson…", deep links
- src/app/(workspace)/lessons/[id]/page.tsx     "Trades" section + Link a trade

Deep links: /journal?trade=ID opens a trade, /journal?lesson=ID shows a lesson's trades.
Lessons stay in their own store and are never sent to Minato; trades only hold their ids.
