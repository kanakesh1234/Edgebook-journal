import type { MistakeKey } from "../../src/lib/mistakes.ts";

/**
 * Golden set for mistake tagging — realistic trader wording with the tag a careful human reviewer would give.
 *
 * Used twice:
 *   • tests/journal/tagging.test.ts runs the OFFLINE rules against it on every `npm test` (no network);
 *   • scripts/eval-tagging.ts runs a LIVE model against the same cases, so you can measure a model before trusting it.
 *
 * It is a seed, not a verdict: written by hand, so measured accuracy on it is optimistic. Grow it from your own real
 * trades — every wrong tag you correct in the app is a new case (see TAGGING.md, "Keeping accuracy honest").
 *
 * `rules`: what the OFFLINE engine is allowed to do.
 *   "tag"    it must name `primary` (or one of `alsoOk`) — the wording is explicit enough.
 *   "silent" it must say nothing — the case needs real reading (Hinglish, a lesson alone, a denial) and guessing would be wrong.
 * `forbid`: tags that would be WRONG. No voter may ever produce these. This is the precision guarantee.
 */
export type GoldenField = "name" | "detail" | "poorly" | "cause" | "lesson" | "improve" | "well";
export type Golden = {
  id: string;
  /** What the trader picked in the autopsy: a quick-pick key, "other", or "none". */
  declared?: string;
  text: Partial<Record<GoldenField, string>>;
  /** Ground truth. null = there is no mistake in what was written. */
  primary: MistakeKey | null;
  secondary?: MistakeKey[];
  alsoOk?: MistakeKey[];
  forbid?: MistakeKey[];
  rules: "tag" | "silent";
  why: string;
};

