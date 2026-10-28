import { checklistScore, type JournalEntry, type TradePlan } from "../types";
import { dayTrades } from "../risk";
import { mistakeTagsOf } from "../mistakes";
import { ruleStats, statFor, ruleText } from "../rule-stats";

/**
 * Pre-trade outlook: "given how you have traded before, and what you just planned, what is likely to happen to YOU?"
 *
 * It is a statement about the trader's own process and results, never about the market: no buy/sell calls, no price targets.
 * The numbers are computed here, offline and deterministically, from the trader's own journal. The AI (optional, see
 * /api/journal/outlook) only puts words around these facts — it cannot add a statistic that is not in them.
 */
export type PlanDraft = {
  date: string;
  setupId?: string; setupName?: string;
  emotion?: string; emotionReason?: string;
  thesis: string; draw?: string; invalidation?: string; breakPlan?: string;
  news: string[];
  maxLoss?: number;
  watch: string[];
  /** Rule texts the trader ticked / left unticked, and how many the setup has. */
  confirmedRules: string[]; skippedRules: string[];
  /** How many rules the chosen setup has in total (confirmed + skipped). Lets the odds work even when rule texts are blank. */
  ruleTotal?: number;
};

export type Factor = { id: string; label: string; n: number; winRate: number | null; avgPnl: number | null; /** winRate − baseline, in points */ delta: number | null };
export type OutlookFacts = {
  baseline: { n: number; winRate: number | null; avgPnl: number | null };
  factors: Factor[];
  /** Mistakes that appeared most in the trades most like this one. */
  likelyMistakes: { key: string; label: string; count: number; of: number }[];
  skippedRuleHistory: { rule: string; skippedBefore: number; of: number; skippedAvgPnl: number | null; confirmedAvgPnl: number | null }[];
  tradeOfDay: number; afterLossToday: boolean;
};
export type Lean = "favorable" | "mixed" | "unfavorable" | "unknown";
export type Outlook = { lean: Lean; headline: string; points: string[]; watch: string[]; source: "rules" | "ai"; note?: string };

const MIN = 3; // a factor needs at least this many past trades to count
const r2 = (n: number) => Math.round(n * 100) / 100;
const wrOf = (t: JournalEntry[]) => (t.length ? r2(t.filter((e) => e.pnl > 0).length / t.length) : null);
const avgOf = (t: JournalEntry[]) => (t.length ? r2(t.reduce((s, e) => s + e.pnl, 0) / t.length) : null);
const planFor = (e: JournalEntry, plans: TradePlan[]) => plans.find((p) => p.id === e.planId);

