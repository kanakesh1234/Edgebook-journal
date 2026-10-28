import type { JournalEntry, TradePlan } from "./types";
import { MISTAKE_CATEGORIES, mistakeTagsOf } from "./mistakes";
import { dayLimitFor, dayTrades, riskFor } from "./risk";

/**
 * Plan ↔ trade review.
 *
 * The plan flow asks "Where do you expect price to go, and why?" and stores the answer (plus the draw on liquidity,
 * the invalidation, the news list, the rules ticked …). This module lays that plan next to what the trader actually
 * did and says, check by check, where the trade followed the plan and where it left it.
 *
 * It is deterministic and offline: it only compares facts the journal already holds. The one soft step is reading the
 * direction out of the trader's own sentence ("look for a sweep of the lows then higher" → long); it is labelled as
 * such in the UI and is skipped when the wording is ambiguous.
 */
export type CheckStatus = "match" | "partial" | "miss" | "info";
export type PlanCheck = { id: string; label: string; status: CheckStatus; planned: string; actual: string };
export type PlanVerdict = "followed" | "partly" | "departed" | "unknown";
export type PlanReview = {
  plan: TradePlan;
  verdict: PlanVerdict;
  /** 0–100, share of the scored checks that matched (partial counts half). Null with fewer than two scored checks. */
  score: number | null;
  headline: string;
  /** The direction the trader's words point to, if they point clearly to one. */
  readDirection: "long" | "short" | null;
  checks: PlanCheck[];
};

const BULL = /\b(long|longs|buy|buys|buying|bull|bullish|higher|rally|rallies|upside|up\s?move|move\s+up|moves\s+up|push(?:es)?\s+up|go(?:es)?\s+up|going\s+up|rise|rises|rip|rips|reclaim|reclaims|rejection\s+from\s+(?:the\s+)?low|up)\b/gi;
const BEAR = /\b(short|shorts|sell|sells|selling|bear|bearish|lower|drop|drops|dump|dumps|downside|down\s?move|move\s+down|moves\s+down|push(?:es)?\s+down|go(?:es)?\s+down|going\s+down|fall|falls|decline|declines|fade|fades|rejection\s+from\s+(?:the\s+)?high|down)\b/gi;

/** Which way do the trader's words lean? Null when they do not lean clearly (equal, or neither). */
export function readDirectionOf(text: string): { dir: "long" | "short" | null; strength: number } {
  const t = (text || "").toLowerCase();
  const bull = (t.match(BULL) ?? []).length;
  const bear = (t.match(BEAR) ?? []).length;
  const total = bull + bear;
  if (total === 0 || bull === bear) return { dir: null, strength: 0 };
  return { dir: bull > bear ? "long" : "short", strength: Math.abs(bull - bear) / total };
}

/** Prices written in a sentence ("above 21,050", "PDH 21083.25"). Small numbers (times, counts) are ignored. */
function pricesIn(text?: string | null): number[] {
  if (!text) return [];
  const out: number[] = [];
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 100) out.push(n);
  }
  return out;
}