export const GOLDEN: Golden[] = [
  // ---- explicit, single-field
  { id: "early-1", declared: "other", text: { name: "Entered before confirmation", detail: "Saw the wick and jumped in before the 5m closed" }, primary: "early", rules: "tag", why: "own name states it" },
  { id: "chased-1", declared: "other", text: { detail: "Price had already run 40 points and I bought the top" }, primary: "chased", rules: "tag", why: "after the move" },
  { id: "stop-1", declared: "other", text: { detail: "Price got close so I widened my stop by 10 points" }, primary: "stop", rules: "tag", why: "moved an existing stop" },
  { id: "size-1", declared: "other", text: { detail: "Took 4 contracts instead of my usual 2" }, primary: "size", rules: "tag", why: "quantity vs norm" },
  { id: "revenge-1", declared: "other", text: { detail: "Got stopped out and immediately re-entered to get it back" }, primary: "revenge", rules: "tag", why: "recover a loss right after" },
  { id: "overtrade-1", declared: "other", text: { detail: "Fourth trade of the day, no setup, I was just bored" }, primary: "overtrade", rules: "tag", why: "no setup, boredom" },
  { id: "news-1", declared: "other", text: { detail: "Didn't check the calendar, FOMC was at 2pm" }, primary: "news", rules: "tag", why: "traded through scheduled news" },
  { id: "hesitation-1", declared: "other", text: { detail: "I froze when the setup appeared and missed the entry" }, primary: "hesitation", rules: "tag", why: "froze on a valid setup" },
  { id: "exit-1", declared: "other", text: { detail: "Closed at 0.5R out of fear, price then hit my full target" }, primary: "exit", rules: "tag", why: "exit driven by fear" },
  { id: "risk-1", declared: "other", text: { detail: "No defined risk on this one, I just averaged down twice" }, primary: "risk", rules: "tag", why: "averaged down, undefined risk" },
  { id: "bias-1", declared: "other", text: { detail: "Daily bias was bearish and I bought anyway, fought the trend" }, primary: "bias", rules: "tag", why: "against HTF bias" },
  { id: "timing-1", declared: "other", text: { detail: "Traded at lunch, outside my window" }, primary: "timing", rules: "tag", why: "outside the planned window" },
  { id: "tilt-1", declared: "other", text: { detail: "I was angry and frustrated after the last trade" }, primary: "tilt", rules: "tag", why: "mood drove it" },
  { id: "plan-1", declared: "other", text: { detail: "Took a trade that wasn't in my playbook" }, primary: "plan", rules: "tag", why: "outside the playbook" },
  { id: "plan-2", declared: "other", text: { detail: "Won, but I took the trade without my checklist" }, primary: "plan", rules: "tag", why: "a win can hide a process failure" },
  { id: "exit-2", declared: "other", text: { detail: "Held the loser hoping it would come back" }, primary: "exit", rules: "tag", why: "held a loser" },
  { id: "risk-2", declared: "other", text: { detail: "Added to my loser to lower my average" }, primary: "risk", rules: "tag", why: "added to a loser" },
  { id: "bias-2", declared: "other", text: { detail: "I knew the bias was bearish but wanted a bounce, so I bought into resistance" }, primary: "bias", rules: "tag", why: "bought into resistance against bias" },
  { id: "size-2", declared: "other", text: { detail: "Doubled my position after the first loss" }, primary: "size", secondary: ["revenge"], alsoOk: ["revenge"], rules: "tag", why: "size is the concrete action" },
  { id: "risk-3", declared: "other", text: { detail: "Stop was too wide for the size, risk was too high" }, primary: "risk", rules: "tag", why: "undefined / oversized risk" },
  { id: "revenge-2", declared: "other", text: { detail: "Third trade was just to make back the loss" }, primary: "revenge", secondary: ["overtrade"], alsoOk: ["overtrade"], rules: "tag", why: "motive is recovering a loss" },

  // ---- corroboration across fields
  { id: "early-2", declared: "other", text: { detail: "Entered before the close of the candle", lesson: "Wait for the close next time" }, primary: "early", rules: "tag", why: "detail + lesson agree" },
  { id: "early-3", declared: "other", text: { poorly: "Took it before the sweep happened, wasn't patient" }, primary: "early", rules: "tag", why: "before the sweep" },

  // ---- NEGATION: the denied mistake must never be tagged
  { id: "neg-chase", declared: "none", text: { detail: "Did not chase, waited for the retest and got filled" }, primary: null, forbid: ["chased", "early"], rules: "silent", why: "denial" },
  { id: "neg-stop", declared: "none", text: { detail: "I didn't move my stop and it hit, clean loss" }, primary: null, forbid: ["stop"], rules: "silent", why: "denial" },
  { id: "neg-fomo", declared: "none", text: { detail: "Followed the plan, no FOMO, stop hit" }, primary: null, forbid: ["fomo", "plan"], rules: "silent", why: "denial" },
  { id: "neg-revenge", declared: "none", text: { poorly: "Not a revenge trade, I took a break first" }, primary: null, forbid: ["revenge"], rules: "silent", why: "denial" },
  { id: "neg-tilt", declared: "none", text: { poorly: "Wasn't tilted, I was calm the whole time" }, primary: null, forbid: ["tilt"], rules: "silent", why: "denial" },
  { id: "neg-hesitate", declared: "none", text: { poorly: "I never hesitate on A+ setups, I took it right away" }, primary: null, forbid: ["hesitation"], rules: "silent", why: "denial" },
  { id: "neg-well", declared: "none", text: { well: "Waited for the sweep, didn't chase, respected my stop" }, primary: null, forbid: ["early", "chased", "stop"], rules: "silent", why: "went-well can only cancel" },
  { id: "neg-mixed-well", declared: "other", text: { poorly: "Entered before the sweep completed", well: "Respected my stop, took size as planned" }, primary: "early", forbid: ["stop", "size"], rules: "tag", why: "went-well cancels stop/size, not early" },
  { id: "neg-then-pos", declared: "other", text: { detail: "Didn't chase but I entered before confirmation" }, primary: "early", forbid: ["chased"], rules: "tag", why: "one clause denied, the next affirmed" },

  // ---- REGRET reads as an affirmation, ADVICE reads as the mistake
  { id: "regret-stop", declared: "other", text: { poorly: "I should NOT have moved my stop" }, primary: "stop", rules: "tag", why: "regret, not denial" },
  { id: "advice-lesson-only", declared: "other", text: { lesson: "Never move my stop again" }, primary: "stop", rules: "silent", why: "a lesson alone is too thin for rules; AI may suggest" },
  { id: "advice-wait", declared: "other", text: { detail: "Got stopped out, lost 2R", lesson: "Wait for the displacement before entering" }, primary: "early", rules: "silent", why: "mistake only implied by the lesson" },

  // ---- CONFUSABLE neighbours
  { id: "exit-vs-early", declared: "other", text: { detail: "Exited early at 1R and it ran to 4R" }, primary: "exit", forbid: ["early"], rules: "tag", why: "exiting early is not an early entry" },
  { id: "timing-vs-early", declared: "other", text: { detail: "Entered at 9:31, too early in the day, wasn't my window" }, primary: "timing", forbid: ["early"], rules: "tag", why: "clock, not confirmation" },
  { id: "exit-3", declared: "other", text: { detail: "Took profit too early and watched it run" }, primary: "exit", forbid: ["early"], rules: "tag", why: "exit side" },
  { id: "exit-be", declared: "other", text: { detail: "Moved to breakeven too early and got stopped, then it ran" }, primary: "exit", forbid: ["stop"], rules: "tag", why: "breakeven too early is an exit mistake" },
  { id: "hesitate-chase", declared: "other", text: { detail: "Missed the entry because I hesitated, then chased it 10 points higher" }, primary: "hesitation", secondary: ["chased"], alsoOk: ["chased"], rules: "tag", why: "root is hesitation" },
  { id: "overtrade-vs-tilt", declared: "other", text: { detail: "Felt tired and distracted, took a random trade with no setup" }, primary: "overtrade", secondary: ["tilt"], alsoOk: ["tilt"], rules: "tag", why: "concrete behaviour first, mood second" },
  { id: "news-vs-fomo", declared: "other", text: { detail: "CPI came out and I jumped in on the spike" }, primary: "news", alsoOk: ["fomo", "chased"], rules: "tag", why: "scheduled event named" },
  { id: "fomo-chased", declared: "other", text: { detail: "Afraid it would run without me so I bought after the big expansion candle" }, primary: "chased", secondary: ["fomo"], alsoOk: ["fomo"], rules: "tag", why: "timing + motive" },

  // ---- things rules must NOT pretend to understand
  { id: "hinglish", declared: "other", text: { detail: "Jaldi mein entry le li, confirmation ka wait nahi kiya" }, primary: "early", rules: "silent", why: "needs a language model" },
  { id: "praise", declared: "none", text: { detail: "Perfect execution, textbook" }, primary: null, rules: "silent", why: "no mistake" },
  { id: "import-note", declared: "none", text: { detail: "" }, primary: null, rules: "silent", why: "empty" },
  { id: "gibberish", declared: "other", text: { detail: "asdf qwer zxcv" }, primary: null, rules: "silent", why: "no signal" },
];
