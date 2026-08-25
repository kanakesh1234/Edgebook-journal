import type { JournalEntry, TradePlan } from "./types";
import { checklistScore } from "./types";

/* ------------------------------------------------------------------ */
/*  Process / competence score — DETERMINISTIC. Documented formula.    */
/*  MINATO never decides the score; it only reports it.                */
/*                                                                      */
/*  Components (0–100 each, weighted):                                 */
/*   review completeness   25%   (autopsy fields + evidence)            */
/*   playbook adherence    25%   (checklist confirmed / required)       */
/*   risk adherence        15%   (no moved stop / no early exit / etc)  */
/*   plan discipline       15%   (plans created & linked & followed)    */
/*   concept engagement    10%   (concepts tagged, improvement noted)    */
/*   consistency           10%   (recent reviewed trades share)         */
/*                                                                      */
/*  P&L is NOT part of the process score — it is reported separately   */
/*  and combined only in competition views.                            */
/* ------------------------------------------------------------------ */

export interface ProcessScore {
  score: number; // 0..100
  parts: {
    reviewCompleteness: number | null;
    playbookAdherence: number | null;
    riskAdherence: number | null;
    planDiscipline: number | null;
    conceptEngagement: number | null;
    consistency: number | null;
  };
}

export function processScore(
  entries: JournalEntry[],
  plans: TradePlan[],
): ProcessScore {
  if (entries.length === 0 && plans.length === 0) {
    return { score: 0, parts: { reviewCompleteness: null, playbookAdherence: null, riskAdherence: null, planDiscipline: null, conceptEngagement: null, consistency: null } };
  }

  // Review completeness: reviewed / (all non-cancelled trades)
  const reviewed = entries.filter((e) => e.reviewStatus === "reviewed").length;
  const reviewCompleteness = entries.length > 0 ? reviewed / entries.length : null;

  // Playbook adherence: checklist confirmed / required
  let confirmed = 0;
  let required = 0;
  for (const e of entries) {
    if (!e.checklist) continue;
    const s = checklistScore(e.checklist);
    confirmed += s.confirmed;
    required += s.required;
  }
  const playbookAdherence = required > 0 ? confirmed / required : null;

  // Risk adherence: share of reviewed trades without stop-movement / early exit / chase
  const riskChecked = entries.filter(
    (e) => e.review?.execution && (e.review.execution.movedStop != null || e.review.execution.exitedEarly != null || e.review.execution.chased != null),
  );
  const riskClean = riskChecked.filter(
    (e) => e.review?.execution?.movedStop !== true && e.review?.execution?.exitedEarly !== true && e.review?.execution?.chased !== true,
  ).length;
  const riskAdherence = riskChecked.length > 0 ? riskClean / riskChecked.length : null;

  // Plan discipline: plans created, and executed trades linked to a plan
  const executedTrades = entries.length;
  const linked = entries.filter((e) => e.planId).length;
  const planDiscipline =
    plans.length > 0 || executedTrades > 0
      ? Math.min(1, (plans.length > 0 ? 0.4 : 0) + (executedTrades > 0 ? 0.6 * (linked / executedTrades) : 0))
      : null;

  // Concept engagement: share of reviewed trades tagging concepts or naming an improvement
  const conceptEngaged = entries.filter(
    (e) => (e.review?.concepts?.used?.length ?? 0) > 0 || !!e.review?.followUp?.watchNext || !!e.reflection?.lesson,
  ).length;
  const conceptEngagement = entries.length > 0 ? conceptEngaged / entries.length : null;

  // Consistency: reviewed trades among the newest 10 entries
  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 10);
  const consistency = recent.length > 0 ? recent.filter((e) => e.reviewStatus === "reviewed").length / recent.length : null;

  const w = (v: number | null, weight: number) => (v == null ? 0 : v * weight);
  const weights: [number | null, number][] = [
    [reviewCompleteness, 0.25],
    [playbookAdherence, 0.25],
    [riskAdherence, 0.15],
    [planDiscipline, 0.15],
    [conceptEngagement, 0.1],
    [consistency, 0.1],
  ];
  let totalWeight = 0;
  let score = 0;
  for (const [v, weight] of weights) {
    if (v != null) {
      score += w(v, weight);
      totalWeight += weight;
    }
  }

  return {
    score: totalWeight > 0 ? Math.round((score / totalWeight) * 100) : 0,
    parts: { reviewCompleteness, playbookAdherence, riskAdherence, planDiscipline, conceptEngagement, consistency },
  };
}
