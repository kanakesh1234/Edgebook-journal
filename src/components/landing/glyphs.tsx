import type { GlyphKey } from "./scene-config";

/** Hand-drawn 48×48 stroke glyphs for the catalog. Decorative: always aria-hidden. */
const PATHS: Record<GlyphKey, string> = {
  plan: "M24 8a16 16 0 1 0 0 32 16 16 0 0 0 0-32Zm0 9v8l6 4",
  review: "M10 11h28v26H10zM10 19h28M17 28l4.5 4.5L31 24",
  replay: "M23 15v18l-13-9zM39 15v18l-13-9z",
  practice: "M24 8a16 16 0 1 0 0 32 16 16 0 0 0 0-32Zm0 8a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z",
  minato: "M24 7l4 12 12 5-12 5-4 12-4-12-12-5 12-5z",
  progress: "M8 37l11-11 7 6 14-17M31 15h9v9",
  weekly: "M10 13h28v25H10zM10 22h28M17 9v8M31 9v8M18 31l4 4 8-8",
  drive: "M15 36a8 8 0 0 1-1-15.9A11 11 0 0 1 35 22a7 7 0 0 1-1 14Z",
};

export function Glyph({ name, className }: { name: GlyphKey; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
