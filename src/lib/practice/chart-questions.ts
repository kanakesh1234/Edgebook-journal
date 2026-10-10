/**
 * Per-trade question builder (Time Machine / Matrix / Boss).
 *
 * Every answer is computed from fields the trader recorded. Screenshots are
 * the visual cue shown above the question — answers are never read off a chart.
 *
 * Question families (each has a stable id so the no-repeat ledger works):
 *   recall      side, setup, entry window, instrument, rank
 *   notes       fill-the-blank and pick-the-real-note, built from the
 *               trader's OWN review text (why entered, lessons, mistakes…)
 *   behaviour   which process flags were recorded on this trade
 *   patterns    repeated-mistake questions across trades — how often, which
 *               other day, and what it cost in total
 *   timing      first-hour entry, earlier/later than average, hold time
 *   chart math  risk points, planned R:R, capture %, points left to target,
 *               per-contract P&L, dollars risked
 *   management  how the trade ended vs stop and target (needs Compare)
 */
import type { JournalEntry } from "@/lib/types";
import { PLAN_EMOTIONS } from "@/lib/types";
import { formatDateMedium } from "@/lib/format";
import type { Rng } from "./math/rng";
import type { PracticeQuestion } from "./engine";
import {
  cap, choiceQ, clockMinutes, fmtMoney, hasShots, hourOf, isNum, nearMoney, numberQ, round, shuffle, sideOf, windowLabel,
} from "./qbuild";
import { framedQuestions } from "./framing";
import { focusOf } from "./focus";

/* ------------------------------------------------------------------ */
/*  Field catalogues                                                   */
/* ------------------------------------------------------------------ */

interface Flag { key: string; phrase: string; mistake: boolean; get: (e: JournalEntry) => boolean | null | undefined }

const FLAGS: Flag[] = [
  { key: "moved-stop", phrase: "moved your stop", mistake: true, get: (e) => e.review?.execution?.movedStop },
  { key: "exited-early", phrase: "exited early", mistake: true, get: (e) => e.review?.execution?.exitedEarly },
  { key: "chased", phrase: "chased the entry", mistake: true, get: (e) => e.review?.execution?.chased },
  { key: "fomo", phrase: "felt FOMO before entering", mistake: true, get: (e) => e.review?.psychology?.fomo ?? e.review?.postLossGate?.fomo },
  { key: "revenge", phrase: "were trading for revenge after a loss", mistake: true, get: (e) => e.review?.psychology?.revenge ?? e.review?.postLossGate?.revenge },
  { key: "fear-exit", phrase: "exited out of fear", mistake: true, get: (e) => e.review?.psychology?.fearExit },
  { key: "make-it-back", phrase: "were trying to make money back", mistake: true, get: (e) => e.review?.psychology?.makeItBack },
  { key: "respected-stop", phrase: "respected your original stop", mistake: false, get: (e) => e.review?.execution?.followedStop },
  { key: "right-time", phrase: "entered at the correct time", mistake: false, get: (e) => e.review?.execution?.correctTime },
  { key: "planned", phrase: "had planned this trade in advance", mistake: false, get: (e) => e.review?.execution?.planned },
  {
    key: "followed-plan", phrase: "followed your plan", mistake: false,
    get: (e) => (typeof e.review?.outcome?.followedPlan === "boolean" ? e.review.outcome.followedPlan : e.reflection?.followedSetup),
  },
];

interface TextField { key: string; label: string; kind: "mistake" | "good" | "neutral"; get: (e: JournalEntry) => string | undefined }

