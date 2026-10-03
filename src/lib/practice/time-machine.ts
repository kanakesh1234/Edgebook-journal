import type { JournalEntry } from "@/lib/types";
import { formatDateMedium, weekdayShort } from "@/lib/format";

export type TimeMachineMode = "risk-math" | "mistake-hunter" | "stat-prophecy" | "circuit-breaker" | "kunai" | "weekend-boss" | "news-day-boss" | "rewind" | "odd-one-out";
export type QuestionFormat = "cloze" | "true-false" | "pick-the-real-rule" | "scenario" | "reverse-recall" | "order-steps" | "spot-the-flaw";

export interface FactAtom {
  id: string;
  entryId: string;
  pin: string;
  field: string;
  value: string;
  /** Values marked numeric are always rendered from this local evidence. */
  numeric?: number;
  date: string;
  lesson?: boolean;
  steps?: string[];
}

export interface TradeSource {
  entryId: string;
  pin: string;
  fields: string[];
  imageId?: string;
}

export interface TimeMachineCard {
  id: string;
  mode: TimeMachineMode;
  masteryTag: string;
  title: string;
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
  source: TradeSource;
  xp: number;
  difficulty?: "recognition" | "recall" | "application" | "prediction";
  format?: QuestionFormat;
  variant?: number;
  factId?: string;
}

const MODE_LABEL: Record<TimeMachineMode, string> = {
  "risk-math": "Risk Math Sprint",
  "mistake-hunter": "Mistake Hunter",
  "stat-prophecy": "Stat Prophecy",
  "circuit-breaker": "Circuit Breaker",
  kunai: "Kunai Round",
  "weekend-boss": "Weekend Boss",
  "news-day-boss": "News Day Boss",
  rewind: "Rewind · Screenshot Replay",
  "odd-one-out": "Odd One Out",
};

export function modeLabel(mode: TimeMachineMode) { return MODE_LABEL[mode]; }

/**
 * The original Practice interview treated the review's Q4
 * `followUp.biggestMistake` as the canonical lesson. Keep that exact field
 * first so reviews written by the old page remain eligible for Kunai cards.
 */
