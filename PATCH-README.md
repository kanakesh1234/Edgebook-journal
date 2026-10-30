# Minato / glass buttons / loss-limit popup patch

Unzip over the project root (same paths). No new dependencies. Back up the MODIFIED files first.

- src/components/ai/minato.tsx: hidden launcher (end of page / 45s dwell / opened from a trade), Chat | Mind tabs, "Noted" chip
- src/lib/minato/mind.ts (NEW): feeling memory: hold until next setup, keep only if useful
- src/app/api/minato/chat/route.ts: better answer shape, uses the mind memory
- src/components/dashboard/daily-focus-control.tsx: glass pills (No setup + Session), popup material
- src/components/dashboard/daily-limit.tsx: Inter tabular numbers (`num`) instead of mono
- src/components/dashboard/today-panel.tsx: "No setup today" uses the glass pill