const TEXT_FIELDS: TextField[] = [
  { key: "why", label: "why you entered", kind: "neutral", get: (e) => e.review?.execution?.whyEntered },
  { key: "liq", label: "the liquidity you identified", kind: "neutral", get: (e) => e.review?.setup?.liquiditySwept },
  { key: "smt", label: "your SMT evidence", kind: "neutral", get: (e) => e.review?.setup?.smtEvidence },
  { key: "target", label: "your target", kind: "neutral", get: (e) => e.review?.setup?.targetDescription },
  { key: "manip", label: "the manipulation you identified", kind: "neutral", get: (e) => e.review?.setup?.manipulationIdentified },
  { key: "strong", label: "your strongest evidence", kind: "good", get: (e) => e.review?.followUp?.strongestEvidence },
  // The Autopsy stores its one-line lesson here and the older review flow stored the biggest mistake, so name it for both.
  { key: "mistake", label: "your mistake or lesson note", kind: "mistake", get: (e) => e.review?.followUp?.biggestMistake },
  { key: "mistakeNote", label: "what went wrong", kind: "mistake", get: (e) => e.review?.followUp?.mistakeNote },
  { key: "applied", label: "the concept you applied", kind: "good", get: (e) => e.review?.followUp?.conceptApplied },
  { key: "misunderstood", label: "the concept you misunderstood", kind: "mistake", get: (e) => e.review?.followUp?.conceptMisunderstood },
  { key: "watch", label: "what you wanted to watch next time", kind: "neutral", get: (e) => e.review?.followUp?.watchNext },
  { key: "learned", label: "what you learned", kind: "good", get: (e) => e.review?.concepts?.learned },
  { key: "improve", label: "what you wanted to improve", kind: "mistake", get: (e) => e.review?.concepts?.improve },
  { key: "well", label: "what went well", kind: "good", get: (e) => e.reflection?.wentWell },
  { key: "poorly", label: "what went poorly", kind: "mistake", get: (e) => e.reflection?.wentPoorly },
  { key: "cause", label: "what caused the result", kind: "neutral", get: (e) => e.reflection?.cause },
  { key: "lesson", label: "your lesson", kind: "neutral", get: (e) => e.reflection?.lesson },
  { key: "deviations", label: "how you deviated from the plan", kind: "mistake", get: (e) => e.review?.plannedVsActual?.deviations },
  { key: "insight", label: "your compare insight", kind: "neutral", get: (e) => e.review?.compareInsight },
  { key: "notes", label: "your trade notes", kind: "neutral", get: (e) => e.notes },
];

const STOP_WORDS = new Set([
  "about", "because", "should", "would", "could", "which", "there", "their", "other", "being", "while", "these", "those",
  "where", "after", "before", "again", "still", "really", "going", "think", "thought", "trade", "trades",
]);
const FILLER_WORDS = ["patience", "confirmation", "discipline", "structure", "liquidity", "target", "entry", "stop", "setup"];
const GENERIC_SETUPS = ["Opening range breakout", "Liquidity sweep reversal", "Trend pullback", "News fade", "Range fade"];
const POINT_VALUE: Array<[RegExp, number]> = [[/\bMNQ/i, 2], [/\bMES/i, 5], [/\bNQ/i, 20], [/\bES/i, 50]];

