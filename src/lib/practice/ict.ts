/**
 * ICT Lab — Inner Circle Trader / Smart Money Concepts challenges.
 *
 * Two sources, both free of journal data so the mode works from day one:
 *   1. A curated concept bank (liquidity, FVGs, structure, premium/discount, sessions, process).
 *   2. Scene generators that DRAW a few candles and compute the answer in code
 *      (is there an FVG? what is its midpoint? what just happened at the equal highs?).
 *      Nothing is hand-labelled, so every generated answer is right by construction.
 *
 * Pure functions only (no React, no storage) so they are easy to test.
 */
import type { PracticeQuestion } from "./engine.ts";
import { seededRng, type Rng } from "./math/rng.ts";

/* -------------------------------- visuals -------------------------------- */

export interface Candle { o: number; h: number; l: number; c: number }
export type VisualTone = "gold" | "info" | "profit" | "loss" | "muted";
export interface VisualLevel { price: number; label: string; tone?: VisualTone; /** Only drawn once the question is answered. */ reveal?: boolean }
export interface VisualZone { from: number; to: number; label?: string; tone?: VisualTone; reveal?: boolean }
/** A tiny drawn scene. All numbers are plain data, so it survives the missed-question bank. */
export interface QuestionVisual { kind: "candles"; candles: Candle[]; levels?: VisualLevel[]; zones?: VisualZone[] }

/* -------------------------------- topics -------------------------------- */

export const ICT_TOPICS = [
  { tag: "ict-liquidity", label: "Liquidity" },
  { tag: "ict-fvg", label: "Fair value gaps" },
  { tag: "ict-structure", label: "Market structure" },
  { tag: "ict-blocks", label: "Order blocks" },
  { tag: "ict-pd", label: "Premium & discount" },
  { tag: "ict-sessions", label: "Sessions & time" },
  { tag: "ict-process", label: "Process & risk" },
] as const;

export const isIctTag = (tag: string) => tag.startsWith("ict-");

/* -------------------------------- helpers -------------------------------- */

type Level = 1 | 2 | 3 | 4;
const PIN = "ICT concept";

const round = (n: number, d = 2) => Number(n.toFixed(d));
const px = (n: number) => (Number.isInteger(n) ? String(n) : String(round(n, 2)));

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function choice(id: string, tag: string, level: Level, prompt: string, answer: string, options: string[], explanation: string, rng: Rng, visual?: QuestionVisual): PracticeQuestion {
  const all = [...new Set([answer, ...options])];
  return { id, fp: id, source: "local", group: "ict", kind: "choice", tag, level, pin: PIN, prompt, choices: shuffle(all, rng), answer, explanation, xp: 10 * level, visual };
}

function numeric(id: string, tag: string, level: Level, prompt: string, answer: number, tolerance: number, unit: string, explanation: string, visual?: QuestionVisual): PracticeQuestion {
  return { id, fp: id, source: "local", group: "ict", kind: "number", tag, level, pin: PIN, prompt, answer: String(round(answer, 4)), tolerance, unit, explanation, xp: 12 * level, visual };
}

/** A candle from open/close plus the wick tips. */
const candle = (o: number, c: number, h: number, l: number): Candle => ({ o, c, h: Math.max(h, o, c), l: Math.min(l, o, c) });

/** Flip a scene upside down around `center` (turns a "highs" scene into a "lows" scene). */
const mirror = (candles: Candle[], center: number): Candle[] => candles.map((k) => ({ o: 2 * center - k.o, c: 2 * center - k.c, h: 2 * center - k.l, l: 2 * center - k.h }));

/* -------------------------------- generators -------------------------------- */

const halves = (rng: Rng, min: number, max: number) => rng.int(min * 2, max * 2) / 2;
const basePrice = (rng: Rng) => rng.int(150, 420) * 10;

interface Fvg { candles: Candle[]; kind: "bullish" | "bearish" | "none"; top: number; bottom: number; c1: Candle; c3: Candle }

