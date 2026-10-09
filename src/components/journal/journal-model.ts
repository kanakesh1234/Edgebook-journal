import type { JournalEntry } from "@/lib/types";
import { reviewStatusOf } from "@/lib/types";
import { formatDateMedium, monthName } from "@/lib/format";

/**
 * Pure view-model helpers. Everything here is derived from `useApp().entries` —
 * the Journal owns no data of its own, only a lens over the store.
 */
export type Outcome = "all" | "win" | "loss" | "flat";
export type SortKey = "newest" | "oldest" | "best" | "worst" | "rr";
export type ViewMode = "list" | "grid" | "folders";
export type Lens = { kind: "all" } | { kind: "review" } | { kind: "setup"; id: string };

export const needsReview = (e: JournalEntry) => (e.reviewStatus ?? reviewStatusOf(e)) !== "reviewed";

const parts = (date: string) => date.split("-").map(Number) as [number, number, number];
const asDate = (date: string) => { const [y, m, d] = parts(date); return new Date(y, m - 1, d); };
export const dayShort = (date: string) => asDate(date).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
export const dayLong = (date: string) => asDate(date).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const monthLabel = (ym: string) => { const [y, m] = parts(ym + "-01"); return `${monthName(m - 1)} ${y}`; };

/** Human name for a path: "" | "2026" | "2026-08" | "2026-08-12". */
export function pathLabel(path: string): string {
  if (path.length === 4) return path;
  if (path.length === 7) return monthLabel(path);
  if (path.length === 10) return dayShort(path);
  return "";
}
export const parentPath = (path: string) => (path.length >= 10 ? path.slice(0, 7) : path.length >= 7 ? path.slice(0, 4) : "");

export type Summary = { count: number; wins: number; net: number; avgR: number | null };
export function summarize(list: JournalEntry[]): Summary {
  let wins = 0, net = 0, rSum = 0, rN = 0;
  for (const e of list) {
    if (e.pnl > 0) wins++;
    net += e.pnl;
    if (e.rr != null) { rSum += e.rr; rN++; }
  }
  return { count: list.length, wins, net, avgR: rN ? rSum / rN : null };
}

export type Node = { key: string; count: number; wins: number; net: number };
export type MonthNode = Node & { days: Node[] };
export type YearNode = Node & { months: MonthNode[] };

export function buildTree(list: JournalEntry[], asc = false): YearNode[] {
  const years = new Map<string, YearNode>();
  const months = new Map<string, MonthNode>();
  const days = new Map<string, Node>();
  const bump = (n: Node, e: JournalEntry) => { n.count++; n.net += e.pnl; if (e.pnl > 0) n.wins++; };
  for (const e of list) {
    const y = e.date.slice(0, 4), m = e.date.slice(0, 7);
    let yn = years.get(y);
    if (!yn) { yn = { key: y, count: 0, wins: 0, net: 0, months: [] }; years.set(y, yn); }
    let mn = months.get(m);
    if (!mn) { mn = { key: m, count: 0, wins: 0, net: 0, days: [] }; months.set(m, mn); yn.months.push(mn); }
    let dn = days.get(e.date);
    if (!dn) { dn = { key: e.date, count: 0, wins: 0, net: 0 }; days.set(e.date, dn); mn.days.push(dn); }
    bump(yn, e); bump(mn, e); bump(dn, e);
  }
  const cmp = (a: Node, b: Node) => (asc ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key));
  const out = [...years.values()].sort(cmp);
  for (const y of out) { y.months.sort(cmp); for (const m of y.months) m.days.sort(cmp); }
  return out;
}

export function childrenOf(tree: YearNode[], path: string): Node[] {
  if (!path) return tree;
  const y = tree.find((t) => t.key === path.slice(0, 4));
  if (path.length === 4) return y?.months ?? [];
  const m = y?.months.find((t) => t.key === path.slice(0, 7));
  if (path.length === 7) return m?.days ?? [];
  return [];
}