export const MATH_TAGS = new Set(["planned-rr", "r-dollars", "points", "risk-pts", "capture", "left-on-table", "per-contract", "risk-dollars", "hold-time"]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const clean = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length >= 25 ? text : null;
};
const clip = (text: string, max = 120) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
const word = (w: string) => w.replace(/[^\w'-]/g, "");
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(Math.round(minutes % 60)).padStart(2, "0")}`;

function wordsOf(text: string): string[] {
  return text.split(/\s+/).map(word).filter((w) => w.length >= 5 && !STOP_WORDS.has(w.toLowerCase()));
}

/** Words written by the trader elsewhere in the journal — plausible wrong answers. */
function borrowedWords(all: JournalEntry[], hiddenLower: string): string[] {
  const out = new Set<string>();
  for (const trade of all) for (const field of TEXT_FIELDS) {
    const text = clean(field.get(trade));
    if (text) for (const w of wordsOf(text)) if (w.toLowerCase() !== hiddenLower) out.add(w.toLowerCase());
  }
  return [...out];
}

const outcomeWord = (entry: JournalEntry) => (entry.pnl > 0 ? "a winner" : entry.pnl < 0 ? "a loser" : "break-even");

/* ------------------------------------------------------------------ */
/*  The builder                                                        */
/* ------------------------------------------------------------------ */

export function buildTradeQuestions(entry: JournalEntry, all: JournalEntry[], rng: Rng, pin: string): PracticeQuestion[] {
  const out: Array<PracticeQuestion | null> = [];
  const T = entry.id;
  const id = (suffix: string) => `${T}:${suffix}`;
  const chart = hasShots(entry);
  const look = (text: string) => (chart ? `Look at the chart above. ${text}` : text);
  const dateLabel = formatDateMedium(entry.date);
  const peers = all.filter((e) => e.id !== entry.id);

  /* ---------- recall (L1–L2) ---------- */
  const side = sideOf(entry);
  if (side) {
    const answer = cap(side);
    out.push(choiceQ(id("side"), T, "direction", 1, pin, look("Which side did you take on this trade?"), answer, [answer === "Long" ? "Short" : "Long"], `Your journal records this trade as ${answer}.`, rng));
  }
  out.push(choiceQ(id("outcome"), T, "outcome", 1, pin, look("How did this trade finish?"), entry.pnl > 0 ? "Win" : entry.pnl < 0 ? "Loss" : "Break-even", ["Win", "Loss", "Break-even"], `Recorded P&L is ${fmtMoney(entry.pnl)}.`, rng));
  if (entry.pnl !== 0) {
    out.push(choiceQ(id("pnl"), T, "pnl", 2, pin, look("What P&L did you record on this trade?"), fmtMoney(entry.pnl), nearMoney(entry.pnl, 2, rng), `Recorded P&L is ${fmtMoney(entry.pnl)}.`, rng));
  }
  const setup = entry.setup?.trim();
  if (setup) {
    const others = [...new Set(all.map((e) => e.setup?.trim()).filter((s): s is string => !!s && s !== setup))];
    const pool = others.length >= 2 ? others : [...others, ...GENERIC_SETUPS.filter((g) => g !== setup)];
    out.push(choiceQ(id("setup"), T, "setup", 2, pin, look("Which setup did you tag this trade with?"), setup, shuffle(pool, rng), `Setup recorded: ${setup}.`, rng));
  }
  const hour = hourOf(entry);
  if (hour != null) {
    const others = [9, 10, 11, 13, 14, 15].filter((h) => h !== hour);
    out.push(choiceQ(id("window"), T, "time-window", 2, pin, look("In which time window did you enter?"), windowLabel(hour), shuffle(others, rng).map(windowLabel), `Entry time recorded: ${entry.entryTime} NY.`, rng));
  }
  const ranked = all.filter((e) => isNum(e.pnl));
  if (ranked.length >= 3) {
    const order = [...ranked].sort((a, b) => b.pnl - a.pnl);
    const position = order.findIndex((e) => e.id === entry.id);
    if (position >= 0) {
      const label = position === 0 ? "My best trade" : position === order.length - 1 ? "My worst trade" : "Somewhere in the middle";
      out.push(choiceQ(id("rank"), T, "rank", 2, pin, `Among your ${ranked.length} recorded trades, where does this one rank by P&L?`, label, ["My best trade", "My worst trade", "Somewhere in the middle"], `Ranked ${position + 1} of ${order.length} by P&L.`, rng));
    }
  }
  const sameDay = all.filter((e) => e.date === entry.date && isNum(e.pnl));
  if (sameDay.length > 1) {
    out.push(numberQ(id("day-trades"), T, "day-count", 2, pin, `How many trades did you record on ${dateLabel}?`, sameDay.length, 0, "", `${sameDay.length} recorded trades share this date.`));
    const net = sameDay.reduce((sum, t) => sum + t.pnl, 0);
    out.push(numberQ(id("day-net"), T, "day-net", 3, pin, `What was your combined P&L across all ${sameDay.length} trades on ${dateLabel}?`, net, Math.max(1, Math.abs(net) * 0.01), "$", `Adding the day's trades gives ${fmtMoney(round(net))}.`));
  }

  /* ---------- notes: fill-the-blank + pick-the-real-note ---------- */
  for (const field of TEXT_FIELDS) {
    const text = clean(field.get(entry));
    if (!text) continue;
    const display = clip(text, 220);

    // Fill the blank — hide one meaningful word of the trader's own sentence.
    const eligible = display.split(/\s+/).map((w, i) => ({ w: word(w), i })).filter(({ w, i }) => i > 0 && w.length >= 5 && !STOP_WORDS.has(w.toLowerCase()));
    if (eligible.length) {
      const chosen = eligible[rng.int(0, eligible.length - 1)]!;
      const blanked = display.split(/\s+/).map((w, i) => (i === chosen.i ? "____" : w)).join(" ");
      const wrong = shuffle(borrowedWords(all, chosen.w.toLowerCase()), rng).slice(0, 3);
      const fillers = FILLER_WORDS.filter((f) => f !== chosen.w.toLowerCase());
      const q = choiceQ(
        id(`cloze-${field.key}`), T, "recall-note", display.length > 90 ? 3 : 2, pin,
        `Complete what you wrote about ${field.label}: “${blanked}”`, chosen.w, [...wrong, ...shuffle(fillers, rng)],
        `You wrote: “${display}”`, rng,
      );
      out.push(q);
    }

    // Pick the real note — your own sentence vs. other things you wrote.
    const sameField = peers.map((p) => clean(field.get(p))).filter((t): t is string => !!t && t !== text).map((t) => clip(t, 110));
    const sameTrade = TEXT_FIELDS
      .filter((f) => f.key !== field.key && f.kind !== field.kind)
      .map((f) => clean(f.get(entry)))
      .filter((t): t is string => !!t && t !== text)
      .map((t) => clip(t, 110));
    const distractors = [...new Set([...shuffle(sameField, rng), ...shuffle(sameTrade, rng)])].filter((t) => t !== clip(text, 110));
    if (distractors.length >= 2) {
      out.push(choiceQ(
        id(`note-${field.key}`), T, "recall-note", 3, pin,
        `Which of these did you actually write as ${field.label} on this trade?`, clip(text, 110), distractors,
        `You wrote: “${display}”`, rng,
      ));
    }
  }

  /* ---------- behaviour flags ---------- */
  const recorded = FLAGS.map((f) => ({ f, v: f.get(entry) })).filter((x): x is { f: Flag; v: boolean } => typeof x.v === "boolean");
  for (const mistake of [true, false]) {
    const group = recorded.filter((x) => x.f.mistake === mistake);
    const yes = group.filter((x) => x.v);
    const no = [...group, ...recorded.filter((x) => x.f.mistake !== mistake)].filter((x) => !x.v);
    if (yes.length && no.length >= 2) {
      const pick = yes[rng.int(0, yes.length - 1)]!;
      out.push(choiceQ(
        id(mistake ? "flags-mistake" : "flags-good"), T, "process-flag", 2, pin,
        look("Which of these statements did your review record about this trade?"),
        `You ${pick.f.phrase}`, shuffle(no, rng).map((x) => `You ${x.f.phrase}`),
        `Your review recorded that you ${pick.f.phrase}.`, rng,
      ));
    }
  }
  const emotion = entry.review?.psychology?.emotionBefore?.trim();
  if (emotion) {
    const upper = emotion.toUpperCase();
    const others = [...new Set([...peers.map((p) => p.review?.psychology?.emotionBefore?.trim().toUpperCase()), ...PLAN_EMOTIONS].filter((e): e is string => !!e && e !== upper && e !== "OTHER"))];
    out.push(choiceQ(id("emotion"), T, "psychology", 2, pin, look("What emotional state did you record before this trade?"), upper, shuffle(others, rng), `Your review recorded “${emotion}” before entry.`, rng));
  }
  const drive = entry.review?.psychology?.convictionOrUrgency;
  if (drive === "conviction" || drive === "urgency") {
    out.push(choiceQ(id("drive"), T, "psychology", 2, pin, look("Did you mark this entry as driven by conviction or urgency?"), cap(drive), ["Conviction", "Urgency"], `You recorded ${drive}. Urgency is a warning sign; conviction comes from the plan.`, rng));
  }
  const verdict = entry.review?.outcome?.processVerdict;
  if (verdict) {
    const labels: Record<string, string> = { "a-plus": "A+ execution", "process-success": "Good process", "process-failure": "Process failure" };
    const answer = labels[verdict];
    if (answer) out.push(choiceQ(id("verdict"), T, "process", 3, pin, `This trade finished as ${outcomeWord(entry)}. Judging process — not P&L — how did you grade it?`, answer, Object.values(labels), `You graded the process as “${answer}”. P&L and process are judged separately.`, rng));
  }

  /* ---------- repeated-mistake patterns across trades ---------- */
  for (const flag of FLAGS.filter((f) => f.mistake)) {
    if (flag.get(entry) !== true) continue;
    const withRecord = all.filter((e) => typeof flag.get(e) === "boolean");
    const flagged = withRecord.filter((e) => flag.get(e) === true);
    if (flagged.length < 2) continue;
    const dates = flagged.map((e) => formatDateMedium(e.date)).join(", ");
    out.push(numberQ(
      id(`repeat-count-${flag.key}`), T, "repeat-mistake", 3, pin,
      `You recorded that you ${flag.phrase} on this trade. On how many of your ${withRecord.length} reviewed trades did you record the same thing?`,
      flagged.length, 0, "trades", `It shows up on ${flagged.length} trades: ${dates}.`,
    ));
    const others = flagged.filter((e) => e.id !== entry.id);
    const clear = withRecord.filter((e) => flag.get(e) === false);
    if (others.length && clear.length) {
      const answerTrade = others[rng.int(0, others.length - 1)]!;
      const answerDate = formatDateMedium(answerTrade.date);
      const wrongDates = clear.map((e) => formatDateMedium(e.date)).filter((d) => d !== answerDate);
      out.push(choiceQ(
        id(`repeat-day-${flag.key}`), T, "repeat-mistake", 3, pin,
        `Besides this trade, on which day did you also record that you ${flag.phrase}?`, answerDate, shuffle(wrongDates, rng),
        `You also recorded it on ${answerDate} (${fmtMoney(answerTrade.pnl)}).`, rng, { chartTradeIds: [entry.id, answerTrade.id] },
      ));
    }
    const total = flagged.reduce((sum, e) => sum + e.pnl, 0);
    out.push(numberQ(
      id(`repeat-cost-${flag.key}`), T, "repeat-cost", 4, pin,
      `Add up the P&L of every trade where you ${flag.phrase}. What is the total?`,
      total, Math.max(1, Math.abs(total) * 0.01), "$",
      `${flagged.map((e) => `${formatDateMedium(e.date)} ${fmtMoney(e.pnl)}`).join(" + ")} = ${fmtMoney(round(total))}.`,
      { chartTradeIds: flagged.slice(0, 4).map((e) => e.id) },
    ));
  }

  /* ---------- timing ---------- */
  const entryMin = clockMinutes(entry.entryTime);
  const exitMin = clockMinutes(entry.exitTime);
  if (entryMin != null) {
    const inFirstHour = entryMin >= 9 * 60 + 30 && entryMin < 10 * 60 + 30;
    out.push(choiceQ(id("open-hour"), T, "time-window", 2, pin, look("Was your entry inside the first 60 minutes of the NY cash open (09:30–10:30)?"), inFirstHour ? "Yes" : "No", ["Yes", "No"], `Entry time recorded: ${entry.entryTime} NY.`, rng));
    const times = all.map((e) => clockMinutes(e.entryTime)).filter((m): m is number => m != null);
    if (times.length >= 3) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      if (Math.abs(entryMin - avg) >= 5) {
        out.push(choiceQ(id("earlier-later"), T, "time-window", 3, pin, look(`Your average entry across ${times.length} trades is ${hhmm(avg)} NY. Was this entry earlier or later than your average?`), entryMin < avg ? "Earlier" : "Later", ["Earlier", "Later"], `You entered at ${entry.entryTime}; your average is ${hhmm(avg)}.`, rng));
      }
    }
  }
  if (entryMin != null && exitMin != null && exitMin >= entryMin) {
    out.push(numberQ(id("hold"), T, "hold-time", 2, pin, `You entered at ${entry.entryTime} and exited at ${entry.exitTime}. How many minutes did you hold?`, exitMin - entryMin, 0, "min", `${entry.exitTime} − ${entry.entryTime} = ${exitMin - entryMin} minutes.`, { group: "math", compareHint: true }));
  }

  /* ---------- chart math ---------- */
  const { entryPrice: ep, stopLoss: sl, takeProfit: tp, exitPrice: xp } = entry;
  const longShort = side?.toLowerCase();
  if (isNum(ep) && isNum(sl) && ep !== sl) {
    const risk = Math.abs(ep - sl);
    out.push(numberQ(id("risk-pts"), T, "risk-pts", 3, pin, `Entry ${ep}, stop ${sl}. How many points of risk did you take?`, risk, 0.25, "pts", `|${ep} − ${sl}| = ${round(risk)} points.`, { group: "math" }));
    if (isNum(tp)) {
      const reward = Math.abs(tp - ep);
      out.push(numberQ(id("planned-rr"), T, "planned-rr", 3, pin, `Entry ${ep}, stop ${sl}, target ${tp}. What was the planned reward-to-risk (in R)?`, reward / risk, 0.05, "R", `Reward ${round(reward)} ÷ risk ${round(risk)} = ${round(reward / risk)}R.`, { group: "math" }));
      if (isNum(entry.rr) && entry.rr > 0 && reward / risk > 0) {
        const planned = reward / risk;
        out.push(numberQ(id("capture"), T, "capture", 4, pin, `You planned ${round(planned)}R and realized ${entry.rr}R. What percentage of the planned reward did you capture?`, (entry.rr / planned) * 100, 1, "%", `${entry.rr} ÷ ${round(planned)} = ${round((entry.rr / planned) * 100, 1)}%.`, { group: "math", compareHint: true }));
      }
    }
    const mult = POINT_VALUE.find(([re]) => re.test(entry.instrument ?? ""))?.[1];
    if (mult && isNum(entry.quantity) && entry.quantity > 0) {
      out.push(numberQ(id("risk-dollars"), T, "risk-dollars", 3, pin, `Your stop was ${round(risk)} points away on ${entry.instrument} with ${entry.quantity} contract${entry.quantity === 1 ? "" : "s"} ($${mult} per point per contract). How many dollars were you risking?`, risk * mult * entry.quantity, 1, "$", `${round(risk)} pts × $${mult} × ${entry.quantity} = $${round(risk * mult * entry.quantity)}.`, { group: "math" }));
    }
  }
  if (isNum(ep) && isNum(xp) && longShort) {
    const points = longShort === "short" ? ep - xp : xp - ep;
    out.push(numberQ(id("points"), T, "points", 3, pin, `Entry ${ep}, exit ${xp} on a ${longShort} trade. How many points did you gain (negative if you lost)?`, points, 0.25, "pts", `${longShort === "short" ? "Short = entry − exit" : "Long = exit − entry"} = ${round(points)} points.`, { group: "math", compareHint: true }));
    if (isNum(tp)) {
      const left = longShort === "short" ? xp - tp : tp - xp;
      if (left > 0) out.push(numberQ(id("left-on-table"), T, "left-on-table", 3, pin, `You exited at ${xp} and your target was ${tp} on a ${longShort} trade. How many points were still left to target?`, left, 0.25, "pts", `${longShort === "short" ? `${xp} − ${tp}` : `${tp} − ${xp}`} = ${round(left)} points.`, { group: "math", compareHint: true }));
    }
  }
  if (isNum(entry.rr) && Math.abs(entry.rr) > 0 && Math.abs(Math.abs(entry.rr) - 1) > 0.1 && entry.pnl !== 0) {
    const oneR = Math.abs(entry.pnl / entry.rr);
    out.push(numberQ(id("r-dollars"), T, "r-dollars", 3, pin, `This trade made ${fmtMoney(entry.pnl)} at ${entry.rr}R. How many dollars was 1R?`, oneR, Math.max(1, oneR * 0.02), "$", `|${fmtMoney(entry.pnl)}| ÷ |${entry.rr}R| = $${round(oneR)} per R.`, { group: "math" }));
  }
  if (isNum(entry.quantity) && entry.quantity > 1 && entry.pnl !== 0) {
    out.push(numberQ(id("per-contract"), T, "per-contract", 3, pin, `You traded ${entry.quantity} contracts and made ${fmtMoney(entry.pnl)}. What was the P&L per contract?`, entry.pnl / entry.quantity, 0.5, "$", `${fmtMoney(entry.pnl)} ÷ ${entry.quantity} = ${fmtMoney(round(entry.pnl / entry.quantity))}.`, { group: "math" }));
  }

  /* ---------- management (needs the second chart) ---------- */
  if (isNum(ep) && isNum(sl) && isNum(tp) && isNum(xp) && longShort) {
    const isLong = longShort !== "short";
    const stopped = isLong ? xp <= sl : xp >= sl;
    const hitTarget = isLong ? xp >= tp : xp <= tp;
    const inProfit = isLong ? xp > ep : xp < ep;
    const verdict = stopped ? "Stopped out" : hitTarget ? "Hit the target" : inProfit ? "Exited early in profit" : "Exited early at a loss";
    out.push(choiceQ(
      id("ended"), T, "management", 2, pin,
      "Open Compare and study the management chart. How did this trade end relative to your stop and target?",
      verdict, ["Stopped out", "Hit the target", "Exited early in profit", "Exited early at a loss"],
      `Entry ${ep}, stop ${sl}, target ${tp}, exit ${xp} → ${verdict.toLowerCase()}.`, rng, { compareHint: true },
    ));
  }

  // Adaptive framing: extra questions that depend on how this trade went (mistakes, their cost, repeats, typed answers).
  out.push(...framedQuestions(entry, all, rng, pin));

  const ready = out.filter((q): q is PracticeQuestion => q != null);
  const kind = focusOf(entry, all).kind;
  for (const q of ready) {
    if (!q.group) q.group = MATH_TAGS.has(q.tag) ? "math" : "tm";
    if (!q.chartTradeIds) q.chartTradeIds = [entry.id];
    q.focus = kind;
  }
  return ready;
}

