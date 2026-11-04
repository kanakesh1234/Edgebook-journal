# Asset manifest — landing film

Master canvas for every layer: **2000 × 1200 units (5:3)**, horizon at **y = 700**, light source (sun) at **x = 1000, y = 700**
directly behind the gate. Shared camera axis (transform-origin) for all layers: **50% / 64.6%**, the base of the gate (y = 775).
Layers render 18% larger than the stage (`.cx-layer`) so push-in and parallax never expose an edge.
All layers are inline SVG: no text, no raster, no loading. Component → `scene-art.tsx`.

| Role | Component | Alpha | Depth / motion | Notes |
|---|---|---|---|---|
| 00 Sky | `SkyLayer` | opaque | smallest: scale +5%, pointer −3px | gradient, sun glow, 46 faint stars |
| 10 Far ridges | `FarLayer` | transparent top | scale +16%, pointer −6px | hazed toward the horizon colour |
| 20 Midground | `MidLayer` | transparent top | scale +34%, pointer −10px | hills + 10 "candle stones" + shore strip |
| 25 Water | `WaterLayer` | opaque below y = 735 | scale +50%, pointer −14px | ripples + sun-reflection column |
| 30 Gate core | `GateCoreLayer` | transparent | with gate group | paper page + light bloom (`--glow`) behind the doors |
| 40 Left door | `DoorLeftLayer` | transparent | gate scale · slides −3%, grows, exits | foreground occluder, red candle emblem |
| 41 Right door | `DoorRightLayer` | transparent | mirror of 40 | gold candle emblem |
| — Shade | `.cx-shade` (CSS) | — | static | vignette + tint (`--tint`) + `public/landing/grain.png` (160×160 tile, 32 KB) |

Anchors: gate base-centre = (1000, 775); gate top = y 480; doors meet at x = 1000 (seam gap 2 units).
Pointer parallax opposes between far (negative) and near (positive) layers; max ≈ 18px, off on coarse pointers.
To replace art with photographic layers: keep the same 5:3 master, horizon, light direction and anchors, give each PNG/WebP
10–20% bleed and straight alpha, then swap the SVG for an `<img width height>` inside the same `.cx-layer` wrapper.
