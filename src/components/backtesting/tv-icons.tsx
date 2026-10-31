import type { ReactNode, SVGProps } from "react";

/* ------------------------------------------------------------------ */
/*  EJ icon system — SF-Symbols-style.                                  */
/*   · 24×24 grid, 2px safe padding, 1.6px stroke, round caps + joins   */
/*   · currentColor only                                                */
/*   · every glyph has a REGULAR (outline) and a FILLED variant.        */
/*     Filled = hierarchical: primary shapes solid, secondary shapes    */
/*     tinted (fill-opacity), exactly like SF Symbols `.fill`.          */
/*   · "nodes" (line end-points) are rings r2.3 in regular, solid dots  */
/*     in filled — big enough to stay legible at 18px.                  */
/* ------------------------------------------------------------------ */

type Def = (f: boolean) => ReactNode;

/** Tinted secondary fill (filled variant only). */
const tint = (f: boolean, o = 0.24) => (f ? { fill: "currentColor", fillOpacity: o } : {});
/** Solid primary fill (filled variant only). */
const solid = (f: boolean) => (f ? { fill: "currentColor" } : {});
/** A line end-point. */
const Node = ({ f, x, y }: { f: boolean; x: number; y: number }) => <circle cx={x} cy={y} r={f ? 2.6 : 2.3} {...solid(f)} />;