/** Three candles with (or without) a fair value gap between candle 1 and candle 3. */
function fvgScene(rng: Rng, kind: Fvg["kind"]): Fvg {
  const b = basePrice(rng);
  const gap = halves(rng, 2, 9);
  const overlap = halves(rng, 1, 3);
  // Built as a bullish sequence, then mirrored for the bearish case.
  const c1 = candle(b + 1, b + 4, b + 5, b);
  const c3Low = kind === "none" ? c1.h - overlap : c1.h + gap;
  const c3High = c3Low + halves(rng, 3, 7);
  const c3 = candle(c3Low + 1, c3High - 1, c3High, c3Low);
  const c2 = candle(b + 4, c3High, c3High + 1, b + 3);
  let candles = [c1, c2, c3];
  const flip = kind === "bearish" || (kind === "none" && rng.next() < 0.5);
  if (flip) candles = mirror(candles, b + 6);
  const [k1, , k3] = candles as [Candle, Candle, Candle];
  // The one rule: bullish when candle 1's high sits below candle 3's low, bearish when candle 1's low sits above candle 3's high.
  const detected: Fvg["kind"] = k1.h < k3.l ? "bullish" : k1.l > k3.h ? "bearish" : "none";
  const top = detected === "bullish" ? k3.l : detected === "bearish" ? k1.l : 0;
  const bottom = detected === "bullish" ? k1.h : detected === "bearish" ? k3.h : 0;
  return { candles, kind: detected, top, bottom, c1: k1, c3: k3 };
}

function fvgQuestions(rng: Rng): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const kinds: Fvg["kind"][] = ["bullish", "bearish", "none"];
  const scene = fvgScene(rng, rng.pick(kinds));
  const key = `${scene.kind}:${scene.candles.map((k) => `${k.o}-${k.c}-${k.h}-${k.l}`).join("|")}`;
  const gapZone: VisualZone[] = scene.kind === "none" ? [] : [{ from: scene.bottom, to: scene.top, label: "FVG", tone: scene.kind === "bullish" ? "profit" : "loss", reveal: true }];
  const visual: QuestionVisual = { kind: "candles", candles: scene.candles, zones: gapZone };
  const label = { bullish: "Bullish FVG", bearish: "Bearish FVG", none: "No FVG" }[scene.kind];

  out.push(choice(
    `ict:gen:fvg-read:${key}`, "ict-fvg", 1,
    "Look at the three candles. Which one describes the gap between candle 1 and candle 3?",
    label, ["Bullish FVG", "Bearish FVG", "No FVG"],
    scene.kind === "none"
      ? "Candle 1's wick and candle 3's wick overlap, so there is no unfilled space between them — no fair value gap."
      : scene.kind === "bullish"
        ? `Candle 1's high (${px(scene.bottom)}) is below candle 3's low (${px(scene.top)}). The space between them is a bullish FVG.`
        : `Candle 1's low (${px(scene.top)}) is above candle 3's high (${px(scene.bottom)}). The space between them is a bearish FVG.`,
    rng, visual,
  ));

  if (scene.kind !== "none") {
    const size = round(scene.top - scene.bottom);
    const words = scene.kind === "bullish" ? `candle 1 high ${px(scene.bottom)}, candle 3 low ${px(scene.top)}` : `candle 1 low ${px(scene.top)}, candle 3 high ${px(scene.bottom)}`;
    out.push(numeric(
      `ict:gen:fvg-size:${key}`, "ict-fvg", 2,
      `${scene.kind === "bullish" ? "Bullish" : "Bearish"} FVG: ${words}. How many points wide is the gap?`,
      size, 0.01, "pts", `Gap = ${px(scene.top)} − ${px(scene.bottom)} = ${px(size)} points.`, visual,
    ));
    const ce = round((scene.top + scene.bottom) / 2);
    out.push(numeric(
      `ict:gen:fvg-ce:${key}`, "ict-fvg", 3,
      `The same FVG spans ${px(scene.bottom)} to ${px(scene.top)}. Where is its consequent encroachment (CE)?`,
      ce, 0.01, "", `CE is the 50% midpoint of the gap: (${px(scene.top)} + ${px(scene.bottom)}) ÷ 2 = ${px(ce)}.`, visual,
    ));
  }
  return out;
}

