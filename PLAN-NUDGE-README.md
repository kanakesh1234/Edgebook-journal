# Plan Trade — contextual Minato popup (data-gated) + win-probability ring

Unzip over the project root (same paths). No new packages, env changes, migrations or deletions.

NEW (5)
- src/lib/minato/plan-intervention.ts             engine: data gate + evidence gate + 6 interventions + delivery rules
- src/components/journal/use-plan-intervention.ts  timing / session / preferences hook
- src/components/journal/plan-intervention.tsx     full-screen popup, tap anywhere to dismiss
- src/components/journal/win-odds-ring.tsx         win probability as a ring, top right of the checklist step
- tests/journal/plan-intervention.test.ts

REPLACE (2)
- src/components/journal/plan-trade-flow.tsx       see PLAN-NUDGE-flow.diff to merge by hand if you edited it
- tests/run-all.ts                                 +1 import line

Changes in this version
- The big win-probability card at the bottom of the setup checklist is gone (win-odds-card.tsx is untouched; the
  no-playbook Log-trade step still uses it).
- Win probability is now a 46px ring, top right of the checklist step. Tap it for the detail; tap anywhere else to close.
- The AI popup is full screen over a blurred scrim. Tap/click anywhere or press Esc to dismiss. Its own buttons
  (action, Details, Show fewer like this) are the only exceptions. Dismissing snoozes that situation for a day.

When it speaks: only once the journal has 12 trades, 6 linked plans, 20 written notes and 5 written reviews
(`READY` in plan-intervention.ts), on the checklist step, after 1.6 s of no typing/tapping, max 2 per sitting.
Preferences live in localStorage `edgebook:plan-nudges:v1:<handle>`; delete that key to reset.
