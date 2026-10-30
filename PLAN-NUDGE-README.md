# Plan Trade — contextual Minato popup (data-gated)

Unzip over the project root (same paths). No new packages, no env changes, no migrations, nothing deleted.

NEW (4)
- src/lib/minato/plan-intervention.ts            engine: data gate + evidence gate + 6 interventions + delivery rules
- src/components/journal/use-plan-intervention.ts timing/session/preferences hook
- src/components/journal/plan-intervention.tsx    the popup
- tests/journal/plan-intervention.test.ts

REPLACE (2)
- src/components/journal/plan-trade-flow.tsx      +35 lines, nothing removed (see PLAN-NUDGE-flow.diff to merge by hand)
- tests/run-all.ts                                +1 import line

Verified on the zipped project: `npx tsc --noEmit` clean, `npm test` all pass, `next build` succeeds.

## When it speaks
Never until ALL of these hold (src/lib/minato/plan-intervention.ts, `READY`):
12 logged trades · 6 trades with a linked plan · 20 written notes (journal/reflection/autopsy/plan text) · 5 trades with a written review.
Then only on the Setup (checklist) step, after the trader has been idle 1.6 s, one at a time, max 2 per planning sitting.
Each message also needs its own evidence (e.g. a rule skipped >=3 AND confirmed >=3 times). Edit `READY` to tune.

## Preferences
Dismiss (x) snoozes that exact situation 7 days. "Show fewer like this" (under Details) mutes that kind 30 days.
Stored in the browser's localStorage under `edgebook:plan-nudges:v1:<handle>`. Delete that key to reset.