function rangeQuestions(rng: Rng): PracticeQuestion[] {
  const low = basePrice(rng);
  const span = rng.int(4, 12) * 5;
  const high = low + span;
  const mid = low + span / 2;
  // keep price clearly off the midpoint so the call is never a coin toss
  const offset = halves(rng, Math.ceil(span * 0.12), Math.floor(span * 0.45));
  const price = rng.next() < 0.5 ? mid + offset : mid - offset;
  const zone = price > mid ? "Premium" : "Discount";
  const key = `${low}-${high}-${price}`;
  const visual: QuestionVisual = {
    kind: "candles",
    candles: [candle(low + span * 0.2, high - span * 0.1, high, low + span * 0.1), candle(high - span * 0.1, price, high - span * 0.05, price - 1)],
    levels: [
      { price: high, label: `Swing high ${px(high)}`, tone: "muted" },
      { price: low, label: `Swing low ${px(low)}`, tone: "muted" },
      { price, label: `Price ${px(price)}`, tone: "gold" },
      { price: mid, label: "50%", tone: "info", reveal: true },
    ],
    zones: [
      { from: mid, to: high, label: "Premium", tone: "loss", reveal: true },
      { from: low, to: mid, label: "Discount", tone: "profit", reveal: true },
    ],
  };
  const questions: PracticeQuestion[] = [];
  questions.push(choice(
    `ict:gen:pd-zone:${key}`, "ict-pd", 2,
    `The dealing range is ${px(low)} – ${px(high)} and price is trading at ${px(price)}. Is price in premium or discount?`,
    zone, ["Premium", "Discount", "Exactly at equilibrium"],
    `Equilibrium is ${px(mid)}. ${px(price)} is ${price > mid ? "above" : "below"} it, so price is in ${zone.toLowerCase()}.`,
    rng, visual,
  ));
  questions.push(numeric(
    `ict:gen:pd-eq:${key}`, "ict-pd", 3,
    `Dealing range: swing low ${px(low)}, swing high ${px(high)}. What is the equilibrium (50%) level?`,
    mid, 0.01, "", `(${px(low)} + ${px(high)}) ÷ 2 = ${px(mid)}.`, visual,
  ));
  return questions;
}

function oteQuestion(rng: Rng): PracticeQuestion {
  const low = basePrice(rng);
  const span = rng.int(4, 14) * 5;
  const high = low + span;
  const bullish = rng.next() < 0.5;
  const ratio = rng.pick([0.62, 0.705, 0.79] as const);
  // A bullish leg retraces DOWN from the high; a bearish leg retraces UP from the low.
  const level = round(bullish ? high - ratio * span : low + ratio * span, 3);
  const leg = bullish ? `a bullish leg from ${px(low)} up to ${px(high)}` : `a bearish leg from ${px(high)} down to ${px(low)}`;
  const visual: QuestionVisual = {
    kind: "candles",
    candles: bullish ? [candle(low + 1, low + span * 0.45, low + span * 0.5, low), candle(low + span * 0.45, high, high, low + span * 0.4)] : [candle(high - 1, high - span * 0.45, high, high - span * 0.5), candle(high - span * 0.45, low, high - span * 0.4, low)],
    levels: [{ price: high, label: `High ${px(high)}`, tone: "muted" }, { price: low, label: `Low ${px(low)}`, tone: "muted" }, { price: level, label: `${ratio * 100}%`, tone: "gold", reveal: true }],
    zones: [{ from: bullish ? high - 0.79 * span : low + 0.62 * span, to: bullish ? high - 0.62 * span : low + 0.79 * span, label: "OTE", tone: "info", reveal: true }],
  };
  return numeric(
    `ict:gen:ote:${low}-${high}-${bullish ? "b" : "s"}-${ratio}`, "ict-pd", 4,
    `After ${leg}, where is the ${ratio * 100}% retracement${ratio === 0.705 ? " (the OTE sweet spot)" : ""}?`,
    level, Math.max(0.05, span * 0.002), "",
    `Range = ${px(span)}. ${bullish ? `${px(high)} − ${ratio} × ${px(span)}` : `${px(low)} + ${ratio} × ${px(span)}`} = ${px(level)}. The OTE zone is the 62%–79% retracement.`,
    visual,
  );
}

