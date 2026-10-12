# ox-test fixes — copy these 4 files over your project (same paths)

REPLACE
- src/lib/matrix/progression.ts  — addDays() built the date in local time but read it back with toISOString() (UTC),
                                   so review due dates were off by a day in time zones at/after UTC+12 (or at/before UTC-12).
                                   Now uses local calendar parts. (tests/matrix/progression.test.ts failed under TZ=Pacific/Auckland.)
- src/lib/theme.ts               — the theme state never read the saved choice after a reload, so it reported "system / light"
                                   while the page was actually dark: wrong sun/moon icon, wrong Settings selection, light backtesting charts.
                                   Now seeded once from localStorage.
- package.json                   — adds the "typecheck" script (tsc --noEmit).
- tests/run-all.ts               — registers 3 test files that existed but never ran: tagging, csv-import, practice math.

OPTIONAL CLEANUP (delete these; they are stale drop-in notes for packages the app doesn't use)
- APPLY.md  INSTALL.md  INTEGRATION.md  DELETED.txt  scripts/migrate-lessons.mjs

Then:  npm run typecheck && npm test
