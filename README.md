# Replay "No data to replay" fix

Copy these files over the project (same paths), then `git add -A && git commit && git push`.
No new packages, no env changes, nothing to delete.

NEW      src/lib/server/lse-client.ts
REPLACE  src/app/api/market-data/route.ts
REPLACE  src/lib/backtesting/data/loader.ts
REPLACE  src/lib/backtesting/data/lse-provider.ts
REPLACE  src/components/backtesting/range-bar.tsx
NEW      tests/backtesting/lse-client.test.ts
REPLACE  tests/run-all.ts

Check: npm run typecheck && npm test
