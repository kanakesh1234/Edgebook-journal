/* Builds and ranks the Feed from data the app already has. Pure and deterministic:
   same inputs on the same day → same order, so scrolling back never reshuffles and nothing is random.
   Every card carries a plain-language `reason`, so "why am I seeing this?" always has an answer. */

import type { CurrencyCode, JournalEntry, PlaybookSetup } from "../types";
import type { LessonView } from "@/components/lessons/types";
import { planJournalReplay } from "../backtesting/journal-replay";
import type { EndCard, FeedCard, FeedKey, FeedState, LessonCard, SetupCard, StarterCard, TradeCard } from "./types";
import { savedKeys } from "./state";

/** A session is a finite batch — it ends. */
export const BATCH_SIZE = 20;
const TRADE_WINDOW_DAYS = 120;
const MAX_RUN = 2;

export interface BuildInput {
  entries: JournalEntry[];
  playbook: PlaybookSetup[];
  /** null while loading, [] when there are none. */
  lessons: LessonView[] | null;
  state: FeedState;
  /** Cards already looked at on this device. */
  seen: ReadonlySet<FeedKey>;
  /** Lesson ids already read (from local reading progress). */
  readLessons: ReadonlySet<string>;
  /** YYYY-MM-DD in the trader's calendar. */
  today: string;
  startingBalance: number;
  currency: CurrencyCode;
  limit?: number;
}

export const tradeKey = (id: string): FeedKey => `trade:${id}`;
export const setupKey = (id: string): FeedKey => `setup:${id}`;
export const lessonKey = (id: string): FeedKey => `lesson:${id}`;

/** Whole days from `a` to `b` (YYYY-MM-DD), DST-safe. */
export function daysBetween(a: string, b: string): number {
  const p = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86_400_000);
}

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10_000) / 10_000;
}

const weekday = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function whenLabel(date: string, today: string): string {
  const d = daysBetween(date, today);
  if (d <= 0) return "From today";
  if (d === 1) return "From yesterday";
  if (d < 7) return `From ${weekday(date)}`;
  return `From ${weekday(date)}`;
}

export function setupStatsFor(setup: PlaybookSetup, entries: JournalEntry[]) {
  const mine = entries.filter((e) => e.setupId === setup.id || (!e.setupId && e.setup && e.setup.trim().toLowerCase() === setup.name.trim().toLowerCase()));
  const wins = mine.filter((e) => e.pnl > 0).length;
  const rs = mine.map((e) => e.rr).filter((r): r is number => typeof r === "number");
  return {
    trades: mine.length,
    wins,
    winRate: mine.length ? wins / mine.length : null,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
  };
}

const VIDEO_URL_RE = /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i;
const VIDEO_TAG_RE = /<video\b[^>]*\bsrc=["']([^"']+)["']/i;

/** Extracts a playable video URL from lesson HTML, cover URL, or explicit video fields when present. */
export function extractVideoUrl(html?: string | null, cover?: string | null, direct?: string | null): string | null {
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (typeof cover === "string" && VIDEO_URL_RE.test(cover.trim())) return cover.trim();
  if (typeof html === "string" && html) {
    const m = VIDEO_TAG_RE.exec(html);
    if (m?.[1]) return m[1];
  }
  return null;
}

function tradeVideoUrl(e: JournalEntry): string | null {
  const direct = (e as { videoUrl?: string | null; video?: string | null }).videoUrl ?? (e as { video?: string | null }).video;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const vidImg = e.images.find((img) => VIDEO_URL_RE.test(img.name) || VIDEO_URL_RE.test(img.id));
  return vidImg ? `/api/drive/image/${encodeURIComponent(vidImg.id)}` : null;
}

function lessonVideoUrl(l: LessonView): string | null {
  const direct = (l as { videoUrl?: string | null; video?: string | null }).videoUrl ?? (l as { video?: string | null }).video;
  return extractVideoUrl(l.html, l.cover, direct);
}

/* ------------------------------- scoring ------------------------------- */

interface Affinity { setups: Map<string, number>; instruments: Map<string, number> }

/** What the viewer's saves say they care about. */
function affinityOf(i: BuildInput): Affinity {
  const setups = new Map<string, number>(), instruments = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string | undefined) => { if (k) m.set(k, (m.get(k) ?? 0) + 1); };
  const byId = new Map(i.entries.map((e) => [tradeKey(e.id), e]));
  for (const key of savedKeys(i.state)) {
    if (key.startsWith("trade:")) { const e = byId.get(key); if (e) { bump(setups, e.setupId); bump(instruments, e.instrument); } }
    else if (key.startsWith("setup:")) bump(setups, key.slice(6));
  }
  return { setups, instruments };
}

