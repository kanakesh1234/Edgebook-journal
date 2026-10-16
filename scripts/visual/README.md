# Visual / responsive test harness (optional dev tooling)

Renders the **real** app components in a plain browser bundle (Next's `Link` and `navigation` are replaced by tiny shims)
against a mock backend that includes an in-memory "Google Drive" with the same GET/PUT contract as `/api/drive/data`.
Nothing here ships to production; `scripts/` is excluded from `tsconfig.json`.

Needs: `npm i -D esbuild playwright` (then `npx playwright install chromium`) and Python 3 with `playwright`.

    node scripts/visual/build.mjs                                   # bundle the pages
    scripts/visual/run.sh python3 scripts/visual/audit.py           # every page × 7 screen sizes → /tmp/audit
    scripts/visual/run.sh python3 scripts/visual/feed-e2e.py        # 47 behaviour checks on the Feed + Drive persistence

The audit reports console errors, horizontal overflow, touch targets under 40px and text under 11px, and saves screenshots.
It is not a substitute for testing on real phones. It cannot see real Google, Supabase or market-data responses.
