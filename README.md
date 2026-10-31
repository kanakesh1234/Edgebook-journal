# Trade sheet redesign

Unzip into your project root (same paths, overwrite when asked). No new packages, no database changes. Then run `npm run dev`.

| File | What changed |
|---|---|
| `src/components/journal/entry-detail-modal.tsx` | Full redesign of the trade sheet |
| `src/components/journal/tag-panel.tsx` | Tags show results only. Tagging runs silently in the background |
| `src/lib/mistakes.ts` | One chip per category (fixes duplicate tags) |
| `src/components/journal/trade-review-flow.tsx` | "AI tags" and "Updated by the AI" wording removed |
| `src/components/journal/autopsy.tsx` | "Category · AI" and "AI noticed" wording removed |

Nothing else is touched. The sheet keeps the same props, so `journal/page.tsx` needs no changes.
