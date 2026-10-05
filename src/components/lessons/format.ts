import type { LessonView } from "./types";

const sameYear = (t: number) => new Date(t).getFullYear() === new Date().getFullYear();

/** "Oct 4" this year, "Oct 4, 2025" otherwise. */
export function fmtShort(t: number): string {
  return new Date(t).toLocaleDateString(undefined, sameYear(t) ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/** "Oct 4, 2026" */
export function fmtLong(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Compact relative time for comments. Falls back to a date after a week. */
export function ago(t: number): string {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return fmtShort(t);
}

export const byline = (l: Pick<LessonView, "bylines" | "mine" | "author">): string =>
  l.bylines.length ? l.bylines.join(", ") : l.mine ? "You" : l.author.name;

export const initialOf = (name: string): string => (name.trim()[0] ?? "?").toUpperCase();

/** Whole minutes still to read, never below 1. */
export const minsLeft = (readMins: number, progress: number): number => Math.max(1, Math.ceil(readMins * (1 - progress)));

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
