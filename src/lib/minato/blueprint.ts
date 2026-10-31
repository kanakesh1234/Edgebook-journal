/**
 * EDGEBOOK SITE BLUEPRINT & TRADER NAME RESOLVER FOR MINATO
 *
 * Gives Minato complete, accurate awareness of:
 * 1. The trader's real chosen name (never their email prefix or account ID like `kanakesh939264`).
 * 2. Every page, section, drill, and workflow inside EdgeBook so Minato can guide the trader
 *    to the exact place to practise, review, backtest, or adjust rules.
 */

export interface SiteSectionBlueprint {
  route: string;
  name: string;
  purpose: string;
  features: string[];
  whenToRecommend: string;
}

export const EDGEBOOK_SITE_BLUEPRINT: SiteSectionBlueprint[] = [
  {
    route: "/dashboard",
    name: "Home (Dashboard)",
    purpose: "Your daily command center scoped to your active primary challenge.",
    features: [
      "Equity Curve & 4 steering KPIs (Win rate, Average day & streak, Drawdown room, To target)",
      "Daily Loss Limit lock ('Limit $X' pill next to today's date)",
      "Plan a Trade flow (Pre-session thesis, bias, draw on liquidity, invalidation, pre-trade checklist, emotional check-in)",
      "Add Trade modal & interactive Monthly Calendar with Weekly P&L column",
    ],
    whenToRecommend: "Before a session to lock a daily loss limit or write a pre-trade plan ('Plan a trade'), or to check overall equity and drawdown room.",
  },
  {
    route: "/journal",
    name: "Journal & Quick Autopsy",
    purpose: "Complete trade log, filtering, CSV import, and deep post-trade review.",
    features: [
      "Trade list & filters by setup, instrument, mistake tag, or review status",
      "Quick Autopsy (`/review/[id]`): 5-step structured trade review (Followed plan, Emotion, Process verdict, Biggest mistake/lesson, Watch next)",
      "Chart Screenshot Evidence & Compare Symbol chart",
      "Trade Replay button ('Replay') to step through the trade candle-by-candle",
      "Record No-Trade Day for disciplined sit-on-hands sessions",
    ],
    whenToRecommend: "When trades are unreviewed, after a loss or rule break to complete Quick Autopsy, or to tag mistakes and write lessons.",
  },
  {
    route: "/practice",
    name: "Practise (Daily Reps, Kunai Drills, ICT Lab & The Matrix)",
    purpose: "Active skill-building, spaced repetition on past mistakes, and chart recognition drills.",
    features: [
      "Daily Mission & XP Streak: personalized questions built from your own reviewed trades and mistake tags",
      "The Matrix: timed chart-reading & scenario drills (Classic, Time-Attack, What-If, Pro modes) with spaced revision on blunder trades",
      "ICT Lab: liquidity sweeps, FVG, SMT divergence, displacement, and session killzone drills",
      "Trading Math Duel: mental calculation reps for R-multiples, risk, and position sizing",
      "Weekly Practice Review (`/practice/weekly`): reflect on what went well and set next week's focus",
    ],
    whenToRecommend: "When the trader asks what to practise next, struggles with a recurring mistake (FOMO, early entry, moving stops), or wants to sharpen setup/ICT recognition and mental math.",
  },
  {
    route: "/lab",
    name: "Trading Lab (Challenges, Playbook, Rules & Backtesting)",
    purpose: "Your personal operating manual where you define your edge, accounts, and test strategies.",
    features: [
      "Challenges: create and manage prop/live/paper accounts, set starting balance, profit target, max drawdown (static or dynamic EOD/live trailing), and mark your Primary Challenge",
      "Playbook Setups: define canonical setups with entry rules, invalidation, exit rules, minimum R:R, and allowed sessions/instruments",
      "Rule Set: configure automated guardrails (Maximum daily loss, Maximum trades per day, Consecutive-loss stop, Minimum R:R, Trade your setup, Respect risk rules)",
      "Backtesting (`/backtesting/create` & `/backtesting/session`): TradingView-style multi-timeframe historical candle replay with order engine, drawing tools, and session analytics",
    ],
    whenToRecommend: "When a setup is underperforming, when the trader needs to tighten confirmation rules, switch/edit their Primary Challenge, or backtest a strategy on historical candles.",
  },
  {
    route: "/feed",
    name: "Feed (Replays, Charts & Lessons Stream)",
    purpose: "bite-sized visual review stream of your own trades, chart replays, and playbook lessons.",
    features: [
      "Interactive candle-by-candle replays of your logged trades",
      "Curated cards highlighting your best setups, recent losses to learn from, and linked lessons",
      "Collections & Favorites to bookmark model executions",
    ],
    whenToRecommend: "For quick visual reinforcement of A+ executions and reviewing past trade replays before market open.",
  },
  {
    route: "/lessons",
    name: "Lessons (Written Playbook & Study Notes)",
    purpose: "Rich-text knowledge base where you document market concepts, setup studies, and trading lessons.",
    features: [
      "Rich editor with images, highlights, and YouTube embeds (`/lessons/new`)",
      "Direct linking between lessons and specific journal trades",
    ],
    whenToRecommend: "When the trader learns a durable market lesson or wants to turn a repeated mistake into a documented study guide.",
  },
  {
    route: "/friends",
    name: "Friends (Accountability & Head-to-Head Process Comparison)",
    purpose: "Connect with trading partners via Connection ID (`@handle`) to compare process discipline and consistency.",
    features: [
      "Add friends by `@handle` (never exposing email)",
      "Process-first leaderboard & head-to-head comparison",
    ],
    whenToRecommend: "When the trader asks about accountability partners or comparing discipline with peers.",
  },
  {
    route: "/settings",
    name: "Settings (Profile, Account, Appearance, MINATO Memory & Data)",
    purpose: "Manage your profile name, handle, theme, Minato's memory, and journal backups.",
    features: [
      "Profile (`?pane=profile`): set your Full Name (used in greetings) and `@handle`",
      "MINATO (`?pane=minato`): see, add, edit, pin, or delete what Minato remembers, plus Retrieval Debug Mode",
      "Trading Preferences (`?pane=trading`): currency and active primary challenge link",
      "Data (`?pane=data`): export/import JSON backup, recover entry times",
    ],
    whenToRecommend: "When the trader wants to view, edit, pin, or clear what Minato remembers (`Settings → MINATO`), change their display name, or export a backup.",
  },
];

