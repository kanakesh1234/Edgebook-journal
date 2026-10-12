# Edgebook AI tagging — files only (built on ox-test_1.zip)

Copy these files over your ox-test project (same paths). Then add ONE line to the end of tests/run-all.ts:

    import "./journal/tagging.test.ts";

Then: npx tsc --noEmit && npm test

NEW (12):  TAGGING.md, scripts/eval-tagging.ts, src/app/api/journal/tag-trade/route.ts,
           src/components/journal/tag-panel.tsx, src/lib/tagging/{apply,evidence,index,policy,prompt,rules}.ts,
           tests/journal/tagging-golden.ts, tests/journal/tagging.test.ts
REPLACED (6, full files — they already contain your ox-test_1 edits):
           src/lib/types.ts, src/lib/mistakes.ts, src/lib/practice/focus.ts, src/lib/review/mistakes.ts,
           src/components/journal/autopsy.tsx, src/components/journal/entry-detail-modal.tsx

If you changed any of the 6 replaced files after ox-test_1.zip, don't overwrite them — use the v3 installer instead.
tests/run-all.ts and package.json are NOT included, so your versions stay.