function tradeCards(i: BuildInput, aff: Affinity): TradeCard[] {
  const recent = i.entries.filter((e) => daysBetween(e.date, i.today) <= TRADE_WINDOW_DAYS && daysBetween(e.date, i.today) >= 0);
  const fortnight = recent.filter((e) => daysBetween(e.date, i.today) <= 14);
  const best = fortnight.reduce<JournalEntry | null>((b, e) => (e.pnl > 0 && (!b || e.pnl > b.pnl) ? e : b), null);
  const setupName = new Map(i.playbook.map((s) => [s.id, s.name]));

  const all = recent.map((e): TradeCard => {
    const plan = planJournalReplay(e, { startingBalance: i.startingBalance, currency: i.currency });
    const replayable = plan.ok && plan.mode === "trade";
    const hasImage = e.images.length > 0;
    const videoUrl = tradeVideoUrl(e);
    const age = daysBetween(e.date, i.today);
    const key = tradeKey(e.id);
    const sAff = Math.min(1.4, (e.setupId ? aff.setups.get(e.setupId) ?? 0 : 0) * 0.35 + (aff.instruments.get(e.instrument) ?? 0) * 0.1);

    let score = 2 * Math.exp(-age / 21) + (replayable ? 0.6 : 0) + (hasImage || videoUrl ? 0.4 : 0) + sAff;
    let reason = replayable ? "Replay it bar by bar" : whenLabel(e.date, i.today);
    if (sAff >= 0.35 && e.setupId && setupName.get(e.setupId)) { reason = `Because you saved ${setupName.get(e.setupId)}`; }
    else if (best && e.id === best.id) { score += 0.9; reason = "Your best trade in two weeks"; }
    else if (e.pnl < 0 && age <= 14) { score += 0.8; reason = "A recent loss, worth a second look"; }
    if (i.seen.has(key)) score -= 1.2;
    score += hash01(key + i.today) * 0.05; // stable per day
    return { kind: "trade", key, entry: e, replayable, hasImage, ...(videoUrl ? { videoUrl } : {}), reason, score };
  });

  // A trade with neither a chart nor a replay is a weak reel; keep only the freshest few so a sparse journal still has content.
  const rich = all.filter((c) => c.replayable || c.hasImage || Boolean(c.videoUrl));
  const plain = all.filter((c) => !c.replayable && !c.hasImage && !c.videoUrl).sort((a, b) => b.score - a.score).slice(0, rich.length < 4 ? 6 : 0);
  return [...rich, ...plain].sort((a, b) => b.score - a.score).slice(0, 60);
}

function setupCards(i: BuildInput, aff: Affinity): SetupCard[] {
  return i.playbook.filter((s) => s.active !== false).map((setup): SetupCard => {
    const key = setupKey(setup.id);
    const stats = setupStatsFor(setup, i.entries);
    const a = Math.min(1.4, (aff.setups.get(setup.id) ?? 0) * 0.35);
    let score = 0.9 + a + (stats.trades >= 5 ? 0.3 : 0);
    if (i.seen.has(key)) score -= 1.2;
    score += hash01(key + i.today) * 0.05;
    const reason = a >= 0.35 ? "A setup you keep coming back to"
      : stats.trades >= 3 && stats.winRate !== null ? `Won ${Math.round(stats.winRate * 100)}% of ${stats.trades} trades`
      : "From your playbook";
    return { kind: "setup", key, setup, stats, reason, score };
  });
}

function lessonCards(i: BuildInput): LessonCard[] {
  if (!i.lessons) return [];
  const linked = new Set<string>();
  for (const e of i.entries) if (daysBetween(e.date, i.today) <= 21) for (const id of e.lessonIds ?? []) linked.add(id);
  return i.lessons.map((lesson): LessonCard => {
    const key = lessonKey(lesson.id);
    const community = !lesson.mine;
    const videoUrl = lessonVideoUrl(lesson);
    const ageDays = Math.max(0, (Date.parse(i.today + "T12:00:00Z") - lesson.createdAt) / 86_400_000);
    let score = 1.0 + 0.8 * Math.exp(-ageDays / 14);
    let reason = community ? `Shared by ${lesson.author.name}` : "From your playbook";
    if (linked.has(lesson.id)) { score += 1.2; reason = "Linked to a trade you took recently"; }
    else if (community && ageDays <= 14) { score += 0.5; reason = `New from ${lesson.author.name}`; }
    if (lesson.repostedBy.length && community) reason = `${reason} · reposted by ${lesson.repostedBy[0]}`;
    if (i.readLessons.has(lesson.id)) score -= 1.0;
    if (i.seen.has(key)) score -= 1.0;
    score += hash01(key + i.today) * 0.05;
    return { kind: "lesson", key, lesson, community, ...(videoUrl ? { videoUrl } : {}), reason, score };
  });
}

