import type { JournalEntry } from "./types";

/* ------------------------------------------------------------------ */
/*  Demo data generator                                                */
/*  Produces a plausible ~4-month trading history so the dashboard,    */
/*  calendar and roadmap can be explored instantly. Clearly labelled   */
/*  in the UI and one click to remove.                                 */
/* ------------------------------------------------------------------ */

const INSTRUMENTS: Array<[string, number]> = [
  ["NQ", 5], ["ES", 3], ["BTCUSD", 4], ["EURUSD", 4], ["GBPJPY", 2],
  ["NVDA", 2], ["TSLA", 2], ["AAPL", 1], ["CL", 1],
];

const SETUPS = [
  "Opening range breakout",
  "VWAP reclaim",
  "Order block retest",
  "Trend continuation",
  "Liquidity sweep",
  "Failed breakdown",
  "Gap fill",
];

const WIN_NOTES = [
  "Clean break and retest of the premarket high. Held the runner into the NY close — textbook execution.",
  "Waited for London to sweep the lows before entering long. Patience paid; partials at 1R and 2R.",
  "Followed the plan exactly. Size felt right, no hesitation on entry, trail did its job.",
  "Third touch of the daily level with clear rejection wicks. Added on the VWAP hold.",
  "Momentum was obvious after the CPI print. Took the continuation leg only, no hero trades.",
  "A+ setup from the playbook. Entry at the edge of the order block, stop under structure.",
];

const LOSS_NOTES = [
  "Chased strength into resistance right after open. No setup — pure impulse. Deserved the stop-out.",
  "Thesis invalidated fast on higher-than-expected volume. Cut it without hesitating; small damage.",
  "Revenge trade after the first loss. Same instrument, doubled size. This is exactly what breaks accounts.",
  "Held past my invalidation hoping for a bounce. Process error, not bad luck.",
  "News spike blew through the level. Stop was correct but slippage made it worse than planned.",
  "Faded a trend that simply refused to die. One try, one loss, walked away.",
];

const FLAT_NOTES = [
  "Scratch trade — exited flat once momentum stalled. No harm done.",
  "Sized down to feel out the session. Closed breakeven when the range refused to expand.",
];

function pickWeighted<T>(items: Array<[T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[0][0];
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Deterministic-enough demo journal ending yesterday. */
export function generateDemoEntries(now = new Date()): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const days = 118;
  let seq = 0;

  for (let i = days; i >= 1; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // weekends off
    if (Math.random() < 0.28) continue; // no-trade days

    // Skill improves gently over the period
    const t = 1 - i / days;
    const winProb = 0.5 + t * 0.16;
    const isWin = Math.random() < winProb;

    let pnl: number;
    if (isWin) pnl = Math.round(90 + Math.random() ** 1.6 * 520);
    else if (Math.random() < 0.08) pnl = 0;
    else pnl = -Math.round(60 + Math.random() ** 2 * 340);

    let rr: number | null =
      pnl > 0 ? +(0.8 + Math.random() * 2.6).toFixed(1)
      : pnl < 0 ? +(-1 - Math.random() * 0.45).toFixed(1)
      : null;
    // ~15% of entries simply didn't track R
    if (rr !== null && Math.random() < 0.15) rr = null;

    entries.push({
      id: `demo_${(++seq).toString(36)}_${i}`,
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      pnl,
      rr,
      instrument: pickWeighted(INSTRUMENTS),
      direction: Math.random() > 0.47 ? "long" : "short",
      setup: pick(SETUPS),
      notes:
        pnl > 0 ? pick(WIN_NOTES) : pnl < 0 ? pick(LOSS_NOTES) : pick(FLAT_NOTES),
      images: [],
      createdAt: d.getTime(),
      updatedAt: d.getTime(),
    });
  }
  return entries;
}
