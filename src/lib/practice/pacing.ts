/**
 * Pacing — how long the feedback stays on screen before the next question arrives.
 *
 * Nothing here is a setting. The round adapts to the player:
 *   - a right answer moves on quickly, and faster still once they are in a flow (combo);
 *   - a wrong answer holds a little longer, scaled to how much there is to read;
 *   - Enter, Space or a tap always skips the wait.
 *
 * Pure functions only, so the rules are easy to test.
 */

const RIGHT_MS = 520;
const RIGHT_FLOW_MS = 380;
const FLOW_AT = 3;
const WRONG_MIN_MS = 1400;
const WRONG_MAX_MS = 2600;
const MS_PER_WORD = 110;

/** Milliseconds to hold the feedback before advancing. */
export function feedbackDwellMs(args: { correct: boolean; combo: number; explanation?: string }): number {
  if (args.correct) return args.combo >= FLOW_AT ? RIGHT_FLOW_MS : RIGHT_MS;
  const words = args.explanation ? brief(args.explanation).split(/\s+/).filter(Boolean).length : 0;
  return Math.min(WRONG_MAX_MS, Math.max(WRONG_MIN_MS, 900 + words * MS_PER_WORD));
}

/** The first sentence of an explanation, trimmed to a length that can be read at a glance. */
export function brief(text: string | undefined, maxChars = 150): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const stop = clean.search(/[.!?](\s|$)/);
  const first = stop >= 0 ? clean.slice(0, stop + 1) : clean;
  if (first.length <= maxChars) return first;
  const cut = first.slice(0, maxChars - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : cut.length).trimEnd()}…`;
}
