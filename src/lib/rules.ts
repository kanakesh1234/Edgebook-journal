import type { JournalEntry, JournalSettings, RuleDef } from "./types";
import { defaultRuleSet } from "./types";
import { groupByDay } from "./stats";
import { todayKey } from "./format";

/* ------------------------------------------------------------------ */
/*  Rule engine — compares actual trades against the Trading Lab plan  */
/*  Pure & testable. Only evaluates what the data honestly supports.   */
/* ------------------------------------------------------------------ */

export interface Violation {
  id: string;
  date: string;
  ruleId: string;
  ruleLabel: string;
  kind: RuleDef["kind"];
  severity: "warn" | "breach";
  detail: string;
  entryId?: string;
}

export function activeRules(settings: JournalSettings): RuleDef[] {
  const rules = (settings.rules ?? defaultRuleSet()).rules;
  return rules.filter((r) => r.enabled);
}

export function ruleById(settings: JournalSettings, id: string): RuleDef | undefined {
  return (settings.rules ?? defaultRuleSet()).rules.find((r) => r.id === id);
}

function num(params: RuleDef["params"], key: string): number {
  const v = params[key];
  return typeof v === "number" ? v : Number(v) || 0;
}

function strList(params: RuleDef["params"], key: string): string[] {
  const v = params[key];
  return Array.isArray(v) ? v.filter(Boolean) : [];
}

/**
 * Evaluate all enabled rules against the journal.
 * Deterministic: violations are returned newest-first, one per rule per
 * day/entry as applicable.
 */
