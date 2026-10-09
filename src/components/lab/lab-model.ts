import type { Challenge, JournalEntry, PlaybookRule, PlaybookSetup } from "@/lib/types";
import { setupRules } from "@/lib/types";
import { setupStats, tradesForSetup, type SetupStats } from "@/lib/setup-stats";
import { challengeProgress, type ChallengeProgress } from "@/lib/challenges";
import type { BacktestSessionSummary, BacktestStatus } from "@/lib/backtesting/types";
import type { Tone } from "./lab-ui";

/* ------------------------------------------------------------------ */
/*  Tabs ↔ URL hash                                                    */
/*  /lab#backtesting is linked from the backtesting create/session     */
/*  pages, so the hash vocabulary has to stay stable.                  */
/* ------------------------------------------------------------------ */

export type LabTab = "overview" | "setups" | "challenges" | "backtests";

export const TABS: { id: LabTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "setups", label: "Setups" },
  { id: "challenges", label: "Challenges" },
  { id: "backtests", label: "Backtests" },
];

export const TAB_HASH: Record<LabTab, string> = {
  overview: "",
  setups: "setups",
  challenges: "challenges",
  backtests: "backtesting",
};

const HASH_TAB: Record<string, LabTab> = {
  setups: "setups",
  playbook: "setups",
  challenges: "challenges",
  backtesting: "backtests",
  backtests: "backtests",
  overview: "overview",
};

