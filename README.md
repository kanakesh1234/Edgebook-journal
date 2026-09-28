# EdgeBook Journal — fixes to apply

Copy each file below into the SAME path in your project (`~/desktop/ox-test`),
overwriting the existing file. Two are brand new files (create them fresh).

## 1. Vercel 500 on Google Sign-In (fs.mkdirSync crash) — Drive-backed account store

New files:
- `src/lib/server/store-drive.ts` — NEW
- `scripts/get-store-refresh-token.mjs` — NEW

Replaced files:
- `src/lib/server/accounts.ts`
- `src/lib/server/friends.ts`

Files updated to `await` the now-async functions above:
- `src/app/api/auth/google/callback/route.ts`
- `src/app/api/auth/google/disconnect/route.ts`
- `src/app/api/profile/handle/route.ts`
- `src/app/api/friends/route.ts`
- `src/app/api/friends/competition/route.ts`
- `src/app/api/ranking/route.ts`
- `src/app/api/debug/google-drive/route.ts`
- `src/lib/server/metrics.ts`
- `src/lib/server/authed-drive.ts`

**Setup step required before this works, locally AND on Vercel:**
1. In Google Cloud Console → your OAuth client → Authorized redirect URIs, add:
   `http://localhost:8991/callback`
2. Run once, locally: `node scripts/get-store-refresh-token.mjs`
   (needs `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` — it reads `.env.local` automatically)
3. Sign in with whichever Google account you want to hold app data (your own is fine).
4. It prints `EDGEBOOK_STORE_REFRESH_TOKEN=...` — add that to `.env.local` locally,
   and to Vercel → Project Settings → Environment Variables → redeploy.

Without step 2–4, account/friend data has nowhere to write and every sign-in will fail.

## 2. MINATO not grounded in real trade data / showing "thinking" / showing stray `**`

Replaced file:
- `src/app/api/minato/chat/route.ts`

No setup needed — this is self-contained. Adds `lastTrade`/`recentTradesDetail`/
`recentLessons` to the facts sent to the model, tells it not to invent trade
specifics, and strips `<think>` blocks and markdown syntax from the reply
before it reaches the chat bubble.

## 3. CSV import drops entry times (breaks time-window / day-of-week analysis)

Replaced files:
- `src/lib/csv-import.ts`
- `src/components/journal/entry-form-modal.tsx`
- `src/components/journal/plan-trade-flow.tsx`

⚠️ This only fixes **future** imports. Your existing ~30 imported trades still
have no `entryTime` stored — re-import that CSV, or manually add entry times
to those trades, to get time-window/day-of-week analysis working on them.

## Verified

`npx tsc --noEmit` passes clean with all of the above in place — no type
errors, no leftover un-awaited calls.