export function evaluateRules(entries: JournalEntry[], settings: JournalSettings): Violation[] {
  const out: Violation[] = [];
  const push = (v: Omit<Violation, "id">) => out.push({ ...v, id: `${v.date}:${v.ruleId}:${v.entryId ?? "day"}` });

  const rules = activeRules(settings);
  const byId = new Map(rules.map((r) => [r.id, r]));
  const daily = [...groupByDay(entries).values()].sort((a, b) => a.date.localeCompare(b.date));

  // ---- day-level rules ----
  let lossStreak = 0;
  for (const day of daily) {
    const r = byId.get("risk.max-daily-loss");
    if (r) {
      const limit = num(r.params, "limit");
      if (day.pnl < 0 && Math.abs(day.pnl) > limit) {
        push({
          date: day.date, ruleId: r.id, ruleLabel: r.label, kind: r.kind, severity: "breach",
          detail: `Daily loss −$${Math.abs(day.pnl).toFixed(0)} exceeded the −$${limit.toFixed(0)} limit by $${(Math.abs(day.pnl) - limit).toFixed(0)}.`,
        });
      }
    }

    const t = byId.get("risk.max-trades-per-day");
    if (t) {
      const max = num(t.params, "maxTrades");
      if (day.trades > max) {
        push({
          date: day.date, ruleId: t.id, ruleLabel: t.label, kind: t.kind, severity: "breach",
          detail: `${day.trades} trades in one day — limit is ${max}.`,
        });
      }
    }

    const c = byId.get("risk.max-consecutive-losses");
    if (c) {
      const max = num(c.params, "max");
      if (day.pnl < 0) {
        lossStreak += 1;
        if (lossStreak >= max) {
          push({
            date: day.date, ruleId: c.id, ruleLabel: c.label, kind: c.kind, severity: "breach",
            detail: `${lossStreak} losing days in a row — the stop rule says step away at ${max}.`,
          });
        }
      } else {
        lossStreak = 0;
      }
    }
  }

  // ---- entry-level rules ----
  for (const e of entries) {
    const rr = byId.get("risk.min-rr");
    if (rr && e.rr != null) {
      const min = num(rr.params, "min");
      if (e.rr < min) {
        push({
          date: e.date, ruleId: rr.id, ruleLabel: rr.label, kind: rr.kind, severity: "warn", entryId: e.id,
          detail: `${e.instrument} taken at ${e.rr}R — below the ${min}R minimum.`,
        });
      }
    }

    const ai = byId.get("setup.allowed-instruments");
    if (ai) {
      const list = strList(ai.params, "instruments");
      if (list.length > 0 && e.instrument !== "—" && !list.some((s) => s.toLowerCase() === e.instrument.toLowerCase())) {
        push({
          date: e.date, ruleId: ai.id, ruleLabel: ai.label, kind: ai.kind, severity: "warn", entryId: e.id,
          detail: `${e.instrument} is not in your allowed list (${list.join(", ")}).`,
        });
      }
    }

    const as = byId.get("setup.allowed-setups");
    if (as) {
      const list = strList(as.params, "setups");
      if (list.length > 0 && !e.setup) {
        push({
          date: e.date, ruleId: as.id, ruleLabel: as.label, kind: as.kind, severity: "warn", entryId: e.id,
          detail: `Unnamed setup — playbook required (${list.join(", ")}).`,
        });
      } else if (list.length > 0 && !list.some((s) => s.toLowerCase() === e.setup.toLowerCase())) {
        push({
          date: e.date, ruleId: as.id, ruleLabel: as.label, kind: as.kind, severity: "warn", entryId: e.id,
          detail: `"${e.setup}" is not in your playbook (${list.join(", ")}).`,
        });
      }
    }

    const ns = byId.get("behavior.name-your-setups");
    if (ns && !e.setup) {
      push({
        date: e.date, ruleId: ns.id, ruleLabel: ns.label, kind: ns.kind, severity: "warn", entryId: e.id,
        detail: `${e.instrument} traded without a named setup.`,
      });
    }

    const ts = byId.get("behavior.trade-your-setup");
    if (ts && e.reflection?.followedSetup === false) {
      push({
        date: e.date, ruleId: ts.id, ruleLabel: ts.label, kind: ts.kind, severity: "breach", entryId: e.id,
        detail: `Reflection on ${e.instrument}: setup not followed.`,
      });
    }

    const rk = byId.get("behavior.respect-risk-rules");
    if (rk && e.reflection?.followedRisk === false) {
      push({
        date: e.date, ruleId: rk.id, ruleLabel: rk.label, kind: rk.kind, severity: "breach", entryId: e.id,
        detail: `Reflection on ${e.instrument}: risk rules not respected.`,
      });
    }
  }

  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export interface AdherenceSummary {
  violations30: number;
  breaches30: number;
  /** Share of trading days (last 30) with zero violations. */
  cleanDayRate: number; // 0..1 (0 when nothing to check)
  tradingDays30: number;
  byRule: Record<string, number>; // ruleId → violation count (30d)
  recent: Violation[]; // newest-first, capped 12
}

export function adherenceSummary(entries: JournalEntry[], settings: JournalSettings, today = todayKey()): AdherenceSummary {
  const all = evaluateRules(entries, settings);
  const d = new Date(today + "T00:00:00");
  d.setDate(d.getDate() - 30);
  const localCut = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const window = all.filter((v) => v.date >= localCut);
  const byRule: Record<string, number> = {};
  for (const v of window) byRule[v.ruleId] = (byRule[v.ruleId] ?? 0) + 1;

  const daysWithViolations = new Set(window.map((v) => v.date));
  const tradingDays30 = new Set(entries.filter((e) => e.date >= localCut).map((e) => e.date)).size;
  const cleanDays = [...new Set(entries.filter((e) => e.date >= localCut).map((e) => e.date))].filter(
    (day) => !daysWithViolations.has(day),
  ).length;

  return {
    violations30: window.length,
    breaches30: window.filter((v) => v.severity === "breach").length,
    cleanDayRate: tradingDays30 > 0 ? cleanDays / tradingDays30 : 0,
    tradingDays30,
    byRule,
    recent: all.slice(0, 12),
  };
}
