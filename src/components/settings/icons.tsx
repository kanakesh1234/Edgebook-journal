/* Settings-only glyphs — monoline, rounded, SF-Symbols-style. 24px grid. */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1em"
      height="1em"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

/** circle.lefthalf.filled */
export const AppearanceGlyph = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" />
  </Svg>
);

/** internaldrive */
export const DatabaseGlyph = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="6" width="17" height="12" rx="3" />
    <path d="M3.5 13.5h17" />
    <circle cx="16.5" cy="16" r="0.6" fill="currentColor" />
  </Svg>
);

/** clock.arrow.circlepath */
export const ClockRewindGlyph = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4.5v4.2h4.2" />
    <path d="M12 7.8V12l2.8 1.8" />
  </Svg>
);

export const MinusGlyph = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M6 12h12" />
  </Svg>
);

export const PlusGlyph = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M12 6v12M6 12h12" />
  </Svg>
);

/** arrow.up.right */
export const ArrowUpRightGlyph = (p: P) => (
  <Svg {...p}>
    <path d="M7 17 17 7" />
    <path d="M8.5 7H17v8.5" />
  </Svg>
);
