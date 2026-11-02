# Minato + Supabase removal — what changed and why

## 1. "My reasoning engine rejected the request" (Minato dead on every message)
Root causes, all in `src/lib/minato/agent/llm.ts`:
- `.env.local` had `MINATO_FALLBACK_MODEL=z-ai/glm-5.2:free`, a retired slug. The old `ai.ts` remapped it, but the new agent
  read the env directly, so it was sent to OpenRouter as-is (404). The primary free slug can also disappear at any time.
- A 404 ("no such model") was handled like "this model refuses tools", which flipped the whole turn into text-tool mode.
- When it failed, the provider's reason was thrown away, so the message was undiagnosable.

Fixes: dead slugs dropped · free chains end with OpenRouter's `openrouter/free` router · a 404 model is skipped cleanly ·
oversized `max_tokens` is retried smaller · if every free model is rejected, the live OpenRouter catalogue is queried for free
tool-capable models (cached 30 min) · the chat now shows the model name + provider reason when a request is rejected ·
a **paid** chain (`MINATO_MODELS=anthropic/...`) is never silently downgraded to free models.

Check it any time (signed in): `GET /api/minato/chat?probe=1` → per-model status + the provider's own error text.

## 2. Supabase removed — Google Drive is the only server
Removed: `src/utils/supabase/*`, `supabase-integration.ts`, `services/supabase-memory.ts`, `server/supabase-identity.ts`,
`/api/auth/supabase/token`, `/api/cron/supabase-keepalive`, `supabase/` (SQL), the `vercel.json` cron, both `@supabase/*`
packages (and their lockfile entries), the CSP allowance, and the Supabase env vars.
- `middleware.ts` used to build a Supabase client on **every request** with `NEXT_PUBLIC_SUPABASE_URL!` — if those env vars
  were missing/paused the whole site could fail. Gone.
- Tab heartbeat / draft auto-save / "snapshot before Drive write" were advisory and are gone; Drive writes are unchanged.
- Minato's memory now lives in `EdgeBook/journals/minato-knowledge.json` on the trader's Drive (`DriveKnowledgeStore`):
  one read per request, one merged write at the end, never blocks an answer, never overwrites a corrupt file.
- Anything previously stored in the Supabase tables is not migrated (it was a best-effort cache; Drive holds the journal).

## 3. Other Minato bug fixed
Error notices were saved into the chat thread and **sent back to the model as Minato's own previous answer**, poisoning later
replies. They're now flagged and excluded (existing saved ones are recognised by wording).

## Deploy
1. Copy these files over the project; run `npm install` (prunes the removed packages).
2. In `.env.local` / Vercel: set `MINATO_MODEL=openrouter/free` (or a paid model, which is far more reliable), clear
   `MINATO_FALLBACK_MODEL`, and delete the four `SUPABASE`/`NEXT_PUBLIC_SUPABASE` variables and `CRON_SECRET`.
3. Redeploy, then open `/api/minato/chat?probe=1` while signed in.

Tests: `npm test` → 15/15 suites, incl. 58 new assertions in `tests/minato/resilience.test.ts`. `tsc` shows no new errors.
Not verified here: `next build` / a live OpenRouter call (no network; the bundled compilers are macOS-only).