/** The groups of past trades that resemble this plan (setup, feeling, skipped rules, news day, after a loss). Shared by the facts and the odds. */
function similarGroups(d: PlanDraft, entries: JournalEntry[], plans: TradePlan[]) {
  // Only trades dated up to today's plan, so a trade being logged right now never predicts itself.
  const past = entries.filter((e) => e.date <= d.date && e.pnl !== undefined);
  // `weak` groups (single rules) count for half as much in the odds, because they overlap with the bigger groups.
  const groups: { id: string; label: string; trades: JournalEntry[]; weak?: boolean }[] = [];
  const add = (id: string, label: string, trades: JournalEntry[], weak = false) => { if (trades.length > 0) groups.push({ id, label, trades, weak }); };

  const sameName = (e: JournalEntry) => !e.setupId && !!e.setup && !!d.setupName && e.setup.trim().toLowerCase() === d.setupName.trim().toLowerCase();
  if (d.setupId) add("setup", `trades on your “${d.setupName ?? "this"}” setup`, past.filter((e) => e.setupId === d.setupId || sameName(e)));
  if (d.emotion) add("emotion", `plans written while feeling ${d.emotion.toLowerCase()}`, past.filter((e) => planFor(e, plans)?.emotionalState === d.emotion));

  const withPlan = past.map((e) => ({ e, p: planFor(e, plans) })).filter((x): x is { e: JournalEntry; p: TradePlan } => !!x.p);
  const anySkipped = (p: TradePlan) => p.rules.some((r) => r.state !== "ready");
  if (d.skippedRules.length > 0) add("skipped", "trades where you skipped a setup rule", withPlan.filter((x) => x.p.rules.length > 0 && anySkipped(x.p)).map((x) => x.e));
  else if (d.confirmedRules.length > 0) add("allrules", "trades where you confirmed every rule", withPlan.filter((x) => x.p.rules.length > 0 && !anySkipped(x.p)).map((x) => x.e));
  // One group per rule the trader ticked / left unticked: what happened on past trades where that same rule got the same answer.
  if (d.setupId) {
    const key = (t: string) => ruleText(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const sameSetup = withPlan.filter((x) => x.p.playbookId === d.setupId);
    const byRule = (text: string, confirmed: boolean) => sameSetup.filter((x) => x.p.rules.some((r) => key(r.label) === key(text) && (r.state === "ready") === confirmed)).map((x) => x.e);
    d.confirmedRules.filter(Boolean).slice(0, 6).forEach((t, i) => add(`rule-on-${i}`, `trades where you confirmed “${ruleText(t)}”`, byRule(t, true), true));
    d.skippedRules.filter(Boolean).slice(0, 6).forEach((t, i) => add(`rule-off-${i}`, `trades where you skipped “${ruleText(t)}”`, byRule(t, false), true));
  }
  if (d.news.length > 0) add("news", "trades planned on a news day", withPlan.filter((x) => (x.p.newsEvents?.length ?? 0) > 0).map((x) => x.e));

  // Position in the day: a trade after a loss earlier today behaves differently from a first trade.
  const today = dayTrades(d.date, entries);
  const tradeOfDay = today.length + 1;
  const afterLossToday = today.some((t) => t.pnl < 0);
  if (afterLossToday) {
    const after: JournalEntry[] = [];
    for (const day of new Set(past.map((e) => e.date))) { if (day === d.date) continue; const t = dayTrades(day, entries); t.forEach((e, i) => { if (i > 0 && t.slice(0, i).some((x) => x.pnl < 0)) after.push(e); }); }
    add("afterloss", "trades taken after an earlier loss the same day", after);
  }
  return { past, groups, tradeOfDay, afterLossToday };
}

export function buildOutlookFacts(d: PlanDraft, entries: JournalEntry[], plans: TradePlan[]): OutlookFacts {
  const { past, groups, tradeOfDay, afterLossToday } = similarGroups(d, entries, plans);
  const base = { n: past.length, winRate: wrOf(past), avgPnl: avgOf(past) };
  const factors: Factor[] = [];
  const related = new Map<string, JournalEntry>();
  for (const g of groups.filter((x) => !x.weak)) {
    const w = wrOf(g.trades);
    factors.push({ id: g.id, label: g.label, n: g.trades.length, winRate: w, avgPnl: avgOf(g.trades), delta: w != null && base.winRate != null ? r2(w - base.winRate) : null });
    if (g.trades.length >= MIN) g.trades.forEach((t) => related.set(t.id, t));
  }

  // Mistakes most common in the closest matches (or, with none, across the whole journal).
  const pool = related.size >= MIN ? [...related.values()] : past;
  const counts = new Map<string, { label: string; count: number }>();
  for (const e of pool) for (const t of mistakeTagsOf(e)) { const c = counts.get(t.key) ?? { label: t.label, count: 0 }; c.count++; counts.set(t.key, c); }
  const likelyMistakes = [...counts.entries()].map(([key, v]) => ({ key, label: v.label, count: v.count, of: pool.length })).filter((m) => m.count >= 2).sort((a, b) => b.count - a.count).slice(0, 3);

  const stats = ruleStats(plans, entries);
  const skippedRuleHistory = d.skippedRules.flatMap((rule) => {
    const s = statFor(stats, d.setupId, rule);
    return s && s.skipped > 0 ? [{ rule: ruleText(rule), skippedBefore: s.skipped, of: s.planned, skippedAvgPnl: s.skippedAvgPnl, confirmedAvgPnl: s.confirmedAvgPnl }] : [];
  }).slice(0, 4);

  return { baseline: base, factors, likelyMistakes, skippedRuleHistory, tradeOfDay, afterLossToday };
}

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const money = (n: number | null) => (n == null ? "—" : `${n < 0 ? "−" : "+"}$${Math.abs(Math.round(n))}`);

/** The offline answer. Always available; the AI only rephrases and connects it with what the trader wrote. */
export function localOutlook(f: OutlookFacts, d: PlanDraft): Outlook {
  const usable = f.factors.filter((x) => x.n >= MIN && x.delta != null);
  if (f.baseline.n < 5) return { lean: "unknown", source: "rules", headline: "Not enough history to predict yet.", points: [`You have ${f.baseline.n} past trade${f.baseline.n === 1 ? "" : "s"}. After about 5–10 logged trades with plans, this will compare your new plan with how similar ones went.`], watch: d.watch.slice(0, 3) };

  const weighted = usable.reduce((s, x) => s + x.delta! * Math.min(x.n, 10), 0) / Math.max(1, usable.reduce((s, x) => s + Math.min(x.n, 10), 0));
  const lean: Lean = usable.length === 0 ? "mixed" : weighted >= 0.1 ? "favorable" : weighted <= -0.1 ? "unfavorable" : "mixed";
  const points: string[] = [];
  for (const x of usable.sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!)).slice(0, 3)) {
    const dir = x.delta! > 0 ? "better" : x.delta! < 0 ? "worse" : "about the same";
    points.push(`${x.n} ${x.label}: ${pct(x.winRate)} won, average ${money(x.avgPnl)} — ${dir} than your usual ${pct(f.baseline.winRate)}.`);
  }
  for (const s of f.skippedRuleHistory) points.push(`You have skipped “${s.rule}” ${s.skippedBefore} of ${s.of} times; those trades averaged ${money(s.skippedAvgPnl)}${s.confirmedAvgPnl != null ? ` vs ${money(s.confirmedAvgPnl)} when you confirmed it` : ""}.`);
  const thin = f.factors.filter((x) => x.n < MIN);
  if (thin.length > 0) points.push(`Too few past trades to judge: ${thin.map((x) => x.label).join("; ")}.`);
  if (f.afterLossToday && !f.factors.some((x) => x.id === "afterloss")) points.push("You already took a loss today, which is when discipline slips most — your plan's loss limit matters more now.");

  const watch = [...f.likelyMistakes.map((m) => `${m.label} — in ${m.count} of your ${m.of} most similar trades`), ...d.watch.map((w) => `${w} (you chose to watch this)`)].slice(0, 4);
  const headline = lean === "favorable" ? "Your history says this plan looks stronger than your average." : lean === "unfavorable" ? "Your history says plans like this have gone worse than your average." : "Mixed: nothing in your history strongly favours or warns against this plan.";
  return { lean, headline, points: points.slice(0, 5), watch, source: "rules" };
}

