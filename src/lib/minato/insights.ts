import type { EdgeBookContext } from "./context";
import { executionVerdict } from "./context";

/* ------------------------------------------------------------------ */
/*  Deterministic insights — computed from data, never invented.       */
/*  MINATO stays quiet unless something here earns his attention.      */
/* ------------------------------------------------------------------ */

export type MinatoState = "idle" | "curious" | "warning" | "firm" | "proud" | "celebration" | "thinking";

export interface Insight {
  id: string;
  state: MinatoState;
  priority: number; // higher = more urgent
  message: string; // Telugu-English, 1–3 sentences
}

export function computeInsights(ctx: EdgeBookContext): Insight[] {
  const out: Insight[] = [];
  const { discipline, adherence, stats, recurringPatterns, recentTrades } = ctx;

  // 1. Missed journal discipline
  if (discipline.missedDays > 0) {
    out.push({
      id: "missed-journal",
      state: discipline.missedDays >= 3 ? "firm" : "warning",
      priority: 80,
      message:
        `Orey, ${discipline.missedDays} trading ${discipline.missedDays === 1 ? "day" : "days"} journal cheyyaledu. ` +
        `Traded day ayithe entry, lekapothe no-trade ani mark cheyyi. Process miss avvakudadhu bro.`,
    });
  }

  // 2. Hard breaches in the last 7 days
  if (adherence.breaches30 > 0 && adherence.recent[0]?.severity === "breach") {
    const v = adherence.recent.find((x) => x.severity === "breach");
    if (v) {
      out.push({
        id: "recent-breach",
        state: "warning",
        priority: 75,
        message: `Recent ga "${v.ruleLabel}" break ayyindhi — ${v.detail} Result entho le, process matter.`,
      });
    }
  }

  // 3. Repeated pattern from actual reflections
  const top = recurringPatterns[0];
  if (top && top.count >= 2) {
    out.push({
      id: `pattern-${top.pattern}`,
      state: top.count >= 3 ? "firm" : "warning",
      priority: 60 + top.count,
      message:
        `I've noticed — recent reviews lo "${top.pattern}" pattern ${top.count} sarlu kanipisthundi. ` +
        `Same mistake malli avvakunda next entry mundu oka line reminder pettuko bro.`,
    });
  }

  // 4. Recent trades without reflection
  const unreflected = recentTrades.filter((e) => executionVerdict(e) === "unreflected").length;
  if (unreflected > 0) {
    out.push({
      id: "missing-reflection",
      state: "curious",
      priority: 40,
      message:
        `${unreflected} recent ${unreflected === 1 ? "trade" : "trades"} ki reflection ledu. ` +
        `2 minutes pettu bro — review is the edge.`,
    });
  }

  // 5. Milestone proximity
  if (stats.remainingToTarget > 0 && stats.targetProgress > 0.75) {
    out.push({
      id: "milestone-close",
      state: "celebration",
      priority: 30,
      message: `Target ki ${Math.round(stats.targetProgress * 100)}% reach ayyav. Last stretch lo discipline loose cheyyaku.`,
    });
  }

  // 6. Clean streak / proud
  if (discipline.disciplineStreak >= 5) {
    out.push({
      id: "clean-streak",
      state: "proud",
      priority: 35,
      message: `Super ra. ${discipline.disciplineStreak} days clean discipline. Profit kanna important — consistency. Ilaane continue cheyyali.`,
    });
  } else if (adherence.cleanDayRate >= 0.9 && adherence.tradingDays30 >= 5) {
    out.push({
      id: "high-adherence",
      state: "proud",
      priority: 30,
      message: `Last 30 days adherence ${Math.round(adherence.cleanDayRate * 100)}%. Clean execution ra. Nice.`,
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}

export function topState(insights: Insight[]): MinatoState {
  return insights[0]?.state ?? "idle";
}
