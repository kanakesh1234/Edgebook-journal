# Edgebook (ox-test)

Next.js 15 + React 19 + Supabase + Google Drive storage.

## Local development
```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
```

## Checks (run before every push)
```bash
npm run typecheck   # tsc --noEmit
npm test            # unit tests (needs Node >= 22.6)
```

## Deploy (Vercel)
1. Push to GitHub — Vercel builds on every push.
2. Set every variable from `.env.example` in Vercel → Project → Settings → Environment Variables.
3. Never commit `.env.local` (it is git-ignored).

Notes
- `.data/lessons.json` is a read-only seed that is copied into Drive on first run. Keep it committed.
- The AI API routes set `maxDuration = 60` so they don't hit Vercel's default timeout.
