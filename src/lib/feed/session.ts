/* Healthy-use controls. The clock counts only time the Feed is on screen and the tab is focused; the prompt is a
   suggestion, never a lock: the viewer can always continue, change the limit, or turn it off. */

export interface SessionClock {
  day: string;
  /** Active milliseconds today. */
  ms: number;
  /** Minutes the viewer has chosen to add past the daily limit today. */
  extraMin: number;
  extensions: number;
}

export type Prompt = "none" | "break" | "enough";

export const EXTEND_MIN = 5;
/** After this many "a few more minutes" the prompt stops offering them and gently suggests stopping. */
export const SOFT_EXTENSIONS = 2;
/** A single tick can add at most this much, so a sleeping laptop never counts as hours of use. */
export const MAX_TICK_MS = 5_000;

export const freshClock = (day: string): SessionClock => ({ day, ms: 0, extraMin: 0, extensions: 0 });

export function tick(c: SessionClock, deltaMs: number, today: string): SessionClock {
  const base = c.day === today ? c : freshClock(today);
  const d = Math.max(0, Math.min(MAX_TICK_MS, deltaMs));
  return d === 0 ? base : { ...base, ms: base.ms + d };
}

export function promptFor(c: SessionClock, dailyMinutes: number): Prompt {
  if (!(dailyMinutes > 0)) return "none";
  if (c.ms < (dailyMinutes + c.extraMin) * 60_000) return "none";
  return c.extensions >= SOFT_EXTENSIONS ? "enough" : "break";
}

export const extend = (c: SessionClock, minutes = EXTEND_MIN): SessionClock => ({ ...c, extraMin: c.extraMin + minutes, extensions: c.extensions + 1 });

export const minutesUsed = (c: SessionClock) => Math.floor(c.ms / 60_000);

export function remainingMinutes(c: SessionClock, dailyMinutes: number): number | null {
  if (!(dailyMinutes > 0)) return null;
  return Math.max(0, Math.ceil(((dailyMinutes + c.extraMin) * 60_000 - c.ms) / 60_000));
}

export function parseClock(raw: unknown, today: string): SessionClock {
  if (!raw || typeof raw !== "object") return freshClock(today);
  const r = raw as Partial<SessionClock>;
  if (r.day !== today) return freshClock(today);
  const n = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0);
  return { day: today, ms: n(r.ms, 86_400_000), extraMin: n(r.extraMin, 600), extensions: Math.floor(n(r.extensions, 50)) };
}
