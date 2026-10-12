import type { MistakeKey } from "../mistakes";

/**
 * Rules engine for mistake tagging — the offline voter, and the safety net when AI is off.
 *
 * What makes it safer than plain keyword matching:
 *   • NEGATION   "I did NOT chase", "no FOMO today", "didn't move my stop" cancel the mistake instead of tagging it.
 *   • COUNTERFACTUAL  "I should NOT have moved my stop" keeps the mistake (the negation is regret, not denial).
 *   • TENSE      In forward-looking fields (lesson / improve / watch-next) "never chase again" and
 *                "wait for the sweep next time" are read as the mistake that happened, not as its absence.
 *   • ROLE       Text from "what went well" can only ever cancel a mistake, never create one.
 *   • EVIDENCE   Every hit carries the exact sentence it came from, so a tag can always be explained and verified.
 */

export type SourceRole =
  | "mistake-name" | "mistake-detail" | "went-poorly" | "cause" | "deviation" | "post-loss"
  | "lesson" | "improve" | "watch-next" | "psych-note" | "note" | "went-well";

/** Fields that talk about the NEXT trade ("never chase again"), where a negation is an instruction, not a denial. */
export const FORWARD_ROLES: ReadonlySet<SourceRole> = new Set(["lesson", "improve", "watch-next"]);

/** How much a role's words count. The trader's own naming of the mistake is the strongest; imported notes are the weakest. */
export const ROLE_WEIGHT: Record<SourceRole, number> = {
  "mistake-name": 1, "mistake-detail": 1, "went-poorly": 0.9, cause: 0.9, deviation: 0.9, "post-loss": 0.7,
  lesson: 0.75, improve: 0.75, "watch-next": 0.55, "psych-note": 0.6, note: 0.5, "went-well": 0,
};

type Rule = {
  key: MistakeKey;
  re: RegExp;
  weight: number;
  /** Intent rules describe a practice to adopt ("wait for the sweep"). They only apply to forward-looking fields (and, reversed, to "went well"). */
  intent?: boolean;
  /** If the sentence also matches this, the hit is dropped ("exited early" is not an early ENTRY). */
  veto?: RegExp;
};

/* ---------------------------------------------------------------------------------------------------------------------
 * Descriptive rules — what a trader writes about what they DID.
 * The first block keeps the original patterns (so older saved results and tests behave the same); the rest widen coverage.
 * ------------------------------------------------------------------------------------------------------------------- */