type Verdict = "Buy-side sweep (wick above, closes back below)" | "Sell-side sweep (wick below, closes back above)" | "Bullish break (body closes above)" | "Bearish break (body closes below)";
const VERDICTS: Verdict[] = ["Buy-side sweep (wick above, closes back below)", "Sell-side sweep (wick below, closes back above)", "Bullish break (body closes above)", "Bearish break (body closes below)"];

function sweepQuestion(rng: Rng): PracticeQuestion {
  const b = basePrice(rng);
  const K = b + 30;
  const want = rng.pick(["sweep", "break"] as const);
  // Five build-up candles under the level; candles 2 and 4 tag it exactly — equal highs.
  const run = [b + 8, b + 14, b + 11, b + 18, b + 15];
  const built: Candle[] = run.map((open, i) => {
    const close = open + (i % 2 === 0 ? 5 : -2);
    const top = i === 1 || i === 3 ? K : Math.max(open, close) + halves(rng, 1, 3);
    return candle(open, close, top, Math.min(open, close) - halves(rng, 1, 3));
  });
  const prevClose = built[4]!.c;
  const last = want === "sweep"
    ? candle(prevClose, K - halves(rng, 1, 3), K + halves(rng, 2, 4), K - 8)
    : candle(prevClose, K + halves(rng, 2, 4), K + halves(rng, 5, 6), prevClose - 1);
  const candles = [...built, last];
  const flip = rng.next() < 0.5;
  const scene = flip ? mirror(candles, K) : candles;
  const level = K; // mirrored around K, so the level stays put
  const l = scene[scene.length - 1]!;
  // The rule, applied to what was actually drawn:
  let verdict: Verdict;
  if (!flip) verdict = l.c > level ? VERDICTS[2] : VERDICTS[0];
  else verdict = l.c < level ? VERDICTS[3] : VERDICTS[1];
  const side = flip ? "equal lows (sell-side liquidity)" : "equal highs (buy-side liquidity)";
  return choice(
    `ict:gen:sweep:${scene.map((k) => `${k.o}-${k.c}-${k.h}-${k.l}`).join("|")}`, "ict-liquidity", want === "sweep" ? 2 : 3,
    `The dashed line marks ${side}. What did the final candle do?`,
    verdict, VERDICTS,
    verdict.startsWith("Buy") || verdict.startsWith("Sell")
      ? `The wick ran through ${px(level)} to take the resting orders, but the candle closed back on the original side — a liquidity sweep, not a break.`
      : `The candle body closed beyond ${px(level)}. A close through the level is a break, not just a wick raid.`,
    rng, { kind: "candles", candles: scene, levels: [{ price: level, label: flip ? "Equal lows" : "Equal highs", tone: "gold" }] },
  );
}

/* -------------------------------- concept bank -------------------------------- */

interface Concept { id: string; level: Level; tag: string; prompt: string; answer: string; wrong: [string, string, string]; why: string }

const C = (id: string, level: Level, tag: string, prompt: string, answer: string, wrong: [string, string, string], why: string): Concept => ({ id, level, tag, prompt, answer, wrong, why });

