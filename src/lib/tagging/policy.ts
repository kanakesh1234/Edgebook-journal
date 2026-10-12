import type { MistakeKey } from "../mistakes";
import type { MistakeTagRecord, MistakeTagging } from "../types";
import type { TagBundle } from "./evidence";
import type { ModelRun } from "./prompt";
import { scanSources, type KeyScore, type RuleScan, type SourceRole } from "./rules";

/**
 * The decision layer — what may be FILED on a trade, what is only SUGGESTED, and when to say nothing.
 *
 * Wrong tags are worse than missing tags (they poison the Journal, the Weekly Review and the Practice rounds built
 * from them). So the rule is precision first:
 *
 *   FILED      the trader chose it themselves, OR at least two independent voters agree and nothing contradicts it.
 *   SUGGESTED  one voter, or voters that disagree, or a contradiction in the trader's own words. Shown for a one-tap
 *              confirm; never counted until confirmed.
 *   DROPPED    too weak to bother the trader with.
 *
 * Voters are independent sources of judgement:
 *   you      the trader's own pick (a quick-pick, or a category chosen by hand)
 *   data     a measured fact that proves it (news window, loss limit, size spike…)
 *   ai:<m>   one model's answer, after its quotes were verified (each model counts separately)
 *   rules    the offline rules engine — counts twice when the trader's own words corroborate it across fields
 *
 * A model's self-reported confidence is never used.
 */

const RULES_SUGGEST_MIN = 2;      // below this a rules-only hit is too weak to even suggest
const RULES_SUGGEST_MIN_AI_SILENT = 3; // …and when every model that answered declined to tag, rules need more
const DIRECT: ReadonlySet<SourceRole> = new Set(["mistake-name", "mistake-detail", "went-poorly", "cause", "deviation"]);
/** Tags that explain WHY rather than WHAT. They lose ties against a concrete behaviour. */
const GENERIC: ReadonlySet<MistakeKey> = new Set(["plan", "tilt", "fomo"]);

type Ev = MistakeTagRecord["evidence"][number];
type Cand = { key: MistakeKey; voters: Set<string>; rulesBonus: boolean; counter: boolean; evidence: Ev[]; rules: KeyScore | null; data: boolean };

const votes = (c: Cand) => c.voters.size + (c.rulesBonus ? 1 : 0);
const addEv = (c: Cand, ev: Ev) => { if (!c.evidence.some((e) => e.quote === ev.quote)) c.evidence.push(ev); };
const rank = (c: Cand) => votes(c) * 10 + (GENERIC.has(c.key) ? -3 : 0) + Math.min(9, c.rules?.score ?? 0) + (c.data ? 2 : 0);

/** Agreement-derived strength, 0–1. A trader's own pick is 1. Not a model's opinion of itself. */
export function supportOf(c: { voters: string[]; counter?: boolean; rulesBonus?: boolean; data?: boolean }): number {
  if (c.voters.includes("you")) return 1;
  const n = c.voters.length + (c.rulesBonus ? 1 : 0);
  return Math.max(0.2, Math.min(0.95, Math.round((0.45 + 0.17 * n + (c.data ? 0.08 : 0) - (c.counter ? 0.2 : 0)) * 100) / 100));
}

export type Decision = { tags: MistakeTagRecord[]; tagging: MistakeTagging };