const DESCRIPTIVE: Rule[] = [
  { key: "revenge", weight: 3, re: /\b(revenge|win (it|that|the loss|money) back|make (it|that) back|get (it|my money) back|recover(ed|y)? (the )?loss|(win|make|get) back (the |my )?(loss|losses|money)|got even|pay(ing)? the market back|to get even|immediately re-?entered?|re-?entered? (right |immediately )?(after|to))\b/i },
  { key: "news", weight: 3, re: /\b(news|cpi|fomc|nfp|ppi|jobs report|powell|fed |rate decision|economic (event|calendar)|red folder|high[- ]impact|earnings|announcement)\b/i },
  { key: "stop", weight: 3, re: /\b(moved? (my |the )?(stop|sl)|widen(ed)? (my |the )?(stop|sl)|remov(ed|ing) (my |the )?(stop|sl)|no stop|stop[- ]?loss (was )?(moved|removed|ignored)|didn'?t honou?r (my |the )?stop|ignored (my |the )?stop|pulled (my |the )?stop|cancel(l?ed)? (my |the )?stop|dragged (my |the )?stop|stop (was )?(hit|run) but (i )?(held|stayed|kept)|let it (run )?past (my |the )?stop)\b/i },
  { key: "size", weight: 3, re: /\b(over ?siz(e|ed|ing)|too (big|large|many contracts|much size)|size was (too|way)|increased (my )?(size|contracts|lot)|double(d)? (my )?(size|position)|more contracts|big(ger)? size|risked too much|extra contracts?|\d+\s*(contracts?|lots?|shares)\s+(instead|rather|vs\.?|when)|instead of (my )?(usual |planned )?\d+|(bigger|larger|heavier) (position|lots?|contracts?)|(too )?(big|large) (a )?position|took (way )?(more|extra|too many) (contracts?|lots?|shares)|sized? up|upsiz(e|ed|ing)|full size|max(imum)? size|risked (more|\d+%)|more than (my )?(planned|usual|normal|allowed) (size|risk|contracts?|position))\b/i },
  { key: "fomo", weight: 3, re: /\b(fomo|fear of missing|missing out|afraid (it|price) would (go|run)|didn'?t want to miss|(jumped|hopped) (in|on) (out of|because of|from|due to) (fear|fomo)|everyone was buying|scared (it|price) would (leave|run|go) without)\b/i },
  { key: "chased", weight: 3, re: /\b(chas(e|ed|ing)|late entry|entered late|too late|already (ran|run|moved|pumped|dumped|extended)|bought the top|sold the bottom|extended (move|candle)|entered after (the |a )?(big |huge |strong )?(move|run|candle|expansion|displacement)|price (had )?already (moved|run|left)|missed the (move|entry) (and|so|then) (entered|bought|sold|jumped))\b/i },
  { key: "early", weight: 2.5, veto: /\b(exit(ed)?|clos(e|ed|ing)|cut|took (my )?profit|take (my )?profit|booked|sold|scaled)\b[^.;,]{0,24}\bearly\b|\bearly (in|at|on) (the )?(day|session|morning|open|week)|\b(too )?early (for|to) (a )?(news|session|killzone)\b/i,
    re: /\b(early|premature(ly)?|too soon|before (the )?(confirmation|close|sweep|setup|signal|retest|mss|displacement|fvg)|didn'?t wait|jumped the gun|anticipat(ed|ing)|without (a )?confirmation|no confirmation|unconfirmed|entered (on|at) (a )?(hunch|guess)|pre-?empt(ed|ing)|front[- ]?ran|before (it|price) (swept|closed|confirmed|retested|reached)|before (the |it |price )?(\d+ ?m(in)? )?(candle |bar )?(clos(e|ed)|swe(ep|pt)|confirm(ed|ation)|retest(ed)?))\b/i },
  { key: "overtrade", weight: 2.5, re: /\b(over ?trad(e|ed|ing)|too many trades|extra trade|third trade|3rd trade|trade #?3|trading for the sake|bored|forced (a )?trade|forcing|no setup|random trade|churn(ed|ing)?|took (another|one more|a third) trade|no (valid )?(setup|reason) (to|for)|just to (be in|have a) (a )?trade)\b/i },
  { key: "hesitation", weight: 2.5, re: /\b(hesitat|froze|freeze|frozen|second[- ]guess|missed (the )?(entry|trade|setup)|didn'?t (take|enter|pull)|waited too long|scared to (enter|pull|click)|skipped (a |the )?(valid|good|a\+)|late to (enter|click)|sat on my hands|chickened out|talked myself out|too (scared|afraid|nervous|fearful) to|didn'?t (trust|believe) (my )?(setup|plan|read|analysis)|watched (the |a )?(a\+ ?)?(setup|trade|move|price|it|entry)\b[^.;]{0,32}\b(go|ran|run|leave|left|fly|flew|play(ed)? out|work(ed)?|hit|win)|let (it|the (trade|setup|entry)) (go|pass|slip))\b/i },
  { key: "exit", weight: 3, re: /\b(exit(ed)? (too )?(early|late)|cut (my )?(winner|profit)s? (short|early)|took profit too|closed too (early|soon)|held (a |the |my )?(loser|loss|too long)|hold(ing)? (a )?loss|didn'?t (take|book) profit|gave back|let (a )?winner (turn|become)|left money|trail(ed)? (too|badly)|cut (a |the |my )?(winner|winning trade|profit)s?|(moved|went) to (break ?even|be) too (early|soon)|(scaled|took) (out )?too (early|soon)|(price|it) (then )?(ran|went|hit) (to )?(my )?(target|tp|\d+(\.\d+)? ?r)\b[^.;]{0,20}\bafter (i|I)|panic (closed|exited|sold|bailed)|bailed (out )?(too|early)|(closed|exited|bailed|cut)\b[^;,]{0,24}\bout of fear|(closed|exited) (out of )?fear)\b/i },
  { key: "risk", weight: 2.5, re: /\b(no (risk|stop|plan for risk)|risk management|risk (was )?(too|undefined|unclear)|exceed(ed)? (my )?(daily|day|max)? ?(loss|limit)|beyond (my )?(limit|daily)|broke (my )?(daily )?(loss|risk)|blew (past )?(my )?(limit|risk)|stop (was |is )?too (wide|far)|r:?r (was )?(bad|poor|too low)|bad risk[- ]reward|averag(ed|ing) down|added to (a |the |my )?(loser|losing)|doubled down|no defined (risk|stop|invalidation)|risked (the )?(whole|entire)|past (my )?(daily )?(max )?loss)\b/i },
  { key: "bias", weight: 2.5, re: /\b(against (the )?(daily |htf |higher[- ]timeframe |4h |weekly |overall )?(bias|trend|draw|narrative|direction)|counter[- ]?trend|fought (the )?(trend|bias|draw)|wrong (direction|side|bias)|ignor(ed|ing) (the )?(daily |htf |higher[- ]timeframe |4h |weekly )?(bias|trend|draw|narrative|direction)|traded (the )?opposite|shorted into (the )?(\w+ )?(support|demand|bullish|fvg|order ?block|ob)|bought into (the )?(\w+ )?(resistance|supply|bearish)|(without|no) (htf|higher[- ]timeframe|daily|4h) (confluence|bias|alignment|context))\b/i },
  { key: "timing", weight: 2.5, re: /\b(outside (the )?(session|window|killzone|hours)|wrong (time|session)|after (the )?(session|kill ?zone|11|noon|lunch)|before (9:?30|open)|pre[- ]?market|off[- ]?hours|asia session|too early in the day|late in the (day|session)|time rule|outside (my )?(trading )?(time|hours|window)|traded (at|during) (lunch|midday|the close|power hour)|after (my )?cut-?off)\b/i },
  { key: "tilt", weight: 2, re: /\b(tilt(ed)?|frustrat|angry|emotion(al)?|stress(ed)?|anxious|anxiety|panic(ked)?|greed(y)?|euphori|overconfiden|cocky|tired|exhaust|distract|mood|bad day|upset|impatien|impuls|gut feel|ego|emotionally|not (in )?(the )?(right )?(headspace|state of mind))\b/i },
  { key: "plan", weight: 2, re: /\b(broke (my |the )?(plan|rules?)|didn'?t follow|(not|wasn'?t|was not|isn'?t) (in|part of) (my |the )?(plan|playbook)|off[- ]plan|without (my |the )?(checklist|plan|rules)|ignored (my |the )?(plan|rules?|checklist)|deviat|skipped (the )?(checklist|rules?)|rule(s)? (violation|break)|unplanned|outside (my |the )?(plan|playbook)|not (an? )?(a\+|valid) setup|wasn'?t (a )?(valid |my )?setup|(took|traded) (a |an )?(non[- ]?playbook|unplanned)|entered without (my |the )?(checklist|plan))\b/i },
];

/* ---------------------------------------------------------------------------------------------------------------------
 * Intent rules — "what I will do next time", read backwards into the mistake they imply.
 * They only fire in forward-looking fields (lesson / improve / watch-next). In "went well" they fire reversed: as proof
 * the trader did the right thing, which cancels that mistake.
 * ------------------------------------------------------------------------------------------------------------------- */
const INTENT: Rule[] = [
  { key: "early", intent: true, weight: 2.5, re: /\b(wait(ed|ing)? for (the |a |my )?(\d+ ?m(in)? )?(confirmation|confirm|sweep|close|retest|displacement|mss|bos|choch|fvg|full setup|setup to|signal|entry model|candle)|let (price|it|the setup|the market) (come|develop|confirm|form|play out)|be (more )?patient|patience|don'?t (rush|jump in)|only enter (after|on|when|once)|enter only (after|on|when|once)|until (it|price|the setup) (confirm|form|close|sweep))\b/i },
  { key: "chased", intent: true, weight: 2.5, re: /\b(don'?t chase|never chase|stop chasing|let price come (to me|back)|wait for (a )?(pullback|retrace|retracement)|no chasing)\b/i },
  { key: "stop", intent: true, weight: 2.5, re: /\b(respect(ed)? (my |the )?(stop|stops|sl)|honou?r(ed)? (my |the )?(stop|stops|sl)|kept (my |the )?stop|never (move|widen|remove) (my |the )?(stop|sl)|keep (my |the )?stop|set (a |the )?hard stop|leave (my |the )?stop alone)\b/i },
  { key: "size", intent: true, weight: 2.5, re: /\b((stick|stuck) to (my )?(planned |normal |usual |fixed )?(size|position size|lot size|risk per trade)|reduce (my )?size|smaller size|(trade|size) (smaller|down)|fixed (size|risk)|size down|took (my )?(planned|normal|usual) size|size (as|was) planned|risk (only|just) \d)\b/i },
  { key: "exit", intent: true, weight: 2.5, re: /\b((take|took) (my )?profit|trail (my )?(stop )?(better|properly)|let (my )?winners? run|hold (to|until|for) (the )?target|stick to (the )?target|scale out|don'?t (cut|close|take) (winners|profit|it) (early|too))\b/i },
  { key: "revenge", intent: true, weight: 2.5, re: /\b(walk(ed)? away after (a )?loss|took a break|stop trading after|step away after|take a break after (a )?loss|no (re-?entry|trading) after (a )?loss|don'?t trade (to|for) (win|get) (it |money )?back|cool(ing)? off)\b/i },
  { key: "tilt", intent: true, weight: 2, re: /\b(stay(ed)? (calm|composed|disciplined)|was calm|control (my )?(emotions?|temper)|trade (calm|with a clear head)|don'?t trade (when|while) (tired|angry|upset|stressed)|manage (my )?emotions)\b/i },
  { key: "timing", intent: true, weight: 2.5, re: /\b(only trade (in|during) (the )?(ny|new york|london|kill ?zone|session|window)|trade only (in|during)|stay within (my )?(session|window|hours)|no trades (after|outside|before)|stick to (the )?(session|killzone|window|time))\b/i },
  { key: "news", intent: true, weight: 2.5, re: /\b(check(ed)? (the )?(calendar|news|economic)|avoid (trading )?(news|cpi|fomc|nfp)|stay out (of|during) news|sit out (news|cpi|fomc|nfp))\b/i },
  { key: "plan", intent: true, weight: 2, re: /\b(follow(ed)? (my )?(plan|rules|checklist)|(stick|stuck) to (the |my )?(plan|rules|checklist|playbook)|only (take|trade) (a\+|plan(ned)?|my setups?)|trade (the )?plan|review (the )?checklist)\b/i },
  { key: "overtrade", intent: true, weight: 2.5, re: /\b(only (take )?(one|two|1|2) trades?|limit (myself )?to (one|two|1|2) trades?|stop after (one|two|1|2)|quality over quantity|fewer trades|(no|don'?t take) (more than|extra) (two|2) trades)\b/i },
  { key: "hesitation", intent: true, weight: 2.5, re: /\b(pull the trigger|trust (my )?(setup|plan|process|analysis)|execute (the setup )?without hesitation|don'?t (second[- ]guess|overthink)|click the button)\b/i },
  { key: "risk", intent: true, weight: 2.5, re: /\b(define (my )?risk|always (use|set|have) (a )?stop|know (my )?risk (before|first)|risk (no more|max)|min(imum)? r:?r)\b/i },
  { key: "bias", intent: true, weight: 2.5, re: /\b(trade (with|in the direction of) (the )?(daily |htf |4h )?(bias|trend|draw)|check (the )?(htf|higher[- ]timeframe|daily|4h) (first|before)|align with (the )?(htf|bias|daily|4h)|respect (the )?(bias|htf|daily|trend))\b/i },
  { key: "fomo", intent: true, weight: 2.5, re: /\b(it'?s ok(ay)? to miss|no need to (rush|jump|chase)|another (trade|setup) will come|there'?s always (another|a next)|missing (a )?trade (is )?(ok|fine))\b/i },
];

export const RULES: readonly Rule[] = [...DESCRIPTIVE, ...INTENT];

/* ----------------------------------------------------------------- language helpers ----------------------------------------------------------------- */

const NEGATORS = /^(not|never|no|didn'?t|didnt|wasn'?t|wasnt|weren'?t|isn'?t|aren'?t|don'?t|dont|doesn'?t|won'?t|avoided|avoiding|resisted|resisting|refused|zero|nothing|none|n't)$/i;
// Deliberately NOT here: "without" — "traded without checking the news" is a mistake, not a denial.
const COUNTERFACTUAL = /\b(should(n'?t| not)? have|shouldn'?t have|wish i (had|hadn'?t)|if only|if i (had|hadn'?t)|could have|would have|had i\b|supposed to|meant to|needed to|ought to)\b/i;
const SCOPE_BREAK = /[,;:]|\b(?:but|however|though|although|yet|then|and|so|because|since|while|which)\b/i;

type Sentence = { text: string };
function sentences(text: string): Sentence[] {
  // Split on sentence punctuation only when whitespace follows, so "0.5R", "9.35" and "4.2k" stay in one piece.
  return text.split(/(?<=[.!?;])\s+|\n+/).map((s) => ({ text: s.trim() })).filter((s) => s.text.length > 1);
}

/** True when the words just before a match (inside the same clause) deny it: "did NOT chase", "no FOMO". */
function isNegated(before: string): boolean {
  const clause = before.split(SCOPE_BREAK).pop() ?? "";
  const words = clause.trim().split(/\s+/).filter(Boolean).slice(-4);
  return words.some((w) => NEGATORS.test(w.replace(/[^\p{L}'’]/gu, "").replace(/’/g, "'")));
}

/** Keeps a quote readable: the whole sentence, or a ~170-char window around the match. Always an exact substring of the source. */
function quoteAround(s: string, start: number, end: number): string {
  if (s.length <= 170) return s;
  let a = Math.max(0, start - 70), b = Math.min(s.length, end + 70);
  const sp = s.indexOf(" ", a); if (a > 0 && sp !== -1 && sp < start) a = sp + 1;
  const sp2 = s.lastIndexOf(" ", b); if (b < s.length && sp2 > end) b = sp2;
  return s.slice(a, b).trim();
}

/* -------------------------------------------------------------------- scanning -------------------------------------------------------------------- */

export type RuleHit = { key: MistakeKey; sourceId: string; role: SourceRole; quote: string; weight: number; negated: boolean; intent: boolean };
export type ScanSource = { id: string; role: SourceRole; text: string };

/** Every rule hit in one piece of text, already interpreted for negation, tense and role. `negated` hits are evidence AGAINST a mistake. */
export function scanText(src: ScanSource): RuleHit[] {
  const out: RuleHit[] = [];
  const forward = FORWARD_ROLES.has(src.role);
  const wentWell = src.role === "went-well";
  const seen = new Set<string>();
  for (const sentence of sentences(src.text)) {
    const counterfactual = COUNTERFACTUAL.test(sentence.text);
    for (const rule of RULES) {
      if (rule.intent && !forward && !wentWell) continue;
      if (rule.veto?.test(sentence.text)) continue;
      const re = new RegExp(rule.re.source, "gi");
      const m = re.exec(sentence.text);
      if (!m) continue;
      const negatedWords = isNegated(sentence.text.slice(0, m.index));
      let negated: boolean, weight = rule.weight;
      if (rule.intent) {
        // A practice to adopt. In "went well" it proves the mistake did NOT happen; in a lesson it implies it did.
        negated = wentWell;
        if (!wentWell) weight *= 0.8;
        if (!wentWell && negatedWords) continue; // "don't wait for confirmation" — unusual; do not guess
      } else if (forward) {
        // "never chase again", "don't move my stop" — an instruction, so the mistake is what is being corrected.
        negated = false;
        if (negatedWords) weight *= 0.8;
      } else {
        // Backward-looking. A denial cancels the mistake — unless it is regret ("I should NOT have moved my stop").
        negated = negatedWords && !counterfactual;
        if (wentWell && !negated) continue; // "went well" can only cancel a mistake, never create one
      }
      const quote = quoteAround(sentence.text, m.index, m.index + m[0].length);
      const id = `${rule.key}|${negated}|${quote}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ key: rule.key, sourceId: src.id, role: src.role, quote, weight, negated, intent: !!rule.intent });
    }
  }
  return out;
}

export type KeyScore = { key: MistakeKey; score: number; sources: string[]; hits: RuleHit[] };
export type RuleScan = { scores: KeyScore[]; counter: Map<MistakeKey, RuleHit[]> };

/** Reads every source, then scores each mistake: strongest hit per source × role weight, summed across sources (corroboration). */
export function scanSources(sources: ScanSource[]): RuleScan {
  const perKey = new Map<MistakeKey, Map<string, RuleHit & { eff: number }>>();
  const counter = new Map<MistakeKey, RuleHit[]>();
  for (const src of sources) {
    for (const h of scanText(src)) {
      if (h.negated) { counter.set(h.key, [...(counter.get(h.key) ?? []), h]); continue; }
      const eff = h.weight * ROLE_WEIGHT[h.role];
      if (eff <= 0) continue;
      const bySrc = perKey.get(h.key) ?? new Map();
      const cur = bySrc.get(h.sourceId);
      if (!cur || eff > cur.eff) bySrc.set(h.sourceId, { ...h, eff });
      perKey.set(h.key, bySrc);
    }
  }
  const scores: KeyScore[] = [...perKey].map(([key, bySrc]) => {
    const hits = [...bySrc.values()].sort((a, b) => b.eff - a.eff);
    return { key, score: Math.round(hits.reduce((s, h) => s + h.eff, 0) * 100) / 100, sources: hits.map((h) => h.sourceId), hits };
  }).sort((a, b) => b.score - a.score || b.sources.length - a.sources.length);
  return { scores, counter };
}
