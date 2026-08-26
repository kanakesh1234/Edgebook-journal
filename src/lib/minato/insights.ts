import type { EdgeBookContext } from "./context";
import { executionVerdict } from "./context";

/* ------------------------------------------------------------------ */
/*  MINATO insights — quiet by default, evidence-based when active.    */
/*  No constant nagging. No discipline monitoring. No Telugu.          */
/*  Only surfaces when there is meaningful, evidence-backed data.      */
/* ------------------------------------------------------------------ */

export type MinatoState = "idle" | "curious" | "warning" | "firm" | "proud" | "celebration" | "thinking";

export interface Insight {
  id: string;
  state: MinatoState;
  priority: number;
  message: string;
}

export function computeInsights(ctx: EdgeBookContext): Insight[] {
  const out: Insight[] = [];
  const { recentTrades } = ctx;

  // Only surface insights when there are enough reviewed trades to be meaningful.
  const reviewedTrades = recentTrades.filter((e) => e.reviewStatus === "reviewed");
  if (reviewedTrades.length < 3) return out;

  // 1. Repeated patterns (3+ occurrences from actual reflection text)
  const topPattern = ctx.recurringPatterns[0];
  if (topPattern && topPattern.count >= 3) {
    out.push({
      id: `pattern-${topPattern.pattern}`,
      state: "firm",
      priority: 80,
      message: `I've noticed "${topPattern.pattern}" in ${topPattern.count} of your recent trade reviews. Worth reviewing before your next entry.`,
    });
  }

  // 2. Rule violations across reviewed trades
  const violated = reviewedTrades.filter((e) => {
    const c = e.checklist;
    if (!c) return false;
    return [c.r1Time, c.r2Environment, c.r3LiquiditySweep, c.r4Manipulation, c.r5Target, c.r6Smt].some((i) => i?.answer === false);
  });
  if (violated.length >= 2) {
    out.push({
      id: "rule-violations",
      state: "warning",
      priority: 70,
      message: `${violated.length} of your last ${reviewedTrades.length} reviewed trades had at least one checklist rule marked as broken.`,
    });
  }

  // 3. Consistent improvement (recent trades all reviewed + followed plan)
  const recent5 = reviewedTrades.slice(0, 5);
  const allClean = recent5.length >= 3 && recent5.every((e) => e.review?.outcome?.followedPlan === true);
  if (allClean) {
    out.push({
      id: "consistent-execution",
      state: "proud",
      priority: 60,
      message: `Your last ${recent5.length} reviewed trades all followed the plan. That's the kind of consistency that compounds.`,
    });
  }

  // 4. Significant drawdown
  if (ctx.stats.drawdown > 0 && ctx.stats.tradingDays > 0) {
    const ddPct = ctx.stats.tradingDays > 0 ? Math.round((ctx.stats.drawdown / Math.max(1, ctx.stats.tradingDays * 100)) * 100) : 0;
    if (ddPct >= 5) {
      out.push({
        id: "drawdown",
        state: "warning",
        priority: 65,
        message: `You're in a ${ddPct}% drawdown from your peak equity. Consider reducing size or taking a break until your setup re-aligns.`,
      });
    }
  }

  return out.sort((a, b) => b.priority - a.priority);
}

export function topState(insights: Insight[]): MinatoState {
  return insights[0]?.state ?? "idle";
}
