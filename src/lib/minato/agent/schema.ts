/**
 * SCHEMA — validates what the model sends as tool arguments before any backend code sees it.
 *
 * The model is an untrusted caller: it can invent parameters, send "20" for 20, drop required fields, or
 * return malformed JSON. Every tool declares a small schema; arguments are coerced where that is safe
 * (numeric strings, case of enums), clamped where a range is sensible, and REJECTED with a precise message
 * where they are wrong, so the model can correct itself on the next round instead of silently getting
 * the wrong slice of data. Unknown keys are dropped, never forwarded.
 */

export type ParamSpec =
  | { type: "string"; description?: string; enum?: readonly string[]; maxLength?: number; pattern?: RegExp; patternHint?: string }
  | { type: "number" | "integer"; description?: string; minimum?: number; maximum?: number }
  | { type: "boolean"; description?: string }
  | { type: "array"; description?: string; items: ParamSpec; maxItems?: number };

export interface ObjectSchema {
  properties: Record<string, ParamSpec>;
  required?: readonly string[];
}

export type ValidationResult =
  | { ok: true; value: Record<string, unknown>; notes: string[] }
  | { ok: false; errors: string[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const DATE_SPEC = {
  type: "string" as const,
  pattern: ISO_DATE,
  patternHint: "YYYY-MM-DD",
  maxLength: 10,
};

function coerce(name: string, spec: ParamSpec, v: unknown, notes: string[], errors: string[]): unknown {
  switch (spec.type) {
    case "string": {
      if (typeof v === "number" || typeof v === "boolean") v = String(v);
      if (typeof v !== "string") { errors.push(`${name}: expected a string`); return undefined; }
      let s = v.trim();
      if (spec.maxLength && s.length > spec.maxLength) { s = s.slice(0, spec.maxLength); notes.push(`${name} was shortened to ${spec.maxLength} characters`); }
      if (spec.enum) {
        const hit = spec.enum.find((x) => x.toLowerCase() === s.toLowerCase());
        if (!hit) { errors.push(`${name}: must be one of ${spec.enum.join(", ")}`); return undefined; }
        return hit;
      }
      if (spec.pattern && !spec.pattern.test(s)) { errors.push(`${name}: must look like ${spec.patternHint ?? spec.pattern.source}`); return undefined; }
      return s;
    }
    case "number":
    case "integer": {
      let n: number;
      if (typeof v === "number") n = v;
      else if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v.replace(/[$,%\s]/g, "")))) n = Number(v.replace(/[$,%\s]/g, ""));
      else { errors.push(`${name}: expected a number`); return undefined; }
      if (!Number.isFinite(n)) { errors.push(`${name}: expected a finite number`); return undefined; }
      if (spec.type === "integer") n = Math.trunc(n);
      if (spec.minimum != null && n < spec.minimum) { notes.push(`${name} raised to ${spec.minimum}`); n = spec.minimum; }
      if (spec.maximum != null && n > spec.maximum) { notes.push(`${name} capped at ${spec.maximum}`); n = spec.maximum; }
      return n;
    }
    case "boolean": {
      if (typeof v === "boolean") return v;
      if (v === "true") return true;
      if (v === "false") return false;
      errors.push(`${name}: expected true or false`);
      return undefined;
    }
    case "array": {
      if (!Array.isArray(v)) { errors.push(`${name}: expected a list`); return undefined; }
      const cap = spec.maxItems ?? 50;
      if (v.length > cap) notes.push(`${name} limited to the first ${cap} items`);
      const out: unknown[] = [];
      for (const [i, item] of v.slice(0, cap).entries()) {
        const r = coerce(`${name}[${i}]`, spec.items, item, notes, errors);
        if (r !== undefined) out.push(r);
      }
      return out;
    }
  }
}

export function validateArgs(schema: ObjectSchema, raw: unknown): ValidationResult {
  const errors: string[] = [];
  const notes: string[] = [];
  if (raw == null) raw = {};
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["arguments must be a JSON object"] };
  const input = raw as Record<string, unknown>;
  const value: Record<string, unknown> = {};

  for (const [key, spec] of Object.entries(schema.properties)) {
    const v = input[key];
    if (v === undefined || v === null || v === "") continue;
    const c = coerce(key, spec, v, notes, errors);
    if (c !== undefined) value[key] = c;
  }
  for (const key of schema.required ?? []) {
    if (value[key] === undefined && !errors.some((e) => e.startsWith(key))) errors.push(`${key}: is required`);
  }
  const unknown = Object.keys(input).filter((k) => !(k in schema.properties));
  if (unknown.length) notes.push(`ignored unknown parameter(s): ${unknown.slice(0, 5).join(", ")}`);
  return errors.length ? { ok: false, errors } : { ok: true, value, notes };
}

/** JSON-Schema form sent to the model (strips the RegExp, keeps a readable hint). */
export function toJsonSchema(schema: ObjectSchema): { type: "object"; properties: Record<string, unknown>; required?: string[] } {
  const conv = (s: ParamSpec): Record<string, unknown> => {
    switch (s.type) {
      case "string":
        return {
          type: "string",
          ...(s.description || s.patternHint ? { description: [s.description, s.patternHint ? `Format: ${s.patternHint}.` : ""].filter(Boolean).join(" ") } : {}),
          ...(s.enum ? { enum: [...s.enum] } : {}),
        };
      case "number":
      case "integer":
        return { type: s.type, ...(s.description ? { description: s.description } : {}), ...(s.minimum != null ? { minimum: s.minimum } : {}), ...(s.maximum != null ? { maximum: s.maximum } : {}) };
      case "boolean":
        return { type: "boolean", ...(s.description ? { description: s.description } : {}) };
      case "array":
        return { type: "array", items: conv(s.items), ...(s.description ? { description: s.description } : {}), ...(s.maxItems ? { maxItems: s.maxItems } : {}) };
    }
  };
  return {
    type: "object",
    properties: Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, conv(v)])),
    ...(schema.required?.length ? { required: [...schema.required] } : {}),
  };
}
