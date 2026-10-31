/**
 * Context router: decides WHAT KIND of help is being asked for, so only the matching slice of the trader's data is sent.
 *
 * Deterministic on purpose: it runs on every question, must add no latency or cost, and must behave identically on the
 * client (to pick memories) and on the server (to trim facts). An ambiguous question blends the two best plans; an
 * unrecognised one falls back to a broad plan, so a routing miss costs tokens, never answer quality.
 */
import type { MemoryKind, MemoryTopic } from "./memory";

export type Intent = "trade_review" | "technical" | "behavior" | "strategy" | "performance" | "planning" | "practice" | "memory" | "chitchat" | "general";

export interface Route {
  intent: Intent;
  secondary: Intent | null;
  /** 0–1: how clearly one intent won. */
  confidence: number;
  inherited: boolean;
  scores: Partial<Record<Intent, number>>;
}

const W = (re: RegExp, w: number): [RegExp, number] => [re, w];

const RULES: Record<Exclude<Intent, "general">, [RegExp, number][]> = {
  chitchat: [
    W(/^\s*(hi|hello|hey|yo|sup|thanks|thank you|thx|ty|ok|okay|cool|great|nice|got it|good (morning|evening|afternoon|night)|gm|gn|how are you|who are you|what can you do|help)\b[\s!.?,]*$/i, 6),
  ],
  trade_review: [
    W(/\b(review|autopsy|debrief|break ?down|go over|walk me through|dissect|critique)\b/i, 2),
    W(/\bhow was\b.{0,24}\b(trade|entry|session|day|setup)\b/i, 3),
    W(/\bwhat (happened|went (wrong|right|well|badly))\b/i, 2.5),
    W(/\b(last|latest|previous|recent|today'?s|yesterday'?s|this|that|my) (trade|entry|loss|win|position)\b/i, 3),
    W(/\b(worst|best|biggest) (trade|loss|win)\b/i, 3),
    W(/\blast \d{1,2} (trades|entries)\b/i, 3),
    W(/\b(20\d{2}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4}|\d{1,2}(st|nd|rd|th)? (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2})\b/i, 2.5),
    W(/\b(entry|exit|stop ?loss|take ?profit|tp|sl|fill|slippage)\b/i, 1),
  ],
  technical: [
    W(/\b(liquidity|sweep|smt|fvg|fair value gap|order ?block|displacement|imbalance|premium|discount|kill ?zone|market structure|bos|choch|mss|asia (high|low)|london|ny open|support|resistance|confluence|vwap|ema|sma|rsi|macd|indicator|candle|wick|breakout|retest|invalidation|draw on liquidity|bias)\b/i, 2.5),
    W(/\b(chart|price action|trend|structure|level|zone|session high|session low)\b/i, 1.5),
    W(/\bis (this|that) (a )?(valid|good|clean|textbook) (setup|entry|sweep|model)\b/i, 3),
  ],
  behavior: [
    W(/\b(feel|feeling|felt|emotion\w*|mindset|psycholog\w*|tilt\w*|fomo|revenge|anxi\w*|nervous|scared|afraid|fear|frustrat\w*|angry|upset|confiden\w*|overconfiden\w*|discipline\w*|patien\w*|impulsiv\w*|urge|stress\w*|burn\w*out|tired|exhaust\w*|calm|habit\w*|self[- ]control|control myself|hesitat\w*)\b/i, 2.5),
    W(/\bwhy do i\b/i, 3),
    W(/\b(pattern|keeps? (repeating|happening)|keep (doing|making)|same mistake|recurring|over and over|always|every time)\b/i, 2),
    W(/\b(weakness|strength|improv\w*|blind spot|bad habit|what am i doing wrong)\b/i, 2),
  ],
  strategy: [
    W(/\b(setup|playbook|strateg\w*|edge|rules?|checklist|backtest\w*|expectancy|r[- ]multiple|risk[- ]?reward|position siz\w*|sizing)\b/i, 2),
    W(/\b(which|what) (setup|instrument|session|time|day)\b/i, 3),
    W(/\b(best|worst) (setup|time|day|session|instrument|window)\b/i, 3),
    W(/\bwin ?rate (by|per|on)\b/i, 3),
  ],
  performance: [
    W(/\bhow am i doing\b/i, 4),
    W(/\b(performance|p ?& ?l|pnl|profit|drawdown|equity|balance|win ?rate|stats?|statistics|numbers|progress|payout|consistency|streak|expectancy|average|total)\b/i, 2),
    W(/\b(this|last) (week|month|year|quarter)\b/i, 2),
    W(/\b(target|challenge|account|prop)\b/i, 1.5),
  ],
  planning: [
    W(/\b(plan|prep\w*|pre[- ]?session|game ?plan|goals?|watchlist|tomorrow|next (trade|session|week)|before (the )?(open|session|trading))\b/i, 2),
    W(/\bwhat should i (do|focus|work)\b/i, 3),
    W(/\b(reset|take a break|walk away|stop (for the day|trading)|should i (trade|take|stop|continue|skip)|daily (limit|loss))\b/i, 3),
  ],
  practice: [
    W(/\b(practi[cs]e|drill|lesson|mission|xp|quiz|kunai|ict lab|training|exercise|study|homework)\b/i, 3),
  ],
  memory: [
    W(/\bwhat do you (know|remember)\b/i, 5),
    W(/\bwhat have you (learned|noticed|picked up)\b/i, 5),
    W(/\b(about me|my profile|your memory|you remember|do you remember)\b/i, 3),
    W(/^\s*(please\s+)?(remember|forget)\b/i, 5),
  ],
};

