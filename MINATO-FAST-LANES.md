# Minato — Fast Lanes update

Unzip at the project root (the folder with package.json) and overwrite. No new dependencies, no DB changes, nothing to delete.

## What was wrong (from your screenshot)
1. "good morning sensei" skipped the small-talk route (the pattern only matched a bare greeting), fell into the broadest "general" plan and got a full stats dump.
2. The model saw `drawdown: 30` (money already used) and called it "$30 left"; the dashboard shows room $470.
3. "No live market data yet" came from a hard-coded `liveMarketDataAvailable: false`, and it was Sunday, so "pre-market" was also wrong.
4. It ended by asking YOU to write the pre-session plan.
5. Every message uploaded the whole journal, and the ~10 KB site blueprint was sent twice on every data question.

## How it works now
| Lane | When (decided instantly, no model call) | What the model sees | Journal read |
|---|---|---|---|
| chat | greetings, thanks, concept questions, anything not about your own data | ~200-token prompt, first name, market clock, 8-number glance, last 8 turns | never |
| calc | "if win rate is 45% and RR 1:2…", sizing with stated numbers | same + exact numbers computed in `ideal-calc.ts` | never |
| data | your trades, stats, patterns, plan, drawdown, dates | existing context router (only the slice the question needs) | yes |

* The model can escalate: if a chat message really needs your data it answers `[[JOURNAL]]`; the server tells the app, and the app sends the journal once.
* Doubt → it asks ONE short question instead of guessing.
* Hypothetical math is deterministic (exact DP for streak odds, NQ $20/pt, MNQ $2/pt, expectancy, profit factor, Kelly); the model only phrases it.
* Market state (weekend / daily break / session) is computed, not guessed.
* Data lane: drawdown is `{used, limit, room, usedPct}` using the same model as the dashboard; the blueprint is sent only for product-help questions; the deterministic fallback is computed only if needed.

## Files — REPLACE
- src/app/api/minato/chat/route.ts
- src/components/ai/minato.tsx
- src/components/ai/minato.css
- src/lib/minato/router.ts
- src/lib/minato/context-pack.ts
- tests/run-all.ts

## Files — ADD
- src/lib/minato/lane.ts
- src/lib/minato/lean.ts
- src/lib/minato/ideal-calc.ts
- src/lib/minato/market-clock.ts
- tests/minato/lane.test.ts

## Verify
`npm test` (new lane tests: 50 assertions; existing 25/25 Minato evals, format and mind-engine tests still pass) and `npm run typecheck`.
