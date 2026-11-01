/**
 * LANE — the instant, zero-cost decision that comes before everything else.
 *
 *   chat  → a normal message ("good morning", "thanks", "what is a fair value gap?").
 *           Goes straight to the model with a tiny prompt. No journal, no memory dump.
 *   calc  → an ideal / hypothetical calculation ("1:2 RR at 45% win rate — expectancy?").
 *           The numbers come from deterministic math on what the trader typed; the model only phrases them.
 *   data  → the question is about THEIR trades, stats, patterns or plan. Only this lane reads the journal,
 *           and even then the context router sends just the slice the question needs.
 *
 * Pure and dependency-free so the client (to decide what to upload) and the server (to decide what to read)
 * always agree. The model can still escalate a chat/calc message to `data` by answering `[[JOURNAL]]`.
 */

export type Lane = "chat" | "calc" | "data";

export interface LaneResult {
  lane: Lane;
  reason: string;
}

export interface LaneOptions {
  /** A trade is open in Minato's focus (e.g. launched from a trade). */
  hasFocus?: boolean;
  /** Lane of the previous turn, so short follow-ups ("why?") stay in the same conversation. */
  prevLane?: Lane | null;
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}\s%$:/.'+\-&]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const words = (t: string) => (t ? t.split(" ").length : 0);

/* ---------------------------- the trader's own data ---------------------------- */

const OWN = "(?:my|mine|our|me)";
const THING =
  "(?:trades?|trading|journal|win ?rate|p ?& ?l|pnl|profit|profits|loss|losses|setups?|edge|stats?|statistics|performance|drawdown|equity|balance|account|challenge|plans?|mistakes?|patterns?|habits?|reviews?|sessions?|streaks?|risk|rules?|entries|entry|exits?|stops?|results?|numbers|progress|process|discipline|consistency|journal)";

