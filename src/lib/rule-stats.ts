import type { JournalEntry, TradePlan } from "./types";

/**
 * Which playbook rules does the trader keep skipping — and what does skipping them cost?
 *
 * Rule confirmation is optional in the plan flow. Every plan stores each rule as "ready" (confirmed) or "skipped", so over
 * time this becomes a record of the rules the trader avoids, matched to the result of the trade that plan led to.
 * A plan only counts once it is linked to a real trade (an abandoned plan says nothing about results).
 */
export type RuleStat = {
  key: string;
  text: string;
  setup: string;
  /** Trades planned with this rule in front of the trader. */
  planned: number;
  skipped: number;
  skipRate: number;
  /** Results when this rule was skipped / confirmed. Null when there are no such trades. */
  skippedWinRate: number | null; skippedAvgPnl: number | null;
  confirmedWinRate: number | null; confirmedAvgPnl: number | null;
};

/** "Rule 3: wait for the sweep" → "wait for the sweep". */
export const ruleText = (label: string) => label.replace(/^Rule \d+:?\s*/i, "").trim() || label;
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const isConfirmed = (state: string) => state === "ready";

const avg = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null);
const wr = (v: number[]) => (v.length ? Math.round((v.filter((x) => x > 0).length / v.length) * 100) / 100 : null);

export function ruleStats(plans: TradePlan[], entries: JournalEntry[]): RuleStat[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const acc = new Map<string, { text: string; setup: string; skipped: number[]; confirmed: number[] }>();
  for (const p of plans) {
    const trade = p.linkedTradeId ? byId.get(p.linkedTradeId) : undefined;
    if (!trade) continue;
    for (const r of p.rules ?? []) {
      const text = ruleText(r.label);
      const key = `${p.playbookId ?? p.playbookName ?? ""}|${norm(text)}`;
      const a = acc.get(key) ?? { text, setup: p.playbookName ?? "", skipped: [], confirmed: [] };
      (isConfirmed(r.state) ? a.confirmed : a.skipped).push(trade.pnl);
      acc.set(key, a);
    }
  }
  return [...acc.entries()].map(([key, a]) => {
    const planned = a.skipped.length + a.confirmed.length;
    return {
      key, text: a.text, setup: a.setup, planned, skipped: a.skipped.length, skipRate: planned ? a.skipped.length / planned : 0,
      skippedWinRate: wr(a.skipped), skippedAvgPnl: avg(a.skipped), confirmedWinRate: wr(a.confirmed), confirmedAvgPnl: avg(a.confirmed),
    };
  }).sort((a, b) => b.skipped - a.skipped || b.skipRate - a.skipRate);
}

/** The stat for one rule of one setup, if it has any history. */
export const statFor = (stats: RuleStat[], playbookId: string | undefined, text: string) =>
  stats.find((s) => s.key === `${playbookId ?? ""}|${norm(text)}`) ?? stats.find((s) => s.key.endsWith(`|${norm(text)}`));