const toMin = (t?: string | null) => { const m = t?.match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const nearest = (xs: number[], to: number) => xs.reduce((a, b) => (Math.abs(b - to) < Math.abs(a - to) ? b : a), xs[0]!);

/** The plan this trade executed: linked by id, or the plan that points back at the trade. Never a guess by date. */
export function planForEntry(e: JournalEntry, plans: TradePlan[]): TradePlan | null {
  return plans.find((p) => p.id === e.planId) ?? plans.find((p) => p.linkedTradeId === e.id) ?? null;
}

export function reviewPlanForEntry(e: JournalEntry, plans: TradePlan[], entries: JournalEntry[], dayLimits?: Record<string, number>): PlanReview | null {
  const plan = planForEntry(e, plans);
  if (!plan) return null;
  const checks: PlanCheck[] = [];
  const add = (c: PlanCheck) => checks.push(c);

  /* 1 · Direction — the plan's words vs the side taken */
  const words = [plan.thesis, plan.expectedSetup, plan.drawOnLiquidity].filter(Boolean).join(" . ");
  const read = readDirectionOf(words);
  const side = e.direction;
  const bias = plan.bias && plan.bias !== "either" ? plan.bias : null;
  const planned: "long" | "short" | null = bias ?? read.dir;
  if (planned && side) {
    const ok = planned === side;
    add({ id: "direction", label: "Direction", status: ok ? "match" : "miss", planned: `${planned === "long" ? "Long" : "Short"} (${bias ? "chosen in the plan" : "read from your words"})`, actual: side === "long" ? "Long" : "Short" });
  }

  /* 2 · Setup */
  if (plan.playbookName || e.setup) {
    const same = plan.playbookId && e.setupId ? plan.playbookId === e.setupId : (plan.playbookName ?? "").trim().toLowerCase() === (e.setup ?? "").trim().toLowerCase();
    if (plan.playbookName && e.setup) add({ id: "setup", label: "Setup", status: same ? "match" : "miss", planned: plan.playbookName, actual: e.setup });
  }

  /* 3 · Rules — how many of the setup's rules were confirmed before entry */
  if (plan.rules?.length) {
    const ok = plan.rules.filter((r) => r.state === "ready");
    const skipped = plan.rules.filter((r) => r.state !== "ready");
    const share = ok.length / plan.rules.length;
    add({
      id: "rules", label: "Setup rules", status: share === 1 ? "match" : share >= 0.5 ? "partial" : "miss",
      planned: `All ${plan.rules.length} rules confirmed`,
      actual: skipped.length === 0 ? "All confirmed" : `${ok.length} of ${plan.rules.length} confirmed — skipped: ${skipped.slice(0, 3).map((r) => r.label.replace(/^Rule \d+:?\s*/i, "")).join("; ")}${skipped.length > 3 ? ` +${skipped.length - 3} more` : ""}`,
    });
  }

  /* 4 · Draw on liquidity (target) — did the trade head for it, and get there? */
  const drawLevels = pricesIn(plan.drawOnLiquidity);
  if (drawLevels.length && side && (e.exitPrice != null || e.takeProfit != null)) {
    const ref = e.exitPrice ?? e.takeProfit!;
    // Which side of the entry is the draw on? Without an entry price, assume it lies in the direction traded.
    const lvl = nearest(drawLevels, ref);
    const drawUp = e.entryPrice != null ? lvl > e.entryPrice : (planned ?? side) === "long";
    const withTrade = drawUp === (side === "long");
    const reached = drawUp ? ref >= lvl : ref <= lvl;
    const gap = Math.abs(ref - lvl);
    add({
      id: "draw", label: "Draw on liquidity",
      status: !withTrade ? "miss" : reached ? "match" : gap / lvl <= 0.0015 ? "partial" : "miss",
      planned: plan.drawOnLiquidity ?? fmt(lvl),
      actual: !withTrade ? `Traded ${side === "long" ? "up" : "down"}, away from ${fmt(lvl)}` : reached ? `Exit ${fmt(ref)} reached ${fmt(lvl)}` : `Exit ${fmt(ref)}, ${fmt(gap)} pts short of ${fmt(lvl)}`,
    });
  } else if (plan.drawOnLiquidity?.trim()) {
    add({ id: "draw", label: "Draw on liquidity", status: "info", planned: plan.drawOnLiquidity, actual: e.exitPrice != null ? `Exited at ${fmt(e.exitPrice)}` : "No exit price logged" });
  }

  /* 5 · Invalidation vs the stop actually used */
  const invLevels = pricesIn(plan.invalidation);
  if (invLevels.length && e.stopLoss != null) {
    const lvl = nearest(invLevels, e.stopLoss);
    const gap = Math.abs(e.stopLoss - lvl);
    const tight = gap / lvl <= 0.0015;
    add({ id: "invalidation", label: "Invalidation", status: tight ? "match" : "partial", planned: plan.invalidation ?? fmt(lvl), actual: `Stop ${fmt(e.stopLoss)}${tight ? "" : ` (${fmt(gap)} pts from ${fmt(lvl)})`}` });
  } else if (plan.invalidation?.trim()) {
    add({ id: "invalidation", label: "Invalidation", status: "info", planned: plan.invalidation, actual: e.stopLoss != null ? `Stop ${fmt(e.stopLoss)}` : "No stop logged" });
  }

  /* 6 · News — did the trade walk into an event listed in the plan? */
  const t0 = toMin(e.entryTime);
  if (plan.newsEvents?.length) {
    const hit = t0 == null ? null : plan.newsEvents.find((n) => { const nt = toMin(n.time); return nt != null && t0 - nt >= -10 && t0 - nt <= 30; });
    add({
      id: "news", label: "News", status: t0 == null ? "info" : hit ? "miss" : "match",
      planned: plan.newsEvents.map((n) => `${n.name}${n.time ? ` ${n.time}` : ""}`).join(", "),
      actual: t0 == null ? "No entry time logged" : hit ? `Entered at ${e.entryTime}, inside the ${hit.name} window` : `Entered at ${e.entryTime}, clear of the event`,
    });
  }

  /* 7 · Daily loss limit */
  const limit = dayLimitFor(e.date, plans, dayLimits);
  if (limit) {
    const day = dayTrades(e.date, entries);
    const idx = day.findIndex((t) => t.id === e.id);
    if (idx >= 0) {
      const before = riskFor(limit, day.slice(0, idx));
      const after = riskFor(limit, day.slice(0, idx + 1));
      const afterLimit = !!before && before.used >= limit;
      const crossed = !!after && after.used >= limit;
      add({ id: "limit", label: "Daily loss limit", status: afterLimit ? "miss" : crossed ? "partial" : "match", planned: `Stop at −${fmt(limit)}`, actual: afterLimit ? "Taken after the limit was already used" : crossed ? "This trade used up the limit" : `${fmt(after?.used ?? 0)} of ${fmt(limit)} used` });
    }
  }

  /* 8 · Mistakes the trader said they would watch for */
  if (plan.watchMistakes?.length && e.review) {
    const filed = new Set(mistakeTagsOf(e).map((t) => t.key as string));
    const hit = plan.watchMistakes.filter((k) => filed.has(k));
    add({ id: "watch", label: "Mistakes you watched for", status: hit.length ? "miss" : "match", planned: `${plan.watchMistakes.length} flagged in the plan`, actual: hit.length ? `${hit.map((k) => MISTAKE_CATEGORIES.find((c) => c.key === k)?.label ?? k).join(", ")} showed up` : "None showed up" });
  }

  /* 9 · Instrument */
  if (plan.instrument && e.instrument && e.instrument !== "—") {
    const a = plan.instrument.toUpperCase(), b = e.instrument.toUpperCase();
    add({ id: "instrument", label: "Instrument", status: b.startsWith(a) || a.startsWith(b) ? "match" : "miss", planned: plan.instrument, actual: e.instrument });
  }

  const scored = checks.filter((c) => c.status !== "info");
  const points = scored.reduce((s, c) => s + (c.status === "match" ? 1 : c.status === "partial" ? 0.5 : 0), 0);
  const score = scored.length >= 2 ? Math.round((points / scored.length) * 100) : null;
  const verdict: PlanVerdict = score == null ? "unknown" : score >= 80 ? "followed" : score >= 50 ? "partly" : "departed";

  const dir = checks.find((c) => c.id === "direction");
  const won = e.pnl > 0, lost = e.pnl < 0;
  const headline =
    dir?.status === "match" && won ? "You read the day right and traded it — and it paid."
    : dir?.status === "match" && lost ? "You traded the direction you planned, and it lost. Judge the process, not the result."
    : dir?.status === "miss" && won ? "You went against your own read and it worked. That is luck to be careful with, not an edge."
    : dir?.status === "miss" && lost ? "You traded against the direction you planned, and it lost."
    : verdict === "followed" ? "This trade stayed close to the plan."
    : verdict === "partly" ? "Parts of the plan were followed, parts were not."
    : verdict === "departed" ? "This trade left most of the plan behind."
    : "Not enough detail logged to compare this trade with its plan.";

  return { plan, verdict, score, headline, readDirection: read.dir, checks };
}