const DATA: RegExp[] = [
  new RegExp(`\\b${OWN}\\b.{0,32}\\b${THING}\\b`),
  /\bhow am i (doing|trading|performing)\b/,
  /\bhow('?s| is| was) (my|the) (day|week|month|session|trading)\b/,
  /\b(last|latest|previous|recent|first|worst|best|biggest|longest|shortest) (\d{1,2} )?(trades?|entry|entries|loss|losses|win|wins|position|session|day|hold)\b/,
  /\b(today'?s?|yesterday'?s?|this (week|month|year)|last (week|month|year)) (trades?|session|results?|p ?& ?l|pnl|performance|numbers|journal|stats)\b/,
  /\b(review|autopsy|debrief|replay|dissect|critique)\b.{0,30}\b(trade|entry|session|day|week|month|loss|win|it|this|that)\b/,
  /\b(20\d{2}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})\b/,
  /\bwhy (did|do|am|have) i\b/,
  /\bwhat (did|have|am|do) i\b/,
  /\bam i (improving|overtrading|revenge|tilting|following|breaking|respecting|getting better|consistent)\b/,
  /\bcompare (my |two )?(periods?|months?|weeks?|sessions?|halves)\b/,
  /\bwhat should i (work on|improve|change|fix|focus on|stop|do (today|next|now))\b/,
  /\b(pre[- ]?session|game ?plan|trading plan|plan for (today|tomorrow|the (day|session|week))|today'?s plan|prep for)\b/,
  /\b(weekly|monthly|daily) (review|recap|summary|report)\b/,
  /\bwhat do you (know|remember)\b.{0,20}\b(me|my|about)\b/,
  /\b(compare|which|what('?s| is)) (my )?(best|worst) (setup|instrument|session|day|time|window|trade)\b/,
  /\bwith this win ?rate\b|\bat (my|this|the current) win ?rate\b|\bwith my (win ?rate|stats|numbers|average)\b/,
  /\b(following|followed|follow) (the |my )?plan\b/,
  /\bdrawdown (room|left|limit|used)|daily (loss )?limit|loss limit\b/,
  // "A+" is a review verdict the trader assigns to their own trades — it can only be answered from the journal.
  /(?:^|[^\p{L}\p{N}])a\s?\+|\ba[- ]plus\b/u,
  // Ranking questions over the trader's own categories, with or without "my": "best setup", "worst session".
  /\b(best|worst|top|strongest|weakest|most profitable|least profitable|most consistent)\b.{0,24}\b(setups?|instruments?|sessions?|windows?|days?|times?|hours?|trades?)\b/,
  // First-person trade verbs: "the setup I took", "what I traded", "the trade I lost".
  /\b(i|we) (took|traded|entered|exited|risked|lost|won|broke|followed|skipped|missed)\b/,
];

/* ------------------------------- ideal calculations ------------------------------- */

const CALC_WORD =
  /\b(expectancy|profit factor|break ?even|kelly|payoff|r[- ]?multiple|risk[- ]?(?:to[- ]?)?reward|reward[- ]?(?:to[- ]?)?risk|\brr\b|r:r|position siz\w*|lot size|how many (?:contracts|micros|minis|lots|shares)|contracts?\b|losing streak|win(?:ning)? streak|losses in a row|consecutive (?:loss\w*|win\w*)|streak|monte carlo|probability|odds|chances?|point value|tick value|pip value|risk per trade|compound\w*|\d+(?:\.\d+)?\s*%\s*of\s*\$?\d)/;
const HYPOTHETICAL = /\b(if|suppose|assume|assuming|say|let'?s say|ideal|ideally|hypothetical\w*|imagine|what if|given|for a|on a|with a|at a)\b/;
const HAS_NUMBER = /\d/;
// Explicit journal references always win; a bare "my" does not (it is just "what's my expectancy at 45% / 1:2").
const USES_JOURNAL = /\b(current|actual|real|journal|so far|lately|recently|my (trades|journal|stats|statistics|numbers|results|average|history|record))\b/;
// The message carries its own inputs, so no journal is needed.
const SELF_CONTAINED = /\d+(?:\.\d+)?\s*(?:%|percent)\s*(?:win|wr|accuracy)|win ?rate\s*(?:of|is|at|=)?\s*\d|\d\s*:\s*\d|\brr\b\s*(?:of|is|=)?\s*\d|\$\s*\d|\d+\s*(?:pt|pts|points)\b|\d+\s*(?:trades|losses)\b/;

/* ---------------------------------- plain chat ---------------------------------- */

const GREETING =
  /^(hi|hii+|hello|hey+|yo|sup|hola|namaste|gm|gn|good (morning|afternoon|evening|night|day)|morning|evening|what'?s up|wassup|howdy|thanks|thank you|thx|ty|cheers|ok(ay)?|cool|great|nice|awesome|perfect|got it|understood|sure|yes|yep|no|nope|bye|see you|later|how are you( doing)?|how'?s it going|what are you (doing|up to)|i('?m| am) asking what are you doing|are you there|who are you|what can you do|help$|i (had|have) a (doubt|question)|can i ask|may i ask|arey i('?m| am) saying)\b/;

const META_QUESTION =
  /\b(i (had|have) a (doubt|question)|can i ask( a (doubt|question)| you( something)?)?|may i ask|arey i('?m| am) saying)\b/;

export function classifyLane(text: string, opts: LaneOptions = {}): LaneResult {
  const t = norm(text);
  if (!t) return { lane: "chat", reason: "empty" };

  // 1. Plain greetings / thanks / acknowledgements / conversational meta-openings ("I had a doubt can I ask").
  if ((GREETING.test(t) || META_QUESTION.test(t)) && words(t) <= 12 && !DATA.some((re) => re.test(t))) {
    return { lane: "chat", reason: "greeting" };
  }

  // 2. The trader's own data → the only lane that touches the journal.
  if (DATA.some((re) => re.test(t))) return { lane: "data", reason: "own-data" };

  // 3. Ideal calculation: calculator words + numbers or a "what if" framing, and no reference to their own journal.
  if (CALC_WORD.test(t) && !USES_JOURNAL.test(t) && (SELF_CONTAINED.test(t) || (!/\b(my|mine|me)\b/.test(t) && (HAS_NUMBER.test(t) || HYPOTHETICAL.test(t))))) {
    return { lane: "calc", reason: "ideal-calc" };
  }

  // 4. A trade is open in focus and the message is a short follow-up about it.
  if (opts.hasFocus && words(t) <= 10) return { lane: "data", reason: "focus-trade" };

  // 5. Short follow-ups continue whichever lane the conversation was in.
  if (opts.prevLane && opts.prevLane !== "chat" && words(t) <= 5) {
    return { lane: opts.prevLane, reason: "follow-up" };
  }

  // 6. Everything else is conversation. The model asks one question if unsure, or escalates with [[JOURNAL]].
  return { lane: "chat", reason: "default" };
}

/** Deterministic one-line replies for when the model is unreachable — never a stats dump. */
export function quickReply(text: string, name: string): string | null {
  const t = norm(text);
  const who = name && name !== "Trader" ? `, ${name}` : "";
  if (META_QUESTION.test(t) && !DATA.some((re) => re.test(t))) {
    return `Of course${who} — go ahead and ask. What's on your mind?`;
  }
  if (/^(good )?morning\b|^gm\b/.test(t)) return `Good morning${who}. What are we working on?`;
  if (/^good afternoon\b/.test(t)) return `Good afternoon${who}. What are we working on?`;
  if (/^good evening\b/.test(t)) return `Good evening${who}. What are we working on?`;
  if (/^(good night|gn|bye|see you|later)\b/.test(t)) return `Rest well${who}. I'll be here.`;
  if (/^(thanks|thank you|thx|ty|cheers)\b/.test(t)) return "Anytime.";
  if (/\b(what are you (doing|up to)|what('?re| are) you doing)\b/.test(t)) {
    return `I'm right here${who} — ready whenever you want to review a trade, sharpen a concept, build a routine, or just talk through what's on your mind.`;
  }
  if (/^(how are you( doing)?|how'?s it going|are you there)\b/.test(t)) {
    return `Doing well${who} — ready whenever you want to review a trade, run numbers, or talk through what's on your mind.`;
  }
  if (/^(who are you|what can you do|help$)\b/.test(t)) {
    return `I'm Minato, your trading companion${who}. Ask me about a setup or calculation, or tell me to replay a trade, set a reminder, or open any section.`;
  }
  if (/^(hi|hii+|hello|hey+|yo|sup|hola|namaste|howdy|what'?s up|wassup)\b/.test(t)) return `Hey${who}. What's on your mind?`;
  if (/^(ok|okay|cool|great|nice|awesome|perfect|got it|understood|sure)\b/.test(t)) return "Got it.";
  return null;
}
