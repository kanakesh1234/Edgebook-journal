#!/bin/bash
# Run this from inside your ox-test project folder (the one that contains "src").
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ ! -d "src/app" ]; then
  echo "Please cd into your ox-test folder first (the one containing src/)."
  exit 1
fi
cp "$HERE/src/app/api/lessons/route.ts" "src/app/api/lessons/route.ts"
cp "$HERE/src/app/(workspace)/lessons/page.tsx" "src/app/(workspace)/lessons/page.tsx"
cp "$HERE/src/app/(workspace)/lessons/[id]/page.tsx" "src/app/(workspace)/lessons/[id]/page.tsx"
echo "Done. 3 files replaced. Now restart npm run dev."