/* ------------------------------------------------------------------ */
/*  Win / loss probability                                             */
/* ------------------------------------------------------------------ */

export type OddsDriver = { label: string; /** change in win chance, in percentage points */ pts: number };
export type OddsChecklist = {
  done: number; total: number;
  /** Win chance if none / all of the setup's rules are confirmed (everything else held as planned). */
  atNone: number; atAll: number;
  /** Average gain in win chance per extra rule confirmed. */
  perRule: number;
  /** True when your own trades say how much the checklist matters; false while it is still the standard assumption. */
  fromHistory: boolean;
  /** What the fitted effect says: more rules ⇒ more wins ("up"), no real difference ("flat"), or the opposite ("down"). */
  trend: "up" | "flat" | "down";
  /** Past trades that carry a checklist, and how they did when it was (mostly) complete vs not. */
  history: { n: number; fullWinRate: number | null; fullN: number; partialWinRate: number | null; partialN: number } | null;
};
export type OddsSimilar = { n: number; winRate: number | null; avgPnl: number | null; profitFactor: number | null; avgR: number | null; label: string };
export type WinOdds =
  | { status: "thin"; n: number; needed: number }
  | {
      status: "ready";
      /** 0–100 */ win: number; loss: number; n: number;
      /** Likely range (about 80% sure the true chance sits inside). */ low: number; high: number;
      confidence: "low" | "medium" | "high";
      checklist: OddsChecklist | null;
      drivers: OddsDriver[];
      similar: OddsSimilar | null;
    };

