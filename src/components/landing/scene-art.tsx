/**
 * SCENE ART — authored SVG depth layers.
 *
 * Master canvas: 2000 × 1200 units (5:3), one horizon at y = 700, one light source (the sun
 * sits directly behind the gate at x = 1000), one warm graded palette. Every layer shares the
 * same viewBox so they align perfectly when CSS scales them from the same camera axis
 * (50% / 64.6%, the base of the gate).
 *
 * Bleed: the layer boxes are rendered 18% larger than the stage (see .cx-layer in
 * landing.css) so parallax and push-in never expose an edge.
 *
 * Depth roles (see ASSET-MANIFEST.md):
 *   00 sky · 10 far ridges · 20 midground + candle stones · 25 water
 *   30 gate core (light behind the doors) · 40 left door · 41 right door
 */

const VB = "0 0 2000 1200";

/** Deterministic pseudo-random so server and client markup always match. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Catmull-Rom → cubic Bézier through points; closes down to `floor`. */
function hillPath(pts: [number, number][], floor: number) {
  let d = `M${pts[0]![0]} ${floor} L${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return `${d} L${pts[pts.length - 1]![0]} ${floor} Z`;
}

/** Linear surface height of a polyline hill at x (used to seat props on a ridge). */
function surface(pts: [number, number][], x: number) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[i + 1]!;
    if (x >= x1 && x <= x2) return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
  }
  return pts[pts.length - 1]![1];
}

/* 00 · SKY ------------------------------------------------------------------ */
export function SkyLayer() {
  const r = rng(7);
  const stars = Array.from({ length: 46 }, () => ({
    x: r() * 2000,
    y: r() * 430,
    r: 0.6 + r() * 1.1,
    o: 0.15 + r() * 0.4,
  }));
  return (
    <svg viewBox={VB} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sky-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0907" />
          <stop offset="0.2" stopColor="#17130f" />
          <stop offset="0.36" stopColor="#3a2d22" />
          <stop offset="0.48" stopColor="#85684a" />
          <stop offset="0.57" stopColor="#d1a46a" />
          <stop offset="0.6" stopColor="#ecc890" />
          <stop offset="1" stopColor="#ecc890" />
        </linearGradient>
        <radialGradient id="sky-sun" cx="1000" cy="700" r="760" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff3d4" stopOpacity="0.95" />
          <stop offset="0.12" stopColor="#ffdca3" stopOpacity="0.62" />
          <stop offset="0.38" stopColor="#e2a965" stopOpacity="0.2" />
          <stop offset="1" stopColor="#e2a965" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="2000" height="1200" fill="url(#sky-g)" />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x.toFixed(0)} cy={s.y.toFixed(0)} r={s.r.toFixed(2)} fill="#f6e6c8" opacity={s.o.toFixed(2)} />
      ))}
      <rect width="2000" height="1200" fill="url(#sky-sun)" />
    </svg>
  );
}

/* 10 · FAR RIDGES ------------------------------------------------------------ */
export function FarLayer() {
  const a: [number, number][] = [[-120, 640], [160, 604], [420, 566], [700, 598], [980, 640], [1260, 612], [1560, 574], [1840, 598], [2120, 624]];
  const b: [number, number][] = [[-120, 676], [200, 650], [560, 662], [900, 686], [1240, 664], [1620, 646], [2120, 668]];
  return (
    <svg viewBox={VB} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="far-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="#6e5b49" />
          <stop offset="0.6" stopColor="#a98559" />
          <stop offset="0.66" stopColor="#d0a569" />
        </linearGradient>
        <linearGradient id="far-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.52" stopColor="#4e4136" />
          <stop offset="0.6" stopColor="#7e6446" />
          <stop offset="0.64" stopColor="#c19a62" />
        </linearGradient>
      </defs>
      <path d={hillPath(a, 722)} fill="url(#far-a)" opacity="0.92" />
      <path d={hillPath(b, 736)} fill="url(#far-b)" />
    </svg>
  );
}

/* 20 · MIDGROUND + CANDLE STONES -------------------------------------------- */
const HILL_L: [number, number][] = [[-120, 706], [120, 668], [340, 648], [560, 650], [760, 676], [940, 716]];
const HILL_R: [number, number][] = [[1060, 716], [1240, 686], [1460, 650], [1700, 646], [1920, 668], [2120, 696]];

export function MidLayer() {
  // Slim standing stones — a quiet nod to candlesticks, not a literal chart.
  const stones: { x: number; w: number; h: number; side: "l" | "r"; wick: number }[] = [
    { x: 232, w: 14, h: 62, side: "l", wick: 16 },
    { x: 300, w: 10, h: 38, side: "l", wick: 12 },
    { x: 380, w: 18, h: 86, side: "l", wick: 22 },
    { x: 468, w: 12, h: 52, side: "l", wick: 14 },
    { x: 640, w: 9, h: 34, side: "l", wick: 10 },
    { x: 1332, w: 10, h: 40, side: "r", wick: 12 },
    { x: 1488, w: 16, h: 74, side: "r", wick: 20 },
    { x: 1566, w: 11, h: 46, side: "r", wick: 13 },
    { x: 1662, w: 19, h: 92, side: "r", wick: 24 },
    { x: 1768, w: 9, h: 36, side: "r", wick: 10 },
  ];
  return (
    <svg viewBox={VB} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="mid-l" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.5" stopColor="#332a22" />
          <stop offset="0.62" stopColor="#241d17" />
        </linearGradient>
        <linearGradient id="mid-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6b878" stopOpacity="0" />
          <stop offset="1" stopColor="#e6b878" stopOpacity="0.28" />
        </linearGradient>
      </defs>
      {stones.map((s, i) => {
        const base = surface(s.side === "l" ? HILL_L : HILL_R, s.x) + 10;
        const top = base - s.h - 22;
        const rim = s.side === "l" ? s.x + s.w : s.x; // face that catches the sun
        return (
          <g key={i}>
            <line x1={s.x + s.w / 2} y1={top - s.wick} x2={s.x + s.w / 2} y2={top} stroke="#17120d" strokeWidth="1.6" />
            <rect x={s.x} y={top} width={s.w} height={s.h + 22} rx="1.5" fill="#17120d" />
            <line x1={rim} y1={top + 1} x2={rim} y2={top + s.h * 0.7} stroke="#ffcf8f" strokeWidth="1" opacity="0.5" />
          </g>
        );
      })}
      <path d={hillPath(HILL_L, 742)} fill="url(#mid-l)" />
      <path d={hillPath(HILL_R, 742)} fill="url(#mid-l)" />
      <rect x="-120" y="640" width="2240" height="110" fill="url(#mid-haze)" />
      <rect x="-120" y="735" width="2240" height="20" fill="#120e0a" />
    </svg>
  );
}

/* 25 · WATER ----------------------------------------------------------------- */
export function WaterLayer() {
  const r = rng(21);
  // Perspective ripples: spacing and length grow toward the viewer.
  const ripples = Array.from({ length: 38 }, (_, i) => {
    const t = i / 37;
    const y = 748 + t * t * 440;
    const len = 70 + t * 520 * (0.5 + r());
    return { y, x: r() * 2000 - len / 2, len, o: 0.05 + r() * 0.1, dark: i % 3 === 0 };
  });
  // The sun's reflection column, broken into shimmering dashes.
  const dashes = Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    return { y: 752 + t * t * 420, w: 46 + t * 340 * (0.7 + r() * 0.5), h: 2 + t * 5, o: 0.8 - t * 0.62 };
  });
  return (
    <svg viewBox={VB} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="wat-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#dcae6b" />
          <stop offset="0.65" stopColor="#a87d49" />
          <stop offset="0.74" stopColor="#5a4230" />
          <stop offset="0.88" stopColor="#2a1f15" />
          <stop offset="1" stopColor="#0f0b07" />
        </linearGradient>
      </defs>
      <rect y="735" width="2000" height="465" fill="url(#wat-g)" />
      {ripples.map((s, i) => (
        <rect key={i} x={s.x.toFixed(0)} y={s.y.toFixed(0)} width={s.len.toFixed(0)} height={(1.2 + (s.y - 748) / 220).toFixed(1)} rx="1" fill={s.dark ? "#1a130c" : "#ffe3b4"} opacity={s.o.toFixed(2)} />
      ))}
      {dashes.map((d, i) => (
        <rect key={`d${i}`} x={(1000 - d.w / 2).toFixed(0)} y={d.y.toFixed(0)} width={d.w.toFixed(0)} height={d.h.toFixed(1)} rx={(d.h / 2).toFixed(1)} fill="#fff0cc" opacity={d.o.toFixed(2)} />
      ))}
    </svg>
  );
}

/* 30 · GATE CORE — the light and the page behind the doors ------------------ */
export function GateCoreLayer() {
  const lines = Array.from({ length: 19 }, (_, i) => 506 + i * 14.2);
  return (
    <svg viewBox={VB} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="core-paper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6dc" />
          <stop offset="1" stopColor="#efd6a2" />
        </linearGradient>
        <radialGradient id="core-bloom" cx="1000" cy="640" r="1100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff1cc" stopOpacity="0.95" />
          <stop offset="0.22" stopColor="#ffd592" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffd592" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="cx-bloom">
        <rect x="-400" y="-300" width="2800" height="1800" fill="url(#core-bloom)" />
      </g>
      <g className="cx-core">
        <rect x="931" y="481" width="138" height="294" fill="url(#core-paper)" />
        {lines.map((y, i) => (
          <line key={i} x1="940" y1={y.toFixed(1)} x2="1060" y2={y.toFixed(1)} stroke="#8a6a38" strokeWidth="0.5" opacity="0.2" />
        ))}
        <line x1="952" y1="490" x2="952" y2="768" stroke="#b78e3e" strokeWidth="0.6" opacity="0.45" />
      </g>
    </svg>
  );
}

/* 40 / 41 · DOORS — split foreground occluders ------------------------------- */
function Door({ side }: { side: "l" | "r" }) {
  const left = side === "l";
  const outer = left ? "930,480 999,480 999,775 915,775" : "1001,480 1070,480 1085,775 1001,775";
  const frame = left ? "941,494 990,494 990,762 928,762" : "1010,494 1059,494 1072,762 1010,762";
  const refl = left ? "915,775 999,775 999,1070 930,1070" : "1001,775 1085,775 1070,1070 1001,1070";
  const id = left ? "dl" : "dr";
  return (
    <svg viewBox={VB} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-face`} x1={left ? "0" : "1"} y1="0" x2={left ? "1" : "0"} y2="0">
          <stop offset="0" stopColor="#2b2118" />
          <stop offset="0.7" stopColor="#15100b" />
          <stop offset="1" stopColor="#0c0906" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1={left ? "1" : "0"} y1="0" x2={left ? "0" : "1"} y2="0">
          <stop offset="0" stopColor="#ffd592" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ffd592" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-refl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d0906" stopOpacity="0.55" />
          <stop offset="1" stopColor="#0d0906" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6c585" />
          <stop offset="1" stopColor="#b78e3e" />
        </linearGradient>
      </defs>
      <polygon points={refl} fill={`url(#${id}-refl)`} />
      <polygon points={outer} fill={`url(#${id}-face)`} />
      {/* sun-side rim on the seam edge */}
      <rect x={left ? 985 : 1001} y="480" width="14" height="295" fill={`url(#${id}-edge)`} />
      <polygon points={frame} fill="none" stroke="#cba76b" strokeWidth="0.8" opacity="0.42" />
      <line x1={left ? 930 : 1001} y1="480.5" x2={left ? 999 : 1070} y2="480.5" stroke="#6b5538" strokeWidth="1" />
      {/* emblem: the red candle on the left door, the gold candle on the right, parted by the seam */}
      {left ? (
        <g>
          <line x1="984" y1="582" x2="984" y2="650" stroke="#ac5157" strokeWidth="1.4" opacity="0.85" />
          <rect x="979" y="600" width="10" height="22" rx="2" fill="#ac5157" opacity="0.82" />
        </g>
      ) : (
        <g>
          <line x1="1016" y1="566" x2="1016" y2="660" stroke={`url(#${id}-gold)`} strokeWidth="1.4" />
          <rect x="1011" y="584" width="10" height="34" rx="2" fill={`url(#${id}-gold)`} />
        </g>
      )}
    </svg>
  );
}
export const DoorLeftLayer = () => <Door side="l" />;
export const DoorRightLayer = () => <Door side="r" />;
