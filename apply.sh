#!/bin/bash
# Run this from inside your ox-test project folder (the one that contains "src").
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ ! -d "src/app" ]; then
  echo "Please cd into your ox-test folder first (the one containing src/)."
  exit 1
fi
for f in "src/app/api/lessons/route.ts" "src/app/(workspace)/lessons/page.tsx" "src/app/(workspace)/lessons/[id]/page.tsx" "src/lib/server/lessons-store.ts"; do
  cp "$HERE/$f" "$f"
done
echo "Done. 4 files replaced. Now restart npm run dev."
