/**
 * IDEAL CALCULATIONS — hypothetical math from the numbers the trader typed ("1:2 RR at 45% win rate").
 * No journal is read. Everything is computed here, deterministically; the model only phrases the result.
 */
import { INSTRUMENT_SPECS, exactLosingStreakProbability, type InstrumentSpec } from "./tools";

export interface IdealInput {
  winRate: number | null; // 0..1
  rr: number | null; // reward per 1 risk
  avgWin: number | null;
  avgLoss: number | null;
  trades: number | null;
  streakK: number | null;
  instrument: string | null;
  stopPoints: number | null;
  riskDollars: number | null;
  riskPct: number | null;
  balance: number | null;
  percentOf: { pct: number; of: number } | null;
}

export interface IdealResult {
  kinds: ("expectancy" | "streak" | "sizing" | "percent")[];
  inputs: Partial<IdealInput>;
  results: Record<string, unknown>;
  /** What is still needed for a complete answer — the model asks for it ONCE. */
  missing: string[];
  assumptions: string[];
  /** Ready-to-show answer in Minato's card dialect (used when no model is reachable). */
  fallbackText: string;
}

const num = (s: string | undefined | null) => (s == null ? null : Number(s.replace(/,/g, "")));
const money = (n: number) => `$${Math.abs(n) >= 100 ? Math.round(n).toLocaleString("en-US") : (Math.round(n * 100) / 100).toString()}`;
const sgn = (n: number, d = 2) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n * 10 ** d) / 10 ** d)}`;
const pct = (p: number, d = 1) => `${Math.round(p * 100 * 10 ** d) / 10 ** d}%`;

function kNumber(raw: string): number | null {
  const m = raw.toLowerCase().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)(k)?$/);
  return m ? Number(m[1]) * (m[2] ? 1000 : 1) : null;
}

export function parseIdeal(text: string): IdealInput {
  const q = text.toLowerCase().replace(/[\u2212\u2013]/g, "-");
  const out: IdealInput = {
    winRate: null, rr: null, avgWin: null, avgLoss: null, trades: null, streakK: null,
    instrument: null, stopPoints: null, riskDollars: null, riskPct: null, balance: null, percentOf: null,
  };

  const wr =
    q.match(/(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)\s*(?:win\s*rate|winrate|wr|accuracy|hit\s*rate|winners?)/) ??
    q.match(/(?:win\s*rate|winrate|wr|accuracy|hit\s*rate)\s*(?:of|is|at|=|:)?\s*(\d{1,3}(?:\.\d+)?)\s*(%|percent)?/);
  if (wr) {
    const v = Number(wr[1]);
    out.winRate = v > 1 ? v / 100 : v;
    if (out.winRate > 1 || out.winRate < 0) out.winRate = null;
  }

  // Reward:risk — "1:2 rr", "rr of 2", "2r target", "1 to 3 risk reward", "risk reward 1:2"
  const ratio = q.match(/(\d+(?:\.\d+)?)\s*(?::|to|\/)\s*(\d+(?:\.\d+)?)(?=\s*(?:rr|r:r|risk|reward|rrr|r\b|$|[,.?]|\s))/);
  const rrWord = q.match(/(?:\brr\b|r:r|risk[- ]?(?:to[- ]?)?reward|reward[- ]?(?:to[- ]?)?risk)\s*(?:ratio\s*)?(?:of|is|at|=|:)?\s*(\d+(?:\.\d+)?)(?!\s*[:/])/);
  const rMult = q.match(/\b(\d+(?:\.\d+)?)\s*r\b(?!\s*(?:isk|eward))/);
  if (ratio && /(rr|r:r|risk|reward|ratio|1\s*(?::|to)\s*\d)/.test(q)) {
    const a = Number(ratio[1]);
    const b = Number(ratio[2]);
    if (a > 0 && b > 0) out.rr = b / a; // "1:2" → risk 1, reward 2
  } else if (rrWord) out.rr = Number(rrWord[1]);
  else if (rMult && /(target|reward|rr|win|profit|average)/.test(q)) out.rr = Number(rMult[1]);

  const aw = q.match(/(?:avg|average)\s*(?:win(?:ner)?s?|profit)\s*(?:of|is|=|:)?\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/) ?? q.match(/wins?\s*(?:average|avg)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/);
  const al = q.match(/(?:avg|average)\s*loss(?:es)?\s*(?:of|is|=|:)?\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/) ?? q.match(/loss(?:es)?\s*(?:average|avg)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/);
  if (aw) out.avgWin = num(aw[1]);
  if (al) out.avgLoss = num(al[1]);
  if (out.avgWin && out.avgLoss && out.rr == null) out.rr = out.avgWin / out.avgLoss;

  const n = q.match(/(?:in|over|across|next|for|of)\s+(?:the\s+next\s+)?(\d{1,5})\s*(?:trades|entries|positions|samples)/) ?? q.match(/(\d{1,5})\s*trades\b/);
  if (n) out.trades = Number(n[1]);

  const k =
    q.match(/streak\s*(?:of|>=|≥|at least)?\s*(\d{1,2})/) ??
    q.match(/(\d{1,2})\s*(?:\+\s*)?(?:losses|losers|loses)\s*in a row/) ??
    q.match(/(\d{1,2})\s*consecutive/) ??
    q.match(/(\d{1,2})\s*(?:straight|back[- ]to[- ]back)\s*loss/);
  if (k) out.streakK = Number(k[1]);

  if (/\bmnq\b|micro\s*nq|nq\s*micro/.test(q)) out.instrument = "MNQ";
  else if (/\bmes\b|micro\s*es\b|es\s*micro/.test(q)) out.instrument = "MES";
  else if (/\bnq\b|mini\s*nq|nq\s*mini/.test(q)) out.instrument = /micro or mini|mini or micro/.test(q) ? null : "NQ";
  else if (/\bes\b|mini\s*es\b|s&p/.test(q)) out.instrument = "ES";
  else if (/\bmgc\b/.test(q)) out.instrument = "MGC";
  else if (/\bgc\b|gold/.test(q)) out.instrument = "GC";
  else if (/\bmcl\b/.test(q)) out.instrument = "MCL";
  else if (/\bcl\b|crude/.test(q)) out.instrument = "CL";
  else if (/\bmym\b/.test(q)) out.instrument = "MYM";
  else if (/\bym\b|dow/.test(q)) out.instrument = "YM";
  if (/\bnq\b/.test(q) && /micro or mini|mini or micro|micro\/mini/.test(q)) out.instrument = null; // both asked → compute both

  const stop = q.match(/(\d{1,4}(?:\.\d+)?)\s*(?:pt|pts|point|points)\b/) ?? q.match(/\bstop\s*(?:loss|size|of|is|at|=|:)?\s*(\d{1,4}(?:\.\d+)?)\b/);
  if (stop) out.stopPoints = Number(stop[1]);

  const rd =
    q.match(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*(?:risk|per trade|max loss|at risk)/) ??
    q.match(/\brisk(?:ing)?\s*(?:per trade\s*)?(?:is|of|=|:)?\s*\$\s*(\d[\d,]*(?:\.\d+)?)/) ??
    q.match(/\brisk(?:ing)?\s*(?:is|of|=|:)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:dollars|usd|bucks)/);
  if (rd) out.riskDollars = num(rd[1]);

  const rp = q.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*(?:risk|per trade|of (?:my |the )?(?:account|balance|capital|equity))/) ?? q.match(/\brisk(?:ing)?\s*(?:per trade\s*)?(?:is|of|=|:)?\s*(\d{1,2}(?:\.\d+)?)\s*%/);
  if (rp) out.riskPct = Number(rp[1]);

  const bal =
    q.match(/\$?\s*(\d[\d,]*(?:\.\d+)?k?)\s*(?:account|balance|capital|equity|challenge|funded|eval)/) ??
    q.match(/(?:account|balance|capital|equity)\s*(?:size\s*)?(?:of|is|=|:)?\s*\$?\s*(\d[\d,]*(?:\.\d+)?k?)/);
  if (bal) out.balance = kNumber(bal[1]!);

  const po = q.match(/(\d{1,3}(?:\.\d+)?)\s*%\s*of\s*\$?\s*(\d[\d,]*(?:\.\d+)?k?)/);
  if (po && !/win ?rate|risk/.test(q.slice(Math.max(0, (po.index ?? 0) - 12), po.index ?? 0))) {
    const of = kNumber(po[2]!);
    if (of) out.percentOf = { pct: Number(po[1]), of };
  }
  return out;
}

/* ------------------------------- math -------------------------------- */

/** P(longest losing streak ≥ k) for k = 1..cap, from the exact DP. */
function streakCurve(winRate: number, n: number, cap = 30): number[] {
  const out: number[] = [];
  for (let k = 1; k <= Math.min(cap, n); k++) {
    out.push(exactLosingStreakProbability(winRate, n, k));
    if (out[out.length - 1]! < 1e-6) break;
  }
  return out;
}

function sizing(spec: InstrumentSpec, stop: number, risk: number) {
  const perContract = stop * spec.pointValue;
  const contracts = Math.floor(risk / perContract);
  return {
    symbol: spec.symbol,
    pointValue: spec.pointValue,
    riskPerContract: round2(perContract),
    contracts,
    actualRisk: round2(contracts * perContract),
    note: contracts === 0 ? `Even 1 ${spec.symbol} risks ${money(perContract)} — above the ${money(risk)} budget.` : undefined,
  };
}
const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeIdeal(text: string, memory: { riskDollars?: number | null; riskPct?: number | null; stopPoints?: number | null; balance?: number | null } = {}): IdealResult | null {
  const q = text.toLowerCase();
  const inp = parseIdeal(text);
  const wantsStreak = /\b(streak|losses in a row|consecutive|monte carlo)\b/.test(q);
  const wantsSizing = /\b(position siz\w*|how many (?:contracts|micros|minis|lots)|contracts?|lot size|size for|sizing)\b/.test(q) || (!!inp.instrument && !!inp.stopPoints && /risk|size/.test(q));
  const wantsExpectancy =
    /\b(expectancy|profit factor|break ?even|kelly|payoff|edge|r[- ]?multiple|worth|profitable|positive|math|rr|r:r|risk[- ]?reward|reward[- ]?risk)\b/.test(q) ||
    (inp.winRate != null && inp.rr != null);
  const wantsPercent = !!inp.percentOf && !wantsSizing && !wantsStreak;
  if (!wantsStreak && !wantsSizing && !wantsExpectancy && !wantsPercent) return null;

  const kinds: IdealResult["kinds"] = [];
  const results: Record<string, unknown> = {};
  const missing: string[] = [];
  const assumptions: string[] = [];
  const rows: string[] = [];
  const working: string[] = [];
  let lead = "";

  /* percent-of */
  if (wantsPercent && inp.percentOf) {
    kinds.push("percent");
    const v = (inp.percentOf.pct / 100) * inp.percentOf.of;
    results.percentOf = { pct: inp.percentOf.pct, of: inp.percentOf.of, value: round2(v) };
    lead = `**${inp.percentOf.pct}%** of **${money(inp.percentOf.of)}** is **${money(v)}**.`;
    working.push(`${inp.percentOf.pct}% × ${money(inp.percentOf.of)} = ${money(v)}`);
  }

  /* expectancy / edge */
  if (wantsExpectancy) {
    const p = inp.winRate;
    const rr = inp.rr;
    const e: Record<string, unknown> = {};
    if (rr != null) {
      const be = 1 / (1 + rr);
      e.breakEvenWinRate = round2(be * 100);
      rows.push(`- **Break-even** · ${pct(be)} win rate at ${round2(rr)}R`);
      working.push(`Break-even win rate = 1 ÷ (1 + RR) = 1 ÷ ${round2(1 + rr)} = ${pct(be, 2)}`);
    }
    if (p != null && rr != null) {
      kinds.push("expectancy");
      const exp = p * rr - (1 - p);
      const pf = (1 - p) > 0 ? (p * rr) / (1 - p) : null;
      const kelly = Math.max(0, p - (1 - p) / rr);
      e.winRate = round2(p * 100);
      e.rr = round2(rr);
      e.expectancyR = round2(exp);
      e.profitFactor = pf == null ? null : round2(pf);
      e.kellyPct = round2(kelly * 100);
      lead = `**${sgn(exp)}R** per trade — ${exp > 0 ? "a positive edge" : exp === 0 ? "exactly break-even" : "a negative edge"} at **${pct(p, 0)}** win rate and **${round2(rr)}R** reward.`;
      rows.unshift(`- **Profit factor** · ${pf == null ? "∞" : round2(pf)}`);
      if (exp > 0) rows.push(`- **Kelly / half-Kelly** · ${pct(kelly)} / ${pct(kelly / 2)} of equity`);
      if (inp.avgLoss) {
        const d = exp * inp.avgLoss;
        e.expectancyDollars = round2(d);
        e.avgLoss = inp.avgLoss;
        rows.push(`- **Per trade** · ${d >= 0 ? "+" : "−"}${money(d)} at ${money(inp.avgLoss)} risk`);
      }
      working.unshift(`Expectancy = p·RR − (1−p) = ${round2(p)}·${round2(rr)} − ${round2(1 - p)} = ${sgn(exp, 3)}R`);
      working.push(`Profit factor = p·RR ÷ (1−p) = ${pf == null ? "∞" : round2(pf)}`, `Kelly = p − (1−p)/RR = ${pct(kelly, 2)} (never size at full Kelly)`);
      assumptions.push("Independent trades with a fixed win rate and a fixed reward:risk.");
    } else if (rr == null && p != null) {
      missing.push("reward:risk (e.g. 1:2)");
    } else if (p == null && rr != null) {
      lead = lead || `You need to win more than **${pct(1 / (1 + rr))}** of trades to break even at **${round2(rr)}R**.`;
    } else if (!wantsStreak && !wantsSizing) {
      missing.push("win rate and reward:risk");
    }
    results.expectancy = e;
  }

  /* losing streak odds */
  if (wantsStreak) {
    if (inp.winRate == null) {
      missing.push("win rate");
    } else {
      kinds.push("streak");
      const n = inp.trades ?? 100;
      if (inp.trades == null) assumptions.push("Horizon assumed at 100 trades (you didn't say).");
      const curve = streakCurve(inp.winRate, n);
      const median = curve.reduce((acc, pk, i) => (pk >= 0.5 ? i + 1 : acc), 0);
      const p95 = (() => { const i = curve.findIndex((pk) => pk <= 0.05); return i < 0 ? curve.length + 1 : i; })();
      const worst = curve.length;
      const pk = inp.streakK ? exactLosingStreakProbability(inp.winRate, n, inp.streakK) : null;
      results.streak = {
        winRate: round2(inp.winRate * 100), trades: n, typicalLongest: median, p95Longest: p95,
        atLeast: inp.streakK ? { k: inp.streakK, probabilityPct: round2((pk ?? 0) * 100) } : null,
        curve: curve.slice(0, 12).map((x, i) => ({ k: i + 1, probabilityPct: round2(x * 100) })),
      };
      const streakLead = inp.streakK
        ? `**${pct(pk ?? 0)}** chance of at least one **${inp.streakK}-loss streak** in **${n} trades** at a **${pct(inp.winRate, 0)}** win rate.`
        : `Over **${n} trades** at **${pct(inp.winRate, 0)}**, expect a longest losing streak of about **${median}**, and **${p95}** or fewer 95% of the time.`;
      lead = lead ? `${lead} ${streakLead}` : streakLead;
      rows.push(`- **Typical worst run** · ${median} losses`, `- **95% ceiling** · ${p95} losses`, `- **Rare tail** · ${worst >= 30 ? "30+" : worst} losses is possible`);
      working.push(`Exact dynamic-programming probability of a run ≥ k losses in ${n} independent trades; loss chance = ${pct(1 - inp.winRate, 1)}.`);
      assumptions.push("Trades are independent; real streaks cluster when discipline slips.");
    }
  }

  /* position sizing */
  if (wantsSizing) {
    const stop = inp.stopPoints ?? memory.stopPoints ?? null;
    const bal = inp.balance ?? memory.balance ?? null;
    let risk = inp.riskDollars ?? null;
    if (risk == null && inp.riskPct != null && bal != null) risk = (inp.riskPct / 100) * bal;
    if (risk == null) risk = memory.riskDollars ?? (memory.riskPct != null && bal != null ? (memory.riskPct / 100) * bal : null);
    if (stop == null) missing.push("stop size in points");
    if (risk == null) missing.push(inp.riskPct != null ? "account size (to turn the % into dollars)" : "risk per trade ($ or %)");
    if (stop != null && risk != null) {
      kinds.push("sizing");
      const symbols = inp.instrument ? [inp.instrument] : /\bnq\b/i.test(text) || /micro|mini/i.test(text) ? ["NQ", "MNQ"] : ["MNQ", "NQ"];
      const calc = symbols.map((s) => sizing(INSTRUMENT_SPECS[s] ?? INSTRUMENT_SPECS.NQ!, stop, risk!));
      results.sizing = { stopPoints: stop, riskBudget: round2(risk), calc };
      const head = calc.map((c) => `**${c.contracts} ${c.symbol}**`).join(" or ");
      const sizeLead = `Risking **${money(risk)}** on a **${stop}-pt** stop: ${head}.`;
      lead = lead ? `${lead} ${sizeLead}` : sizeLead;
      for (const c of calc) rows.push(`- **${c.symbol}** · ${c.contracts} contracts · ${money(c.actualRisk)} real risk`);
      working.push(...calc.map((c) => `${c.symbol}: floor(${money(risk!)} ÷ (${stop} pts × $${c.pointValue})) = floor(${round2(risk! / c.riskPerContract)}) = ${c.contracts}`));
      assumptions.push("Rounded down — never up — so real risk stays inside the budget. Commissions and slippage excluded.");
      const zero = calc.find((c) => c.note);
      if (zero?.note) rows.push(`> ${zero.note}`);
    }
  }

  if (!kinds.length && !lead && !missing.length) return null;
  if (!lead) lead = missing.length ? `I need one more thing to work this out: **${missing[0]}**.` : "Here's the math.";

  const note = missing.length && kinds.length ? `\n> To finish this, send me the ${missing.join(" and ")}.` : "";
  const fallbackText = [lead, ...rows.filter((r) => !r.startsWith(">")).slice(0, 4), ...rows.filter((r) => r.startsWith(">")).slice(0, 1)].join("\n") + note +
    (working.length ? `\n---\n**Working**\n${[...working, ...assumptions].slice(0, 5).map((w) => `- ${w}`).join("\n")}` : "");

  return { kinds, inputs: inp, results, missing, assumptions, fallbackText };
}
