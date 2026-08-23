# Edgebook — Trading Journal

A premium, local-first trading journal: log every session, measure your edge, and watch an
animated roadmap carry your equity from where you started to where you're aiming.

![stack](https://img.shields.io/badge/Next.js-15-black) ![react](https://img.shields.io/badge/React-19-blue) ![tailwind](https://img.shields.io/badge/Tailwind-4-teal) ![motion](https://img.shields.io/badge/Motion-12-purple)

## Features

| Area | What you get |
| --- | --- |
| **Landing** | Animated hero (candlestick field, drawing equity curve), scroll reveals, market ticker, feature bento, animated journey teaser |
| **Auth** | Local accounts (salted SHA-256 via WebCrypto) with sign-in / sign-up / demo-data mode. Clean `AuthProvider` interface ready to swap for NextAuth/Clerk/Firebase |
| **Journal** | Entries with date, net P&L, realized R multiple, instrument, direction, setup tag, notes and up to two screenshots (drag & drop, auto-compressed) |
| **Gallery** | Full-text search (`/` to focus), outcome/instrument filters, five sort modes, detail modal with lightbox, edit & delete |
| **Dashboard** | Total P&L, equity vs target, win-rate donut, drawdown budget meter, equity curve with start/target reference lines, daily results bars, best/worst day |
| **Roadmap** | Serpentine road from starting equity to target — milestones light up as you pass them, a rider animates along the path, the recovery zone between peak and current equity is highlighted, plus pace-to-target estimates |
| **Calendar** | Month heatmap of daily P&L with intensity scaling, day drill-down into entries, add-entry-for-day shortcut, animated month transitions |
| **Settings** | Journey plan (start/target/drawdown/currency) that instantly re-drives every visual, JSON export/import, storage usage meter, demo seeding, data wipe |

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Create a local account, or click **Explore with demo data** to seed ~4 months of realistic
trades (one click removes them in Settings).

## Production

```bash
npm run build && npm start
```

## Tests

```bash
npx tsx scripts/test-stats.ts   # analytics engine unit tests
node scripts/e2e.mts            # headless-browser end-to-end suite (needs Chrome/Brave + server on :3111)
```

## Architecture

```
src/
├─ app/
│  ├─ page.tsx                 # landing
│  ├─ login/                   # auth (suspended; search-param aware)
│  └─ (workspace)/             # guarded shell: sidebar, mobile tabs, page transitions
│     ├─ dashboard/ roadmap/ calendar/ journal/ settings/
├─ components/
│  ├─ ui/                      # primitives: button, modal, inputs, toast, lightbox…
│  ├─ landing/ shell/ charts/ journal/ roadmap/ dashboard/
└─ lib/
   ├─ types.ts                 # domain model
   ├─ stats.ts                 # pure analytics engine (unit-tested)
   ├─ store.ts                 # zustand state + persistence orchestration
   ├─ images.ts                # upload pipeline (validate → downscale → JPEG) + URL cache
   ├─ format.ts                # money/date formatting
   └─ services/
      ├─ storage.ts            # DataStore interface · IndexedDB impl · Google Drive placeholder
      └─ auth.ts               # AuthProvider interface · local impl
```

### Designed for tomorrow's backend

* **Storage** — everything talks to the `DataStore` interface (`src/lib/services/storage.ts`).
  Today it resolves to IndexedDB; `GoogleDriveDataStore` documents the exact swap path for a
  cloud backend without touching UI code.
* **Auth** — `AuthProvider` is the only seam the login page knows about.
* **Images** — stored as compressed blobs keyed by id; metadata lives with entries, so moving
  binaries to Drive/S3 later changes one service.

## Privacy

All data — entries, settings, hashed credentials and screenshots — stays in your browser.
No servers, no telemetry. Export to JSON anytime from Settings.