const MIN_HISTORY = 5;
const RISKY_FEELINGS = new Set(["FOMO", "ANXIOUS", "FRUSTRATED", "REVENGE-PRONE", "TIRED", "DISTRACTED"]);
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Feature columns. Every past trade — and the trade being planned — is described the same way:
 *   0 intercept
 *   1 checklist  : share of the setup's rules confirmed before the trade, centred on one half (−0.5 … +0.5)
 *   2 setup      : 1 when the trade used the setup being planned
 *   3 feeling    : 1 when the plan was written while FOMO / anxious / frustrated / revenge-prone / tired / distracted
 *   4 news       : 1 when the plan listed a news event
 *   5 afterLoss  : 1 when an earlier trade the same day lost
 *   6 later      : 1 for the second trade of the day or later
 */
// The setup's rules ARE the edge — a trade with every rule confirmed should win more often than one with none. That is the
// starting assumption (+1.0 on the log-odds scale ≈ +25 points near 50%). Your own trades then confirm, shrink or reverse it.
const PRIOR_MEAN = [0, 1.0, 0, 0, 0, 0, 0];
// How hard each coefficient is pulled back to its starting value. Higher = needs more trades to move.
const PRIOR_STRENGTH = [0, 2, 4, 4, 4, 4, 4];

/** Solve A·x = b (A is small, symmetric positive definite). Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    const d = M[c]![c]! || 1e-9;
    for (let k = c; k <= n; k++) M[c]![k] = M[c]![k]! / d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r]![c]!; if (f) for (let k = c; k <= n; k++) M[r]![k] = M[r]![k]! - f * M[c]![k]!; }
  }
  return M.map((r) => r[n]!);
}

/** Share of the setup's rules the trader confirmed before a past trade, from whatever record that trade has. */
function adherenceOf(e: JournalEntry, plan: TradePlan | undefined): number | null {
  if (plan?.rules?.length) return plan.rules.filter((r) => r.state === "ready").length / plan.rules.length;
  if (e.preTradeChecklist?.length) return e.preTradeChecklist.filter((i) => i.confirmed).length / e.preTradeChecklist.length;
  if (e.checklist) { const s = checklistScore(e.checklist); return s.required > 0 ? s.confirmed / s.required : null; }
  return null;
}

/**
 * "How likely is THIS trade to win, given how you have traded before — and how complete your checklist is?"
 *
 * A ridge-regularised logistic model fitted to the trader's own decided trades (break-evens are neither a win nor a loss).
 * Unlike the earlier version, every factor is fitted TOGETHER, so overlapping evidence is not double counted, and the
 * checklist is a first-class input: confirming more of the setup's rules raises the chance, by as much as your trades
 * support. Until enough of your trades carry a checklist, the checklist effect is the standard assumption (and the card
 * says so). The result is a range, not a promise, and always describes the trader's habits — never the market.
 */