const BROAD = /\b(teach me|analy[sz]e (my )?(trading|journal|everything)|what should i (improve|change|work on)|overall|big picture|everything you know|full (picture|review)|look at everything)\b/i;
const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export function routeIntent(text: string, opts: { hasFocus?: boolean; prev?: Intent | null } = {}): Route {
  const scores: Partial<Record<Intent, number>> = {};
  for (const intent of Object.keys(RULES) as Exclude<Intent, "general">[]) {
    let s = 0;
    for (const [re, w] of RULES[intent]) if (re.test(text)) s += w;
    if (s > 0) scores[intent] = s;
  }
  if (opts.hasFocus) scores.trade_review = (scores.trade_review ?? 0) + 3;
  const ranked = (Object.entries(scores) as [Intent, number][]).sort((a, b) => b[1] - a[1]);
  const [top, second] = [ranked[0], ranked[1]];

  // A short follow-up ("why?", "and the one before?") belongs to the conversation, not to a fresh topic.
  if ((!top || top[1] < 2) && wordCount(text) <= 6 && opts.prev && opts.prev !== "chitchat") {
    return { intent: opts.prev, secondary: null, confidence: 0.5, inherited: true, scores };
  }
  // Open-ended "look at everything" questions need the broad view, whatever keyword happened to match.
  if (BROAD.test(text) && (!top || top[1] < 5)) return { intent: "general", secondary: null, confidence: 0.4, inherited: false, scores };
  if (!top || top[1] < 1.5) return { intent: "general", secondary: null, confidence: 0.2, inherited: false, scores };
  const conf = top[1] / (top[1] + (second?.[1] ?? 0) + 1);
  return {
    intent: top[0],
    secondary: second && second[1] >= top[1] * 0.6 && top[0] !== "chitchat" ? second[0] : null,
    confidence: Math.round(conf * 100) / 100,
    inherited: false,
    scores,
  };
}

/* ================================ context plans ================================ */

export interface ContextPlan {
  intent: Intent;
  stats: boolean;
  hold: boolean;
  patterns: boolean;
  deep: { time: boolean; dow: boolean; setups: boolean; behavior: boolean; concepts: boolean };
  /** recent = newest N compact rows; resolved = max rows picked by what the question refers to; detail = include prices and setup evidence. */
  trades: { recent: number; resolved: number; detail: boolean };
  analogs: number;
  /** rows = how many selected trades get their full written words; rowChars = cap per trade. */
  words: { rows: number; rowChars: number; recalled: number; lessons: number };
  companion: { practice: boolean; plans: boolean; noTradeDays: boolean; mind: boolean; today: boolean; recentDays: number; commitments: boolean; saved: boolean; readiness: boolean };
  memory: { k: number; kinds: MemoryKind[] | null; topics: MemoryTopic[] | null; gaps: boolean };
}