export function decide(b: TagBundle, runs: ModelRun[], scan: RuleScan = scanBundle(b), now = Date.now()): Decision {
  const cands = new Map<MistakeKey, Cand>();
  const cand = (key: MistakeKey) => { let c = cands.get(key); if (!c) { c = { key, voters: new Set(), rulesBonus: false, counter: false, evidence: [], rules: null, data: false }; cands.set(key, c); } return c; };

  const aiAnswered = runs.length > 0;
  const aiAbstained = aiAnswered && runs.every((r) => r.tags.length === 0);

  // AI voters — one per model, quotes already verified.
  for (const r of runs) for (const t of r.tags) { const c = cand(t.key); c.voters.add(`ai:${r.model}`); for (const e of t.evidence) addEv(c, e); }

  // Rules voter.
  const direct = scan.scores.filter((s) => s.hits.some((h) => DIRECT.has(h.role)));
  const best = scan.scores[0]?.score ?? 0;
  for (const ks of scan.scores) {
    const floor = aiAbstained ? RULES_SUGGEST_MIN_AI_SILENT : RULES_SUGGEST_MIN;
    if (ks.score < floor) continue;
    const c = cand(ks.key);
    c.voters.add("rules"); c.rules = ks;
    for (const h of ks.hits.slice(0, 3)) addEv(c, { src: h.sourceId, role: h.role, quote: h.quote });
    // The trader's words, across two fields, or the trader NAMING the mistake in a phrase the rules recognise outright.
    const corroborated = ks.sources.length >= 2 && direct.includes(ks) && ks.score >= 3;
    const named = ks.hits.some((h) => h.role === "mistake-name" && h.weight >= 2.5) && ks.score - (scan.scores.find((s) => s.key !== ks.key)?.score ?? 0) >= 1 && ks.score === best;
    if ((corroborated || named) && !aiAbstained) c.rulesBonus = true;
  }

  // Data voter — a measured fact that proves a specific mistake.
  for (const f of b.facts) if (f.objective && f.key) { const c = cand(f.key); c.voters.add("data"); c.data = true; addEv(c, { src: f.id, role: "fact", quote: f.text }); }

  // Contradictions in the trader's own words ("did not chase", or "waited for the sweep" under what went well).
  for (const [key, hits] of scan.counter) if (hits.length > 0 && cands.has(key)) cands.get(key)!.counter = true;

  const d = b.declared;
  const declaredKey = d.pickedCategory ?? d.mistakeKey;
  const declaredNone = d.mistake === "none";

  const toRecord = (c: Cand, primary: boolean, status: "filed" | "suggested"): MistakeTagRecord & { status: "filed" | "suggested" } => {
    const voters = [...c.voters];
    return {
      key: c.key, primary, status, source: voters.some((v) => v.startsWith("ai:")) ? "ai" : "rules", voters,
      support: supportOf({ voters, counter: c.counter, rulesBonus: c.rulesBonus, data: c.data }), evidence: c.evidence.slice(0, 3),
    };
  };

  // What may be filed on machine agreement alone.
  const statusOf = (c: Cand): "filed" | "suggested" | null => {
    if (declaredNone) return c.voters.size > 0 ? "suggested" : null; // "no mistake" is the trader's call; we can only raise a question
    if (votes(c) >= 2 && !c.counter) return "filed";
    if (c.voters.size >= 1) return "suggested";
    return null;
  };

  let primary: (MistakeTagRecord & { status: "filed" | "suggested" }) | null = null;
  const rest: (MistakeTagRecord & { status: "filed" | "suggested" })[] = [];
  let conflict: MistakeTagging["conflict"];

  if (declaredKey && !declaredNone) {
    // The trader's own pick is final. Machine agreement can add secondary tags and can warn about a likely mis-tap.
    const own = cands.get(declaredKey) ?? cand(declaredKey);
    own.voters.add("you");
    primary = { key: declaredKey, primary: true, status: "filed", source: d.pickedCategory ? "you" : "preset", voters: [...own.voters], support: 1, evidence: own.evidence.slice(0, 3) };
    const unsupported = own.voters.size === 1; // only "you"
    for (const c of [...cands.values()].filter((x) => x.key !== declaredKey).sort((a, b) => rank(b) - rank(a))) {
      const s = statusOf(c); if (!s) continue;
      if (unsupported && s === "filed" && !conflict) conflict = { declared: declaredKey, better: c.key, quote: c.evidence.find((e) => e.role !== "fact")?.quote };
      rest.push(toRecord(c, false, s));
    }
  } else {
    // Filed candidates always come before suggested ones; within each, the best-supported (and most concrete) first.
    // A concrete behaviour outranks a generic "why" (tilt / fomo / plan) whenever both are filed, however many voters the mood has.
    const order = (c: Cand) => (statusOf(c) === "filed" ? 1000 : 0) + (GENERIC.has(c.key) ? 0 : 500) + rank(c);
    const ordered = [...cands.values()].filter((c) => statusOf(c) !== null).sort((a, b) => order(b) - order(a));
    for (let i = 0; i < ordered.length; i++) {
      const rec = toRecord(ordered[i]!, i === 0, statusOf(ordered[i]!)!);
      if (i === 0) primary = rec; else rest.push(rec);
    }
  }

  // Filed: the primary (if filed) plus any secondary with its own agreement — at most three in total.
  const filed: MistakeTagRecord[] = [];
  const suggestions: MistakeTagRecord[] = [];
  const strip = (r: MistakeTagRecord & { status?: string }): MistakeTagRecord => { const { status: _s, ...rec } = r; return rec; };
  if (primary?.status === "filed") filed.push(strip(primary));
  else if (primary) suggestions.push(strip(primary));
  for (const r of rest) {
    if (r.status === "filed" && primary?.status === "filed" && filed.length < 3) filed.push(strip(r));
    else if (r.status === "filed" || r.status === "suggested") suggestions.push(strip({ ...r, primary: false }));
  }
  // A suggested primary stays "primary" only when nothing is filed; otherwise it is just a suggestion.
  if (filed.length === 0 && suggestions[0]) suggestions[0] = { ...suggestions[0], primary: true };
  else for (const s of suggestions) s.primary = false;

  const verdict: MistakeTagging["verdict"] = filed.length > 0 ? "filed" : suggestions.length > 0 ? "suggested" : declaredNone ? "none" : "unsure";
  return {
    tags: filed,
    tagging: { v: 1, verdict, suggestions: suggestions.slice(0, 3), conflict, models: runs.map((r) => r.model), degraded: !aiAnswered, at: now },
  };
}

/** The rules engine over a whole bundle: every trader-written source, read in its role. */
export function scanBundle(b: TagBundle): RuleScan {
  return scanSources(b.sources.map((s) => ({ id: s.id, role: s.role, text: s.text })));
}