export const CONCEPTS: Concept[] = [
  C("bsl", 1, "ict-liquidity", "Where does buy-side liquidity (BSL) rest?", "Above swing highs and equal highs", ["Below swing lows and equal lows", "Inside the middle of a fair value gap", "Only at the daily opening price"], "Buy stops from short sellers and breakout buyers cluster above highs. That pool is buy-side liquidity."),
  C("ssl", 1, "ict-liquidity", "Where does sell-side liquidity (SSL) rest?", "Below swing lows and equal lows", ["Above swing highs and equal highs", "At the 50% of every dealing range", "Only inside the London session"], "Stops from longs and breakout sellers sit under lows. That pool is sell-side liquidity."),
  C("equal-highs", 1, "ict-liquidity", "Why do equal highs matter to an ICT trader?", "They mark obvious resting stops that price is likely to target", ["They guarantee an immediate reversal", "They prove the trend has ended", "They are random noise with no meaning"], "Obvious levels attract orders. Equal highs or lows are treated as engineered liquidity — a probable target, not a guarantee."),
  C("fvg-def", 1, "ict-fvg", "What is a fair value gap (FVG)?", "A three-candle imbalance where candle 1 and candle 3 wicks do not overlap", ["Any unusually large candle", "The distance between two moving averages", "The space between the open and close of one candle"], "Aggressive one-sided movement leaves a gap between the wicks of candles 1 and 3. Price often returns to rebalance it."),
  C("fvg-middle", 1, "ict-fvg", "Which candle creates a fair value gap?", "The middle candle — the displacement candle", ["The first candle of the three", "The third candle of the three", "The candle with the smallest body"], "The big middle candle moves so fast that candles 1 and 3 never trade through the same space."),
  C("displacement", 1, "ict-structure", "Displacement is best described as…", "A strong, energetic move with large bodies that leaves imbalances", ["A slow grind of overlapping small candles", "Any pullback into the 62% level", "The first candle after a news release"], "Displacement shows intent: big-bodied candles, little overlap, and usually one or more FVGs behind them."),
  C("asia", 1, "ict-sessions", "How is the Asian range usually used?", "Its high and low become liquidity that London often raids", ["As the exact direction for the whole day", "As a signal to avoid trading entirely", "Only as the weekly opening level"], "The quiet overnight range builds obvious highs and lows. London frequently runs one side before the day's real move."),
  C("london-kz", 1, "ict-sessions", "The London killzone is commonly taught as…", "02:00–05:00 New York time", ["09:30–11:00 New York time", "20:00–22:00 New York time", "13:30–16:00 New York time"], "ICT's London killzone is 02:00–05:00 NY time — when the Asian range often gets raided."),
  C("ny-kz", 1, "ict-sessions", "The New York AM killzone is commonly taught as…", "07:00–10:00 New York time", ["02:00–05:00 New York time", "12:00–13:00 New York time", "15:30–17:00 New York time"], "The NY AM killzone (07:00–10:00 NY) covers the data releases and the equities open, when volatility is highest."),
  C("silver-bullet", 1, "ict-sessions", "Which are the ICT Silver Bullet windows?", "03:00–04:00, 10:00–11:00 and 14:00–15:00 New York time", ["00:00–01:00, 06:00–07:00 and 18:00–19:00 New York time", "09:30–10:30, 12:00–13:00 and 15:00–16:00 New York time", "01:00–02:00, 08:00–09:00 and 16:00–17:00 New York time"], "The Silver Bullet is a one-hour window trading a fresh FVG after a sweep — London open, NY AM and NY PM."),
  C("mitigation", 1, "ict-blocks", "What does it mean when an order block is 'mitigated'?", "Price has returned to the zone and traded back into it", ["The block has been deleted from the chart for good", "The block formed on a higher timeframe", "The block was created during the Asian session"], "Mitigation is price revisiting the zone to rebalance the orders left there."),
  C("bos", 2, "ict-structure", "A break of structure (BOS) in an uptrend confirms…", "Continuation — price closed beyond the previous swing high", ["A reversal to a downtrend", "That every FVG has now been filled", "That the session has ended"], "A body close beyond the last swing in the trend's direction is continuation: the trend is still printing higher highs."),
  C("mss", 2, "ict-structure", "A market structure shift (MSS) is…", "A displacement break of the last swing against the prevailing trend", ["Any candle that closes above the previous candle", "A retracement into the 62%–79% zone", "A gap between two sessions"], "The first break against the trend, with displacement, is the earliest sign that the order flow may have turned."),
  C("first-sign", 2, "ict-structure", "In an uptrend, which break is the first hint of a shift to bearish?", "The most recent higher low", ["The previous day's high", "The weekly opening price", "The most recent higher high"], "A trend that breaks its latest higher low has stopped making higher lows — the first structural crack."),
  C("sweep", 2, "ict-liquidity", "A wick through a high that closes back below it is usually called…", "A liquidity sweep (stop run)", ["A break of structure", "An order block", "A premium array"], "The wick takes the resting orders, but acceptance beyond the level never happens — a raid, not a break."),
  C("ob-bull", 2, "ict-blocks", "A bullish order block is classically…", "The last down-close candle before a displacement up that breaks structure", ["The first candle of the trading day", "The candle with the longest wick on the chart", "The last up-close candle before a drop"], "The final sell candle before aggressive buying marks where large orders were absorbed."),
  C("breaker", 2, "ict-blocks", "A breaker block forms when…", "An order block fails, liquidity is swept, structure shifts and the zone flips role", ["Any candle closes outside the Bollinger Bands", "Price gaps at the weekly open", "An FVG is filled by exactly 50%"], "A failed order block that gets run through, followed by an MSS, can flip from support to resistance (or the reverse)."),
  C("ifvg", 2, "ict-fvg", "An inversion FVG (IFVG) is…", "An FVG that price closes through, so it flips from support to resistance or the reverse", ["An FVG that has never been touched", "A gap formed only on the weekly chart", "An FVG with three equal candles"], "When a body closes through an FVG, the gap stops working in its original direction and is often respected on the other side."),
  C("premium", 2, "ict-pd", "Price trading above the 50% of the current dealing range is in…", "Premium", ["Discount", "Equilibrium", "Outside the range entirely"], "Above 50% is premium — expensive relative to the range, where sellers look for entries in a bearish context."),
  C("equilibrium", 2, "ict-pd", "The equilibrium of a dealing range is…", "The 50% midpoint between the swing high and swing low", ["The 79% retracement of the leg", "The previous day's close", "The highest volume candle"], "Equilibrium splits the range into premium above and discount below."),
  C("ote", 2, "ict-pd", "ICT's optimal trade entry (OTE) zone is…", "The 62%–79% retracement of the leg", ["The 23.6%–38.2% retracement", "The 88.6%–100% retracement", "The 100%–127% extension"], "The OTE band sits deep enough in discount (or premium) to offer a tight stop while still catching most pullbacks."),
  C("ce", 2, "ict-fvg", "The consequent encroachment (CE) of an FVG is…", "The 50% midpoint of the gap", ["The high of candle 1", "The close of candle 2", "The 79% level of the gap"], "CE is the midpoint — a level traders watch for a reaction or for a body close that would invalidate the gap."),
  C("discount-long", 2, "ict-pd", "In a bullish context, where do ICT-style long entries belong?", "In discount, ideally at a PD array such as an FVG or order block", ["In premium, right after a big green candle", "Anywhere, as long as volume is high", "Only at the all-time high"], "Buying below equilibrium gives a better price relative to the range and a closer invalidation."),
  C("amd", 3, "ict-process", "Power of 3 (AMD) stands for…", "Accumulation, Manipulation, Distribution", ["Analysis, Momentum, Direction", "Acceleration, Mitigation, Displacement", "Asia, Madrid, Dallas"], "Price builds a range (accumulation), raids one side (manipulation), then delivers the real move (distribution)."),
  C("judas", 3, "ict-sessions", "A Judas swing is…", "A false move near a session open that runs liquidity before the real move", ["A confirmed trend reversal at the weekly close", "A gap between two sessions that never fills", "A candle that closes exactly on its open"], "Early in a session, price often moves one way to trap traders and take liquidity, then reverses."),
  C("smt", 3, "ict-process", "SMT divergence compares…", "Correlated markets, where one makes a new extreme the other fails to confirm", ["Two timeframes on the same chart", "Volume against price", "The open and close of one candle"], "If one index sweeps a high and a correlated one does not, the failed confirmation hints that the raid may be a trap."),
  C("draw", 3, "ict-process", "What is a 'draw on liquidity'?", "The pool of liquidity price is most likely reaching for next", ["A drawing tool used for trend lines", "A drawdown limit on the account", "The candle that created the last FVG"], "Price is treated as moving from liquidity to liquidity. Identifying the next draw gives the trade a destination."),
  C("pdh", 3, "ict-liquidity", "What is a good use for the previous day's high and low (PDH/PDL)?", "Liquidity targets and reference levels for sweeps and draws", ["Exact entry prices for every trade", "Levels that can never be broken", "A signal to stop trading for the day"], "Prior highs and lows hold obvious stops, so they are natural targets and sweep points."),
  C("a-plus", 3, "ict-process", "Which set of conditions is the strongest for a long?", "Sell-side sweep in discount, then MSS with displacement, entry in an FVG or order block", ["A breakout above premium highs with no pullback", "A first touch of an old high with no displacement", "Buying a quiet lunchtime range because it looks tight"], "Liquidity taken, structure shifted, a reason to enter at a good price: the narrative is complete."),
  C("entry-after-mss", 3, "ict-process", "After an MSS with displacement, where do traders usually look to enter?", "On a retracement into the FVG or order block the move left behind", ["At the very top of the displacement candle", "Only at the next session open", "At the exact opposite swing"], "Chasing the move gives a poor price. The imbalance left behind is the area where the move is likely to be defended."),
  C("stop-place", 3, "ict-risk", "Where does a stop usually go on a long after a sweep and MSS?", "Beyond the swept low — the structure the idea depends on", ["Right at the FVG midpoint", "A few ticks from the entry", "There is no stop; SMT replaces it"], "If price trades back through the sweep low, the idea that justified the trade is gone — that is the invalidation."),
  C("invalid", 3, "ict-risk", "Price closes straight through your order block with no reaction. What now?", "Treat the idea as invalid and reassess or stand aside", ["Double the size, since it is cheaper now", "Move the stop further away to give it room", "Ignore it, because blocks never fail"], "A close through the zone breaks the premise. Hoping is not a plan — take the loss or step away."),
  C("htf-ltf", 3, "ict-process", "How does the ICT approach split timeframes?", "Higher timeframe for bias and draw, lower timeframe for the entry", ["Lower timeframe for bias, higher for entry", "One timeframe only, never both", "The weekly chart for stops, the 1-second chart for targets"], "The big picture sets the narrative. The lower timeframe then gives a precise trigger and a tighter stop."),
  C("sweep-then-mss", 4, "ict-structure", "Equal highs are swept and price closes back below, then displaces down through a swing low leaving an FVG. This is best described as…", "A buy-side sweep followed by a bearish MSS — a sell setup candidate", ["A bullish break of structure — a buy setup", "A pure range with no information", "An unmitigated bullish order block"], "Liquidity above was taken, price rejected it, and structure shifted down with displacement."),
  C("ob-premium", 4, "ict-pd", "A bullish order block sits in the premium of the higher-timeframe range. How good is it for longs?", "Lower probability — better to wait for discount or a sweep", ["The best possible long, because blocks always hold", "Equal to one in discount; location never matters", "It guarantees a trade to the next high"], "Buying near the top of a range leaves little room and a distant stop. Location inside the range matters."),
  C("why-wait", 4, "ict-process", "Why wait for displacement after a sweep rather than entering at the sweep?", "A sweep alone can continue; displacement plus an MSS shows intent to reverse", ["Displacement is required by the exchange", "Sweeps never lead to reversals", "It makes the position size larger"], "Price can keep running after taking liquidity. A structural shift gives evidence that the raid was the move."),
  C("fvg-close", 4, "ict-fvg", "A candle body closes fully through an FVG. What does that suggest?", "The gap has failed in its original role and may invert", ["The gap is now stronger than before", "Nothing — only wicks matter for FVGs", "A new FVG has automatically formed above it"], "Acceptance beyond the gap invalidates it as support or resistance; it can become an IFVG."),
  C("size-stop", 4, "ict-risk", "A valid setup needs a stop three times wider than usual. What keeps risk consistent?", "Cut the position size so dollar risk stays the same, or skip the trade", ["Keep the usual size and hope", "Widen the stop and enlarge the position", "Remove the stop so it cannot be hit"], "Risk is stop distance × size. A wider stop needs a smaller size, or the trade does not fit the plan."),
  C("journal", 4, "ict-process", "Which details are most useful to journal on every ICT-style trade?", "Bias or draw, the sweep, the PD array used and the invalidation", ["Only the final P&L", "The colour of the candle at entry", "The number of indicators on the chart"], "A record of the story — what was targeted, what was taken, where you entered and why you would be wrong — makes reviews useful."),
  C("checklist", 4, "ict-risk", "Three of your five checklist conditions are met. What does disciplined practice say?", "Wait or skip — only full-criteria A+ setups get capital", ["Take it at half size, always", "Take it, since three is more than half", "Add a sixth condition to justify it"], "A checklist exists to stop you lowering the bar when you feel the urge to trade."),
  C("always-filled", 4, "ict-fvg", "Is it true that every FVG gets completely filled before the trend continues?", "No — some hold at or before the CE, so it is a probability, not a rule", ["Yes, always, without exception", "Yes, but only on the daily chart", "No, FVGs are only decoration"], "Many gaps are partially filled or respected at the midpoint. Treat them as areas of interest, never as certainties."),
];