const P: Record<string, Def> = {
  /* ---------------- cursors ---------------- */
  cross: (f) => (<><path d="M12 3.5v5.2M12 15.3v5.2M3.5 12h5.2M15.3 12h5.2" /><circle cx="12" cy="12" r="1.7" {...solid(f)} /></>),
  dot: (f) => (<><circle cx="12" cy="12" r="8" {...tint(f, 0.18)} /><circle cx="12" cy="12" r={f ? 2.8 : 2.1} fill="currentColor" stroke="none" /></>),
  arrow: (f) => <path d="M6 3.2v14.6l3.9-3.7 2.6 5.9 2.5-1.1-2.6-5.8h5.4z" {...solid(f)} />,
  eraser: (f) => (
    <g transform="rotate(-45 12 12)">
      <rect x="3.2" y="8" width="17.6" height="8" rx="2.4" {...tint(f)} />
      <path d="M9 8v8" />
      {f && <path d="M9 8h9.8a2.4 2.4 0 012.4 2.4v3.2a2.4 2.4 0 01-2.4 2.4H9z" fill="currentColor" />}
    </g>
  ),

  /* ---------------- lines ---------------- */
  trendLine: (f) => (<><path d="M7.13 16.87L16.87 7.13" /><Node f={f} x={5.5} y={18.5} /><Node f={f} x={18.5} y={5.5} /></>),
  ray: (f) => (<><path d="M7.13 16.87l4.24-4.24M14.63 9.37L21 3" /><Node f={f} x={5.5} y={18.5} /><Node f={f} x={13} y={11} /></>),
  infoLine: (f) => (
    <><rect x="3.5" y="3.5" width="8.5" height="5.2" rx="1.6" {...tint(f, 0.25)} /><path d="M7.13 16.87L16.87 7.13" /><Node f={f} x={5.5} y={18.5} /><Node f={f} x={18.5} y={5.5} /></>
  ),
  extendedLine: (f) => (
    <><path d="M3 21l3.87-3.87M10.13 13.87l3.74-3.74M17.13 6.87L21 3" /><Node f={f} x={8.5} y={15.5} /><Node f={f} x={15.5} y={8.5} /></>
  ),
  hLine: (f) => (<><path d="M3 12h6.7M14.3 12H21" /><Node f={f} x={12} y={12} /></>),
  hRay: (f) => (<><path d="M7.8 12H21" /><Node f={f} x={5.5} y={12} /></>),
  vLine: (f) => (<><path d="M12 3v6.7M12 14.3V21" /><Node f={f} x={12} y={12} /></>),
  crossLine: (f) => (<><path d="M3 12h6.7M14.3 12H21M12 3v6.7M12 14.3V21" /><Node f={f} x={12} y={12} /></>),
  channel: (f) => (<><path d="M3.5 12L20.5 3.5v8L3.5 20z" {...tint(f)} /><path d="M3.5 16L20.5 7.5" strokeDasharray="2 3" /></>),
  arrowMarker: (f) => (<><path d="M5 19L18 6" /><path d="M10.5 5.5h8v8" {...solid(f)} /></>),

  /* ---------------- fib / forecasting / measure ---------------- */
  fib: (f) => (
    <>
      {f && <rect x="3.5" y="10" width="17" height="5" fill="currentColor" fillOpacity=".22" stroke="none" />}
      <path d="M3.5 5h17M3.5 10h17M3.5 15h17M3.5 20h17" strokeOpacity={f ? 1 : 0.55} />
      <path d="M7 20L17 5" />
    </>
  ),
  longPos: (f) => (
    <>
      {f && <path d="M4 14V6.1a2.6 2.6 0 012.6-2.6h10.8A2.6 2.6 0 0120 6.1V14z" fill="currentColor" fillOpacity=".28" stroke="none" />}
      <rect x="4" y="3.5" width="16" height="17" rx="2.6" />
      <path d="M4 14h16M12 11V6.8M9.8 8.8L12 6.6l2.2 2.2" />
    </>
  ),
  shortPos: (f) => (
    <>
      {f && <path d="M4 10h16v7.9a2.6 2.6 0 01-2.6 2.6H6.6A2.6 2.6 0 014 17.9z" fill="currentColor" fillOpacity=".28" stroke="none" />}
      <rect x="4" y="3.5" width="16" height="17" rx="2.6" />
      <path d="M4 10h16M12 13v4.4M9.8 15.4l2.2 2.2 2.2-2.2" />
    </>
  ),
  priceRange: (f) => (
    <>
      {f && <rect x="4.5" y="5" width="15" height="14" fill="currentColor" fillOpacity=".16" stroke="none" />}
      <path d="M4.5 5h15M4.5 19h15M12 5v14M9.3 8.4L12 5.7l2.7 2.7M9.3 15.6l2.7 2.7 2.7-2.7" />
    </>
  ),
  dateRange: (f) => (
    <>
      {f && <rect x="5" y="4.5" width="14" height="15" fill="currentColor" fillOpacity=".16" stroke="none" />}
      <path d="M5 4.5v15M19 4.5v15M5 12h14M8.4 9.3L5.7 12l2.7 2.7M15.6 9.3l2.7 2.7-2.7 2.7" />
    </>
  ),
  datePriceRange: (f) => (<><rect x="4.5" y="5.5" width="15" height="13" rx="2.4" {...tint(f)} /><path d="M12 5.5v13M4.5 12h15" strokeDasharray="1.5 3" /></>),
  ruler: (f) => (
    <g transform="rotate(-45 12 12)">
      <rect x="2.6" y="8" width="18.8" height="8" rx="2.2" {...tint(f)} />
      <path d="M7.5 8v3M11.5 8v2M15.5 8v3M19 8v2" />
    </g>
  ),

  /* ---------------- shapes / annotate ---------------- */
  brush: (f) => (
    <>
      <path d="M5.2 15.6L15.6 5.2l3.2 3.2L8.4 18.8l-4.2 1z" {...tint(f)} />
      <path d="M13.2 7.6l3.2 3.2" />
      {f && <path d="M4.2 19.8l1-4.2 3.2 3.2z" fill="currentColor" />}
    </>
  ),
  rect: (f) => <rect x="4" y="6" width="16" height="12" rx="2.6" {...tint(f)} />,
  ellipse: (f) => <ellipse cx="12" cy="12" rx="8.5" ry="6.3" {...tint(f)} />,
  triangle: (f) => <path d="M12 5.2c.5 0 .9.3 1.2.7l6.1 10.6c.5.9-.1 2-1.2 2H5.9c-1.1 0-1.7-1.1-1.2-2l6.1-10.6c.3-.4.7-.7 1.2-.7z" {...tint(f)} />,
  text: (f) => <g strokeWidth={f ? 2.2 : undefined}><path d="M5.5 7V5.5h13V7M12 5.5v13M9 18.5h6" /></g>,
  emoji: (f) => (
    <>
      <circle cx="12" cy="12" r="8.5" {...tint(f)} />
      <path d="M8.6 13.8c.8 1.5 2 2.2 3.4 2.2s2.6-.7 3.4-2.2" />
      <path d="M9.2 9.6v.6M14.8 9.6v.6" strokeWidth={f ? 2.1 : undefined} />
    </>
  ),

  /* ---------------- utilities ---------------- */
  zoomIn: (f) => (<><circle cx="10.5" cy="10.5" r="6.5" {...tint(f)} /><path d="M15.4 15.4l5.1 5.1M10.5 7.8v5.4M7.8 10.5h5.4" /></>),
  magnet: (f) => (
    <>
      <path d="M5.5 4h4v8.2a2.5 2.5 0 005 0V4h4v8.2a6.5 6.5 0 01-13 0z" {...tint(f)} />
      <path d="M5.5 8.2h4M14.5 8.2h4" />
    </>
  ),
  stayDraw: (f) => (<><path d="M4.6 14.6l8.2-8.2 2.9 2.9-8.2 8.2-3.7.9z" {...tint(f)} /><path d="M16.5 14.5v6M13.5 17.5h6" /></>),
  lock: (f) => (<><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.6" {...solid(f)} /><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" /></>),
  unlock: (f) => (<><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.6" {...tint(f, 0.22)} /><path d="M8.5 10.5V8a3.5 3.5 0 016.9-.8" /></>),
  eye: (f) => (<><path d="M2.8 12S6 6 12 6s9.2 6 9.2 6-3.2 6-9.2 6-9.2-6-9.2-6z" {...tint(f, 0.18)} /><circle cx="12" cy="12" r="2.6" {...solid(f)} /></>),
  eyeOff: () => (<><path d="M9.9 6.2A9.6 9.6 0 0112 6c6 0 9.2 6 9.2 6a15.5 15.5 0 01-2.7 3.4M6.2 8.1A15.5 15.5 0 002.8 12S6 18 12 18c1.3 0 2.5-.2 3.6-.7" /><path d="M4 4l16 16" /></>),
  trash: (f) => (
    <>
      <path d="M6.5 7l.8 11.2A2 2 0 009.3 20h5.4a2 2 0 002-1.8L17.5 7z" {...tint(f)} />
      <path d="M4.5 7h15M9.5 7V5a1.5 1.5 0 011.5-1.5h2A1.5 1.5 0 0114.5 5v2M10 11v5M14 11v5" />
    </>
  ),
  clone: (f) => (<><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" {...tint(f)} /><path d="M15.5 8.5V6.5a2 2 0 00-2-2h-7a2 2 0 00-2 2v7a2 2 0 002 2h2" /></>),
  lineStyle: () => (<><path d="M4 7h16" /><path d="M4 12h16" strokeDasharray="4 3" /><path d="M4 17h16" strokeDasharray="0.01 3.4" /></>),

  /* ---------------- top bar ---------------- */
  undo: () => <path d="M9.5 5L4.5 10l5 5M4.5 10h9.5a5.5 5.5 0 010 11H10" />,
  redo: () => <path d="M14.5 5l5 5-5 5M19.5 10H10a5.5 5.5 0 000 11h4" />,
  indicators: (f) => (<><path d="M4 4v16h16" /><path d="M7.8 15l3.4-4.4 3 2.5 4.3-5.6" />{f && <circle cx="18.5" cy="7.5" r="1.6" fill="currentColor" />}</>),
  measure: (f) => (
    <g transform="rotate(-45 12 12)">
      <rect x="2.6" y="8" width="18.8" height="8" rx="2.2" {...tint(f)} />
      <path d="M7.5 8v3M11.5 8v2M15.5 8v3M19 8v2" />
    </g>
  ),
  replay: (f) => (<><path d="M11 7.5v9L4.5 12z" {...solid(f)} /><path d="M19.5 7.5v9L13 12z" {...solid(f)} /></>),
  alert: (f) => (<><path d="M6.5 16.5v-6a5.5 5.5 0 0111 0v6l1.5 2H5z" {...tint(f, 0.22)} /><path d="M10 21.2a2 2 0 004 0" /></>),
  camera: (f) => (
    <>
      <path d="M4.5 8.5A1.5 1.5 0 016 7h2l1.5-2.5h5L16 7h2a1.5 1.5 0 011.5 1.5v9A1.5 1.5 0 0118 19H6a1.5 1.5 0 01-1.5-1.5z" {...tint(f)} />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  settings: () => (<><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></>),
  fullscreen: () => <path d="M4 9V6a2 2 0 012-2h3M15 4h3a2 2 0 012 2v3M20 15v3a2 2 0 01-2 2h-3M9 20H6a2 2 0 01-2-2v-3" />,
  fullscreenExit: () => <path d="M9 4v3a2 2 0 01-2 2H4M20 9h-3a2 2 0 01-2-2V4M15 20v-3a2 2 0 012-2h3M4 15h3a2 2 0 012 2v3" />,
  chevronDown: () => <path d="M6.5 9.5l5.5 5.5 5.5-5.5" />,
  chevronRight: () => <path d="M9.5 6.5l5.5 5.5-5.5 5.5" />,
  chevronLeft: () => <path d="M14.5 6.5L9 12l5.5 5.5" />,
  plus: () => <path d="M12 5v14M5 12h14" />,
  check: () => <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: () => <path d="M6 6l12 12M18 6L6 18" />,
  back: () => <path d="M15 5.5L8.5 12l6.5 6.5" />,
  play: () => <path d="M8 5.8v12.4a.8.8 0 001.2.7l10-6.2a.8.8 0 000-1.4l-10-6.2A.8.8 0 008 5.8z" fill="currentColor" />,
  pause: () => (<><rect x="6.5" y="5.5" width="3.8" height="13" rx="1.2" fill="currentColor" /><rect x="13.7" y="5.5" width="3.8" height="13" rx="1.2" fill="currentColor" /></>),
  stepFwd: () => (<><path d="M5.5 6.4v11.2a.7.7 0 001.1.6l8.6-5.6a.7.7 0 000-1.2L6.6 5.8a.7.7 0 00-1.1.6z" fill="currentColor" /><rect x="17.2" y="6" width="2.6" height="12" rx="1.1" fill="currentColor" stroke="none" /></>),
  stepBack: () => (<><path d="M18.5 6.4v11.2a.7.7 0 01-1.1.6l-8.6-5.6a.7.7 0 010-1.2l8.6-5.6a.7.7 0 011.1.6z" fill="currentColor" /><rect x="4.2" y="6" width="2.6" height="12" rx="1.1" fill="currentColor" stroke="none" /></>),
  jump: () => <path d="M4.5 12h10.5M11.5 7.5L16 12l-4.5 4.5M20 6v12" />,
  sun: () => (<><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></>),
  moon: () => <path d="M19 14.2A7.8 7.8 0 019.8 5 7.8 7.8 0 1019 14.2z" />,
  search: () => (<><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></>),
  calendar: (f) => (<><rect x="4.5" y="6" width="15" height="13.5" rx="2.8" {...tint(f)} /><path d="M4.5 10.5h15M8.5 4v3.5M15.5 4v3.5" /></>),
  star: (f) => <path d="M12 4.2l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.7-4.8 2.7 1-5.4-4-3.8 5.4-.7z" {...solid(f)} />,
  info: () => (<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8.1v.1" /></>),
  checkCircle: (f) => (<><circle cx="12" cy="12" r="8.5" {...tint(f)} /><path d="M8.2 12.3l2.6 2.6 5-5.4" /></>),
  more: () => (<><circle cx="6" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="18" cy="12" r="1.4" fill="currentColor" /></>),
  reset: () => <path d="M4.5 12a7.5 7.5 0 107.5-7.5c-2.3 0-4.3.9-5.8 2.4L4.5 8.5M4.5 4.5v4h4" />,
  sidebar: (f) => (
    <>
      {f && <path d="M3.5 7.7a3.2 3.2 0 013.2-3.2h2.8v15H6.7a3.2 3.2 0 01-3.2-3.2z" fill="currentColor" fillOpacity=".4" stroke="none" />}
      <rect x="3.5" y="4.5" width="17" height="15" rx="3.2" /><path d="M9.5 4.5v15" />
    </>
  ),
  layoutH: () => <rect x="3.5" y="8" width="17" height="8" rx="2.6" />,
  layoutV: () => <rect x="8" y="3.5" width="8" height="17" rx="2.6" />,
  grid: () => (<><rect x="4" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" /></>),
  list: () => <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />,
  trade: () => <path d="M5 17l5-5 3 3 6-7M14.5 8H19v4.5" />,

  /* ---------------- chart types ---------------- */
  candles: () => (<><path d="M8 4v16M16 6v13" /><rect x="5.5" y="8" width="5" height="8" rx="1.2" fill="currentColor" /><rect x="13.5" y="9.5" width="5" height="6" rx="1.2" fill="currentColor" /></>),
  hollow: () => (<><path d="M8 4v16M16 6v13" /><rect x="5.5" y="8" width="5" height="8" rx="1.2" /><rect x="13.5" y="9.5" width="5" height="6" rx="1.2" fill="currentColor" /></>),
  bars: () => <path d="M7.5 4v16M4.5 8.5h3M7.5 15.5h3M16.5 6v14M13.5 10.5h3M16.5 17h3" />,
  line: () => <path d="M3.5 17l5.5-6.5 4.5 3.5 7-8.5" />,
  area: () => (<><path d="M3.5 17l5.5-6.5 4.5 3.5 7-8.5V20H3.5z" fill="currentColor" fillOpacity=".2" stroke="none" /><path d="M3.5 17l5.5-6.5 4.5 3.5 7-8.5" /></>),
  baseline: () => (<><path d="M3.5 12h17" strokeDasharray="2 3" strokeOpacity=".6" /><path d="M3.5 17l5-6 5 4 7-8" /></>),
};

export type IconName = keyof typeof P | (string & {});

/**
 * `size` is the rendered px size (glyphs are drawn for 20 – 24px; 18px stays legible).
 * `filled` selects the SF-Symbols `.fill`-style variant — used for the ACTIVE tool.
 */
export function I({ name, size = 20, filled = false, ...rest }: { name: IconName; size?: number; filled?: boolean } & Omit<SVGProps<SVGSVGElement>, "name">) {
  const def = P[name as string];
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}
    >
      {def ? def(filled) : null}
    </svg>
  );
}

/** Names of every glyph (used by the icon contact-sheet check). */
export const ICON_NAMES = Object.keys(P);