export function filterEntries(list: JournalEntry[], f: { outcome: Outcome; instrument: string; query: string }): JournalEntry[] {
  let out = list;
  if (f.outcome === "win") out = out.filter((e) => e.pnl > 0);
  else if (f.outcome === "loss") out = out.filter((e) => e.pnl < 0);
  else if (f.outcome === "flat") out = out.filter((e) => e.pnl === 0);
  if (f.instrument !== "all") out = out.filter((e) => e.instrument === f.instrument);
  const q = f.query.trim().toLowerCase();
  if (q) {
    out = out.filter((e) =>
      [e.notes ?? "", e.instrument, e.setup ?? "", e.date, formatDateMedium(e.date), dayLong(e.date), e.reflection?.lesson ?? "", e.review?.psychology?.emotionBefore ?? ""].some((s) => s.toLowerCase().includes(q)),
    );
  }
  return out;
}

export function sortEntries(list: JournalEntry[], sort: SortKey): JournalEntry[] {
  return [...list].sort((a, b) => {
    switch (sort) {
      case "oldest": return a.date.localeCompare(b.date) || a.createdAt - b.createdAt;
      case "best": return b.pnl - a.pnl;
      case "worst": return a.pnl - b.pnl;
      case "rr": return (b.rr ?? -Infinity) - (a.rr ?? -Infinity) || b.date.localeCompare(a.date);
      default: return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
    }
  });
}

export type DayGroup = { date: string; net: number; items: JournalEntry[] };
export type MonthGroup = { key: string; summary: Summary; days: DayGroup[] };
/** Groups an already-sorted chronological list into Month → Day. */
export function groupMonthDay(list: JournalEntry[]): MonthGroup[] {
  const out: MonthGroup[] = [];
  for (const e of list) {
    const mk = e.date.slice(0, 7);
    let g = out[out.length - 1];
    if (!g || g.key !== mk) { g = { key: mk, summary: { count: 0, wins: 0, net: 0, avgR: null }, days: [] }; out.push(g); }
    let d = g.days[g.days.length - 1];
    if (!d || d.date !== e.date) { d = { date: e.date, net: 0, items: [] }; g.days.push(d); }
    d.items.push(e); d.net += e.pnl; g.summary.count++; g.summary.net += e.pnl; if (e.pnl > 0) g.summary.wins++;
  }
  return out;
}

export const tradeTitle = (e: JournalEntry) =>
  [e.instrument !== "—" ? e.instrument : null, e.direction].filter(Boolean).join(" ") || "Trade";
export const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

/* ---------------- MNQ default contract ---------------- */
const MNQ_MONTH_CODES: Record<number, string> = { 2: "H", 5: "M", 8: "U", 11: "Z" }; // Mar, Jun, Sep, Dec (0-based)
const MNQ_ROLL_DAYS = 8; // volume rolls to the next contract ~8 days before expiry (Thursday of the week prior)

/**
 * Front-month MNQ symbol for a date (default: today), e.g. MNQU26, MNQZ26, MNQH27, MNQM27.
 * Contracts expire on the 3rd Friday of Mar/Jun/Sep/Dec; once the roll date passes, the next quarter is used.
 */
export function defaultMnqSymbol(on: Date | string = new Date()): string {
  const d = typeof on === "string" ? asDate(on.slice(0, 10)) : on;
  const year = d.getFullYear();
  const today = new Date(year, d.getMonth(), d.getDate());
  for (let y = year; y <= year + 1; y++) {
    for (const m of [2, 5, 8, 11]) {
      const firstDow = new Date(y, m, 1).getDay();
      const thirdFriday = 1 + ((5 - firstDow + 7) % 7) + 14;
      const roll = new Date(y, m, thirdFriday - MNQ_ROLL_DAYS);
      if (today < roll) return `MNQ${MNQ_MONTH_CODES[m]}${String(y).slice(-2)}`;
    }
  }
  return "MNQ";
}

/** The user's explicit symbol (trimmed, upper-cased) or, when blank / the legacy "—" placeholder, the default MNQ contract. */
export const resolveInstrument = (value: string | null | undefined, on?: Date | string): string => {
  const v = (value ?? "").trim();
  return v && v !== "—" ? v.toUpperCase() : defaultMnqSymbol(on);
};
