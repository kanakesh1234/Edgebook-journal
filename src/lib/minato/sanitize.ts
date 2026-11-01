/**
 * SANITIZE — the boundary between "whatever the client sent" and the analytics code.
 *
 * The server trusts the signed-in client's journal (existing design) but must never crash on it. One `null`, a string
 * where a number belongs, or a missing date used to throw inside computeStats and take the whole route down.
 * Entries that cannot be placed on a day or given a finite P&L are dropped and COUNTED — never silently repaired,
 * never invented — so the reply can say how many were ignored.
 */
export interface SanitizeResult {
  entries: Record<string, unknown>[];
  dropped: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}/;

export function sanitizeEntries(raw: unknown, limit = 5000): SanitizeResult {
  if (!Array.isArray(raw)) return { entries: [], dropped: 0 };
  const entries: Record<string, unknown>[] = [];
  let dropped = 0;
  for (const item of raw.slice(0, limit)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) { dropped++; continue; }
    const e = item as Record<string, unknown>;
    const pnl = typeof e.pnl === "number" ? e.pnl : typeof e.pnl === "string" && e.pnl.trim() !== "" ? Number(e.pnl) : NaN;
    if (typeof e.date !== "string" || !DATE.test(e.date) || !Number.isFinite(pnl)) { dropped++; continue; }
    entries.push(pnl === e.pnl ? e : { ...e, pnl });
  }
  return { entries, dropped: dropped + Math.max(0, raw.length - limit) };
}
