#!/bin/bash
# Run from inside your ox-test project folder (the one that contains "src").
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ ! -d "src/app" ]; then echo "Please cd into your ox-test folder first (the one containing src/)."; exit 1; fi

FILES=(
  "src/lib/server/storage.ts"
  "src/lib/server/lessons-store.ts"
  "src/lib/server/lessons-html.ts"
  "src/app/api/lessons/route.ts"
  "src/app/api/lessons/media/route.ts"
  "src/components/lessons/writer.tsx"
  "scripts/migrate-lessons.mjs"
)

BK="$HOME/ox-test-backup-before-storage-$(date +%Y%m%d-%H%M%S)"
for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp "$f" "$BK/$f"; fi
done
echo "Backed up your old files to $BK"

for f in "${FILES[@]}"; do
  mkdir -p "$(dirname "$f")"
  cp "$HERE/$f" "$f"
done
echo "Replaced/added ${#FILES[@]} files."

# keep local lesson data and media out of git
touch .gitignore
if ! grep -qx '.data/' .gitignore; then printf '\n.data/\n' >> .gitignore; echo "Added .data/ to .gitignore"; fi

echo "Installing packages..."
npm install @upstash/redis @vercel/blob
echo
echo "Done. Next: add the env vars to .env.local, run the migration, then restart npm run dev."
