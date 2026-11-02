#!/usr/bin/env bash
# Run from the project root (the folder that contains package.json) AFTER copying these files over it.
set -e
rm -rf src/app/api/auth/supabase src/app/api/cron src/lib/server/supabase-identity.ts \
       src/lib/services/supabase-memory.ts src/lib/supabase-integration.ts src/utils/supabase supabase
rmdir src/utils 2>/dev/null || true
npm install
echo
echo "Done. Now edit .env.local:"
echo "  MINATO_MODEL=openrouter/free        (or a paid model — far more reliable)"
echo "  MINATO_FALLBACK_MODEL=               (clear it: z-ai/glm-5.2:free is retired)"
echo "  delete the NEXT_PUBLIC_SUPABASE_* and SUPABASE_RLS_JWT_* lines (and CRON_SECRET on Vercel)"
echo "Then: npm test && npm run dev, and open /api/minato/chat?probe=1 while signed in."
