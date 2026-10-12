#!/usr/bin/env bash
# Edgebook AI tagging — safe installer. Usage: ./apply-tagging.sh /path/to/ox-test
# Merges into YOUR current files. If any patch does not fit, NOTHING is changed and you are told which one.
set -u
ROOT="${1:-.}"; HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$ROOT/package.json" ] && [ -d "$ROOT/src/lib" ] || { echo "✗ $ROOT does not look like the ox-test project"; exit 1; }
cd "$ROOT"
bad=0
for p in "$HERE"/patches/*.patch; do
  if patch -p1 --dry-run -s < "$p" >/dev/null 2>&1; then echo "  ok     $(basename "$p")";
  elif patch -R -p1 --dry-run -s < "$p" >/dev/null 2>&1; then echo "  done   $(basename "$p") (already applied)";
  else echo "  CLASH  $(basename "$p")  — your file changed in the same lines"; bad=1; fi
done
[ $bad -eq 0 ] || { echo; echo "✗ Nothing was changed. Send me the CLASH file(s) and I will merge them for you."; exit 2; }
for p in "$HERE"/patches/*.patch; do patch -R -p1 --dry-run -s < "$p" >/dev/null 2>&1 || patch -p1 -s < "$p"; done
( cd "$HERE/files" && find . -type f ) | while read -r f; do mkdir -p "$(dirname "$f")"; cp "$HERE/files/$f" "$f"; done
if ! grep -q "journal/tagging.test" tests/run-all.ts; then echo 'import "./journal/tagging.test.ts";' >> tests/run-all.ts; echo "  added  tagging test to tests/run-all.ts (your other lines untouched)"; fi
echo "✓ Installed. Now run:  npx tsc --noEmit && npm test"