/** The concept bank as questions. `cycle` re-keys the bank so retired concepts can come back for spaced review. */
function conceptQuestions(rng: Rng, cycle: number): PracticeQuestion[] {
  return CONCEPTS.map((c) => choice(`ict:${c.id}:c${cycle}`, c.tag, c.level, c.prompt, c.answer, c.wrong, c.why, rng));
}

/* -------------------------------- public API -------------------------------- */

const MIN_FRESH_CONCEPTS = 14;
const MAX_CYCLES = 50;

/**
 * Every candidate ICT question for one round.
 * `retired(fp)` says whether a question was already answered correctly. Once fewer than a round's worth of
 * concepts are left, the bank is re-keyed (cycle + 1) so the player can review them again instead of running dry.
 */
export function ictQuestions(args: { seed: number; retired: (fp: string) => boolean; scenes?: number }): PracticeQuestion[] {
  const rng = seededRng(args.seed);
  let cycle = 0;
  while (cycle < MAX_CYCLES && CONCEPTS.filter((c) => !args.retired(`ict:${c.id}:c${cycle}`)).length < MIN_FRESH_CONCEPTS) cycle++;
  const concepts = conceptQuestions(rng, cycle);

  const scenes: PracticeQuestion[] = [];
  for (let i = 0; i < (args.scenes ?? 10); i++) {
    const roll = i % 4;
    if (roll === 0) scenes.push(...fvgQuestions(rng));
    else if (roll === 1) scenes.push(...rangeQuestions(rng));
    else if (roll === 2) scenes.push(sweepQuestion(rng));
    else scenes.push(oteQuestion(rng));
  }
  const seen = new Set<string>();
  return [...scenes, ...concepts].filter((q) => (seen.has(q.fp) ? false : (seen.add(q.fp), true)));
}
