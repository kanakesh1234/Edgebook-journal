/**
 * Curriculum — what each level actually asks.
 *
 * Before this, "Level up" only raised the gate (how many right answers you need). The questions themselves
 * barely changed, and they stopped changing at about level 10. Now every level has a plan:
 *
 *   - a named STAGE (Recognition → Recall → Application → Analysis → Mastery) so a level-up says what is new
 *   - a TIER MIX: the share of tier-1…4 questions in a round. It is a bell centred on the level's target
 *     difficulty, with a guaranteed slice of review from easier tiers and a small stretch from the next one
 *   - a BLUNDER BOOST: the higher the level, the more of the round is spent on your mistake trades
 *
 * Pure functions, no imports — it loads anywhere (including plain-node tests).
 */

export type Tier = 1 | 2 | 3 | 4;

export interface Stage { from: number; name: string; blurb: string; asks: string }

export const STAGES: readonly Stage[] = [
  { from: 1, name: "Recognition", blurb: "Spot what you recorded.", asks: "Side, result, setup and the mistake you named — mostly pick-the-answer." },
  { from: 3, name: "Recall", blurb: "Remember your own words and times.", asks: "Entry windows, your notes and lessons, and which process flags you recorded." },
  { from: 5, name: "Application", blurb: "Do the numbers on your own trades.", asks: "What your mistakes cost you — points past your stop, dollars lost, how big the loss was." },
  { from: 8, name: "Analysis", blurb: "Find the patterns behind your results.", asks: "Repeated mistakes, what they cost in total, and the rule you wrote for yourself." },
  { from: 12, name: "Mastery", blurb: "Answer without a safety net.", asks: "Typed answers instead of choices, and comparisons across many trades." },
];

export function stageOf(level: number): Stage {
  const lv = Math.max(1, Math.floor(level));
  let current = STAGES[0]!;
  for (const stage of STAGES) if (lv >= stage.from) current = stage;
  return current;
}

/** The stage that STARTS at this level, or null when the level is in the middle of a stage. */
export const newStageAt = (level: number): Stage | null => STAGES.find((s) => s.from === Math.floor(level)) ?? null;

/** Question difficulty (1–4, fractional) for a level: level 1 mixes recognition with recall; tier 4 is reached around level 10. */
export function targetDifficulty(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return Math.min(4, 1.4 + (lv - 1) * 0.3);
}

/** Shares of tier 1…4 questions in one round. Always sums to 1. */
export function tierMix(level: number): [number, number, number, number] {
  const t = targetDifficulty(level);
  const lv = Math.max(1, Math.floor(level));
  const raw = [1, 2, 3, 4].map((tier) => Math.exp(-((tier - t) ** 2) / (2 * 0.55 * 0.55)));
  // Review: from level 2 up, keep a slice of easier questions so old ground stays fresh.
  const easier = [1, 2, 3, 4].filter((tier) => tier < Math.floor(t));
  if (lv >= 2 && easier.length) for (const tier of easier) raw[tier - 1]! += 0.15 / easier.length;
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => v / sum) as [number, number, number, number];
}

/** Fraction of a round given to mistake trades beyond their normal weight: 0 at level 1, up to +0.2 by level 11. */
export const blunderBoost = (level: number): number => Math.min(0.2, Math.max(0, (Math.floor(level) - 1) * 0.02));

/** What to tell the player when they reach `level`. */
export function levelUpNote(level: number): { title: string; body: string } {
  const stage = stageOf(level);
  const fresh = newStageAt(level);
  if (fresh) return { title: `New stage · ${fresh.name}`, body: fresh.asks };
  const mix = tierMix(level);
  const hardest = mix[3] >= 0.5 ? "Most questions are now the hardest tier." : mix[2] + mix[3] >= 0.5 ? "More of the round is application and analysis." : "A little more recall, a little less recognition.";
  return { title: `${stage.name} · deeper`, body: `${hardest} More of the round goes to the trades you made mistakes on.` };
}
