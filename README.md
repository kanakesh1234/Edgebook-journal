# Trade sheet redesign (v2)

Unzip into your project root (same paths, overwrite when asked). No new packages, no database changes. Then `npm run dev`.

| File | What changed |
|---|---|
| `src/components/journal/entry-detail-modal.tsx` | Rebuilt: one calm main screen + pages that push in (Review, Plan, Rules, Daily limit, Lessons, Notes) |
| `src/components/journal/tag-panel.tsx` | Tags show the result only. Tagging runs silently in the background |
| `src/lib/mistakes.ts` | One chip per category (fixes duplicate tags) |
| `src/components/journal/trade-review-flow.tsx` | "AI" wording removed |
| `src/components/journal/autopsy.tsx` | "AI" wording removed |

The sheet keeps its props, so `journal/page.tsx` needs no changes.
