import type { JournalEntry } from "@/lib/types";
import type { SymName } from "./symbols";

/**
 * Turns everything stored on a trade's `review` / `reflection` into readable, grouped rows,
 * so the sheet shows the *complete* review — including fields added to the schema later —
 * without this file needing to know each one. Pure view-model; reads only from the entry.
 */
export type ReviewRow = { label: string; value: string | boolean; long?: boolean; bad?: boolean };
export type ReviewGroup = { id: string; title: string; icon: SymName; tint: string; rows: ReviewRow[] };

const LABELS: Record<string, string> = {
  fomo: "FOMO", revenge: "Revenge", fearExit: "Fear of exiting", makeItBack: "Make-it-back",
  convictionOrUrgency: "Drive", emotionBefore: "Feeling before", emotionalState: "Emotional state",
  processVerdict: "Process verdict", followedSetup: "Followed setup", followedRisk: "Respected risk",
  wentWell: "Went well", wentPoorly: "Didn’t go well", watchNext: "Watch next", lesson: "Next time", rr: "R multiple",
};
const ENUMS: Record<string, string> = { "a-plus": "A+ trade", "process-success": "Good process", "process-failure": "Process failure" };
const SKIP = /^(id|ids|.*Ids?|.*At|version|schemaVersion)$/;
const BAD = new Set(["fomo", "revenge", "fearExit", "makeItBack"]);

const sentence = (k: string) => {
  const s = k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase().trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const labelOf = (k: string) => LABELS[k] ?? sentence(k);
const pretty = (v: string) => ENUMS[v] ?? (/^[a-z0-9]+([-_][a-z0-9]+)+$/.test(v) ? sentence(v) : v);

function walk(v: unknown, key: string, out: ReviewRow[], depth: number, forceLong: boolean) {
  if (v == null || depth > 4) return;
  const label = labelOf(key);
  if (typeof v === "boolean") out.push({ label, value: v, bad: BAD.has(key) && v });
  else if (typeof v === "number") out.push({ label, value: String(v) });
  else if (typeof v === "string") {
    const t = v.trim();
    if (t) out.push({ label, value: pretty(t), long: forceLong || t.length > 42 || t.includes("\n") });
  } else if (Array.isArray(v)) {
    if (v.every((x) => typeof x === "string" || typeof x === "number")) {
      const t = v.map(String).filter(Boolean).map(pretty).join(", ");
      if (t) out.push({ label, value: t, long: t.length > 42 });
    } else v.forEach((x) => walk(x, key, out, depth + 1, forceLong));
  } else if (typeof v === "object") {
    for (const [k, c] of Object.entries(v as Record<string, unknown>)) if (!SKIP.test(k)) walk(c, k, out, depth + 1, forceLong);
  }
}
function rowsOf(obj: unknown, only?: string[], long = false): ReviewRow[] {
  const out: ReviewRow[] = [];
  if (obj && typeof obj === "object")
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (SKIP.test(k) || (only && !only.includes(k))) continue;
      walk(v, k, out, 1, long);
    }
  return out;
}

export function buildReviewGroups(e: JournalEntry): ReviewGroup[] {
  const r = (e.review ?? {}) as Record<string, unknown>;
  const f = (e.reflection ?? {}) as Record<string, unknown>;
  const used = new Set<string>();
  const take = (k: string) => { used.add(k); return r[k]; };
  const groups: ReviewGroup[] = [
    { id: "process", title: "Process", icon: "shield", tint: "#34c759", rows: [...rowsOf(take("outcome")), ...rowsOf(f, ["followedSetup", "followedRisk"])] },
    { id: "happened", title: "What happened", icon: "chart", tint: "#0a84ff", rows: rowsOf(f, ["wentWell", "wentPoorly", "cause"], true) },
    { id: "mindset", title: "Mindset", icon: "heart", tint: "#ff375f", rows: [...rowsOf(take("psychology")), ...rowsOf(take("postLossGate"))] },
    { id: "lessons", title: "Lessons", icon: "bulb", tint: "#ff9f0a", rows: [...rowsOf(f, ["lesson"], true), ...rowsOf(take("concepts")), ...rowsOf(take("followUp"))] },
  ];
  // Anything else stored on the review (or reflection) still shows up, under its own heading.
  for (const [k, v] of Object.entries(r)) if (!used.has(k) && !SKIP.test(k)) groups.push({ id: `r-${k}`, title: labelOf(k), icon: "note", tint: "#8e8e93", rows: rowsOf({ [k]: v }) });
  const known = ["followedSetup", "followedRisk", "wentWell", "wentPoorly", "cause", "lesson"];
  const rest = Object.fromEntries(Object.entries(f).filter(([k]) => !known.includes(k)));
  groups.push({ id: "reflection-other", title: "Reflection", icon: "note", tint: "#8e8e93", rows: rowsOf(rest) });
  return groups.filter((g) => g.rows.length > 0);
}
