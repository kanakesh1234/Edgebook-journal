import type { BeliefOut, MemoryPayload } from "./retrieve";

const STRENGTHS = new Set(["possible", "likely", "established", "mixed signals"]);
const KINDS = new Set(["episodic", "semantic", "procedural"]);
const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

/** The memory payload comes from the client: re-bound every field before it reaches the prompt. */
export function sanitizeMemoryPayload(value: unknown): MemoryPayload | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { beliefs?: unknown; insufficient?: unknown };
  const beliefs: BeliefOut[] = (Array.isArray(v.beliefs) ? v.beliefs : []).slice(0, 24).flatMap((b): BeliefOut[] => {
    if (!b || typeof b !== "object") return [];
    const x = b as Record<string, unknown>;
    const say = s(x.say, 300);
    if (!say) return [];
    return [{
      say, kind: KINDS.has(x.kind as string) ? (x.kind as BeliefOut["kind"]) : "semantic",
      strength: STRENGTHS.has(x.strength as string) ? (x.strength as BeliefOut["strength"]) : "possible",
      confidence: typeof x.confidence === "number" ? Math.max(0, Math.min(1, x.confidence)) : 0,
      basedOn: typeof x.basedOn === "number" ? Math.max(0, Math.min(100000, Math.round(x.basedOn))) : 0,
      stance: x.stance === "recorded" ? "recorded" : "inferred", lastConfirmed: s(x.lastConfirmed, 10),
      ...(Array.isArray(x.evidence) ? { evidence: x.evidence.slice(0, 2).map((e) => s(e, 140)).filter(Boolean) } : {}),
    }];
  });
  const insufficient = (Array.isArray(v.insufficient) ? v.insufficient : []).slice(0, 4).map((x) => s(x, 160)).filter(Boolean);
  return { beliefs, insufficient };
}