const none = { time: false, dow: false, setups: false, behavior: false, concepts: false };
const noCompanion = { practice: false, plans: false, noTradeDays: false, mind: false, today: false, recentDays: 0, commitments: false, saved: false, readiness: false };

const PLANS: Record<Intent, Omit<ContextPlan, "intent">> = {
  chitchat: {
    stats: false, hold: false, patterns: false, deep: none, trades: { recent: 0, resolved: 0, detail: false }, analogs: 0, words: { rows: 0, rowChars: 0, recalled: 0, lessons: 0 },
    companion: { ...noCompanion, today: true, mind: true, commitments: true }, memory: { k: 2, kinds: ["semantic"], topics: null, gaps: false },
  },
  trade_review: {
    stats: false, hold: false, patterns: true, deep: { ...none, behavior: true }, trades: { recent: 3, resolved: 6, detail: true }, analogs: 5, words: { rows: 4, rowChars: 1400, recalled: 4, lessons: 4 },
    companion: { ...noCompanion, plans: true, mind: true, today: true, recentDays: 2, commitments: true }, memory: { k: 6, kinds: ["episodic", "semantic"], topics: ["execution", "risk", "emotion", "strategy", "habit", "timing"], gaps: false },
  },
  technical: {
    stats: false, hold: true, patterns: false, deep: { ...none, time: true, setups: true, concepts: true }, trades: { recent: 8, resolved: 6, detail: true }, analogs: 4, words: { rows: 3, rowChars: 900, recalled: 3, lessons: 3 },
    companion: { ...noCompanion, plans: true }, memory: { k: 4, kinds: null, topics: ["strategy", "timing", "execution"], gaps: false },
  },
  behavior: {
    stats: true, hold: false, patterns: true, deep: { ...none, behavior: true, time: true }, trades: { recent: 10, resolved: 5, detail: false }, analogs: 0, words: { rows: 5, rowChars: 700, recalled: 6, lessons: 6 },
    companion: { ...noCompanion, plans: false, mind: true, today: true, recentDays: 5, commitments: true, saved: true, readiness: true }, memory: { k: 8, kinds: null, topics: ["emotion", "habit", "execution", "risk", "timing", "preference"], gaps: true },
  },
  strategy: {
    stats: true, hold: true, patterns: true, deep: { time: true, dow: true, setups: true, behavior: true, concepts: true }, trades: { recent: 20, resolved: 10, detail: false }, analogs: 0, words: { rows: 3, rowChars: 600, recalled: 3, lessons: 5 },
    companion: { ...noCompanion, plans: true }, memory: { k: 6, kinds: null, topics: ["strategy", "timing", "execution", "habit"], gaps: true },
  },
  performance: {
    stats: true, hold: true, patterns: false, deep: { time: true, dow: true, setups: true, behavior: true, concepts: false }, trades: { recent: 15, resolved: 8, detail: false }, analogs: 0, words: { rows: 0, rowChars: 0, recalled: 0, lessons: 2 },
    companion: { ...noCompanion, noTradeDays: true, today: true, readiness: true }, memory: { k: 3, kinds: null, topics: ["habit", "execution"], gaps: false },
  },
  planning: {
    stats: true, hold: false, patterns: true, deep: { ...none, behavior: true }, trades: { recent: 6, resolved: 4, detail: false }, analogs: 0, words: { rows: 2, rowChars: 600, recalled: 4, lessons: 5 },
    companion: { practice: true, plans: true, noTradeDays: true, mind: true, today: true, recentDays: 3, commitments: true, saved: false, readiness: true }, memory: { k: 6, kinds: ["procedural", "semantic"], topics: null, gaps: false },
  },
  practice: {
    stats: false, hold: false, patterns: false, deep: none, trades: { recent: 5, resolved: 3, detail: false }, analogs: 0, words: { rows: 0, rowChars: 0, recalled: 3, lessons: 6 },
    companion: { ...noCompanion, practice: true, mind: true, today: true }, memory: { k: 4, kinds: ["procedural", "semantic"], topics: ["habit", "preference", "strategy"], gaps: false },
  },
  memory: {
    stats: false, hold: false, patterns: true, deep: none, trades: { recent: 0, resolved: 0, detail: false }, analogs: 0, words: { rows: 0, rowChars: 0, recalled: 0, lessons: 0 },
    companion: { ...noCompanion, mind: true, today: true, recentDays: 5, commitments: true, saved: true }, memory: { k: 24, kinds: null, topics: null, gaps: true },
  },
  general: {
    stats: true, hold: true, patterns: true, deep: { time: true, dow: true, setups: true, behavior: true, concepts: true }, trades: { recent: 20, resolved: 10, detail: false }, analogs: 3, words: { rows: 4, rowChars: 700, recalled: 5, lessons: 6 },
    companion: { practice: true, plans: true, noTradeDays: true, mind: true, today: true, recentDays: 3, commitments: true, saved: true, readiness: true }, memory: { k: 8, kinds: null, topics: null, gaps: true },
  },
};

