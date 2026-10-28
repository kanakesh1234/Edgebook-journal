import type { ReactNode, SVGProps } from "react";

/* Hand-drawn 28×28 line icons in the style of TradingView's toolbars. */

const P: Record<string, ReactNode> = {
  // cursors
  cross: <><path d="M14 5v18M5 14h18" /></>,
  dot: <circle cx="14" cy="14" r="2.6" fill="currentColor" stroke="none" />,
  arrow: <path d="M8 6l12 7.2-5.2 1.4L18.6 21l-2.4 1.2-3.8-6.4-4.4 3.4z" fill="currentColor" stroke="none" />,
  eraser: <><path d="M16.5 6.5l5 5-8.2 8.2H8.8l-3.3-3.3a1.4 1.4 0 010-2z" /><path d="M10 11.5l6 6M13.3 19.7H22" /></>,
  // lines
  trendLine: <><path d="M6 21L22 7" /><circle cx="6" cy="21" r="2" /><circle cx="22" cy="7" r="2" /></>,
  ray: <><path d="M6 21L24 5" /><circle cx="6" cy="21" r="2" /><circle cx="15" cy="13" r="2" /></>,
  infoLine: <><path d="M6 22L22 10" /><circle cx="6" cy="22" r="2" /><circle cx="22" cy="10" r="2" /><rect x="9" y="5" width="9" height="5" rx="1" /></>,
  extendedLine: <><path d="M4 23L24 5" /><circle cx="10" cy="17.6" r="2" /><circle cx="18" cy="10.4" r="2" /></>,
  hLine: <><path d="M4 14h20" /><circle cx="14" cy="14" r="2" /></>,
  hRay: <><path d="M7 14h17" /><circle cx="7" cy="14" r="2" /></>,
  vLine: <><path d="M14 4v20" /><circle cx="14" cy="14" r="2" /></>,
  crossLine: <><path d="M4 14h20M14 4v20" /><circle cx="14" cy="14" r="2" /></>,
  channel: <><path d="M5 17L21 8M7 23l16-9" /><path d="M6 20l16-9" strokeDasharray="2 2" /></>,
  arrowMarker: <><path d="M6 22L21 7" /><path d="M13 7h8v8" /></>,
  // fib / forecasting
  fib: <><path d="M5 7h18M5 11h18M5 15h18M5 21h18" /><path d="M7 21L21 7" strokeDasharray="2 2" /></>,
  longPos: <><rect x="6" y="6" width="16" height="8" fill="currentColor" fillOpacity=".25" /><rect x="6" y="14" width="16" height="7" /><path d="M6 14h16" /></>,
  shortPos: <><rect x="6" y="7" width="16" height="7" /><rect x="6" y="14" width="16" height="8" fill="currentColor" fillOpacity=".25" /><path d="M6 14h16" /></>,
  priceRange: <><path d="M5 7h18M5 21h18M14 7v14" /><path d="M11.5 10L14 7l2.5 3M11.5 18L14 21l2.5-3" /></>,
  dateRange: <><path d="M7 5v18M21 5v18M7 14h14" /><path d="M10 11.5L7 14l3 2.5M18 11.5l3 2.5-3 2.5" /></>,
  datePriceRange: <><rect x="6" y="7" width="16" height="14" /><path d="M14 7v14M6 14h16" strokeDasharray="2 2" /></>,
  ruler: <><path d="M5.5 18.5L18.5 5.5l4 4-13 13z" /><path d="M9 15l2 2M12 12l2 2M15 9l2 2" /></>,
  // shapes
  brush: <><path d="M6 22c3 0 4.5-1.5 4.5-3.5 0-1.6 1.2-2.5 2.5-2.5l7.5-7.5a2.1 2.1 0 00-3-3L10 12.5c0 1.5-1 2.5-2.5 2.5S5 17 5 19c0 1.5 0 3-1 3z" /></>,
  rect: <rect x="6" y="8" width="16" height="12" rx="1" />,
  ellipse: <ellipse cx="14" cy="14" rx="9" ry="6.5" />,
  triangle: <path d="M14 6l9 16H5z" />,
  text: <><path d="M7 7h14M14 7v15" /></>,
  emoji: <><circle cx="14" cy="14" r="9" /><path d="M10.5 16.5c1 1.6 2.1 2.3 3.5 2.3s2.5-.7 3.5-2.3" /><circle cx="11" cy="11.5" r=".8" fill="currentColor" /><circle cx="17" cy="11.5" r=".8" fill="currentColor" /></>,
  // utility
  zoomIn: <><circle cx="12.5" cy="12.5" r="6.5" /><path d="M17.5 17.5L23 23M12.5 9.5v6M9.5 12.5h6" /></>,
  magnet: <><path d="M8 6v8a6 6 0 0012 0V6" /><path d="M8 6h4v8a2 2 0 004 0V6h4" /><path d="M8 10h4M16 10h4" /></>,
  stayDraw: <><path d="M6 20l3-1 10-10-2-2L7 17z" /><path d="M20 20h-5M17.5 17.5v5" /></>,
  lock: <><rect x="7.5" y="12" width="13" height="9" rx="1.5" /><path d="M10.5 12V9.5a3.5 3.5 0 017 0V12" /></>,
  unlock: <><rect x="7.5" y="12" width="13" height="9" rx="1.5" /><path d="M10.5 12V9.5a3.5 3.5 0 016.7-1.4" /></>,
  eye: <><path d="M4 14s3.6-6 10-6 10 6 10 6-3.6 6-10 6S4 14 4 14z" /><circle cx="14" cy="14" r="2.8" /></>,
  eyeOff: <><path d="M4 14s3.6-6 10-6c1.6 0 3 .4 4.3 1M24 14s-3.6 6-10 6c-1.6 0-3-.4-4.3-1" /><path d="M6 6l16 16" /></>,
  trash: <><path d="M7 9h14M11 9V6.5h6V9M9 9l1 13h8l1-13" /><path d="M12.5 12.5v6M15.5 12.5v6" /></>,
  clone: <><rect x="9" y="9" width="12" height="12" rx="1.5" /><path d="M7 17V8a1 1 0 011-1h9" /></>,
  lineStyle: <><path d="M5 9h18" /><path d="M5 14h18" strokeDasharray="4 3" /><path d="M5 19h18" strokeDasharray="1 3" strokeLinecap="round" /></>,
  // top bar
  undo: <><path d="M10 8L6 12l4 4" /><path d="M6 12h9a5 5 0 010 10h-3" /></>,
  redo: <><path d="M18 8l4 4-4 4" /><path d="M22 12h-9a5 5 0 000 10h3" /></>,
  indicators: <><path d="M4 19l5-6 4 3 6-9" /><path d="M4 23h20" /><circle cx="21" cy="7" r="1.6" fill="currentColor" stroke="none" /></>,
  measure: <><rect x="4" y="9" width="20" height="10" rx="2" /><path d="M8 9v4M12 9v3M16 9v4M20 9v3" /></>,
  replay: <><path d="M12 8l-6 6 6 6V8z" fill="currentColor" stroke="none" /><path d="M21 8l-6 6 6 6V8z" fill="currentColor" stroke="none" /></>,
  alert: <><path d="M7 20h14l-2-3v-5a5 5 0 00-10 0v5z" /><path d="M12 22.5a2.2 2.2 0 004 0" /></>,
  camera: <><path d="M5 10h4l1.5-2.5h7L19 10h4v11H5z" /><circle cx="14" cy="15" r="3.5" /></>,
  settings: <><circle cx="14" cy="14" r="3.2" /><path d="M14 4.5v3M14 20.5v3M4.5 14h3M20.5 14h3M7.3 7.3l2.1 2.1M18.6 18.6l2.1 2.1M7.3 20.7l2.1-2.1M18.6 9.4l2.1-2.1" /></>,
  fullscreen: <path d="M5 11V5h6M17 5h6v6M23 17v6h-6M11 23H5v-6" />,
  fullscreenExit: <path d="M11 5v6H5M23 11h-6V5M17 23v-6h6M5 17h6v6" />,
  chevronDown: <path d="M9 12l5 5 5-5" />,
  chevronRight: <path d="M12 9l5 5-5 5" />,
  chevronLeft: <path d="M16 9l-5 5 5 5" />,
  plus: <path d="M14 7v14M7 14h14" />,
  check: <path d="M7 14.5l4.5 4.5L21 9" />,
  close: <path d="M8 8l12 12M20 8L8 20" />,
  back: <path d="M17 7l-7 7 7 7" />,
  play: <path d="M9 6.5v15l13-7.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="8" y="7" width="4" height="14" fill="currentColor" stroke="none" /><rect x="16" y="7" width="4" height="14" fill="currentColor" stroke="none" /></>,
  stepFwd: <><path d="M7 6.5v15l11-7.5z" fill="currentColor" stroke="none" /><rect x="20" y="7" width="2.5" height="14" fill="currentColor" stroke="none" /></>,
  stepBack: <><path d="M21 6.5v15L10 14z" fill="currentColor" stroke="none" /><rect x="5.5" y="7" width="2.5" height="14" fill="currentColor" stroke="none" /></>,
  jump: <><path d="M14 4v20" /><path d="M9 9l5-5 5 5" opacity="0" /><path d="M5 14h18" strokeDasharray="2 2" opacity="0" /><circle cx="14" cy="14" r="2.5" fill="currentColor" stroke="none" /></>,
  sun: <><circle cx="14" cy="14" r="4" /><path d="M14 4v3M14 21v3M4 14h3M21 14h3M6.9 6.9l2.1 2.1M19 19l2.1 2.1M6.9 21.1L9 19M19 9l2.1-2.1" /></>,
  moon: <path d="M20 17.5A8 8 0 0110.5 8 8 8 0 1020 17.5z" />,
  search: <><circle cx="12.5" cy="12.5" r="6" /><path d="M17 17l5 5" /></>,
  calendar: <><rect x="5.5" y="7" width="17" height="15" rx="2" /><path d="M5.5 12h17M10 4.5v4M18 4.5v4" /></>,
  star: <path d="M14 5l2.7 5.6 6.1.9-4.4 4.3 1 6.1L14 18.9 8.6 21.9l1-6.1-4.4-4.3 6.1-.9z" />,
  // chart types
  candles: <><path d="M9 6v16M19 8v13" /><rect x="6.5" y="10" width="5" height="8" fill="currentColor" stroke="none" /><rect x="16.5" y="11" width="5" height="7" fill="currentColor" stroke="none" /></>,
  hollow: <><path d="M9 6v16M19 8v13" /><rect x="6.5" y="10" width="5" height="8" /><rect x="16.5" y="11" width="5" height="7" fill="currentColor" stroke="none" /></>,
  bars: <><path d="M9 6v16M6 10h3M19 7v15M19 18h3" /></>,
  line: <path d="M4 20l6-8 5 4 9-10" />,
  area: <><path d="M4 20l6-8 5 4 9-10v14H4z" fill="currentColor" fillOpacity=".2" /><path d="M4 20l6-8 5 4 9-10" /></>,
  baseline: <><path d="M4 14h20" strokeDasharray="2 2" /><path d="M4 18l6-8 5 6 9-8" /></>,
  trade: <><path d="M7 19l5-5 3 3 6-8" /><path d="M16 9h5v5" /></>,
  list: <path d="M7 8h14M7 14h14M7 20h14" />,
};

export function I({ name, size = 28, ...rest }: { name: keyof typeof P | string; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}
    >
      {P[name] ?? null}
    </svg>
  );
}
