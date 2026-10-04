# Edgebook fix 2 — lessons save/delete error + security hardening

Copy every file here into the SAME path in your project, then DELETE:
- src/app/api/drive/diagnose/        (whole folder — unsafe, see below)
- git rm -r --cached .data           (stop committing lesson data; .data/ is now in .gitignore). Do this AFTER you have
                                      created/liked/commented once so lessons.json exists in Drive (the old data seeds it).

No new packages, no new env vars. Redeploy. Everyone signs in again once (sessions now expire).

## The bug
"500: EROFS: read-only file system, open '/var/task/.data/lessons.json'" — Vercel's disk is read-only; lessons were saved to
a local file. They now live in the same admin Google Drive folder as accounts.json / friends.json (ADMIN_GOOGLE_REFRESH_TOKEN).
Existing lessons + images that shipped in .data/ are copied into Drive the first time they are used.
Uploads are capped at 4 MB (Vercel rejects request bodies ~4.5 MB).

## Security fixes
- NEW src/middleware.ts: cross-site writes to /api blocked; CSP, X-Frame-Options, nosniff, HSTS, Referrer/Permissions policy.
- Open redirect after login (`next=//evil.com`) fixed; Google ID token audience/issuer/expiry checked.
- Sessions now carry a server-enforced expiry (a stolen cookie no longer works forever).
- OAuth code/state no longer written to logs.
- /api/drive/diagnose removed (was live in production; `?write=1` rewrote your journal).
- /api/market-data, /catalog, /minato/chat, /minato/matrix, /minato/questions required NO login — anyone could spend your
  paid LSE / OpenRouter keys. Now: signed-in only + rate limits + input limits; provider errors no longer echoed.
- Friends: a blocked person could un-block themselves (accept/remove); invalid `status` values were stored. Fixed.
- Friends/accounts/lessons updates are serialised (no more lost likes/requests when two happen at once); handle claim is atomic.
- Lesson uploads: real file type checked from the bytes, served with nosniff + sandbox CSP; screenshot upload must be a JPEG.
- Rate limits: friend search, friend actions, handle changes, lesson actions/uploads, Minato.
