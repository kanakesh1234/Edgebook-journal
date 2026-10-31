/**
 * Minato's "mind": a small, private memory of how the trader says they feel.
 *
 * Learning loop (deliberately simple, transparent and on-device, not a neural network):
 *   1. OBSERVE  – read the trader's own words and extract a feeling (lexicon + negation check).
 *   2. HOLD     – keep it as a pending note until the next setup is taken.
 *   3. VERIFY   – compare it with what the next trade actually did (outcome, rule adherence, tagged mistake).
 *   4. REINFORCE or PRUNE – useful notes are kept and counted per feeling; notes that proved nothing are dropped.
 * The per-feeling counters are the only "weights"; they surface as plain-language patterns.
 */
import type { JournalEntry } from "@/lib/types";

export type Mood =
  | "fomo" | "revenge" | "anxious" | "frustrated" | "overconfident" | "tired" | "hesitant" | "distracted"
  | "calm" | "confident";

export const MOOD_LABEL: Record<Mood, string> = {
  fomo: "FOMO", revenge: "Revenge urge", anxious: "Anxious", frustrated: "Frustrated", overconfident: "Overconfident",
  tired: "Tired", hesitant: "Hesitant", distracted: "Distracted", calm: "Calm", confident: "Confident",
};
const POSITIVE: Mood[] = ["calm", "confident"];
export const isPositive = (m: Mood) => POSITIVE.includes(m);

export interface MindNote {
  id: string;
  at: number;
  date: string;
  mood: Mood;
  /** The trader's own words, trimmed. */
  quote: string;
  status: "pending" | "kept";
  /** Why it was kept (set when the next setup proved it useful). */
  verdict?: string;
  tradeId?: string;
}
export interface MindState {
  notes: MindNote[];
  /** Per-feeling counters: how often it was seen with a setup, and how often it proved relevant. */
  stats: Partial<Record<Mood, { seen: number; hits: number }>>;
}
export const emptyMind = (): MindState => ({ notes: [], stats: {} });

const HOUR = 3_600_000;
const MAX_KEPT = 40;
const MAX_PENDING = 6;

/* ------------------------------ 1. observe ------------------------------ */