function lessonOf(entry: JournalEntry) {
  const candidates: Array<[string, unknown]> = [
    ["review.followUp.biggestMistake", entry.review?.followUp?.biggestMistake],
    ["reflection.lesson", entry.reflection?.lesson],
    ["review.followUp.watchNext", entry.review?.followUp?.watchNext],
  ];
  for (const [, value] of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Explicit diagnostics for the Backfill control; never run during render. */
export function logLessonBackfillDiagnostics(entries: JournalEntry[]): void {
  entries.forEach((entry) => {
    if (!entry.review && !entry.reflection) return;
    const reviewLesson = entry.review?.followUp?.biggestMistake;
    const reflectionLesson = entry.reflection?.lesson;
    const watchNext = entry.review?.followUp?.watchNext;
    const lesson = lessonOf(entry);
    const reason = lesson
      ? `accepted:${typeof reviewLesson === "string" && reviewLesson.trim() ? "review.followUp.biggestMistake" : typeof reflectionLesson === "string" && reflectionLesson.trim() ? "reflection.lesson" : "review.followUp.watchNext"}`
      : "rejected:no non-empty review.followUp.biggestMistake, reflection.lesson, or review.followUp.watchNext";
    console.info("[PRACTICE_BACKFILL] lesson", {
      entryId: entry.id,
      date: entry.date,
      reason,
      hasReview: !!entry.review,
      reviewLessonType: typeof reviewLesson,
      reflectionLessonType: typeof reflectionLesson,
      watchNextType: typeof watchNext,
    });
  });
}

function pin(entry: JournalEntry, drawdownLeft: number | null): string {
  const parts = [formatDateMedium(entry.date), entry.entryTime ? `${entry.entryTime} NY` : "time not recorded", entry.instrument || "trade", entry.direction ?? "side not recorded"];
  if (drawdownLeft != null) parts.push(`$${Math.max(0, Math.round(drawdownLeft)).toLocaleString()} drawdown left`);
  return parts.join(" · ");
}

function shuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.abs((seed * 9301 + i * 49297) % 233280) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Break journal evidence into independently testable facts. This is the only
 * input to both local templates and the AI batch route. */
export function factAtoms(entries: JournalEntry[], seedLessons: string[] = []): FactAtom[] {
  const atoms: FactAtom[] = [];
  for (const entry of entries) {
    const base = { entryId: entry.id, pin: pin(entry, null), date: entry.date };
    const add = (field: string, value: string, numeric?: number) => atoms.push({ ...base, id: `${entry.id}:${field}`, field, value, numeric });
    const lesson = lessonOf(entry);
    if (lesson) atoms.push({ ...base, id: `${entry.id}:lesson`, field: "lesson", value: lesson, lesson: true });
    if (entry.instrument) add("instrument", entry.instrument);
    if (entry.entryTime) add("entry time", `${entry.entryTime} NY`);
    if (entry.direction) add("direction", entry.direction);
    if (Number.isFinite(entry.pnl)) add("P&L", `${entry.pnl < 0 ? "−" : "+"}$${Math.abs(entry.pnl).toLocaleString()}`, entry.pnl);
    if (entry.entryPrice != null) add("entry price", String(entry.entryPrice), entry.entryPrice);
    if (entry.stopLoss != null) add("stop price", String(entry.stopLoss), entry.stopLoss);
    if (entry.takeProfit != null) add("target price", String(entry.takeProfit), entry.takeProfit);
    if (entry.entryPrice != null && entry.stopLoss != null && entry.takeProfit != null && entry.entryPrice !== entry.stopLoss) {
      const rr = Math.abs(entry.takeProfit - entry.entryPrice) / Math.abs(entry.entryPrice - entry.stopLoss);
      add("planned reward-to-risk", `${rr.toFixed(2)}R`, rr);
    }
    const steps = entry.preTradeChecklist?.filter((item) => item.label.trim()).map((item) => item.label.trim()) ?? [];
    if (steps.length >= 2) atoms.push({ ...base, id: `${entry.id}:checklist`, field: "pre-trade checklist", value: steps.join(" → "), steps });
  }
  seedLessons.filter(Boolean).forEach((value, index) => atoms.push({ id: `seed:${index}:lesson`, entryId: `seed:${index}`, pin: "Minato interview · your opening rule", date: "", field: "lesson", value: value.trim(), lesson: true }));
  return atoms;
}

export function questionKey(card: Pick<TimeMachineCard, "source"> & { format?: QuestionFormat; variant?: number }): string {
  return `${card.source.entryId}:${card.source.fields[0] ?? "fact"}:${card.format ?? "legacy"}:${card.variant ?? 0}`;
}

function cardBase(entry: JournalEntry, mode: TimeMachineMode, drawdownLeft: number | null): Pick<TimeMachineCard, "id" | "mode" | "masteryTag" | "title" | "source" | "xp"> {
  return {
    id: `${mode}:${entry.id}`,
    mode,
    masteryTag: mode,
    title: modeLabel(mode),
    source: { entryId: entry.id, pin: pin(entry, drawdownLeft), fields: [] },
    xp: mode === "risk-math" ? 30 : 20,
  };
}

function weekendBossCard(entries: JournalEntry[], drawdownLeft: number | null): TimeMachineCard | null {
  const entry = [...entries].sort((a, b) => a.pnl - b.pnl)[0];
  if (!entry || entry.pnl >= 0) return null;
  const answer = `−$${Math.abs(entry.pnl).toLocaleString()}`;
  const alternatives = [`−$${Math.round(Math.abs(entry.pnl) * 0.5).toLocaleString()}`, `+$${Math.abs(entry.pnl).toLocaleString()}`];
  return {
    ...cardBase(entry, "weekend-boss", drawdownLeft), choices: shuffle([answer, ...alternatives], entry.updatedAt), answer,
    prompt: `Boss replay: this was your costliest recorded trade. Before the debrief, identify the actual P&L you need to beat next time.`,
    explanation: `This boss is built from your ${formatDateMedium(entry.date)} ${entry.instrument || "trade"}. Its recorded P&L was ${answer}; the lesson is the evidence to improve, not a rewritten story.`,
    source: { ...cardBase(entry, "weekend-boss", drawdownLeft).source, fields: ["date", "instrument", "pnl", ...(lessonOf(entry) ? ["lesson"] : [])] },
    xp: 50,
  };
}

function newsBossCard(entries: JournalEntry[], drawdownLeft: number | null): TimeMachineCard | null {
  const entry = entries.find((e) => /\b(cpi|fomc|nfp|news|powell|release)\b/i.test(`${e.notes} ${e.reflection?.cause ?? ""} ${e.review?.followUp?.watchNext ?? ""}`));
  if (!entry) return null;
  const answer = entry.entryTime ? `${entry.entryTime} NY` : "No entry time was recorded";
  const choices = shuffle([answer, "08:30 NY", "09:30 NY"].filter((v, i, all) => all.indexOf(v) === i), entry.createdAt);
  return {
    ...cardBase(entry, "news-day-boss", drawdownLeft), choices, answer,
    prompt: `News Day Boss: your own notes flag a market event on this trade. Which entry time does the journal actually record?`,
    explanation: `The news context comes from your saved notes; the time is read from the structured trade field. No external calendar event has been assumed.`,
    source: { ...cardBase(entry, "news-day-boss", drawdownLeft).source, fields: ["notes", "entryTime"] },
    xp: 40,
  };
}

/** Screenshot-based Rewind is intentionally separate from true candle replay.
 * It can only replay a saved chart and the documented outcome; no candle path
 * is fabricated when a market-data feed is absent. */
function rewindCard(entries: JournalEntry[], drawdownLeft: number | null): TimeMachineCard | null {
  const entry = entries.find((e) => e.images.length > 0 && !!e.entryTime && e.review?.outcome?.followedPlan != null);
  if (!entry) return null;
  const answer = entry.review?.outcome?.followedPlan ? "Take" : "Skip";
  return {
    ...cardBase(entry, "rewind", drawdownLeft), choices: ["Take", "Skip", "Reduce"], answer,
    prompt: `Screenshot replay: you are back at the recorded ${entry.entryTime} NY decision point. Based on the documented process outcome, which call matches what this replay teaches?`,
    explanation: entry.review?.outcome?.followedPlan
      ? "Your review records that the plan was followed. This is a process replay, not a price prediction."
      : "Your review records that the plan was not followed. The correct replay call is to skip rather than recreate the deviation.",
    source: { ...cardBase(entry, "rewind", drawdownLeft).source, fields: ["entryTime", "screenshot", "followedPlan"], imageId: entry.images[0]?.id },
    xp: 35,
  };
}

function oddOneOutCard(entries: JournalEntry[], drawdownLeft: number | null): TimeMachineCard | null {
  const reviewed = entries.filter((e) => e.review?.outcome?.followedPlan != null);
  const broken = reviewed.find((e) => e.review?.outcome?.followedPlan === false);
  if (!broken) return null;
  const clean = reviewed.filter((e) => e.id !== broken.id && e.review?.outcome?.followedPlan === true).slice(0, 2);
  if (clean.length < 2) return null;
  const label = (e: JournalEntry) => `${formatDateMedium(e.date)} · ${e.instrument || "trade"} · ${e.direction ?? "unrecorded side"}`;
  const answer = label(broken);
  return {
    ...cardBase(broken, "odd-one-out", drawdownLeft), choices: shuffle([answer, ...clean.map(label)], broken.updatedAt), answer,
    prompt: "Which trade is the odd one out — the one whose saved review says the plan was not followed?",
    explanation: `The selected trade's documented outcome has followedPlan = false. The other two have followedPlan = true; this is based on the review, not on whether they won or lost.`,
    source: { ...cardBase(broken, "odd-one-out", drawdownLeft).source, fields: ["date", "instrument", "direction", "followedPlan"] },
    xp: 30,
  };
}

function riskCard(entry: JournalEntry, drawdownLeft: number | null): TimeMachineCard | null {
  if (entry.entryPrice == null || entry.stopLoss == null || entry.takeProfit == null || entry.entryPrice === entry.stopLoss) return null;
  const risk = Math.abs(entry.entryPrice - entry.stopLoss);
  const reward = Math.abs(entry.takeProfit - entry.entryPrice);
  const answer = `${(reward / risk).toFixed(2)}R`;
  const choices = shuffle([answer, `${(risk / reward).toFixed(2)}R`, `${(reward / risk * 1.5).toFixed(2)}R`], entry.createdAt);
  return {
    ...cardBase(entry, "risk-math", drawdownLeft), choices, answer,
    prompt: `Your stop was ${risk.toFixed(2)} points and target was ${reward.toFixed(2)} points away. What was the planned reward-to-risk?`,
    explanation: `Computed from the recorded entry, stop, and target: ${reward.toFixed(2)} ÷ ${risk.toFixed(2)} = ${answer}.`,
    source: { ...cardBase(entry, "risk-math", drawdownLeft).source, fields: ["entryPrice", "stopLoss", "takeProfit"] },
  };
}

function kunaiCard(entry: JournalEntry, drawdownLeft: number | null): TimeMachineCard | null {
  const lesson = lessonOf(entry);
  if (!lesson) return null;
  const words = lesson.split(/\s+/).filter(Boolean);
  // A terse journal lesson is still valuable evidence.  Previously these were
  // discarded, which could leave a player with an empty deck despite having
  // recorded a perfectly usable review.
  if (words.length < 3) {
    const answer = lesson;
    return {
      ...cardBase(entry, "kunai", drawdownLeft),
      choices: shuffle([answer, "Chase the first move.", "Ignore the setup."].filter((v, i, a) => a.indexOf(v) === i), entry.updatedAt),
      answer,
      prompt: "Which rule did you save from this trade?",
      explanation: `Your recorded lesson was: “${lesson}”`,
      source: { ...cardBase(entry, "kunai", drawdownLeft).source, fields: ["lesson"] },
    };
  }
  const hidden = words[Math.floor(words.length / 2)].replace(/[.,!?]/g, "");
  const answer = hidden;
  const choices = shuffle([answer, "target", "setup"].filter((v, i, a) => a.indexOf(v) === i), entry.updatedAt);
  return {
    ...cardBase(entry, "kunai", drawdownLeft), choices, answer,
    prompt: `Complete your own lesson: “${lesson.replace(hidden, "____")}"`,
    explanation: `Your recorded lesson was: “${lesson}”`,
    source: { ...cardBase(entry, "kunai", drawdownLeft).source, fields: ["lesson"] },
  };
}

function hunterCard(entry: JournalEntry, drawdownLeft: number | null): TimeMachineCard | null {
  const lesson = lessonOf(entry);
  if (!lesson && !entry.entryTime) return null;
  const realTime = entry.entryTime ?? "no entry time";
  const wrongTime = entry.entryTime === "09:30" ? "09:45" : "09:30";
  const answer = entry.entryTime ? `The time is wrong — it was ${realTime} NY.` : "The review claims a time that was not recorded.";
  return {
    ...cardBase(entry, "mistake-hunter", drawdownLeft),
    choices: shuffle([answer, "The instrument is wrong.", "The P&L sign is wrong."], entry.createdAt + 7), answer,
    prompt: `Detect the planted error: “This ${entry.instrument || "trade"} ${entry.direction ?? "trade"} was entered at ${wrongTime} NY${lesson ? ` because ${lesson}` : ""}.”`,
    explanation: `The source trade records ${realTime}${lesson ? ` and the lesson “${lesson}”` : ""}. The other statements are not claimed as evidence.`,
    source: { ...cardBase(entry, "mistake-hunter", drawdownLeft).source, fields: ["entryTime", ...(lesson ? ["lesson"] : [])] },
  };
}

function prophecyCard(entries: JournalEntry[], drawdownLeft: number | null): TimeMachineCard | null {
  const groups = new Map<string, JournalEntry[]>();
  for (const entry of entries.filter((e) => e.entryTime)) {
    const hour = entry.entryTime!.slice(0, 2);
    const key = `${weekdayShort(entry.date)} ${hour}:00`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const group = [...groups.entries()].find(([, rows]) => rows.length >= 3 && rows.some((e) => e.rr != null));
  if (!group) return null;
  const [window, rows] = group;
  const wins = rows.filter((e) => e.pnl > 0).length;
  const winRate = Math.round((wins / rows.length) * 100);
  const rRows = rows.filter((e): e is JournalEntry & { rr: number } => e.rr != null);
  const avgR = rRows.reduce((sum, e) => sum + e.rr, 0) / rRows.length;
  const answer = `${winRate}% win rate · ${avgR.toFixed(2)}R avg`;
  const lead = rows[0];
  return {
    ...cardBase(lead, "stat-prophecy", drawdownLeft), choices: shuffle([answer, `${Math.max(0, winRate - 25)}% win rate · ${avgR.toFixed(2)}R avg`, `${winRate}% win rate · ${(avgR + 0.75).toFixed(2)}R avg`], lead.createdAt), answer,
    prompt: `Before revealing it: what did your ${window} window do across ${rows.length} recorded trades?`,
    explanation: `${wins} of ${rows.length} trades won. Average R uses the ${rRows.length} trades that recorded an R value.`,
    source: { entryId: lead.id, pin: `${window} window · ${rows.length} trades · journal evidence`, fields: ["date", "entryTime", "pnl", "rr"] },
  };
}

function breakerCard(entries: JournalEntry[], drawdownLeft: number | null, dailyLimit: number | null): TimeMachineCard | null {
  if (!dailyLimit || dailyLimit <= 0) return null;
  const days = new Map<string, JournalEntry[]>();
  entries.forEach((e) => days.set(e.date, [...(days.get(e.date) ?? []), e]));
  const target = [...days.values()].find((rows) => {
    if (rows.length < 2) return false;
    let running = 0;
    const sorted = [...rows].sort((a, b) => (a.entryTime ?? "99:99").localeCompare(b.entryTime ?? "99:99"));
    return sorted.some((e) => { running += e.pnl; return running <= -dailyLimit; });
  });
  if (!target) return null;
  const ordered = [...target].sort((a, b) => (a.entryTime ?? "99:99").localeCompare(b.entryTime ?? "99:99"));
  let total = 0; let stopAt = ordered.length - 1;
  ordered.forEach((e, i) => { total += e.pnl; if (total <= -dailyLimit && stopAt === ordered.length - 1) stopAt = i; });
  const answer = `After trade ${stopAt + 1}`;
  const lead = ordered[0];
  return {
    ...cardBase(lead, "circuit-breaker", drawdownLeft), choices: ordered.map((_, i) => `After trade ${i + 1}`), answer,
    prompt: `Your daily loss limit was $${dailyLimit.toLocaleString()}. At which trade should the circuit breaker have stopped this ${formatDateMedium(lead.date)} session?`,
    explanation: `Running P&L crossed −$${dailyLimit.toLocaleString()} after trade ${stopAt + 1}. This is computed from the ordered trades that day.`,
    source: { ...cardBase(lead, "circuit-breaker", drawdownLeft).source, fields: ["date", "entryTime", "pnl", "dailyLossLimit"] },
  };
}

export function buildDailyMission(entries: JournalEntry[], options: { drawdownLeft: number | null; dailyLossLimit: number | null; missionDate?: string; difficulty?: "recognition" | "recall" | "application" | "prediction"; seedLessons?: string[]; modePerformance?: Record<string, { correct: number; attempts: number }>; runSeed?: string; seenQuestions?: { factId: string; format: string; variant: number; date: string }[] }): TimeMachineCard[] {
  // Each run has its own seed. Unlike the old daily rotation, two launches on
  // the same day select different fact/format/blank combinations.
  const atoms = factAtoms(entries, options.seedLessons);
  if (atoms.length) return buildFactDeck(atoms, options);
  const newest = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
  const seedCards: TimeMachineCard[] = (options.seedLessons ?? []).filter(Boolean).map((lesson, index) => {
    const answer = lesson.trim();
    return {
      id: `seed-kunai:${index}`, mode: "kunai", masteryTag: "kunai", title: "Kunai Round",
      prompt: "Which rule did you give Minato for your first training deck?",
      choices: shuffle([answer, "Chase the first move.", "Ignore the setup."].filter((v, i, a) => a.indexOf(v) === i), index + answer.length),
      answer, explanation: `You set this opening rule: “${answer}”`,
      source: { entryId: `seed:${index}`, pin: "Minato interview · your opening rule", fields: ["interview rule"] }, xp: 20,
    };
  });
  if (!newest.length && !seedCards.length) return [];
  const cards: Array<TimeMachineCard | null> = [
    ...newest.flatMap((e) => [riskCard(e, options.drawdownLeft), hunterCard(e, options.drawdownLeft), kunaiCard(e, options.drawdownLeft)]),
    ...seedCards,
    prophecyCard(entries, options.drawdownLeft),
    breakerCard(entries, options.drawdownLeft, options.dailyLossLimit),
    weekendBossCard(entries, options.drawdownLeft),
    newsBossCard(entries, options.drawdownLeft),
    rewindCard(entries, options.drawdownLeft),
    oddOneOutCard(entries, options.drawdownLeft),
  ];
  const seen = new Set<string>();
  const unique = cards.filter((card): card is TimeMachineCard => !!card && !seen.has(card.mode) && (seen.add(card.mode), true)).slice(0, 9)
    .sort((a, b) => {
      const left = options.modePerformance?.[a.mode]; const right = options.modePerformance?.[b.mode];
      const leftRate = left?.attempts ? left.correct / left.attempts : 0.5;
      const rightRate = right?.attempts ? right.correct / right.attempts : 0.5;
      return leftRate - rightRate;
    });
  // Rotate the short daily deck using the calendar date. The same evidence is
  // never altered, but a three-minute mission does not present the same mode
  // order every day.
  const seed = [...(options.missionDate ?? "")].reduce((n, char) => n + char.charCodeAt(0), 0);
  const offset = unique.length ? seed % unique.length : 0;
  return [...unique.slice(offset), ...unique.slice(0, offset)].map((card) => ({ ...card, difficulty: options.difficulty ?? "recognition" }));
}

const FORMATS: QuestionFormat[] = ["cloze", "true-false", "pick-the-real-rule", "scenario", "reverse-recall", "order-steps", "spot-the-flaw"];

function distractors(atom: FactAtom, atoms: FactAtom[], seed: number): string[] {
  const values = atoms.filter((other) => other.id !== atom.id && other.field === atom.field).map((other) => other.value);
  const generic = atom.lesson ? ["Chase the first move.", "Ignore the setup.", "Trade without confirmation."] : ["Not recorded", "The opposite value", "A different trade"];
  return shuffle([...values, ...generic].filter((v, i, all) => v !== atom.value && all.indexOf(v) === i), seed).slice(0, 3);
}

/** Local templates never synthesize a number, time, or price: answers are the
 * atom's evidence value (or a code-derived boolean/order). */
export function cardFromFact(atom: FactAtom, atoms: FactAtom[], format: QuestionFormat, variant: number, seed: number): TimeMachineCard | null {
  const choicesFor = (answer: string) => shuffle([answer, ...distractors(atom, atoms, seed)].filter((v, i, all) => all.indexOf(v) === i), seed + 9);
  const base = { id: `fact:${atom.id}:${format}:${variant}`, mode: format === "spot-the-flaw" ? "mistake-hunter" : format === "cloze" ? "kunai" : "odd-one-out" as TimeMachineMode, masteryTag: format, title: "Minato Evidence Drill", source: { entryId: atom.entryId, pin: atom.pin, fields: [atom.field] }, xp: atom.numeric != null ? 30 : 20, format, variant, factId: atom.id };
  if (format === "order-steps") {
    if (!atom.steps || atom.steps.length < 2) return null;
    const answer = atom.steps.join(" → ");
    const reversed = [...atom.steps].reverse().join(" → ");
    return { ...base, prompt: "Put this documented pre-trade checklist in its recorded order.", choices: shuffle([answer, reversed, ...distractors(atom, atoms, seed).slice(0, 2)], seed + 9).filter((v, i, all) => all.indexOf(v) === i).slice(0, 4), answer, explanation: `The recorded order is: ${answer}.` };
  }
  if (format === "cloze") {
    const words = atom.value.split(/\s+/).filter(Boolean);
    if (words.length < 2) return null;
    const start = variant % words.length;
    const blank = words[start];
    return { ...base, mode: "kunai", prompt: `Complete the recorded ${atom.field}: “${words.map((word, i) => i === start ? "____" : word).join(" ")}”`, choices: choicesFor(blank), answer: blank, explanation: `Your evidence records ${atom.field} as “${atom.value}”.` };
  }
  if (format === "true-false") {
    const trueStatement = `This record's ${atom.field} is “${atom.value}”.`;
    const falseValue = distractors(atom, atoms, seed)[0] ?? "not recorded";
    const isTrue = variant % 2 === 0;
    return { ...base, prompt: isTrue ? `${trueStatement} True or false?` : `This record's ${atom.field} is “${falseValue}”. True or false?`, choices: ["True", "False"], answer: isTrue ? "True" : "False", explanation: trueStatement };
  }
  if (format === "pick-the-real-rule" || format === "scenario") {
    if (!atom.lesson) return null;
    return { ...base, prompt: format === "scenario" ? `You are about to repeat this situation. Which saved rule applies?` : "Which rule is actually written in your evidence?", choices: choicesFor(atom.value), answer: atom.value, explanation: `Your saved lesson says: “${atom.value}”` };
  }
  if (format === "reverse-recall") {
    const answer = atom.date || atom.pin;
    if (!atom.date) return null;
    return { ...base, prompt: `Which recorded date is pinned to this ${atom.field}: “${atom.value}”?`, choices: shuffle([answer, ...shuffle(atoms.filter((other) => other.date && other.date !== answer).map((other) => other.date), seed).slice(0, 3)], seed), answer, explanation: `This fact comes from the ${answer} journal entry.` };
  }
  if (format === "spot-the-flaw") {
    const fake = distractors(atom, atoms, seed)[0];
    if (!fake) return null;
    const answer = `The ${atom.field} is wrong — it is ${atom.value}.`;
    return { ...base, mode: "mistake-hunter", prompt: `Spot the flaw: “This trade's ${atom.field} was ${fake}.”`, choices: shuffle([answer, "The date is wrong.", "There is no flaw."], seed), answer, explanation: `The evidence records ${atom.field} as ${atom.value}.` };
  }
  return null;
}

export function buildFactDeck(atoms: FactAtom[], options: { difficulty?: TimeMachineCard["difficulty"]; runSeed?: string; seenQuestions?: { factId: string; format: string; variant: number; date: string }[] }): TimeMachineCard[] {
  const seed = hash(options.runSeed || `${Date.now()}:${Math.random()}`);
  const candidates: TimeMachineCard[] = [];
  atoms.forEach((atom, index) => FORMATS.forEach((format, offset) => {
    const variant = (seed + index * 7 + offset * 11) % 4;
    const card = cardFromFact(atom, atoms, format, variant, seed + index + offset);
    if (card) candidates.push({ ...card, difficulty: options.difficulty ?? "recognition" });
  }));
  const seen = new Set((options.seenQuestions ?? []).map((item) => `${item.factId}:${item.format}:${item.variant}`));
  const unseen = candidates.filter((card) => !seen.has(`${card.factId}:${card.format}:${card.variant}`));
  return shuffle(unseen.length ? unseen : candidates, seed).filter((card, index, all) => all.findIndex((other) => questionKey(other) === questionKey(card)) === index);
}
