/**
 * MINATO JARVIS / SIRI / BIXBY TASK & ACTION ENGINE
 *
 * Turns natural-language voice/chat commands into executable workspace tasks:
 *  - Trade Replay (`replay_trade`): launches candle-by-candle replay for any trade
 *    (by date, superlative like "largest holding" / "last trade" / "biggest win",
 *    or conversational pronoun like "this trade" / "that trade" / "from here").
 *  - Trade Inspection (`open_trade_journal`, `open_trade_autopsy`): opens the Journal
 *    trade sheet (`/journal?trade=<id>`) or Quick Autopsy (`/review/<id>`).
 *  - Contextual & Direct Navigation (`navigate`): navigates to any EdgeBook route,
 *    Trading Lab tab (`/lab#setups`, `/lab#challenges`, `/lab#backtesting`), or
 *    Practise arena (`/practice?mode=matrix`, `ict`, `math-duel`, `time-machine`, `boss`),
 *    resolving "navigate me to there" / "take me there" from the previous message.
 *  - Remember & Apple HIG Reminder Pop-ups (`save_reminder`): saves what the trader asks
 *    Minato to remember/remind them of and triggers an Apple HIG translucent reminder pop-up.
 *  - ForexFactory Major-Impact News Check (`check_forexfactory_news`): checks ForexFactory
 *    for today's High-Impact (red-folder) news events and times.
 *  - Workspace State Mutations (`open_new_trade`, `set_daily_loss_limit`,
 *    `log_no_trade_day`, `update_rule`, `switch_challenge`, `set_theme`, `panel_control`).
 */

import type { JournalEntry } from "../types";
import { holdMinutes, formatHold } from "../holdtime";
import { resolveTraderFirstName } from "./blueprint";
import { parseRememberOrRemindCommand, type MinatoReminderItem } from "./reminders";

export type MinatoAction =
  | {
      kind: "replay_trade";
      label: string;
      tradeId: string;
      date: string;
      instrument: string;
      direction: "long" | "short" | null;
      setup: string;
      pnl: number;
      autoExecute?: boolean;
    }
  | {
      kind: "open_trade_journal";
      label: string;
      tradeId: string;
      href: string;
      date: string;
      instrument: string;
      autoExecute?: boolean;
    }
  | {
      kind: "open_trade_autopsy";
      label: string;
      tradeId: string;
      href: string;
      date: string;
      instrument: string;
      autoExecute?: boolean;
    }
  | {
      kind: "navigate";
      label: string;
      href: string;
      section: string;
      autoExecute?: boolean;
    }
  | {
      kind: "open_new_trade";
      label: string;
      presetDate?: string;
      autoExecute?: boolean;
    }
  | {
      kind: "set_daily_loss_limit";
      label: string;
      amount: number;
      date: string;
      autoExecute?: boolean;
    }
  | {
      kind: "log_no_trade_day";
      label: string;
      date: string;
      reason?: string;
      autoExecute?: boolean;
    }
  | {
      kind: "update_rule";
      label: string;
      ruleId:
        | "risk.max-consecutive-losses"
        | "risk.max-daily-loss"
        | "risk.max-trades-per-day"
        | "risk.min-rr";
      paramKey: "max" | "limit" | "maxTrades" | "min";
      value: number;
      enabled: boolean;
      autoExecute?: boolean;
    }
  | {
      kind: "switch_challenge";
      label: string;
      challengeName: string;
      autoExecute?: boolean;
    }
  | {
      kind: "set_theme";
      label: string;
      theme: "dark" | "light" | "toggle";
      autoExecute?: boolean;
    }
  | {
      kind: "panel_control";
      label: string;
      mode: "expand" | "restore" | "close";
      autoExecute?: boolean;
    }
  | {
      kind: "save_reminder";
      label: string;
      reminder: MinatoReminderItem;
      autoExecute?: boolean;
    }
  | {
      kind: "check_forexfactory_news";
      label: string;
      date: string;
      autoExecute?: boolean;
    };

export interface TaskResolution {
  isDirectCommand: boolean;
  directReply: string | null;
  actions: MinatoAction[];
  resolvedTrade: JournalEntry | null;
}

export interface SimpleChatTurn {
  role: "user" | "buddy";
  text: string;
}