const LEXICON: Record<Mood, RegExp> = {
  fomo: /\b(fomo|missed (it|out|the)|miss(ing)? out|chas(e|ing)|left behind|should(?:'ve| have) (taken|entered|bought|sold))\b/gi,
  revenge: /\b(revenge|win (it|that|my money|it all) back|make it back|get (it|my money) back|recover (the |my )?loss(es)?|need to win)\b/gi,
  anxious: /\b(anxious|nervous|scared|afraid|worried|fear|stress(ed)?|uneasy|panick?(ed|ing)?|on edge)\b/gi,
  frustrated: /\b(frustrat\w*|angry|annoyed|\bmad\b|pissed|irritat\w*|upset|furious|tilt(ed)?)\b/gi,
  overconfident: /\b(overconfident|can'?t lose|invincible|too confident|on a (roll|streak)|unstoppable|easy money|cocky)\b/gi,
  tired: /\b(tired|exhaust\w*|sleepy|drained|burn(?:ed|t)[- ]?out|didn'?t sleep|no sleep|fatigue\w*)\b/gi,
  hesitant: /\b(hesitat\w*|doubt\w*|unsure|not sure|second[- ]guess\w*|froze|freez\w*|can'?t pull the trigger)\b/gi,
  distracted: /\b(distract\w*|unfocused|can'?t focus|restless|bored|scattered)\b/gi,
  calm: /\b(calm|relaxed|patient|clear[- ]headed|at ease|steady|disciplined|focused)\b/gi,
  confident: /\b(confident|prepared|sharp|in the zone|ready to go)\b/gi,
};
const NEGATION = /(\bnot|n't|\bnever|\bno longer|\bdon'?t feel|\bwithout)\s*(really |very |that |too )?$/i;
const FIRST_PERSON = /\b(i|i'm|im|i've|ive|i'll|my|me|feel|feeling|felt)\b/i;

/** Feelings the trader expressed about themselves in this message (max 2, strongest first). */
export function detectMoods(text: string): Mood[] {
  if (!FIRST_PERSON.test(text)) return [];
  // A general question ("How do I handle FOMO?") is not a statement about how the trader feels.
  if (/^\s*(how|what|why|when|can|could|should|is|are|does|do)\b/i.test(text) && !/\b(i feel|i'm|im|i am|feeling|felt|i've been)\b/i.test(text)) return [];
  const found: { mood: Mood; n: number }[] = [];
  for (const mood of Object.keys(LEXICON) as Mood[]) {
    const re = new RegExp(LEXICON[mood].source, "gi");
    let n = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 16), m.index);
      if (!NEGATION.test(before)) n++;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    if (n > 0) found.push({ mood, n });
  }
  return found.sort((a, b) => b.n - a.n).slice(0, 2).map((f) => f.mood);
}

/* -------------------------------- 2. hold -------------------------------- */

export function addNotes(state: MindState, moods: Mood[], text: string, now: number, date: string): MindState {
  if (moods.length === 0) return state;
  const quote = text.replace(/\s+/g, " ").trim().slice(0, 180);
  let notes = [...state.notes];
  for (const mood of moods) {
    const dupe = notes.findIndex((n) => n.status === "pending" && n.mood === mood && now - n.at < 3 * HOUR);
    if (dupe >= 0) { notes[dupe] = { ...notes[dupe], at: now, quote }; continue; }
    notes.push({ id: `${now}-${mood}`, at: now, date, mood, quote, status: "pending" });
  }
  const pending = notes.filter((n) => n.status === "pending").sort((a, b) => b.at - a.at).slice(0, MAX_PENDING);
  const kept = notes.filter((n) => n.status === "kept");
  return { ...state, notes: [...kept, ...pending] };
}

/* ------------------------------- 3. verify ------------------------------- */

function troubleBits(e: JournalEntry): string[] {
  const bits: string[] = [];
  if (e.pnl < 0) bits.push("closed red");
  if (e.reflection?.followedSetup === false) bits.push("broke your setup rules");
  if (e.reflection?.followedRisk === false) bits.push("broke your risk rule");
  const mistake = e.review?.followUp?.mistake;
  if (mistake && mistake !== "none") bits.push("carried a tagged mistake");
  if (e.review?.plannedVsActual?.deviations?.trim()) bits.push("drifted from the plan");
  return bits;
}
const isClean = (e: JournalEntry) =>
  e.reflection?.followedSetup === true && e.reflection?.followedRisk !== false && !(e.review?.followUp?.mistake && e.review.followUp.mistake !== "none");
const isReviewed = (e: JournalEntry) => !!e.reflection || !!e.review?.followUp;

function join(bits: string[]) {
  return bits.length <= 1 ? bits[0] ?? "" : `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}`;
}

const localDay = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/** A trade logged this soon after a feeling still belongs to the same sitting, even across midnight. */
const SAME_SITTING = 4 * HOUR;

/**
 * Settle pending notes against the first setup taken after they were written, on THE SAME DAY.
 * Useful → kept (and counted). A feeling is about that day: once the day is over with no setup, it is dropped, so what
 * the trader said on Monday is never tied to a trade on Wednesday.
 */
export function reconcile(state: MindState, entries: JournalEntry[], now: number, today: string = localDay(now)): { state: MindState; changed: boolean } {
  let changed = false;
  const stats = { ...state.stats };
  const next: MindNote[] = [];
  const byTime = [...entries].sort((a, b) => a.createdAt - b.createdAt);

  for (const note of state.notes) {
    if (note.status !== "pending") { next.push(note); continue; }
    const trade = byTime.find((e) => e.createdAt > note.at && (e.date === note.date || e.createdAt - note.at <= SAME_SITTING));
    if (!trade) {
      if (note.date < today) changed = true; // the day ended with no setup: nothing was learned, let it go
      else next.push(note);
      continue;
    }
    const positive = isPositive(note.mood);
    const bits = troubleBits(trade);
    // A calm, green, unreviewed trade can't prove anything yet: wait for the review (up to 48h).
    if (!isReviewed(trade) && trade.pnl >= 0 && now - trade.createdAt < 48 * HOUR) { next.push(note); continue; }

    const hit = positive ? isClean(trade) : bits.length > 0;
    const s = stats[note.mood] ?? { seen: 0, hits: 0 };
    stats[note.mood] = { seen: s.seen + 1, hits: s.hits + (hit ? 1 : 0) };
    changed = true;
    if (hit) {
      next.push({
        ...note,
        status: "kept",
        tradeId: trade.id,
        verdict: positive
          ? `Feeling ${MOOD_LABEL[note.mood].toLowerCase()} went with a clean, plan-following trade.`
          : `After feeling ${MOOD_LABEL[note.mood].toLowerCase()}, your next trade ${join(bits.slice(0, 3))}.`,
      });
    }
  }

  const kept = next.filter((n) => n.status === "kept").sort((a, b) => b.at - a.at).slice(0, MAX_KEPT);
  const pending = next.filter((n) => n.status === "pending");
  return { state: { notes: [...kept, ...pending], stats }, changed };
}

/* ------------------------------- 4. surface ------------------------------ */

export interface MindPattern { mood: Mood; seen: number; hits: number; line: string }

/** Plain-language habits, shown only once a feeling has been tested at least twice. */
export function patterns(state: MindState): MindPattern[] {
  return (Object.entries(state.stats) as [Mood, { seen: number; hits: number }][])
    .filter(([, s]) => s.seen >= 2 && s.hits >= 1)
    .map(([mood, s]) => ({
      mood, ...s,
      line: isPositive(mood)
        ? `When you feel ${MOOD_LABEL[mood].toLowerCase()}, your next trade stayed clean ${s.hits} of ${s.seen} times.`
        : `When you feel ${MOOD_LABEL[mood].toLowerCase()}, your next trade ran into trouble ${s.hits} of ${s.seen} times.`,
    }))
    .sort((a, b) => b.hits / b.seen - a.hits / a.seen);
}

/** Compact payload for the model: what is pending, what proved useful, and the habits. */
export function mindForModel(state: MindState, justNow: Mood[], now: number) {
  return {
    justNow: justNow.map((m) => MOOD_LABEL[m]),
    pending: state.notes.filter((n) => n.status === "pending").slice(0, 4).map((n) => ({ feeling: MOOD_LABEL[n.mood], words: n.quote, hoursAgo: Math.round((now - n.at) / HOUR) })),
    keptBecauseUseful: state.notes.filter((n) => n.status === "kept").slice(0, 8).map((n) => ({ date: n.date, feeling: MOOD_LABEL[n.mood], what: n.verdict })),
    habits: patterns(state).slice(0, 4).map((p) => p.line),
  };
}

/* ----------------------------- persistence ------------------------------ */

export function loadMind(key: string): MindState {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return emptyMind();
    const p = JSON.parse(raw) as MindState;
    return { notes: Array.isArray(p.notes) ? p.notes : [], stats: p.stats && typeof p.stats === "object" ? p.stats : {} };
  } catch { return emptyMind(); }
}
export function saveMind(key: string, state: MindState) {
  try { window.localStorage.setItem(key, JSON.stringify(state)); } catch { /* storage blocked */ }
}
