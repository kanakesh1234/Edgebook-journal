/**
 * VERIFY — checks the figures in a model reply against the data the model was actually given.
 *
 * The prompt already says "never do trading math yourself", but a prompt is a request, not a guarantee.
 * This is the guarantee's second half: every dollar amount, percentage and R-multiple in the reply must be
 * traceable to a number in the facts, the pre-computed tool output, or the trader's own message. Anything else is
 * reported as `unverified` — it may be a legitimate derived figure (a difference, a sum), or a hallucination, and
 * the code cannot tell which, so it never claims either.
 *
 * Deliberately narrow: only $ amounts, % and R-multiples are checked (the figures that drive trading decisions).
 * Plain counts ("3 trades") and dates are not, to keep false positives low.
 */

export type ClaimKind = "usd" | "pct" | "r";
export interface Claim { raw: string; kind: ClaimKind; value: number }

const USD = /([+\-−]?)\s?\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?([kK])?(?![\p{L}\d])/gu;
const PCT = /(\d+(?:\.\d+)?)\s?%/g;
const R_MULT = /(?<![\p{L}\d.])([+\-−]?\d+(?:\.\d+)?)\s?R\b/gu;

const toNum = (s: string) => Number(s.replace(/,/g, ""));

export function extractClaims(text: string): Claim[] {
  const out: Claim[] = [];
  // Pre-computed facts show up as `**bold**`; strip the markers so "$215**" style adjacency never confuses matching.
  const t = text.replace(/\*\*/g, "");
  for (const m of t.matchAll(USD)) {
    const v = toNum(m[2]!) * (m[3] ? 1000 : 1);
    if (Number.isFinite(v)) out.push({ raw: m[0].trim(), kind: "usd", value: v });
  }
  for (const m of t.matchAll(PCT)) out.push({ raw: m[0].trim(), kind: "pct", value: Number(m[1]) });
  for (const m of t.matchAll(R_MULT)) out.push({ raw: m[0].trim(), kind: "r", value: Math.abs(Number(m[1]!.replace("−", "-"))) });
  return out;
}

/** Walk any JSON-ish value and collect every number, plus numbers written inside strings. */
export function collectAllowed(...sources: unknown[]): number[] {
  const out = new Set<number>();
  const add = (n: number) => {
    if (!Number.isFinite(n)) return;
    const a = Math.abs(n);
    out.add(a);
    out.add(Math.round(a));
    out.add(Math.round(a * 10) / 10);
    out.add(Math.round(a * 100) / 100);
    if (a <= 1.5) { out.add(a * 100); out.add(Math.round(a * 100)); } // fractions shown as percentages
  };
  const seen = new WeakSet<object>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 12 || v == null) return;
    if (typeof v === "number") return add(v);
    if (typeof v === "string") {
      for (const m of v.matchAll(/\d[\d,]*(?:\.\d+)?/g)) add(toNum(m[0]));
      return;
    }
    if (typeof v !== "object") return;
    if (seen.has(v as object)) return;
    seen.add(v as object);
    for (const x of Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)) walk(x, depth + 1);
  };
  for (const s of sources) walk(s, 0);
  return [...out];
}

function matches(value: number, allowed: number[]): boolean {
  // Whole numbers may be rounded from a decimal fact (62.5% → 63%); decimals must agree to the cent.
  const tol = Number.isInteger(value) ? 0.5001 : 0.0101;
  return allowed.some((a) => Math.abs(a - value) <= Math.max(tol, a * 0.0005));
}

export interface Verification {
  checked: number;
  unverified: Claim[];
}

export function verifyReply(reply: string, sources: unknown[]): Verification {
  const claims = extractClaims(reply);
  const allowed = collectAllowed(...sources);
  const unverified = claims.filter((c) => !matches(c.value, allowed));
  // De-duplicate identical raw claims so a figure repeated twice is reported once.
  const uniq = [...new Map(unverified.map((c) => [`${c.kind}:${c.raw}`, c])).values()];
  return { checked: claims.length, unverified: uniq };
}

/** Instruction for the single corrective retry. */
export function correctionPrompt(v: Verification): string {
  return [
    "Your last answer contained figures that are not in the data you were given: " + v.unverified.map((c) => c.raw).join(", ") + ".",
    "Rewrite the answer using ONLY numbers that appear in the facts or tool output. If a figure you wanted does not exist there, leave it out and say what is missing. Keep the same format and length.",
  ].join(" ");
}

/**
 * Last resort when the retry still contains unverifiable figures: keep the answer, add one honest note line
 * (valid card dialect) before the `---` working divider, never rewrite the model's words.
 */
export function withUnverifiedNote(reply: string, v: Verification): string {
  if (v.unverified.length === 0) return reply;
  const shown = v.unverified.slice(0, 3).map((c) => c.raw).join(", ");
  const note = `> Not found in your journal data: ${shown}. Treat as an estimate, not a recorded figure.`;
  const lines = reply.split("\n");
  const div = lines.findIndex((l) => /^\s*(?:-{3,}|_{3,}|\*{3,}|—{2,})\s*$/.test(l));
  if (div === -1) return `${reply.trimEnd()}\n${note}`;
  return [...lines.slice(0, div), note, ...lines.slice(div)].join("\n");
}
