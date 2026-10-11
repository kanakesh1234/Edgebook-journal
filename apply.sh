#!/bin/bash
# Run from INSIDE your ox-test project folder (the one containing package.json and src/):
#   bash /path/to/ox-test-fixes/APPLY.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f package.json ] && [ -d src/app ] || { echo "cd into your ox-test project folder first."; exit 1; }

# 1. copy every fixed file to the same path (overwrite)
(cd "$HERE" && find . -type f ! -name APPLY.sh ! -name FIXES.md -print0) | while IFS= read -r -d '' f; do
  mkdir -p "$(dirname "$f")"; cp "$HERE/$f" "$f"; echo "updated  $f"
done

# 2. remove stale leftovers from old drop-in patches (they reference packages/files that don't exist)
for f in apply.sh APPLY.md INSTALL.md INTEGRATION.md DELETED.txt src/README.md scripts/migrate-lessons.mjs; do
  [ -e "$f" ] && { git rm -q --cached "$f" 2>/dev/null || true; rm -f "$f"; echo "removed  $f"; }
done

# 3. make sure local-only junk is not tracked
git rm -q --cached -r --ignore-unmatch .DS_Store tsconfig.tsbuildinfo .env.local .env.local.bak 2>/dev/null || true

echo; echo "Now run:  npm run typecheck && npm test"
echo "Then:     git add -A && git commit -m 'Fix type errors and deployment issues' && git push"