export const tabFromHash = (hash: string): LabTab | null => HASH_TAB[hash.replace(/^#/, "").toLowerCase()] ?? null;

/* ------------------------------------------------------------------ */
/*  Search + formatting helpers                                        */
/* ------------------------------------------------------------------ */

export function matchesQuery(haystack: (string | undefined | null)[], query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = haystack.filter(Boolean).join(" ").toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export const signedPct = (n: number, digits = 2) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;

export const fmtPct0 = (fraction: number | null | undefined) => (fraction == null ? "—" : `${Math.round(fraction * 100)}%`);

/** "Jan 4, 2026" from a YYYY-MM-DD (or ISO) string, in local time. */
export function fmtDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso.slice(0, 10);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Compact relative time. Falls back to a date after a week. */
export function ago(t: number): string {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------ */
/*  Setups                                                             */
/* ------------------------------------------------------------------ */

export interface SetupInfo {
  setup: PlaybookSetup;
  rules: PlaybookRule[];
  trades: JournalEntry[];
  stats: SetupStats;
}

export function buildSetupInfos(playbook: PlaybookSetup[], entries: JournalEntry[]): SetupInfo[] {
  return playbook.map((setup) => {
    const trades = tradesForSetup(setup, entries);
    return { setup, rules: setupRules(setup), trades, stats: setupStats(trades) };
  });
}

export type SetupSort = "playbook" | "pnl" | "winrate" | "trades" | "name";
export const SETUP_SORTS: { id: SetupSort; label: string }[] = [
  { id: "playbook", label: "Playbook order" },
  { id: "pnl", label: "Best P&L" },
  { id: "winrate", label: "Win rate" },
  { id: "trades", label: "Most trades" },
  { id: "name", label: "Name" },
];

export function filterSetups(list: SetupInfo[], query: string, sort: SetupSort): SetupInfo[] {
  const out = list.filter((i) =>
    matchesQuery(
      [i.setup.name, i.setup.strategy, i.setup.purpose, ...i.rules.map((r) => r.text), ...(i.setup.instruments ?? []), ...(i.setup.sessions ?? [])],
      query,
    ),
  );
  switch (sort) {
    case "pnl":
      return out.sort((a, b) => b.stats.totalPnl - a.stats.totalPnl);
    case "winrate":
      return out.sort((a, b) => (b.stats.winRate ?? -1) - (a.stats.winRate ?? -1) || b.stats.trades - a.stats.trades);
    case "trades":
      return out.sort((a, b) => b.stats.trades - a.stats.trades);
    case "name":
      return out.sort((a, b) => a.setup.name.localeCompare(b.setup.name));
    default:
      return out;
  }
}

/* ------------------------------------------------------------------ */
/*  Challenges                                                         */
/* ------------------------------------------------------------------ */

export type ChallengeStatus = "active" | "completed" | "breached";

export interface ChallengeInfo {
  challenge: Challenge;
  progress: ChallengeProgress;
  status: ChallengeStatus;
  primary: boolean;
}

export function buildChallengeInfos(challenges: Challenge[], entries: JournalEntry[], primaryId: string | null): ChallengeInfo[] {
  return challenges.map((challenge) => {
    const progress = challengeProgress(challenge, entries);
    const status: ChallengeStatus = progress.reachedTarget ? "completed" : progress.breached ? "breached" : "active";
    return { challenge, progress, status, primary: primaryId === challenge.id };
  });
}

export const CHALLENGE_STATUS: Record<ChallengeStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "gold" },
  completed: { label: "Completed", tone: "profit" },
  breached: { label: "Breached", tone: "loss" },
};

export type ChallengeSort = "default" | "progress" | "pnl" | "newest";
export const CHALLENGE_SORTS: { id: ChallengeSort; label: string }[] = [
  { id: "default", label: "Primary first" },
  { id: "progress", label: "Progress" },
  { id: "pnl", label: "P&L" },
  { id: "newest", label: "Newest" },
];
export type ChallengeFilter = "all" | ChallengeStatus;
export const CHALLENGE_FILTERS: { id: ChallengeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "breached", label: "Breached" },
];

export function filterChallenges(list: ChallengeInfo[], query: string, sort: ChallengeSort, status: ChallengeFilter): ChallengeInfo[] {
  const out = list.filter(
    (i) =>
      (status === "all" || i.status === status) &&
      matchesQuery([i.challenge.name, i.challenge.notes, ...(i.challenge.instruments ?? [])], query),
  );
  switch (sort) {
    case "progress":
      return out.sort((a, b) => b.progress.progress - a.progress.progress);
    case "pnl":
      return out.sort((a, b) => b.progress.currentPnl - a.progress.currentPnl);
    case "newest":
      return out.sort((a, b) => b.challenge.createdAt - a.challenge.createdAt);
    default:
      return out.sort((a, b) => Number(b.primary) - Number(a.primary));
  }
}

export function ddLabel(mode: "static" | "dynamic", basis: "eod" | "live" | null): string {
  if (mode !== "dynamic") return "static";
  return basis === "eod" ? "dynamic · EOD" : "dynamic · live";
}

/* ------------------------------------------------------------------ */
/*  Backtests                                                          */
/* ------------------------------------------------------------------ */

export const BT_STATUS: Record<BacktestStatus, { label: string; tone: Tone }> = {
  ready: { label: "Ready", tone: "gold" },
  running: { label: "Running", tone: "info" },
  paused: { label: "Paused", tone: "gold" },
  completed: { label: "Completed", tone: "profit" },
  terminated: { label: "Stopped", tone: "loss" },
  breached: { label: "Breached", tone: "loss" },
};

export const btStatus = (s: string) => BT_STATUS[s as BacktestStatus] ?? BT_STATUS.ready;

/** Sessions you can still pick up where you left off. */
export const isResumable = (s: Pick<BacktestSessionSummary, "status">) => s.status === "ready" || s.status === "running" || s.status === "paused";

export type BtSort = "recent" | "pnl" | "winrate";
export const BT_SORTS: { id: BtSort; label: string }[] = [
  { id: "recent", label: "Recently opened" },
  { id: "pnl", label: "Best P&L" },
  { id: "winrate", label: "Win rate" },
];
export type BtFilter = "all" | "open" | "completed" | "stopped";
export const BT_FILTERS: { id: BtFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "stopped", label: "Stopped" },
];

const btBucket = (s: BacktestSessionSummary): Exclude<BtFilter, "all"> =>
  isResumable(s) ? "open" : s.status === "completed" ? "completed" : "stopped";

export function filterSessions(list: BacktestSessionSummary[], query: string, sort: BtSort, status: BtFilter): BacktestSessionSummary[] {
  const out = list.filter(
    (s) =>
      (status === "all" || btBucket(s) === status) &&
      matchesQuery([s.sessionName, s.timeframe, ...s.instruments], query),
  );
  switch (sort) {
    case "pnl":
      return out.sort((a, b) => b.netPnl - a.netPnl);
    case "winrate":
      return out.sort((a, b) => (b.totalTrades > 0 ? b.winRate : -1) - (a.totalTrades > 0 ? a.winRate : -1));
    default:
      return out.sort((a, b) => (b.lastModified || b.createdAt) - (a.lastModified || a.createdAt));
  }
}

export const fmtProfitFactor = (pf: number) => (!Number.isFinite(pf) ? "∞" : pf.toFixed(2));