function money(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${n < 0 ? "−" : "+"}$${abs}`;
}

function tradeShortLabel(e: JournalEntry): string {
  const dir = e.direction ? ` ${e.direction}` : "";
  return `${e.date} ${e.instrument}${dir}`;
}

/**
 * Resolves a target trade from:
 *  1. Explicit date (`2026-10-15`) or trade ID in the current query
 *  2. Superlative in the current query (`largest holding`, `longest hold`, `last trade`, `best trade`, `worst trade`)
 *  3. Conversational context in recent messages when the user says `"this trade"`, `"that trade"`, `"it"`, `"from here"`
 *  4. Active `focusTradeId` or newest trade fallback
 */
export function resolveTargetTrade(
  query: string,
  entries: JournalEntry[],
  history: SimpleChatTurn[] = [],
  focusTradeId?: string | null,
): JournalEntry | null {
  if (entries.length === 0) return null;
  const sortedNewest = [...entries].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0),
  );
  const q = query.toLowerCase();

  // 1. Check explicit trade ID in query
  for (const e of sortedNewest) {
    if (e.id && q.includes(e.id.toLowerCase())) return e;
  }

  // 2. Check explicit date in query (e.g. 2026-10-15)
  const dateInQuery = q.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (dateInQuery) {
    const d = dateInQuery[1]!;
    const onDate = sortedNewest.filter((e) => e.date === d);
    if (onDate.length === 1) return onDate[0]!;
    if (onDate.length > 1) {
      const byDir = onDate.find((e) => e.direction && q.includes(e.direction));
      if (byDir) return byDir;
      const byInst = onDate.find((e) => e.instrument && q.includes(e.instrument.toLowerCase()));
      if (byInst) return byInst;
      return onDate[0]!;
    }
  }

  // 3. Superlatives in current query
  const matchSuperlative = (text: string): JournalEntry | null => {
    const t = text.toLowerCase();
    if (/\b(largest|longest|max|maximum|biggest)\s+(hold|holding|duration)\b|\bheld\s+(the\s+)?longest\b/.test(t)) {
      const withHold = sortedNewest
        .map((e) => ({ e, m: holdMinutes(e) }))
        .filter((x): x is { e: JournalEntry; m: number } => x.m != null)
        .sort((a, b) => b.m - a.m);
      return withHold[0]?.e ?? sortedNewest[0]!;
    }
    if (/\b(shortest|fastest|quickest|min|minimum)\s+(hold|holding|duration)\b/.test(t)) {
      const withHold = sortedNewest
        .map((e) => ({ e, m: holdMinutes(e) }))
        .filter((x): x is { e: JournalEntry; m: number } => x.m != null)
        .sort((a, b) => a.m - b.m);
      return withHold[0]?.e ?? sortedNewest[0]!;
    }
    if (/\b(best|biggest\s+win|largest\s+win|highest\s+profit|top\s+win)\b/.test(t)) {
      return [...sortedNewest].sort((a, b) => b.pnl - a.pnl)[0] ?? null;
    }
    if (/\b(worst|biggest\s+loss|largest\s+loss|heaviest\s+loss)\b/.test(t)) {
      return [...sortedNewest].sort((a, b) => a.pnl - b.pnl)[0] ?? null;
    }
    if (/\b(last|latest|most\s+recent|newest)\s+trade\b/.test(t)) {
      return sortedNewest[0] ?? null;
    }
    if (/\b(first|oldest|earliest)\s+trade\b/.test(t)) {
      return sortedNewest[sortedNewest.length - 1] ?? null;
    }
    return null;
  };

  const directSuper = matchSuperlative(q);
  if (directSuper) return directSuper;

  // 4. Contextual resolution from recent conversation history ("this trade", "that trade", "play of this trade", etc.)
  const recentTurns = [...history].reverse().slice(0, 6);
  for (const turn of recentTurns) {
    const txt = turn.text;
    for (const e of sortedNewest) {
      if (e.id && txt.includes(e.id)) return e;
    }
    const dates = [...txt.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((m) => m[1]!);
    for (const d of dates) {
      const candidates = sortedNewest.filter((e) => e.date === d);
      if (candidates.length === 1) return candidates[0]!;
      if (candidates.length > 1) {
        const lowerTxt = txt.toLowerCase();
        const match =
          candidates.find(
            (e) =>
              (e.direction && lowerTxt.includes(e.direction.toLowerCase())) &&
              (e.setup && lowerTxt.includes(e.setup.toLowerCase())),
          ) ??
          candidates.find((e) => e.direction && lowerTxt.includes(e.direction.toLowerCase())) ??
          candidates.find((e) => e.instrument && lowerTxt.includes(e.instrument.toLowerCase())) ??
          candidates[0]!;
        return match;
      }
    }
    const histSuper = matchSuperlative(txt);
    if (histSuper) return histSuper;
  }

  // 5. Focus trade ID or newest trade
  if (focusTradeId) {
    const f = sortedNewest.find((e) => e.id === focusTradeId);
    if (f) return f;
  }

  return sortedNewest[0] ?? null;
}

interface ResolvedRoute {
  href: string;
  section: string;
  label: string;
}

function matchSectionFromText(text: string): ResolvedRoute | null {
  const t = text.toLowerCase();

  // Specific Practise modes first
  if (/\b(the\s+matrix|matrix\s+drill|matrix\s+mode|chart\s+drill)\b/.test(t)) {
    return { href: "/practice?mode=matrix", section: "Practise → The Matrix", label: "Launch The Matrix Drill" };
  }
  if (/\b(ict\s+lab|ict\s+drill|smc\s+drill|fvg\s+drill|liquidity\s+sweep\s+drill)\b/.test(t)) {
    return { href: "/practice?mode=ict", section: "Practise → ICT Lab", label: "Launch ICT Lab" };
  }
  if (/\b(math\s+duel|sizing\s+drill|r[-\s]?multiple\s+drill)\b/.test(t)) {
    return { href: "/practice?mode=math-duel", section: "Practise → Math Duel", label: "Launch Math Duel" };
  }
  if (/\b(time\s+machine)\b/.test(t)) {
    return { href: "/practice?mode=time-machine", section: "Practise → Time Machine", label: "Launch Time Machine" };
  }
  if (/\b(weekend\s+boss|boss\s+mode)\b/.test(t)) {
    return { href: "/practice?mode=boss", section: "Practise → Weekend Boss", label: "Launch Weekend Boss" };
  }
  if (/\b(weekly\s+review)\b/.test(t)) {
    return { href: "/practice/weekly", section: "Practise → Weekly Review", label: "Open Weekly Review" };
  }

  // Specific Trading Lab tabs & Backtesting
  if (/\b(new\s+backtest|create\s+backtest|start\s+a?\s*backtest)\b/.test(t)) {
    return { href: "/backtesting/create", section: "Trading Lab → New Backtest", label: "Create Backtest Session" };
  }
  if (/\b(backtest|backtesting|backtests)\b/.test(t)) {
    return { href: "/lab#backtesting", section: "Trading Lab → Backtests", label: "Open Trading Lab · Backtests" };
  }
  if (/\b(playbook|setups?\s+tab|my\s+setups|rule\s*set|guardrails?|consecutive[-\s]loss)\b/.test(t)) {
    return { href: "/lab#setups", section: "Trading Lab → Playbook & Rules", label: "Open Trading Lab · Playbook & Rules" };
  }
  if (/\b(challenges?\s+tab|my\s+challenges|primary\s+challenge|prop\s+challenge)\b/.test(t)) {
    return { href: "/lab#challenges", section: "Trading Lab → Challenges", label: "Open Trading Lab · Challenges" };
  }
  if (/\b(trading\s+lab|\blab\b)\b/.test(t)) {
    return { href: "/lab", section: "Trading Lab", label: "Open Trading Lab" };
  }

  // Settings & Memory
  if (/\b(minato\s+memory|memory\s+settings|what\s+minato\s+remembers|saved\s+memories)\b/.test(t)) {
    return { href: "/settings?pane=minato", section: "Settings → Minato Memory", label: "Open Minato Memory" };
  }
  if (/\b(settings|preferences|profile)\b/.test(t)) {
    return { href: "/settings", section: "Settings", label: "Open Settings" };
  }

  // Core workspace routes
  if (/\b(practi[cs]e|drills?|training\s+arena)\b/.test(t)) {
    return { href: "/practice", section: "Practise", label: "Open Practise Arena" };
  }
  if (/\b(unreviewed|needs\s+review|pending\s+review)\b/.test(t)) {
    return { href: "/journal", section: "Journal · Needs Review", label: "Open Unreviewed Trades in Journal" };
  }
  if (/\b(journal|trade\s+log|all\s+trades)\b/.test(t)) {
    return { href: "/journal", section: "Journal", label: "Open Journal" };
  }
  if (/\b(calendar|monthly\s+view)\b/.test(t)) {
    return { href: "/calendar", section: "Calendar", label: "Open Calendar" };
  }
  if (/\b(feed|reels|study\s+feed)\b/.test(t)) {
    return { href: "/feed", section: "Feed", label: "Open Study Feed" };
  }
  if (/\b(lessons?|notes\s+library)\b/.test(t)) {
    return { href: "/lessons", section: "Lessons", label: "Open Lessons" };
  }
  if (/\b(friends|leaderboard|community)\b/.test(t)) {
    return { href: "/friends", section: "Friends", label: "Open Friends" };
  }
  if (/\b(home|dashboard|equity\s+curve)\b/.test(t)) {
    return { href: "/dashboard", section: "Home Dashboard", label: "Open Home Dashboard" };
  }

  return null;
}

export function resolveTargetSection(
  query: string,
  history: SimpleChatTurn[] = [],
): ResolvedRoute | null {
  const direct = matchSectionFromText(query);
  if (direct) return direct;

  const recent = [...history].reverse().slice(0, 4);
  for (const turn of recent) {
    const fromHist = matchSectionFromText(turn.text);
    if (fromHist) return fromHist;
  }
  return null;
}

/**
 * Main Jarvis / Siri / Bixby task resolver.
 */
export function resolveMinatoTasks(params: {
  query: string;
  entries: JournalEntry[];
  history?: SimpleChatTurn[];
  focusTradeId?: string | null;
  traderName?: string | null;
  today?: string;
}): TaskResolution {
  const { query, entries, history = [], focusTradeId = null, today = new Date().toISOString().slice(0, 10) } = params;
  const name = resolveTraderFirstName({ fullName: params.traderName });
  const q = query.trim();
  const low = q.toLowerCase();

  // ------------------------------------------------------------------
  // 0A. REMEMBER / REMIND ME COMMAND ("remember that...", "remind me...", "minato remember...")
  // ------------------------------------------------------------------
  const remParsed = parseRememberOrRemindCommand(q);
  if (remParsed.matched && remParsed.item) {
    const remItem = remParsed.item;
    const timingNote =
      remItem.trigger === "timed" && remItem.clockTime
        ? `at **${remItem.clockTime}**`
        : remItem.trigger === "timed" && remItem.dueAt
          ? `at the scheduled time`
          : `whenever you open **Plan a trade** or **Log a trade**`;
    return {
      isDirectCommand: true,
      resolvedTrade: null,
      actions: [
        {
          kind: "save_reminder",
          label: `Pop up Reminder · ${remItem.text.slice(0, 32)}${remItem.text.length > 32 ? "…" : ""}`,
          reminder: remItem,
          autoExecute: true,
        },
        {
          kind: "navigate",
          label: "View in Minato Memory",
          href: "/settings?pane=minato",
          section: "Settings → Minato Memory",
        },
      ],
      directReply: `Locked in, ${name} — **“${remItem.text}”** is saved to memory and active reminders. I'll pop up a clean reminder ${timingNote}.`,
    };
  }

  // ------------------------------------------------------------------
  // 0B. FOREXFACTORY MAJOR NEWS CHECK COMMAND ("check forexfactory", "what major news events are today?", "autofill today's news")
  // ------------------------------------------------------------------
  if (
    /\b(forexfactory|forex\s+factory|red\s+folder|major\s+(?:impact\s+)?news|high\s+impact\s+news|news\s+events?\s+today|what\s+news\s+(?:is|are)\s+today|autofill.*news)\b/i.test(
      low,
    )
  ) {
    const dateMatch = low.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    const targetDate = dateMatch ? dateMatch[1]! : today;
    return {
      isDirectCommand: true,
      resolvedTrade: null,
      actions: [
        {
          kind: "check_forexfactory_news",
          label: `Check ForexFactory (${targetDate})`,
          date: targetDate,
          autoExecute: true,
        },
      ],
      directReply: `Checking **ForexFactory** for Major-Impact (Red Folder) news events on **${targetDate}** and syncing them to your **Plan a trade** news profile, ${name}…`,
    };
  }

  // ------------------------------------------------------------------
  // 1. DIRECT REPLAY COMMAND ("take me to play of this trade", "replay this trade", "play my last trade", etc.)
  // ------------------------------------------------------------------
  const isReplayCommand =
    /\b(replay|play)\b.*\b(trade|it|this|that|session|entry|20\d{2}-\d{2}-\d{2}|mnq|nq|es|mes)\b/i.test(low) ||
    /\b(take\s+me\s+to|open|start|launch|show\s+me)\b.*\b(replay|play)\b/i.test(low) ||
    /^\s*(replay|play\s+it|replay\s+it|play\s+this|replay\s+this)\s*[!.?]*$/i.test(low);

  if (isReplayCommand) {
    const trade = resolveTargetTrade(q, entries, history, focusTradeId);
    if (trade) {
      const holdMin = holdMinutes(trade);
      const replayAction: MinatoAction = {
        kind: "replay_trade",
        label: `Replay ${tradeShortLabel(trade)} (${money(trade.pnl)})`,
        tradeId: trade.id,
        date: trade.date,
        instrument: trade.instrument,
        direction: trade.direction ?? null,
        setup: trade.setup || "Unnamed setup",
        pnl: trade.pnl,
        autoExecute: true,
      };
      const journalAction: MinatoAction = {
        kind: "open_trade_journal",
        label: `Open in Journal`,
        tradeId: trade.id,
        href: `/journal?trade=${trade.id}`,
        date: trade.date,
        instrument: trade.instrument,
      };
      const autopsyAction: MinatoAction = {
        kind: "open_trade_autopsy",
        label: `Quick Autopsy`,
        tradeId: trade.id,
        href: `/review/${trade.id}`,
        date: trade.date,
        instrument: trade.instrument,
      };
      return {
        isDirectCommand: true,
        resolvedTrade: trade,
        actions: [replayAction, journalAction, autopsyAction],
        directReply: `Launching the candle-by-candle replay for your **${trade.date} ${trade.instrument}${trade.direction ? ` ${trade.direction}` : ""}** trade (${trade.setup || "Unnamed setup"} · **${money(trade.pnl)}**${holdMin != null ? ` · held ${formatHold(holdMin)}` : ""}) right now, ${name}.`,
      };
    }
  }

  // ------------------------------------------------------------------
  // 2. DIRECT TRADE AUTOPSY / JOURNAL OPEN COMMAND
  // ------------------------------------------------------------------
  const isOpenTradeCommand =
    /\b(take\s+me\s+to|open|show\s+me|go\s+to|jump\s+to|inspect)\b.*\b(this\s+trade|that\s+trade|autopsy|trade\s+review|last\s+trade|best\s+trade|worst\s+trade|largest\s+holding|longest\s+hold|20\d{2}-\d{2}-\d{2}\s+trade)\b/i.test(
      low,
    );

  if (isOpenTradeCommand && !isReplayCommand) {
    const trade = resolveTargetTrade(q, entries, history, focusTradeId);
    if (trade) {
      const wantsAutopsy = /\b(autopsy|review)\b/i.test(low);
      const primaryAction: MinatoAction = wantsAutopsy
        ? {
            kind: "open_trade_autopsy",
            label: `Open Autopsy · ${tradeShortLabel(trade)}`,
            tradeId: trade.id,
            href: `/review/${trade.id}`,
            date: trade.date,
            instrument: trade.instrument,
            autoExecute: true,
          }
        : {
            kind: "open_trade_journal",
            label: `Open in Journal · ${tradeShortLabel(trade)}`,
            tradeId: trade.id,
            href: `/journal?trade=${trade.id}`,
            date: trade.date,
            instrument: trade.instrument,
            autoExecute: true,
          };
      const replayAction: MinatoAction = {
        kind: "replay_trade",
        label: `Replay ${tradeShortLabel(trade)}`,
        tradeId: trade.id,
        date: trade.date,
        instrument: trade.instrument,
        direction: trade.direction ?? null,
        setup: trade.setup || "Unnamed setup",
        pnl: trade.pnl,
      };
      return {
        isDirectCommand: true,
        resolvedTrade: trade,
        actions: [primaryAction, replayAction],
        directReply: `Opening ${wantsAutopsy ? "**Quick Autopsy**" : "your **Journal trade sheet**"} for **${trade.date} ${trade.instrument}${trade.direction ? ` ${trade.direction}` : ""}** (${money(trade.pnl)}) now, ${name}.`,
      };
    }
  }

  // ------------------------------------------------------------------
  // 3. WORKSPACE STATE MUTATION COMMANDS
  // ------------------------------------------------------------------
  const dailyLossMatch = low.match(
    /\b(?:set|lock|change|update|make)\s+(?:my\s+|today'?s\s+)?(?:daily\s+)?loss\s+limit\s+(?:to|at|as)?\s*\$?\s*(\d+(?:\.\d+)?)\b/i,
  );
  if (dailyLossMatch) {
    const amount = Number(dailyLossMatch[1]);
    if (Number.isFinite(amount) && amount > 0) {
      return {
        isDirectCommand: true,
        resolvedTrade: null,
        actions: [
          {
            kind: "set_daily_loss_limit",
            label: `Set Today's Loss Limit to $${amount}`,
            amount,
            date: today,
            autoExecute: true,
          },
        ],
        directReply: `Done, ${name} — I've locked your daily loss limit for today (${today}) at **$${amount.toLocaleString("en-US")}** and saved it to memory.`,
      };
    }
  }

  const consecLossMatch = low.match(
    /\b(?:set|enable|add|limit|halt\s+after)\s+(?:a\s+|my\s+)?(?:max\s+)?consecutive[-\s]+loss(?:es)?(?:\s+stop|\s+limit|\s+rule)?\s*(?:to|at|after|of)?\s*(\d+)\b/i,
  );
  if (consecLossMatch) {
    const val = Number(consecLossMatch[1]);
    if (val >= 1 && val <= 20) {
      return {
        isDirectCommand: true,
        resolvedTrade: null,
        actions: [
          {
            kind: "update_rule",
            label: `Enable Rule: Max ${val} Consecutive Losses`,
            ruleId: "risk.max-consecutive-losses",
            paramKey: "max",
            value: val,
            enabled: true,
            autoExecute: true,
          },
          {
            kind: "navigate",
            label: "View in Trading Lab",
            href: "/lab#setups",
            section: "Trading Lab → Playbook & Rules",
          },
        ],
        directReply: `Done, ${name} — I've enabled your **Consecutive-Loss Stop** guardrail at **${val} consecutive losses**.`,
      };
    }
  }

  const maxTradesMatch = low.match(
    /\b(?:set|enable|limit)\s+(?:my\s+)?max\s+trades?\s+per\s+day\s*(?:to|at)?\s*(\d+)\b/i,
  );
  if (maxTradesMatch) {
    const val = Number(maxTradesMatch[1]);
    if (val >= 1 && val <= 50) {
      return {
        isDirectCommand: true,
        resolvedTrade: null,
        actions: [
          {
            kind: "update_rule",
            label: `Enable Rule: Max ${val} Trades / Day`,
            ruleId: "risk.max-trades-per-day",
            paramKey: "maxTrades",
            value: val,
            enabled: true,
          },
        ],
        directReply: `Done, ${name} — I've set your **Max Trades Per Day** guardrail to **${val} trades/day**.`,
      };
    }
  }

  if (/\b(mark|log|record|set)\b.*\b(no[-\s]?trade|no[-\s]?setup)\s+day\b/i.test(low)) {
    const reasonMatch = q.match(/\bbecause\s+(.+)$/i);
    const reason = reasonMatch ? reasonMatch[1]!.trim() : "Disciplined no-setup day";
    return {
      isDirectCommand: true,
      resolvedTrade: null,
      actions: [
        {
          kind: "log_no_trade_day",
          label: `Log No-Trade Day (${today})`,
          date: today,
          reason,
          autoExecute: true,
        },
      ],
      directReply: `Logged **${today}** as a disciplined **No-Trade Day** (${reason}), ${name}. Sitting on your hands when your setup isn't there protects your edge.`,
    };
  }

  if (/\b(log|add|record|create|open)\s+(a\s+)?(new\s+)?trade(\s+entry|\s+form|\s+modal)?\b/i.test(low) && !/review|autopsy|replay/.test(low)) {
    return {
      isDirectCommand: true,
      resolvedTrade: null,
      actions: [
        {
          kind: "open_new_trade",
          label: "Log New Trade",
          presetDate: today,
          autoExecute: true,
        },
      ],
      directReply: `Opening the **New Trade** form for you now, ${name}.`,
    };
  }

  if (/\b(switch\s+to|turn\s+on|enable|use|set)\s+(dark|light)\s+(mode|theme)\b|\btoggle\s+(dark\s+mode|theme)\b/i.test(low)) {
    const mode: "dark" | "light" | "toggle" = /\bdark\b/.test(low) ? "dark" : /\blight\b/.test(low) ? "light" : "toggle";
    return {
      isDirectCommand: true,
      resolvedTrade: null,
      actions: [
        {
          kind: "set_theme",
          label: mode === "toggle" ? "Toggle Theme" : `Switch to ${mode === "dark" ? "Dark" : "Light"} Mode`,
          theme: mode,
          autoExecute: true,
        },
      ],
      directReply: `Switched EdgeBook to **${mode === "toggle" ? "the opposite" : mode} mode** for you, ${name}.`,
    };
  }

  const challengeSwitchMatch = q.match(
    /\b(?:switch|change|set|make)\s+(?:my\s+)?(?:primary\s+)?challenge\s+(?:to\s+)?["']?([A-Za-z0-9 _-]+?)["']?(?:\s+as\s+primary)?$/i,
  );
  if (challengeSwitchMatch) {
    const cName = challengeSwitchMatch[1]!.trim();
    if (cName && !/^(tab|page|section|view)$/i.test(cName)) {
      return {
        isDirectCommand: true,
        resolvedTrade: null,
        actions: [
          {
            kind: "switch_challenge",
            label: `Set Primary Challenge: ${cName}`,
            challengeName: cName,
            autoExecute: true,
          },
        ],
        directReply: `Switching your active **Primary Challenge** to **${cName}**, ${name}.`,
      };
    }
  }

  // ------------------------------------------------------------------
  // 4. DIRECT NAVIGATION COMMAND
  // ------------------------------------------------------------------
  const isNavCommand =
    /\b(navigate(\s+me)?|take\s+me|go\s+to|bring\s+me|jump\s+to|open\s+up|open|launch|start)\b/i.test(low) &&
    !/\b(how\s+many|what\s+is|why\s+did|calculate|probability)\b/i.test(low);

  if (isNavCommand) {
    const targetSection = resolveTargetSection(q, history);
    if (targetSection) {
      return {
        isDirectCommand: true,
        resolvedTrade: null,
        actions: [
          {
            kind: "navigate",
            label: targetSection.label,
            href: targetSection.href,
            section: targetSection.section,
            autoExecute: true,
          },
        ],
        directReply: `Taking you to **${targetSection.section}** (\`${targetSection.href}\`) now, ${name}.`,
      };
    }

    const contextTrade = resolveTargetTrade(q, entries, history, focusTradeId);
    if (contextTrade && /\b(there|it|that|this|here)\b/i.test(low)) {
      return {
        isDirectCommand: true,
        resolvedTrade: contextTrade,
        actions: [
          {
            kind: "open_trade_journal",
            label: `Open ${tradeShortLabel(contextTrade)} in Journal`,
            tradeId: contextTrade.id,
            href: `/journal?trade=${contextTrade.id}`,
            date: contextTrade.date,
            instrument: contextTrade.instrument,
            autoExecute: true,
          },
          {
            kind: "replay_trade",
            label: `Replay ${tradeShortLabel(contextTrade)}`,
            tradeId: contextTrade.id,
            date: contextTrade.date,
            instrument: contextTrade.instrument,
            direction: contextTrade.direction ?? null,
            setup: contextTrade.setup || "Unnamed setup",
            pnl: contextTrade.pnl,
          },
        ],
        directReply: `Opening your **${tradeShortLabel(contextTrade)}** trade (${money(contextTrade.pnl)}) in **Journal** now, ${name}. You can also launch its candle-by-candle **Replay** with one tap below.`,
      };
    }
  }

  // ------------------------------------------------------------------
  // 5. PROACTIVE CONTEXTUAL ACTION PILLS FOR INFORMATIONAL QUESTIONS
  // ------------------------------------------------------------------
  const proactiveActions: MinatoAction[] = [];
  let resolvedTrade: JournalEntry | null = null;

  const asksAboutSpecificTrade =
    /\b(which\s+trade|what\s+trade|largest\s+holding|longest\s+hold|shortest\s+hold|last\s+trade|best\s+trade|worst\s+trade|biggest\s+win|biggest\s+loss|20\d{2}-\d{2}-\d{2}|review\s+my)\b/i.test(
      low,
    );

  if (asksAboutSpecificTrade && entries.length > 0) {
    resolvedTrade = resolveTargetTrade(q, entries, history, focusTradeId);
    if (resolvedTrade) {
      proactiveActions.push(
        {
          kind: "replay_trade",
          label: `Replay ${tradeShortLabel(resolvedTrade)}`,
          tradeId: resolvedTrade.id,
          date: resolvedTrade.date,
          instrument: resolvedTrade.instrument,
          direction: resolvedTrade.direction ?? null,
          setup: resolvedTrade.setup || "Unnamed setup",
          pnl: resolvedTrade.pnl,
        },
        {
          kind: "open_trade_journal",
          label: `Open in Journal`,
          tradeId: resolvedTrade.id,
          href: `/journal?trade=${resolvedTrade.id}`,
          date: resolvedTrade.date,
          instrument: resolvedTrade.instrument,
        },
        {
          kind: "open_trade_autopsy",
          label: `Quick Autopsy`,
          tradeId: resolvedTrade.id,
          href: `/review/${resolvedTrade.id}`,
          date: resolvedTrade.date,
          instrument: resolvedTrade.instrument,
        },
      );
    }
  }

  const mentionedSection = matchSectionFromText(q);
  if (mentionedSection && proactiveActions.length < 3) {
    proactiveActions.push({
      kind: "navigate",
      label: mentionedSection.label,
      href: mentionedSection.href,
      section: mentionedSection.section,
    });
  }

  return {
    isDirectCommand: false,
    directReply: null,
    actions: proactiveActions,
    resolvedTrade,
  };
}

export function enrichActionsFromReplyText(
  replyText: string,
  existingActions: MinatoAction[],
  entries: JournalEntry[],
): MinatoAction[] {
  const out = [...existingActions];
  const hasTradeAction = out.some(
    (a) => a.kind === "replay_trade" || a.kind === "open_trade_journal" || a.kind === "open_trade_autopsy",
  );

  if (!hasTradeAction && entries.length > 0) {
    const dateMatch = replyText.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (dateMatch) {
      const trade = resolveTargetTrade(replyText, entries);
      if (trade && trade.date === dateMatch[1]) {
        out.unshift(
          {
            kind: "replay_trade",
            label: `Replay ${tradeShortLabel(trade)}`,
            tradeId: trade.id,
            date: trade.date,
            instrument: trade.instrument,
            direction: trade.direction ?? null,
            setup: trade.setup || "Unnamed setup",
            pnl: trade.pnl,
          },
          {
            kind: "open_trade_journal",
            label: `Open in Journal`,
            tradeId: trade.id,
            href: `/journal?trade=${trade.id}`,
            date: trade.date,
            instrument: trade.instrument,
          },
          {
            kind: "open_trade_autopsy",
            label: `Quick Autopsy`,
            tradeId: trade.id,
            href: `/review/${trade.id}`,
            date: trade.date,
            instrument: trade.instrument,
          },
        );
      }
    }
  }

  const hasNavAction = out.some((a) => a.kind === "navigate");
  if (!hasNavAction) {
    const sec = matchSectionFromText(replyText);
    if (sec) {
      out.push({
        kind: "navigate",
        label: sec.label,
        href: sec.href,
        section: sec.section,
      });
    }
  }

  return out.slice(0, 4);
}
