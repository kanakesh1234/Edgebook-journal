# Review redesign — what changed

Files (drop-in, same paths and exports as before; nothing else touched):
- src/components/review/review-ui.tsx       shared primitives
- src/components/review/review-charts.tsx   charts
- src/components/review/reviews-panel.tsx   header, period navigation, section index
- src/components/review/weekly-review.tsx
- src/components/review/monthly-review.tsx

New exports (additive): AnimatedNumber, DrawCheck, StatStrip, StripCell, Group, StatRow, Prompt, DirTag,
WEEKLY_SECTIONS, MONTHLY_SECTIONS (review-ui); Ring, WinRateRing, OutcomeBar, PairBar, Sparkline (review-charts).
SessionCurve gains optional activeDrawdown / activeStreak props. `Section` still accepts `code`.