const num = (a: number, b: number) => Math.max(a, Math.round(b * 0.6));
const union = <T,>(a: T[] | null, b: T[] | null): T[] | null => (a === null || b === null ? null : [...new Set([...a, ...b])]);

/** The plan for a route. A clear secondary intent is blended in at reduced weight. */
export function planFor(route: Route): ContextPlan {
  const a = PLANS[route.intent];
  if (!route.secondary) return { intent: route.intent, ...a };
  const b = PLANS[route.secondary];
  const c = Object.fromEntries((Object.keys(a.companion) as (keyof ContextPlan["companion"])[]).map((k) => [k, typeof a.companion[k] === "number" ? num(a.companion[k] as number, b.companion[k] as number) : a.companion[k] || b.companion[k]])) as ContextPlan["companion"];
  return {
    intent: route.intent,
    stats: a.stats || b.stats, hold: a.hold || b.hold, patterns: a.patterns || b.patterns,
    deep: { time: a.deep.time || b.deep.time, dow: a.deep.dow || b.deep.dow, setups: a.deep.setups || b.deep.setups, behavior: a.deep.behavior || b.deep.behavior, concepts: a.deep.concepts || b.deep.concepts },
    trades: { recent: num(a.trades.recent, b.trades.recent), resolved: num(a.trades.resolved, b.trades.resolved), detail: a.trades.detail || b.trades.detail },
    analogs: num(a.analogs, b.analogs),
    words: { rows: num(a.words.rows, b.words.rows), rowChars: num(a.words.rowChars, b.words.rowChars), recalled: num(a.words.recalled, b.words.recalled), lessons: num(a.words.lessons, b.words.lessons) },
    companion: c,
    memory: { k: num(a.memory.k, b.memory.k), kinds: union(a.memory.kinds, b.memory.kinds), topics: union(a.memory.topics, b.memory.topics), gaps: a.memory.gaps || b.memory.gaps },
  };
}

/* ============================= what the question points at ============================= */

