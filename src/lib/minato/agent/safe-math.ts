/**
 * SAFE MATH — a tiny, dependency-free arithmetic evaluator for the `calculate` tool.
 *
 * Why it exists: a language model must never do trading arithmetic in its head. When it needs a derived
 * figure (a difference, a ratio, a contracts-per-risk split) it asks the backend, and the exact result lands
 * in the retrieved-data ledger — which is also what the reply verifier checks every figure against.
 *
 * Grammar (no eval, no Function, no identifiers other than the allow-listed functions/constants):
 *   expr   := term (('+' | '-') term)*
 *   term   := unary (('*' | '/' | '%') unary)*
 *   unary  := ('-' | '+') unary | power
 *   power  := atom (('^' | '**') unary)?
 *   atom   := number | const | func '(' args ')' | '(' expr ')'
 */

export class MathError extends Error {}

const FUNCS: Record<string, { min: number; max: number; fn: (...a: number[]) => number }> = {
  abs: { min: 1, max: 1, fn: Math.abs },
  sqrt: { min: 1, max: 1, fn: Math.sqrt },
  floor: { min: 1, max: 1, fn: Math.floor },
  ceil: { min: 1, max: 1, fn: Math.ceil },
  ln: { min: 1, max: 1, fn: Math.log },
  log10: { min: 1, max: 1, fn: Math.log10 },
  exp: { min: 1, max: 1, fn: Math.exp },
  min: { min: 1, max: 12, fn: Math.min },
  max: { min: 1, max: 12, fn: Math.max },
  pow: { min: 2, max: 2, fn: Math.pow },
  round: {
    min: 1,
    max: 2,
    fn: (x, digits = 0) => {
      const d = Math.max(0, Math.min(8, Math.trunc(digits)));
      const f = 10 ** d;
      return Math.round((x + Number.EPSILON) * f) / f;
    },
  },
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new MathError(`bad number near "${src.slice(i, i + 8)}"`);
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    if (c === "*" && src[i + 1] === "*") { out.push({ t: "op", v: "^" }); i += 2; continue; }
    if ("+-*/%^(),".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new MathError(`unsupported character "${c}"`);
  }
  return out;
}

export function evaluateExpression(input: string): number {
  const src = String(input ?? "")
    .replace(/[,](?=\d{3}(?:\D|$))/g, "") // 1,250 → 1250
    .replace(/\u2212/g, "-")
    .replace(/×/g, "*")
    .replace(/(?<=[\d)]\s*)x(?=\s*[\d(.])/gi, "*") // "2x3" → 2*3 (never touches max( / exp()
    .replace(/÷/g, "/")
    .replace(/\$/g, "")
    .replace(/(\d+(?:\.\d+)?)\s*%(?!\s*[\d(.])/g, "($1/100)") // "45%" → 0.45, but "10 % 3" stays modulo
    .trim();
  if (!src) throw new MathError("empty expression");
  if (src.length > 240) throw new MathError("expression too long");

  const toks = tokenize(src);
  let p = 0;
  let steps = 0;
  const peek = () => toks[p];
  const eat = (v?: string) => {
    const t = toks[p];
    if (!t || (v !== undefined && !(t.t === "op" && t.v === v))) throw new MathError(v ? `expected "${v}"` : "unexpected end");
    p++;
    return t;
  };
  const tick = () => { if (++steps > 2000) throw new MathError("expression too complex"); };

  function expr(): number {
    let v = term();
    for (;;) {
      const t = peek();
      if (t?.t === "op" && (t.v === "+" || t.v === "-")) { p++; tick(); const r = term(); v = t.v === "+" ? v + r : v - r; } else return v;
    }
  }
  function term(): number {
    let v = unary();
    for (;;) {
      const t = peek();
      if (t?.t === "op" && (t.v === "*" || t.v === "/" || t.v === "%")) {
        p++; tick();
        const r = unary();
        if ((t.v === "/" || t.v === "%") && r === 0) throw new MathError("division by zero");
        v = t.v === "*" ? v * r : t.v === "/" ? v / r : v % r;
      } else return v;
    }
  }
  function unary(): number {
    const t = peek();
    if (t?.t === "op" && (t.v === "-" || t.v === "+")) { p++; const v = unary(); return t.v === "-" ? -v : v; }
    return power();
  }
  function power(): number {
    const base = atom();
    const t = peek();
    if (t?.t === "op" && t.v === "^") { p++; tick(); return Math.pow(base, unary()); }
    return base;
  }
  function atom(): number {
    const t = toks[p];
    if (!t) throw new MathError("unexpected end");
    if (t.t === "num") { p++; return t.v; }
    if (t.t === "op" && t.v === "(") { p++; const v = expr(); eat(")"); return v; }
    if (t.t === "id") {
      p++;
      if (Object.hasOwn(CONSTS, t.v) && !(peek()?.t === "op" && (peek() as { v: string }).v === "(")) return CONSTS[t.v]!;
      const f = Object.hasOwn(FUNCS, t.v) ? FUNCS[t.v] : undefined;
      if (!f) throw new MathError(`unknown function "${t.v}"`);
      eat("(");
      const args: number[] = [];
      if (!(peek()?.t === "op" && (peek() as { v: string }).v === ")")) {
        for (;;) {
          args.push(expr());
          const n = peek();
          if (n?.t === "op" && n.v === ",") { p++; continue; }
          break;
        }
      }
      eat(")");
      if (args.length < f.min || args.length > f.max) throw new MathError(`${t.v}() takes ${f.min === f.max ? f.min : `${f.min}-${f.max}`} argument(s)`);
      return f.fn(...args);
    }
    throw new MathError(`unexpected "${(t as { v: unknown }).v}"`);
  }

  const result = expr();
  if (p < toks.length) throw new MathError(`unexpected "${(toks[p] as { v: unknown }).v}"`);
  if (!Number.isFinite(result)) throw new MathError("result is not a finite number");
  return result;
}

/** Evaluate and round for display; returns both the exact and the rounded value. */
export function calculate(expression: string, decimals = 4): { expression: string; result: number; rounded: number } {
  const result = evaluateExpression(expression);
  const d = Math.max(0, Math.min(8, Math.trunc(decimals)));
  const f = 10 ** d;
  return { expression: String(expression).trim(), result, rounded: Math.round((result + Number.EPSILON) * f) / f };
}