export function winOdds(d: PlanDraft, entries: JournalEntry[], plans: TradePlan[]): WinOdds {
  const past = entries.filter((e) => e.date <= d.date && e.pnl !== undefined && e.pnl !== 0);
  if (past.length < MIN_HISTORY) return { status: "thin", n: past.length, needed: MIN_HISTORY };

  const planById = new Map(plans.map((p) => [p.id, p]));
  const planOf = (e: JournalEntry) => (e.planId ? planById.get(e.planId) : undefined) ?? plans.find((p) => p.linkedTradeId === e.id);
  const sameName = (e: JournalEntry) => !e.setupId && !!e.setup && !!d.setupName && e.setup.trim().toLowerCase() === d.setupName.trim().toLowerCase();
  const isSetup = (e: JournalEntry) => (d.setupId ? e.setupId === d.setupId || sameName(e) : false);

  // Position in the day, for "after a loss" and "later trade".
  const byDay = new Map<string, JournalEntry[]>();
  for (const e of entries) { const l = byDay.get(e.date); if (l) l.push(e); else byDay.set(e.date, [e]); }
  const order = new Map<string, { idx: number; lossBefore: boolean }>();
  for (const [date, list] of byDay) {
    const t = dayTrades(date, list);
    t.forEach((e, i) => order.set(e.id, { idx: i, lossBefore: t.slice(0, i).some((x) => x.pnl < 0) }));
  }

  type Row = { x: number[]; y: number; e: JournalEntry; adh: number | null };
  const rows: Row[] = past.map((e) => {
    const plan = planOf(e);
    const adh = adherenceOf(e, plan);
    const pos = order.get(e.id);
    return {
      e, adh, y: e.pnl > 0 ? 1 : 0,
      x: [
        1,
        adh == null ? 0 : adh - 0.5,
        isSetup(e) ? 1 : 0,
        plan?.emotionalState && RISKY_FEELINGS.has(plan.emotionalState) ? 1 : 0,
        (plan?.newsEvents?.length ?? 0) > 0 ? 1 : 0,
        pos?.lossBefore ? 1 : 0,
        (pos?.idx ?? 0) >= 1 ? 1 : 0,
      ],
    };
  });

  const total = d.ruleTotal ?? d.confirmedRules.length + d.skippedRules.length;
  const done = d.confirmedRules.length;
  const todayOrder = dayTrades(d.date, entries);
  const draftX = [
    1,
    total > 0 ? done / total - 0.5 : 0,
    d.setupId ? 1 : 0,
    d.emotion && RISKY_FEELINGS.has(d.emotion) ? 1 : 0,
    d.news.length > 0 ? 1 : 0,
    todayOrder.some((t) => t.pnl < 0) ? 1 : 0,
    todayOrder.length >= 1 ? 1 : 0,
  ];

  /* ---- fit: Newton–Raphson on the penalised log-likelihood ---- */
  const K = draftX.length;
  const wins = rows.reduce((s, r) => s + r.y, 0);
  const p0 = (wins + 0.5) / (rows.length + 1); // Jeffreys smoothing: 2 wins from 2 trades is not "100%"
  let beta = PRIOR_MEAN.map((m, j) => (j === 0 ? logit(p0) : m));
  let H: number[][] = [];
  for (let it = 0; it < 30; it++) {
    const g = new Array(K).fill(0);
    H = Array.from({ length: K }, () => new Array(K).fill(0));
    for (const r of rows) {
      const p = sigmoid(r.x.reduce((s, v, j) => s + v * beta[j]!, 0));
      const w = p * (1 - p);
      for (let a = 0; a < K; a++) {
        g[a] += (r.y - p) * r.x[a]!;
        for (let b = 0; b < K; b++) H[a]![b] += w * r.x[a]! * r.x[b]!;
      }
    }
    for (let j = 1; j < K; j++) { g[j] -= PRIOR_STRENGTH[j]! * (beta[j]! - PRIOR_MEAN[j]!); H[j]![j] += PRIOR_STRENGTH[j]!; }
    H[0]![0] += 1e-6;
    const step = solve(H, g);
    beta = beta.map((v, j) => v + Math.max(-2, Math.min(2, step[j]!)));
    if (step.every((s) => Math.abs(s) < 1e-6)) break;
  }

  const eta = (x: number[]) => x.reduce((s, v, j) => s + v * beta[j]!, 0);
  const clampP = (p: number) => Math.min(0.95, Math.max(0.05, p));
  const pct = (p: number) => Math.round(clampP(p) * 100);
  const p = clampP(sigmoid(eta(draftX)));

  // Likely range from the curvature of the fit (Laplace approximation): wide with little data, narrow with a lot.
  const hx = solve(H, draftX);
  const se = Math.sqrt(Math.max(0, draftX.reduce((s, v, j) => s + v * hx[j]!, 0)));
  const low = pct(sigmoid(eta(draftX) - 1.28 * se)), high = pct(sigmoid(eta(draftX) + 1.28 * se));

  /* ---- what is moving the number ---- */
  const without = (j: number) => { const x = [...draftX]; x[j] = 0; return x; };
  const drivers: OddsDriver[] = [];
  const draftLabel = (j: number) =>
    j === 1 ? (total > 0 ? `Checklist ${done}/${total}` : "Checklist")
    : j === 2 ? `${d.setupName ?? "This setup"} record`
    : j === 3 ? `Feeling ${d.emotion ? d.emotion.toLowerCase() : ""}`.trim()
    : j === 4 ? "News day"
    : j === 5 ? "After a loss today"
    : "Later trade of the day";
  for (let j = 1; j < K; j++) {
    if (draftX[j] === 0 && j !== 1) continue;
    const pts = Math.round((p - clampP(sigmoid(eta(without(j))))) * 100);
    if (Math.abs(pts) >= 1) drivers.push({ label: draftLabel(j), pts });
  }
  drivers.sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));

  /* ---- the checklist, spelled out ---- */
  const known = rows.filter((r) => r.adh != null);
  const spread = known.length ? Math.max(...known.map((r) => r.adh!)) - Math.min(...known.map((r) => r.adh!)) : 0;
  const fromHistory = known.length >= 8 && spread >= 0.25;
  const wr = (l: Row[]) => (l.length ? l.filter((r) => r.y === 1).length / l.length : null);
  const full = known.filter((r) => r.adh! >= 0.99), partial = known.filter((r) => r.adh! < 0.99);
  let checklist: OddsChecklist | null = null;
  if (total > 0) {
    const atNone = pct(sigmoid(eta([...draftX.slice(0, 1), -0.5, ...draftX.slice(2)])));
    const atAll = pct(sigmoid(eta([...draftX.slice(0, 1), 0.5, ...draftX.slice(2)])));
    checklist = {
      done, total, atNone, atAll, perRule: Math.round(((atAll - atNone) / total) * 10) / 10, fromHistory,
      trend: atAll - atNone >= 5 ? "up" : atAll - atNone <= -5 ? "down" : "flat",
      history: known.length ? { n: known.length, fullWinRate: wr(full), fullN: full.length, partialWinRate: wr(partial), partialN: partial.length } : null,
    };
  }

  /* ---- the closest past trades, with the numbers a trader actually judges a setup by ---- */
  let pool = d.setupId ? rows.filter((r) => isSetup(r.e)) : rows;
  let label = d.setupId ? `${d.setupName ?? "this setup"} trades` : "your trades";
  if (pool.length < 3) { pool = rows; label = "your trades"; }
  if (total > 0) {
    const near = pool.filter((r) => r.adh != null && Math.abs(r.adh - done / total) <= 0.25);
    if (near.length >= 3) { pool = near; label = `${label} with a similar checklist`; }
  }
  const gw = pool.filter((r) => r.e.pnl > 0).reduce((s, r) => s + r.e.pnl, 0);
  const gl = Math.abs(pool.filter((r) => r.e.pnl < 0).reduce((s, r) => s + r.e.pnl, 0));
  const rs = pool.map((r) => r.e.rr).filter((v): v is number => typeof v === "number");
  const similar: OddsSimilar | null = pool.length
    ? {
        n: pool.length, label, winRate: wr(pool),
        avgPnl: Math.round((pool.reduce((s, r) => s + r.e.pnl, 0) / pool.length) * 100) / 100,
        profitFactor: gl > 0 ? Math.round((gw / gl) * 100) / 100 : null,
        avgR: rs.length ? Math.round((rs.reduce((s, v) => s + v, 0) / rs.length) * 100) / 100 : null,
      }
    : null;

  const confidence = rows.length < 10 ? "low" : rows.length < 30 ? "medium" : "high";
  const win = pct(p);
  return { status: "ready", win, loss: 100 - win, n: rows.length, low: Math.min(low, win), high: Math.max(high, win), confidence, checklist, drivers: drivers.slice(0, 4), similar };
}