export const SITE_BLUEPRINT_PROMPT_TEXT = [
  "EDGEBOOK WEBSITE BLUEPRINT (use this to guide the trader to exact sections and features):",
  "- **Home (`/dashboard`)**: Equity curve, 4 steering KPIs (Win rate, Average day, Drawdown room, To target), 'Limit $X' daily loss lock, 'Plan a trade' pre-session flow, 'Add trade', and the Monthly Calendar (automatically scoped to the active Primary Challenge).",
  "- **Journal (`/journal` & `/review/[id]`)**: Full trade log, filters, CSV import, 'Record No-Trade Day', and **Quick Autopsy** (5-step post-trade review: Followed plan, Emotion, Process verdict, Biggest mistake/lesson, Watch next + chart screenshots + 'Replay').",
  "- **Practise (`/practice`)**: Daily Missions & XP streak built from the trader's own mistakes, **The Matrix** (timed chart scenario drills & spaced repetition on blunder trades), **ICT Lab** (liquidity sweeps, FVG, SMT, killzones), **Math Duel** (R-multiple & sizing calculations), and **Weekly Review** (`/practice/weekly`).",
  "- **Trading Lab (`/lab` & `/backtesting/session`)**: Manage **Challenges** (set Primary Challenge, starting balance, target, static/dynamic drawdown), **Playbook Setups** (entry/exit/invalidation checklists), **Rule Set** (max daily loss, max trades/day, consecutive-loss stop), and **Backtesting** (candle-by-candle replay engine).",
  "- **Feed (`/feed`)**: Swipeable stream of trade chart replays, A+ setups, and lessons.",
  "- **Lessons (`/lessons`)**: Written study notes and playbook guides linked to trades.",
  "- **Friends (`/friends`)**: Connect via `@handle` for process-score accountability.",
  "- **Settings (`/settings?pane=minato`)**: View, add, edit, pin, or delete what Minato remembers in the **MINATO** tab; set Full Name in **Profile**.",
].join("\n");

/**
 * Cleanly resolve the trader's human first name so Minato NEVER calls them by an email prefix
 * or numeric ID like `kanakesh939264`.
 *
 * Priority:
 *  1. `settings.fullName` (set in Settings -> Profile, e.g. "NANDIGAM KANAKESWARA RAO")
 *  2. `settings.traderName` (if set and not an email/ID)
 *  3. `user.name` / `session.name` — ONLY if it doesn't look like an email handle with digits (e.g. `kanakesh939264`).
 *     If a username has trailing digits like `kanakesh939264`, strip the digits and title-case if alphabetic,
 *     or prefer `settings.fullName`.
 */
export function resolveTraderFirstName(opts: {
  fullName?: string | null;
  traderName?: string | null;
  userName?: string | null;
  sessionName?: string | null;
}): string {
  const cleanCandidate = (raw?: string | null, allowStripDigits = false): string | null => {
    if (!raw || typeof raw !== "string") return null;
    let trimmed = raw.trim();
    if (!trimmed) return null;
    // Strip email domain if an email was passed
    if (trimmed.includes("@")) {
      trimmed = trimmed.split("@")[0]!.trim();
    }
    // Reject internal IDs like g_12345 or u_12345
    if (/^(g_|u_|usr_|id_)/i.test(trimmed)) return null;

    const firstToken = trimmed.split(/\s+/)[0] ?? "";
    if (!firstToken) return null;

    // If the token has 3+ trailing digits (like `kanakesh939264`), it's an email/handle ID, not a display name
    if (/\d{3,}$/.test(firstToken)) {
      if (!allowStripDigits) return null;
      const alphaOnly = firstToken.replace(/\d+$/g, "").replace(/[^a-zA-Z]/g, "");
      if (alphaOnly.length >= 3) {
        return alphaOnly.charAt(0).toUpperCase() + alphaOnly.slice(1).toLowerCase();
      }
      return null;
    }

    // Reject tokens that are mostly digits or symbols
    if (/^\d+$/.test(firstToken)) return null;

    // Format nicely: if ALL CAPS (e.g. "NANDIGAM") or all lowercase, title-case it ("Nandigam") for warm natural conversation
    if (firstToken === firstToken.toUpperCase() || firstToken === firstToken.toLowerCase()) {
      return firstToken.charAt(0).toUpperCase() + firstToken.slice(1).toLowerCase();
    }
    return firstToken;
  };

  return (
    cleanCandidate(opts.fullName, false) ??
    cleanCandidate(opts.traderName, false) ??
    cleanCandidate(opts.userName, false) ??
    cleanCandidate(opts.sessionName, false) ??
    cleanCandidate(opts.userName, true) ??
    cleanCandidate(opts.sessionName, true) ??
    "Trader"
  );
}