export interface TradeRefs {
  dates: string[];
  ranges: { from: string; to: string }[];
  /** "last trade" → 1, "last 3 trades" → 3. */
  lastN: number;
  weekdays: number[];
  instruments: string[];
  setups: string[];
  outcome: "win" | "loss" | null;
  extreme: "best" | "worst" | null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (isoDate: string, n: number) => { const d = new Date(`${isoDate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const valid = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && new Date(Date.UTC(y, m - 1, d)).getUTCMonth() === m - 1;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseTradeRefs(text: string, vocab: { instruments: string[]; setups: string[] }, today: string): TradeRefs {
  const refs: TradeRefs = { dates: [], ranges: [], lastN: 0, weekdays: [], instruments: [], setups: [], outcome: null, extreme: null };
  const t = text.toLowerCase();
  const ty = Number(today.slice(0, 4));
  const add = (y: number | null, m: number, d: number) => {
    let year = y ?? ty;
    if (y !== null && y < 100) year += 2000;
    if (!valid(year, m, d)) return;
    let key = `${year}-${pad(m)}-${pad(d)}`;
    if (y === null && key > today) key = `${year - 1}-${pad(m)}-${pad(d)}`; // no year given: the most recent such date
    if (!refs.dates.includes(key)) refs.dates.push(key);
  };
  for (const m of t.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) add(Number(m[1]), Number(m[2]), Number(m[3]));
  for (const m of t.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/g)) add(Number(m[3]), Number(m[2]), Number(m[1])); // DD/MM/YYYY, the app's convention
  const mon = `(${MONTHS.join("|")})[a-z]*`;
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mon}\\.?(?:,?\\s+(20\\d{2}))?`, "g"))) add(m[3] ? Number(m[3]) : null, MONTHS.indexOf(m[2]) + 1, Number(m[1]));
  for (const m of t.matchAll(new RegExp(`\\b${mon}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`, "g"))) add(m[3] ? Number(m[3]) : null, MONTHS.indexOf(m[1]) + 1, Number(m[2]));

  if (/\btoday('?s)?\b/.test(t)) refs.dates.push(today);
  if (/\byesterday('?s)?\b/.test(t)) refs.dates.push(addDays(today, -1));
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = addDays(today, -((dow + 6) % 7));
  if (/\bthis week\b/.test(t)) refs.ranges.push({ from: monday, to: today });
  if (/\blast week\b/.test(t)) refs.ranges.push({ from: addDays(monday, -7), to: addDays(monday, -1) });
  if (/\bthis month\b/.test(t)) refs.ranges.push({ from: `${today.slice(0, 8)}01`, to: today });
  if (/\blast month\b/.test(t)) {
    const first = new Date(`${today.slice(0, 8)}01T12:00:00Z`); first.setUTCMonth(first.getUTCMonth() - 1);
    const end = new Date(`${today.slice(0, 8)}01T12:00:00Z`); end.setUTCDate(0);
    refs.ranges.push({ from: iso(first), to: iso(end) });
  }
  for (const [i, name] of WEEKDAYS.entries()) if (new RegExp(`\\b${name}s?('s)?\\b`).test(t)) refs.weekdays.push(i);

  const n = t.match(/\blast (\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten) (?:trades|entries|positions)\b/);
  if (n) refs.lastN = Math.min(20, Number(n[1]) || NUMBER_WORDS[n[1]] || 1);
  else if (/\b(last|latest|most recent|previous)\b.{0,14}\b(trade|entry|loss|win|position)\b/.test(t) || /\b(my|the) (last|latest) one\b/.test(t)) refs.lastN = 1;

  for (const i of vocab.instruments) if (i.length >= 2 && new RegExp(`(^|[^a-z0-9])${esc(i.toLowerCase())}([^a-z0-9]|$)`).test(t)) refs.instruments.push(i);
  for (const s of vocab.setups) if (s.length >= 3 && t.includes(s.toLowerCase())) refs.setups.push(s);

  if (/\b(worst|biggest loss|largest loss)\b/.test(t)) refs.extreme = "worst";
  else if (/\b(best|biggest win|largest win)\b/.test(t)) refs.extreme = "best";
  if (/\b(loss(es)?|losing|lost|red)\b/.test(t)) refs.outcome = "loss";
  else if (/\b(wins?|winning|won|green|profitable)\b/.test(t)) refs.outcome = "win";
  return refs;
}

export const hasTradeRefs = (r: TradeRefs) => r.dates.length + r.ranges.length + r.weekdays.length + r.instruments.length + r.setups.length > 0 || r.lastN > 0 || r.extreme !== null;
