/**
 * SCENE CONFIGURATION — the only file you need to edit to retime the film or change copy.
 * Nothing in here knows about CSS or transforms; see cinema-scene.ts for the math and
 * landing.css for how the resulting variables are turned into motion.
 *
 * Ranges are [start, end] in normalised scroll progress (0 = top of the film, 1 = bottom).
 */

type Range = readonly [number, number];

export const TIMELINE = {
  /** Slow camera dolly for the far world (sky → water). Runs across the whole film. */
  camera: [0, 0.56] as Range,
  /** Hero gate grows toward the viewer. */
  push: [0, 0.27] as Range,
  /** Opening title + intro copy leave. */
  introExit: [0.02, 0.1] as Range,
  /** The two doors split. */
  open: [0.15, 0.27] as Range,
  /** The doors and the light behind them pass the camera and are gone. */
  exit: [0.36, 0.46] as Range,

  /** Narrative A (inside the gate): in → hold → out. */
  panelA: { in: [0.22, 0.28] as Range, out: [0.37, 0.43] as Range },
  /** Pop-up chips attached to narrative A. */
  popsA: [
    [0.265, 0.3],
    [0.285, 0.32],
  ] as Range[],

  /** Clean panorama + quote. */
  quote: { in: [0.45, 0.48] as Range, out: [0.52, 0.55] as Range },

  /** Narrative B (over the softened world). */
  panelB: { in: [0.55, 0.61] as Range, out: [0.69, 0.73] as Range },
  popsB: [
    [0.6, 0.63],
    [0.645, 0.68],
  ] as Range[],
  /** World softens for B, then returns to focus. */
  focus: { in: [0.52, 0.6] as Range, out: [0.72, 0.78] as Range },

  /** Catalog rail slides in horizontally; the world softens behind it. */
  catalog: [0.78, 0.88] as Range,
  /** Rail controls + final call-to-action settle. */
  controls: [0.86, 0.93] as Range,
  /** Scrolling itself carries the rail through every card (so nothing is stranded off-screen). */
  railScrub: [0.9, 1] as Range,
} as const;

/**
 * Real scroll positions for navigation. Each becomes an in-page anchor inside the film.
 * `flow` is the element to scroll to instead when reduced motion turns the film into a
 * normal-flow page (there is no timeline to jump along then).
 */
export const MARKERS = [
  { id: "top", p: 0, flow: null },
  { id: "method", p: 0.31, flow: "flow-method" },
  { id: "minato", p: 0.66, flow: "flow-minato" },
  { id: "features", p: 0.93, flow: "flow-features" },
] as const;

export const NAV_LINKS = [
  { label: "Method", href: "#method" },
  { label: "Minato", href: "#minato" },
  { label: "Features", href: "#features" },
] as const;

export const COPY = {
  intro: {
    eyebrow: "Edgebook",
    titleLead: "Record the",
    titleAccent: "decision.",
    sub: "The trading journal that reviews with you.",
    primary: { label: "Start your journal", href: "/login?mode=signup" },
    secondary: { label: "See how it works", href: "#method" },
    cue: "Scroll",
  },
  panelA: {
    eyebrow: "01 · Plan",
    title: "Decide before the bell.",
    body: "Write your intention while the market is quiet. Then hold yourself to it.",
    chip: { time: "08:45", label: "Intention locked" },
    pops: ["Risk capped at 1R", "No revenge trades"],
  },
  quote: "Calm is a position you can hold.",
  panelB: {
    eyebrow: "02 · Review",
    title: "Review with someone who remembers.",
    body: "Minato has read every entry. Ask it anything about your own trading.",
    tag: "Example conversation",
    ask: "Why do I lose on Fridays?",
    answer: "You size up after two wins. It shows in 7 of your last 9 Friday losses.",
  },
  catalog: {
    eyebrow: "Inside",
    title: "One calm practice.",
    primary: { label: "Start your journal", href: "/login?mode=signup" },
    secondary: { label: "Log in", href: "/login" },
  },
} as const;

export type GlyphKey =
  | "plan"
  | "review"
  | "replay"
  | "practice"
  | "minato"
  | "progress"
  | "weekly"
  | "drive";

export interface CatalogItem {
  glyph: GlyphKey;
  title: string;
  line: string;
}

export const CATALOG: CatalogItem[] = [
  { glyph: "plan", title: "Plan", line: "Lock your intention before the bell." },
  { glyph: "review", title: "Review", line: "Judge the decision, not the outcome." },
  { glyph: "replay", title: "Replay", line: "Rewind the tape. Trade it again." },
  { glyph: "practice", title: "Practice", line: "Train away the mistakes that repeat." },
  { glyph: "minato", title: "Minato", line: "An assistant that has read every entry." },
  { glyph: "progress", title: "Progress", line: "See the journey, not only the P&L." },
  { glyph: "weekly", title: "Weekly review", line: "Three minutes. Then close the cover." },
  { glyph: "drive", title: "Your Drive", line: "Lives in your own Google Drive." },
];

/** Motivational lines for the pinned quote section. Original; deliberately unattributed. */
export const QUOTES = [
  "The market pays for patience and charges for impatience.",
  "One clean decision beats ten lucky trades.",
  "Review today. Compound tomorrow.",
] as const;

export const STATEMENT = {
  text: "Your journal lives in your own Google Drive. Plain, portable, and entirely yours.",
  json: { schema: "edgebook.journal.v1", owner: "you@drive", entries: 128, format: "json" },
  note: { title: "Saved to Google Drive", meta: "just now" },
  sample: "Sample data",
} as const;

export const FINALE = {
  title: "Your edge deserves a",
  accent: "ledger.",
  primary: { label: "Start your journal", href: "/login?mode=signup" },
  secondary: { label: "Log in", href: "/login" },
} as const;

export const FOOTER = {
  email: "kanakesh939264@gmail.com",
  disclaimer:
    "Edgebook is for educational and journaling purposes only. It is not financial advice, and trading involves risk.",
} as const;
