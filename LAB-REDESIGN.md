# Trading Lab redesign — drop-in files

Copy over the project root (paths are relative to `ox-test/`):

- src/app/(workspace)/lab/page.tsx            (rewritten)
- src/components/lab/lab.css                  (new)
- src/components/lab/lab-ui.tsx               (new: segmented, popover, sheet, progress…)
- src/components/lab/lab-model.ts             (new: derived data, sort/filter, hash routing)
- src/components/lab/lab-overlays.tsx         (new: sheets + confirmations, `useLab()` actions)
- src/components/lab/overview.tsx             (new)
- src/components/lab/playbook.tsx             (rewritten: Setups)
- src/components/lab/challenges.tsx           (rewritten)
- src/components/lab/backtesting.tsx          (rewritten)
- src/components/lab/setup-sheet.tsx          (new)
- src/components/lab/setup-editor.tsx         (new)
- src/components/lab/challenge-sheet.tsx      (new)
- src/components/lab/challenge-form.tsx       (new)

Not touched: Journal, Lessons, and src/components/lab/setup-detail.tsx
(Journal still imports it, so it stays as-is).