function starters(i: BuildInput): StarterCard[] {
  const out: StarterCard[] = [];
  if (i.entries.length === 0) out.push({ kind: "starter", key: "starter:first-trade", id: "first-trade", reason: "Your journal is empty", score: 3 });
  if (i.playbook.length === 0) out.push({ kind: "starter", key: "starter:first-setup", id: "first-setup", reason: "Define what you trade", score: 2.5 });
  if (i.lessons && i.lessons.length === 0) out.push({ kind: "starter", key: "starter:first-lesson", id: "first-lesson", reason: "Write down what you've learned", score: 2.4 });
  return out;
}

/** Avoid long runs of the same kind so the feed stays varied, without disturbing the score order more than needed. */
export function diversify<T extends { kind: string }>(sorted: T[], maxRun = MAX_RUN): T[] {
  const out: T[] = [];
  const rest = [...sorted];
  while (rest.length) {
    const last = out.slice(-maxRun);
    const blocked = last.length === maxRun && last.every((c) => c.kind === last[0].kind) ? last[0].kind : null;
    const idx = blocked ? rest.findIndex((c) => c.kind !== blocked) : 0;
    out.push(...rest.splice(idx === -1 ? 0 : idx, 1));
  }
  return out;
}

/** The "For you" batch: ranked, varied, finite, ending with a clear stopping point. */
export function buildFeed(i: BuildInput): FeedCard[] {
  const aff = affinityOf(i);
  const pool: FeedCard[] = [...starters(i), ...tradeCards(i, aff), ...setupCards(i, aff), ...lessonCards(i)];
  const limit = i.limit ?? BATCH_SIZE;
  const ranked = diversify(pool.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))).slice(0, limit);
  const end: EndCard = { kind: "end", key: "end", reason: "That's everything for now", score: -1, seen: ranked.filter((c) => i.seen.has(c.key)).length };
  return [...ranked, end];
}

/** Cards for specific saved keys (Saved tab, collections). Keeps the saved order; silently skips anything deleted. */
export function cardsForKeys(i: BuildInput, keys: FeedKey[]): FeedCard[] {
  const out: FeedCard[] = [];
  const trades = new Map(i.entries.map((e) => [tradeKey(e.id), e]));
  const setups = new Map(i.playbook.map((s) => [setupKey(s.id), s]));
  const lessons = new Map((i.lessons ?? []).map((l) => [lessonKey(l.id), l]));
  for (const key of keys) {
    const e = trades.get(key);
    if (e) {
      const plan = planJournalReplay(e, { startingBalance: i.startingBalance, currency: i.currency });
      const videoUrl = tradeVideoUrl(e);
      out.push({ kind: "trade", key, entry: e, replayable: plan.ok && plan.mode === "trade", hasImage: e.images.length > 0, ...(videoUrl ? { videoUrl } : {}), reason: "Saved by you", score: 0 });
      continue;
    }
    const s = setups.get(key);
    if (s) { out.push({ kind: "setup", key, setup: s, stats: setupStatsFor(s, i.entries), reason: "Saved by you", score: 0 }); continue; }
    const l = lessons.get(key);
    if (l) {
      const videoUrl = lessonVideoUrl(l);
      out.push({ kind: "lesson", key, lesson: l, community: !l.mine, ...(videoUrl ? { videoUrl } : {}), reason: "Saved by you", score: 0 });
    }
  }
  return out;
}

/** Does this key still point at something that exists? Used to prune saves of deleted items. */
export function keyExists(i: Pick<BuildInput, "entries" | "playbook" | "lessons">, key: FeedKey): boolean {
  if (key.startsWith("trade:")) return i.entries.some((e) => tradeKey(e.id) === key);
  if (key.startsWith("setup:")) return i.playbook.some((s) => setupKey(s.id) === key);
  if (key.startsWith("lesson:")) return i.lessons === null ? true : i.lessons.some((l) => lessonKey(l.id) === key); // unknown while lessons load: keep
  return false;
}
