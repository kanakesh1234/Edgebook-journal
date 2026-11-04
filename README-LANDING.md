# Landing page — "Record the decision."

Scope: **the landing page only** (`/`). No other route, API or component was changed.

## Run it
```bash
npm install     # nothing new is required; gsap/lenis are no longer used by the landing
npm run dev     # open http://localhost:3000
```

## What it is
One continuous 2.5D film on a pinned (sticky) stage, driven by vertical scroll, followed by three
quiet pinned sections and a minimal footer. No video file, no raster art: the depth layers are
authored SVG, so there is nothing to load, nothing to pop in, and zoom stays sharp.

| Part | File |
|---|---|
| Page composition + metadata | `src/app/page.tsx` |
| **All timeline ranges and all copy (edit here)** | `src/components/landing/scene-config.ts` |
| Scene math: `p` → CSS variables (pure function) | `cinema-scene.ts` |
| Helpers: `clamp, lerp, smoothstep, rangeProgress, segmentInOut` | `timeline.ts` |
| rAF engine, inertia, pointer parallax, scrub sections | `scroll-controller.tsx` |
| Film markup (server-rendered) | `cinema.tsx` |
| SVG depth layers | `scene-art.tsx` (see `ASSET-MANIFEST.md`) |
| Catalog rail (client) | `catalog-rail.tsx` |
| Apple-style header (hides on scroll down) | `header.tsx` |
| Statement + pinned quotes · Finale + footer | `statement.tsx` · `finale.tsx` |
| All styling, tokens, z-index bands, reduced-motion layout | `landing.css` |

`logo.tsx` and `reveal.tsx` are untouched (the rest of the app imports them).

## Timeline map (progress p of the film; ~5200px desktop, 4300px tablet, 3900px phone)
| p | Beat |
|---|---|
| 0.00–0.03 | Hero hold: gate on the water, title + CTA |
| 0.03–0.17 | Title and intro copy exit; camera pushes in |
| 0.15–0.27 | Gate doors split, light blooms |
| 0.22–0.43 | Narrative A "Decide before the bell" inside the opened gate (+2 pop-ups) |
| 0.36–0.46 | Doors and light pass the camera and exit |
| 0.45–0.55 | Clean panorama + quote "Calm is a position you can hold." |
| 0.55–0.75 | Narrative B "Review with someone who remembers" over a softened world (+chat pop-ups) |
| 0.72–0.78 | World returns to focus |
| 0.78–0.96 | Catalog rail slides in horizontally |
| 0.91–1.00 | Controls + CTA settle; final state stays interactive |

Retime by editing `TIMELINE` in `scene-config.ts`; no animation math needs to change.
Everything is a pure function of `p`, so scrolling up reverses every state exactly.

## Z-index bands
0–9 world · 10–19 shade/vignette/grain · 20–29 narrative copy · 30–39 header + rail controls · 40+ overlays (unused).

## Accessibility and motion safety
- Semantic landmarks, one `h1`, `h2` per beat, real `nav`, `button`, `ul`. All copy is HTML; art is `aria-hidden`.
- Visible focus rings everywhere. Tabbing to a control that is not on screen yet (hero CTAs, rail) jumps the film to the beat where it lives.
- Rail: prev/next buttons, ArrowLeft/Right/Home/End, mouse drag, touch swipe (native scroll-snap). Position is announced politely only on deliberate navigation.
- **`prefers-reduced-motion`**: no pinning, zoom, blur, parallax or smoothing. The film becomes a calm normal-flow page (static hero, then every beat in order) with all content and controls available.
- Low-power / coarse-pointer devices (`data-fx="lite"`): no blur filters or backdrop blur; tint only. Pointer parallax is off on touch.
- The header slides away on scroll down and returns on scroll up, at the top, or when focus enters it.

## Verification performed
Rendered the real components and the real `landing.css` in headless Chromium (esbuild harness;
the Next.js SWC binary in the supplied `node_modules` is macOS-only so `next dev` could not run in
the sandbox) at 1440×900, 1280×720, 1024×768, 768×1024 and 390×844.
- Checkpoints p = 0, .18, .27, .44, .58, .74, .90, 1.0 inspected: no holes or unpainted edges, no layer-order flips, no text collisions.
- Console: 0 errors/warnings. Horizontal overflow: none at any size.
- Scroll reversibility: identical variables reaching the same position down, up, or by jump.
- Nav anchors land exactly on their timeline positions; header reappears on scroll up.
- Rail: click, End/Home, mouse drag, announcement, disabled states all work; focus-jump works.
- Reduced motion: not sticky, all 15 content blocks fully opaque, anchors land on real content.

**Please also check in a real browser:** the real Tailwind-styled logo, real-device Safari/iOS URL-bar behaviour,
and 200% browser zoom. Frame-rate was not profiled in the sandbox.

## Placeholders / production work still open
- The scene art is vector and procedural (a deliberate placeholder-grade illustration). If you later commission
  layered photography or illustration, replace the SVGs in `scene-art.tsx` per `ASSET-MANIFEST.md`; the motion needs no change.
- Copy in the pop-ups (e.g. the Minato conversation, "08:45 Intention locked", the JSON card) is illustrative and labelled as an example/sample.
- The three motivational lines are original and unattributed. Swap in your own in `scene-config.ts` (`QUOTES`).
