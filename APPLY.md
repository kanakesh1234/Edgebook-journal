# Applying the Practice redesign

1. Copy everything in this zip over your project (same paths).
   `src/lib/types.ts` is deliberately NOT included, so your newer journal types stay intact.
2. Open `src/lib/types.ts` and add ONE field inside the `arena?: { ... }` block of `PracticeProgress`:

       /** Best correct count in one round at the CURRENT level (resets when the level changes). Drives the progress meter. */
       levelBest?: Record<string, number>;

3. Delete the files listed in DELETED.txt.
4. Run `npm run build`.

Safer alternative (merges instead of overwriting, keeps any edits you made since uploading):
`git apply --3way practice-redesign.patch`

New files are safe to copy. These EXISTING files are replaced, so if you edited any of them, merge by hand or use the patch:
- next.config.ts
- src/app/(workspace)/practice/page.tsx
- src/app/(workspace)/practice/progress/page.tsx
- src/components/matrix/matrix-home.tsx
- src/components/practice/ChartPanel.tsx
- src/components/practice/mode-card.tsx
- src/components/practice/round-runner.tsx
- src/lib/practice/arena.ts
- src/lib/practice/home-stats.ts
- src/lib/practice/xp.ts
- tests/practice/arena.test.ts
