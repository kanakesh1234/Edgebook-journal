/**
 * MINATO POST-TURN MEMORY EXTRACTION & WRITE PATH
 *
 * After each turn/session, runs an extraction step that outputs structured JSON:
 *   { type, content, entities, confidence, source_message_id, created_at, ... }
 *
 * Supports:
 * 1. Semantic memory (durable user facts):
 *    - risk_per_trade ($ or %)
 *    - stop_points (default stop loss in points)
 *    - daily_loss_limit ($ daily max loss)
 *    - drawdown_limit ($ max drawdown)
 *    - profit_target ($ profit target)
 *    - instruments_traded (MNQ, NQ, ES, MES, etc.)
 *    - account_type (paper / live / prop / eval)
 *    - strategy_rules (entry/exit/process rules)
 *    - session_times (NY open, London, 9:30–11:00, etc.)
 *    - goals (consistency, payout, target)
 *    - psychology_notes (triggers, FOMO, tilt notes)
 * 2. Episodic memory (per-session / per-day summaries: what happened, lessons,
 *    mistakes, emotions linked to trade/journal IDs).
 * 3. Deduplication, merging, and superseding contradicting facts:
 *    - Contradicting facts on the same slot (e.g. risk per trade changed from $200 to $100,
 *      or account type changed from paper to live) mark the old fact as `superseded`
 *      with `supersededBy` pointing to the new item ID, preserving full history.
 * 4. Importance score & decay for stale episodic items.
 */

import {
  emptyMemory,
  isActive,
  observe,
  type MemoryEvent,
  type MemoryKind,
  type MemoryStore,
  type MemoryTopic,
  type Observation,
} from "./memory";
import type { MinatoBrain } from "./brain-ml";

export type ExtractedMemoryCategory =
  | "risk_per_trade"
  | "stop_points"
  | "daily_loss_limit"
  | "drawdown_limit"
  | "profit_target"
  | "instruments_traded"
  | "account_type"
  | "strategy_rules"
  | "session_times"
  | "goals"
  | "psychology_notes"
  | "episodic_session";

export interface ExtractedMemoryRecord {
  id: string;
  type: "semantic" | "episodic";
  category: ExtractedMemoryCategory;
  fact_key: string; // axis key used for superseding contradictions
  content: string;
  short: string;
  structured_value: Record<string, unknown>;
  entities: string[];
  confidence: number;
  importance: number;
  source_message_id: string;
  trade_ids?: string[];
  created_at: string; // ISO timestamp
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28) || "item";

const CATEGORY_TO_TOPIC: Record<ExtractedMemoryCategory, MemoryTopic> = {
  risk_per_trade: "risk",
  stop_points: "risk",
  daily_loss_limit: "risk",
  drawdown_limit: "risk",
  profit_target: "fact",
  instruments_traded: "preference",
  account_type: "fact",
  strategy_rules: "strategy",
  session_times: "timing",
  goals: "preference",
  psychology_notes: "emotion",
  episodic_session: "execution",
};

/**
 * Extract structured JSON memory items from a user message (and optional pending question context).
 */
export function extractStructuredMemoriesFromTurn(opts: {
  text: string;
  messageId?: string;
  now?: number;
  pendingQuestionSlot?: "stop_points" | "risk_per_trade" | "both" | null;
  linkedTradeIds?: string[];
}): ExtractedMemoryRecord[] {
  const now = opts.now ?? Date.now();
  const createdAt = new Date(now).toISOString();
  const msgId = opts.messageId ?? `msg_${now}`;
  const raw = opts.text.trim();
  if (!raw) return [];

  // Don't extract durable facts from pure questions unless the user is answering a pending prompt
  // or making a statement alongside a question.
  const isPureQuestion =
    raw.endsWith("?") &&
    !opts.pendingQuestionSlot &&
    !/\b(my|i trade|i risk|i use|i am on|i'm on|remember|my stop|my daily|my max|my target|my goal|my rule)\b/i.test(raw);

  const out: ExtractedMemoryRecord[] = [];
  const entities = extractEntities(raw);

  // 1. Check if answering a pending missing-input prompt (e.g. "20 points and $150 risk" or just "15 pts, 1%")
  if (opts.pendingQuestionSlot) {
    const bareStop = raw.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:pt|pts|point|points|ticks?)\b/i);
    const bareDollar = raw.match(/\$\s*(\d{2,5}(?:\.\d+)?)\b/);
    const barePct = raw.match(/\b(\d{1,2}(?:\.\d+)?)\s*%/);
    const bareNumOnly = raw.match(/^\s*(\d{1,4}(?:\.\d+)?)\s*$/);

    if (bareStop) {
      const pts = Number(bareStop[1]);
      out.push({
        id: `sem:stop_points:${pts}pt`,
        type: "semantic",
        category: "stop_points",
        fact_key: "user:stop_points",
        content: `Default stop loss is ${pts} points`,
        short: `Stop size: ${pts} pts`,
        structured_value: { stopPoints: pts },
        entities,
        confidence: 0.95,
        importance: 0.9,
        source_message_id: msgId,
        created_at: createdAt,
      });
    } else if (opts.pendingQuestionSlot === "stop_points" && bareNumOnly) {
      const pts = Number(bareNumOnly[1]);
      out.push({
        id: `sem:stop_points:${pts}pt`,
        type: "semantic",
        category: "stop_points",
        fact_key: "user:stop_points",
        content: `Default stop loss is ${pts} points`,
        short: `Stop size: ${pts} pts`,
        structured_value: { stopPoints: pts },
        entities,
        confidence: 0.92,
        importance: 0.9,
        source_message_id: msgId,
        created_at: createdAt,
      });
    }

    if (bareDollar) {
      const amt = Number(bareDollar[1]);
      out.push({
        id: `sem:risk_per_trade:${amt}usd`,
        type: "semantic",
        category: "risk_per_trade",
        fact_key: "user:risk_per_trade",
        content: `Risk per trade is $${amt}`,
        short: `Risk/trade: $${amt}`,
        structured_value: { riskDollars: amt },
        entities,
        confidence: 0.95,
        importance: 0.95,
        source_message_id: msgId,
        created_at: createdAt,
      });
    } else if (barePct) {
      const pct = Number(barePct[1]);
      out.push({
        id: `sem:risk_per_trade:${pct}pct`,
        type: "semantic",
        category: "risk_per_trade",
        fact_key: "user:risk_per_trade",
        content: `Risk per trade is ${pct}% of account equity`,
        short: `Risk/trade: ${pct}%`,
        structured_value: { riskPct: pct },
        entities,
        confidence: 0.95,
        importance: 0.95,
        source_message_id: msgId,
        created_at: createdAt,
      });
    } else if (opts.pendingQuestionSlot === "risk_per_trade" && bareNumOnly) {
      const amt = Number(bareNumOnly[1]);
      out.push({
        id: `sem:risk_per_trade:${amt}usd`,
        type: "semantic",
        category: "risk_per_trade",
        fact_key: "user:risk_per_trade",
        content: `Risk per trade is $${amt}`,
        short: `Risk/trade: $${amt}`,
        structured_value: { riskDollars: amt },
        entities,
        confidence: 0.9,
        importance: 0.95,
        source_message_id: msgId,
        created_at: createdAt,
      });
    }
  }

  if (isPureQuestion && out.length === 0) return [];

  // 2. Risk per trade ($ or %)
  const riskDollarStmt =
    raw.match(/\b(?:my\s+risk(?:\s+per\s+trade)?\s+is|i\s+risk|risking|cap\s+risk\s+at|changed?\s+(?:my\s+)?risk\s+to|set\s+(?:my\s+)?risk\s+to)\s*\$\s*(\d{2,5}(?:\.\d+)?)\b/i) ??
    raw.match(/\$\s*(\d{2,5}(?:\.\d+)?)\s*(?:risk\s+per\s+trade|max\s+risk\s+per\s+trade)\b/i);
  if (riskDollarStmt && !out.some((x) => x.category === "risk_per_trade")) {
    const amt = Number(riskDollarStmt[1]);
    out.push({
      id: `sem:risk_per_trade:${amt}usd`,
      type: "semantic",
      category: "risk_per_trade",
      fact_key: "user:risk_per_trade",
      content: `Risk per trade is $${amt}`,
      short: `Risk/trade: $${amt}`,
      structured_value: { riskDollars: amt },
      entities,
      confidence: 0.96,
      importance: 0.95,
      source_message_id: msgId,
      created_at: createdAt,
    });
  }

  const riskPctStmt =
    raw.match(/\b(?:my\s+risk(?:\s+per\s+trade)?\s+is|i\s+risk|risking|changed?\s+(?:my\s+)?risk\s+to|set\s+(?:my\s+)?risk\s+to)\s*(\d{1,2}(?:\.\d+)?)\s*%/i) ??
    raw.match(/\b(\d{1,2}(?:\.\d+)?)\s*%\s*(?:risk\s+per\s+trade|risk\s+per\s+setup)\b/i);
  if (riskPctStmt && !out.some((x) => x.category === "risk_per_trade")) {
    const pct = Number(riskPctStmt[1]);
    out.push({
      id: `sem:risk_per_trade:${pct}pct`,
      type: "semantic",
      category: "risk_per_trade",
      fact_key: "user:risk_per_trade",
      content: `Risk per trade is ${pct}% of account equity`,
      short: `Risk/trade: ${pct}%`,
      structured_value: { riskPct: pct },
      entities,
      confidence: 0.96,
      importance: 0.95,
      source_message_id: msgId,
      created_at: createdAt,
    });
  }

  // 3. Default stop loss size in points
  const stopStmt =
    raw.match(/\b(?:my\s+(?:default\s+|typical\s+|standard\s+|usual\s+|max\s+)?stop(?:\s+loss|\s+size)?\s+is|i\s+use\s+a|stop\s+size\s+is|changed?\s+(?:my\s+)?stop\s+to)\s*(\d{1,3}(?:\.\d+)?)\s*(?:pt|pts|point|points)\b/i) ??
    raw.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:pt|pts|point|points)\s+(?:default\s+|typical\s+|standard\s+)?stop(?:\s+loss)?\b/i);
  if (stopStmt && !out.some((x) => x.category === "stop_points")) {
    const pts = Number(stopStmt[1]);
    out.push({
      id: `sem:stop_points:${pts}pt`,
      type: "semantic",
      category: "stop_points",
      fact_key: "user:stop_points",
      content: `Default stop loss is ${pts} points`,
      short: `Stop size: ${pts} pts`,
      structured_value: { stopPoints: pts },
      entities,
      confidence: 0.95,
      importance: 0.9,
      source_message_id: msgId,
      created_at: createdAt,
    });
  }

  // 4. Daily loss limit
  const dailyLossStmt =
    raw.match(/\b(?:my\s+)?(?:daily\s+(?:loss|drawdown)\s+limit|max\s+daily\s+loss|daily\s+stop)\s*(?:is|=|to|at)?\s*\$\s*(\d{2,5}(?:\.\d+)?)\b/i) ??
    raw.match(/\$\s*(\d{2,5}(?:\.\d+)?)\s*(?:daily\s+loss\s+limit|max\s+daily\s+loss)\b/i);
  if (dailyLossStmt) {
    const limit = Number(dailyLossStmt[1]);
    out.push({
      id: `sem:daily_loss_limit:${limit}usd`,
      type: "semantic",
      category: "daily_loss_limit",
      fact_key: "user:daily_loss_limit",
      content: `Daily loss limit is $${limit}`,
      short: `Daily loss limit: $${limit}`,
      structured_value: { dailyLossLimit: limit },
      entities,
      confidence: 0.96,
      importance: 0.95,
      source_message_id: msgId,
      created_at: createdAt,
    });
  }

  // 5. Max drawdown limit
  const ddLimitStmt =
    raw.match(/\b(?:my\s+)?(?:max(?:imum)?\s+drawdown(?:\s+limit)?|trailing\s+drawdown)\s*(?:is|=|to|at)?\s*\$\s*(\d{3,6}(?:\.\d+)?)\b/i);
  if (ddLimitStmt) {
    const dd = Number(ddLimitStmt[1]);
    out.push({
      id: `sem:drawdown_limit:${dd}usd`,
      type: "semantic",
      category: "drawdown_limit",
      fact_key: "user:drawdown_limit",
      content: `Maximum drawdown limit is $${dd}`,
      short: `Max drawdown: $${dd}`,
      structured_value: { maxDrawdown: dd },
      entities,
      confidence: 0.95,
      importance: 0.92,
      source_message_id: msgId,
      created_at: createdAt,
    });
  }

  // 6. Profit target
  const targetStmt =
    raw.match(/\b(?:my\s+)?(?:profit\s+target|daily\s+target|account\s+target|goal\s+target)\s*(?:is|=|to|at)?\s*\$\s*(\d{2,6}(?:\.\d+)?)\b/i);
  if (targetStmt) {
    const target = Number(targetStmt[1]);
    out.push({
      id: `sem:profit_target:${target}usd`,
      type: "semantic",
      category: "profit_target",
      fact_key: "user:profit_target",
      content: `Profit target is $${target}`,
      short: `Profit target: $${target}`,
      structured_value: { profitTarget: target },
      entities,
      confidence: 0.94,
      importance: 0.85,
      source_message_id: msgId,
      created_at: createdAt,
    });
  }

  // 7. Instruments traded
  const instrStmt =
    raw.match(/\b(?:i\s+(?:only\s+|mainly\s+|primarily\s+|now\s+)?trade|switched\s+to(?:\s+trading)?|my\s+(?:main\s+|primary\s+)?instrument(?:s)?\s+(?:is|are))\s+([^.!?\n]{2,50})/i);
  if (instrStmt) {
    const foundInstrs = entities.filter((e) => ["MNQ", "NQ", "MES", "ES", "YM", "MYM", "RTY", "M2K", "GC", "MGC", "CL", "MCL"].includes(e));
    if (foundInstrs.length > 0) {
      const joined = foundInstrs.join(", ");
      out.push({
        id: `sem:instruments_traded:${slug(joined)}`,
        type: "semantic",
        category: "instruments_traded",
        fact_key: "user:instruments_traded",
        content: `Trades ${joined}`,
        short: `Instruments: ${joined}`,
        structured_value: { instruments: foundInstrs },
        entities: foundInstrs,
        confidence: 0.95,
        importance: 0.9,
        source_message_id: msgId,
        created_at: createdAt,
      });
    }
  }

  // 8. Account type (paper / live / prop / funded / eval)
  const acctStmt =
    raw.match(/\b(?:i\s+(?:am|m)\s+(?:trading\s+)?(?:on\s+)?(?:a\s+)?|my\s+account\s+is(?:\s+a)?|switched\s+to\s+(?:a\s+)?)(paper|sim|demo|live|funded|prop\s+firm|eval(?:uation)?|combine|apex|topstep)\b/i);
  if (acctStmt) {
    const acctRaw = acctStmt[1].toLowerCase();
    const normalized =
      /paper|sim|demo/.test(acctRaw) ? "paper"
      : /eval|combine/.test(acctRaw) ? "prop evaluation"
      : /funded|prop|apex|topstep/.test(acctRaw) ? "funded prop"
      : "live";
    out.push({
      id: `sem:account_type:${slug(normalized)}`,
      type: "semantic",
      category: "account_type",
      fact_key: "user:account_type",
      content: `Account type is ${normalized}`,
      short: `Account: ${normalized}`,
      structured_value: { accountType: normalized },
      entities,
      confidence: 0.95,
      importance: 0.88,
      source_message_id: msgId,
      created_at: createdAt,
    });
  }

  // 9. Session times
  const sessionStmt =
    raw.match(/\b(ny\s+open|london\s+open|new\s+york\s+open|asia\s+session|9:30\s*(?:to|–|-)\s*\d{1,2}:\d{2}|morning\s+session|power\s+hour)\b/i);
  if (sessionStmt && /\b(trade|session|during|only|hours)\b/i.test(raw)) {
    const sess = sessionStmt[1].trim();
    out.push({
      id: `sem:session_times:${slug(sess)}`,
      type: "semantic",
      category: "session_times",
      fact_key: "user:session_times",
      content: `Preferred trading session: ${sess}`,
      short: `Session: ${clip(sess, 32)}`,
      structured_value: { session: sess },
      entities,
      confidence: 0.93,
      importance: 0.85,
      source_message_id: msgId,
      created_at: createdAt,
    });
  }

  // 10. Strategy rules ("my rule is...", "remember that I...", "I never...", "I only enter when...")
  const ruleStmt =
    raw.match(/\b(?:my\s+(?:strategy\s+|trading\s+)?rule\s+is|i\s+only\s+enter\s+when|never\s+enter\s+before|remember(?:\s+that)?[:,]?)\s+([^.!?\n]{8,180})/i);
  if (ruleStmt && out.length === 0) {
    const ruleText = ruleStmt[1].trim();
    out.push({
      id: `sem:strategy_rules:${slug(ruleText)}`,
      type: "semantic",
      category: "strategy_rules",
      fact_key: `user:rule:${slug(ruleText.slice(0, 24))}`,
      content: `Strategy rule: ${clip(ruleText, 200)}`,
      short: clip(ruleText, 44),
      structured_value: { rule: ruleText },
      entities,
      confidence: 0.92,
      importance: 0.88,
      source_message_id: msgId,
      created_at: createdAt,
    });
  }

  // 11. Goals ("my goal is...")
  const goalStmt = raw.match(/\b(?:my\s+(?:main\s+|trading\s+)?goal\s+is|i\s+am\s+aiming\s+to)\s+([^.!?\n]{8,160})/i);
  if (goalStmt) {
    const goalText = goalStmt[1].trim();
    out.push({
      id: `sem:goals:${slug(goalText)}`,
      type: "semantic",
      category: "goals",
      fact_key: "user:goals",
      content: `Trading goal: ${clip(goalText, 200)}`,
      short: `Goal: ${clip(goalText, 38)}`,
      structured_value: { goal: goalText },
      entities,
      confidence: 0.92,
      importance: 0.85,
      source_message_id: msgId,
      created_at: createdAt,
    });
  }

  // 12. Episodic session reflection ("Today I...", "In today's session I learned...", mistake/lesson reflection)
  const episodicStmt =
    raw.match(/\b(?:today\s+i\s+(?:learned|messed\s+up|tilted|overtraded|chased|revenge\s+traded|followed\s+my\s+plan)|lesson\s+from\s+today|my\s+mistake\s+today\s+was)\b/i);
  if (episodicStmt) {
    const dateStr = createdAt.slice(0, 10);
    out.push({
      id: `ep:chat:${dateStr}:${slug(raw.slice(0, 24))}`,
      type: "episodic",
      category: "episodic_session",
      fact_key: `ep:${dateStr}`,
      content: `${dateStr} session reflection: “${clip(raw, 200)}”`,
      short: `${dateStr} · session note`,
      structured_value: { note: raw, date: dateStr },
      entities,
      confidence: 0.9,
      importance: 0.75,
      source_message_id: msgId,
      trade_ids: opts.linkedTradeIds ?? [],
      created_at: createdAt,
    });
  }

  return out;
}

export function extractEntities(text: string): string[] {
  const found = new Set<string>();
  const upper = text.toUpperCase();
  for (const sym of ["MNQ", "NQ", "MES", "ES", "YM", "MYM", "RTY", "M2K", "GC", "MGC", "CL", "MCL"]) {
    if (new RegExp(`\\b${sym}\\b`).test(upper)) found.add(sym);
  }
  for (const concept of ["FVG", "SMT", "SWEEP", "VWAP", "BOS", "CHOCH", "NY OPEN", "LONDON", "ASIA"]) {
    if (upper.includes(concept)) found.add(concept);
  }
  return [...found];
}

/**
 * Apply extracted structured memories into `MinatoBrain.memory`, handling:
 *  - Deduplication (updating existing identical facts)
 *  - Superseding contradicting facts on the same `fact_key` axis (keeping history and marking old as `superseded`)
 *  - Pinning durable user-stated semantic facts
 */
export function applyExtractedMemories(
  brain: MinatoBrain,
  extracted: ExtractedMemoryRecord[],
  now = Date.now(),
): { brain: MinatoBrain; savedRecords: ExtractedMemoryRecord[]; supersededIds: string[] } {
  if (extracted.length === 0) return { brain, savedRecords: [], supersededIds: [] };

  let store: MemoryStore = brain.memory ?? emptyMemory();
  const savedRecords: ExtractedMemoryRecord[] = [];
  const supersededIds: string[] = [];

  for (const rec of extracted) {
    const kind: MemoryKind = rec.type === "episodic" ? "episodic" : "semantic";
    const topic: MemoryTopic = CATEGORY_TO_TOPIC[rec.category] ?? "fact";

    // Check if there is an active memory on the same single-value fact_key (axis) with a different pole/id
    if (rec.type === "semantic" && rec.fact_key.startsWith("user:")) {
      for (const existing of Object.values(store.items)) {
        if (existing.axis === rec.fact_key && existing.id !== rec.id && isActive(existing)) {
          supersededIds.push(existing.id);
        }
      }
    }

    const obs: Observation = {
      id: rec.id,
      kind,
      topic,
      text: rec.content,
      short: rec.short,
      stance: "fact",
      polarity: "neutral",
      level: "established",
      confidence: rec.confidence,
      n: 1,
      axis: rec.fact_key,
      pole: rec.id,
      evidence: [
        {
          date: rec.created_at.slice(0, 10),
          entryId: rec.trade_ids?.[0],
          note: `msg:${rec.source_message_id}`,
        },
      ],
      tags: [
        `cat:${rec.category}`,
        ...rec.entities.map((e) => `ent:${e.toLowerCase()}`),
        ...Object.entries(rec.structured_value).map(([k, v]) => `val:${k}=${String(v)}`),
      ],
      origin: "user",
      at: now,
      touch: true,
      pinned: rec.type === "semantic", // durable user facts stay pinned unless unpinned/deleted
    };

    const prevItem = store.items[rec.id];
    store = observe(store, obs, now);

    // Ensure any contradicting user fact on the same axis is explicitly marked superseded even if both were pinned
    if (rec.type === "semantic" && rec.fact_key.startsWith("user:")) {
      const items = { ...store.items };
      for (const id of supersededIds) {
        const old = items[id];
        if (old && old.id !== rec.id && old.status !== "superseded") {
          const supEv: MemoryEvent = {
            at: now,
            op: "superseded",
            why: `superseded by newer user fact: “${rec.short}”`,
            prev: {
              status: old.status,
              confidence: old.confidence,
              n: old.n,
              against: old.against,
              text: old.text,
              supersededBy: old.supersededBy,
            },
          };
          items[id] = {
            ...old,
            status: "superseded",
            pinned: false,
            supersededBy: rec.id,
            log: [...old.log, supEv].slice(-6),
          };
        }
      }
      store = { ...store, items };
    }

    if (!prevItem || prevItem.text !== rec.content || prevItem.status !== "established") {
      savedRecords.push(rec);
    }
  }

  return {
    brain: { ...brain, memory: { ...store, updatedAt: now } },
    savedRecords,
    supersededIds,
  };
}

/**
 * Read active user semantic parameters (risk $, risk %, stop points, daily loss limit, instruments, account type)
 * directly from the semantic memory store so deterministic calculation tools use them automatically.
 */
export interface UserSemanticParams {
  riskDollars: number | null;
  riskPct: number | null;
  stopPoints: number | null;
  dailyLossLimit: number | null;
  drawdownLimit: number | null;
  profitTarget: number | null;
  instruments: string[];
  accountType: string | null;
}

export function readUserSemanticParams(store?: MemoryStore | null): UserSemanticParams {
  const params: UserSemanticParams = {
    riskDollars: null,
    riskPct: null,
    stopPoints: null,
    dailyLossLimit: null,
    drawdownLimit: null,
    profitTarget: null,
    instruments: [],
    accountType: null,
  };
  if (!store) return params;

  const active = Object.values(store.items)
    .filter((it) => isActive(it))
    .sort((a, b) => b.lastReinforced - a.lastReinforced);

  for (const it of active) {
    for (const tag of it.tags) {
      if (tag.startsWith("val:riskDollars=") && params.riskDollars === null) {
        const n = Number(tag.split("=")[1]);
        if (Number.isFinite(n) && n > 0) params.riskDollars = n;
      }
      if (tag.startsWith("val:riskPct=") && params.riskPct === null) {
        const n = Number(tag.split("=")[1]);
        if (Number.isFinite(n) && n > 0) params.riskPct = n;
      }
      if (tag.startsWith("val:stopPoints=") && params.stopPoints === null) {
        const n = Number(tag.split("=")[1]);
        if (Number.isFinite(n) && n > 0) params.stopPoints = n;
      }
      if (tag.startsWith("val:dailyLossLimit=") && params.dailyLossLimit === null) {
        const n = Number(tag.split("=")[1]);
        if (Number.isFinite(n) && n > 0) params.dailyLossLimit = n;
      }
      if (tag.startsWith("val:maxDrawdown=") && params.drawdownLimit === null) {
        const n = Number(tag.split("=")[1]);
        if (Number.isFinite(n) && n > 0) params.drawdownLimit = n;
      }
      if (tag.startsWith("val:profitTarget=") && params.profitTarget === null) {
        const n = Number(tag.split("=")[1]);
        if (Number.isFinite(n) && n > 0) params.profitTarget = n;
      }
      if (tag.startsWith("val:accountType=") && params.accountType === null) {
        params.accountType = tag.split("=")[1] || null;
      }
    }
    // Also parse fallback from free text if created via "Remember that..."
    if (it.origin === "user") {
      if (params.riskDollars === null) {
        const m = it.text.match(/\brisk(?:ing)?\s*(?:per\s+trade\s*)?(?:is\s*)?\$\s*(\d{2,5}(?:\.\d+)?)/i) ??
                  it.text.match(/\$\s*(\d{2,5}(?:\.\d+)?)\s*risk/i);
        if (m) params.riskDollars = Number(m[1]);
      }
      if (params.riskPct === null) {
        const m = it.text.match(/\brisk(?:ing)?\s*(?:per\s+trade\s*)?(?:is\s*)?(\d{1,2}(?:\.\d+)?)\s*%/i) ??
                  it.text.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*risk/i);
        if (m) params.riskPct = Number(m[1]);
      }
      if (params.stopPoints === null) {
        const m = it.text.match(/(\d{1,3}(?:\.\d+)?)\s*(?:pt|pts|point|points)\s*stop/i) ??
                  it.text.match(/stop(?:\s+loss|\s+size)?\s*(?:is|of)?\s*(\d{1,3}(?:\.\d+)?)\s*(?:pt|pts|point|points)/i);
        if (m) params.stopPoints = Number(m[1]);
      }
    }
  }

  return params;
}

/**
 * Summarize working memory conversation when the thread gets long (> 12 messages),
 * keeping recent turns verbatim and compressing older turns into a concise working summary.
 */
export function summarizeWorkingMemory(
  messages: { role: "user" | "buddy"; text: string }[],
  maxVerbatim = 10,
): { summary: string | null; recentMessages: { role: "user" | "buddy"; text: string }[]; approxTokens: number } {
  const fullChars = messages.reduce((s, m) => s + m.text.length, 0);
  if (messages.length <= maxVerbatim) {
    return {
      summary: null,
      recentMessages: messages,
      approxTokens: Math.ceil(fullChars / 3.7),
    };
  }

  const older = messages.slice(0, messages.length - maxVerbatim);
  const recentMessages = messages.slice(-maxVerbatim);
  const userPoints = older
    .filter((m) => m.role === "user")
    .map((m) => clip(m.text.replace(/\s+/g, " ").trim(), 90))
    .slice(-6);

  const summary = `Earlier in this conversation (${older.length} turns): trader asked/discussed: ${userPoints.join(" | ")}`;
  const usedChars = summary.length + recentMessages.reduce((s, m) => s + m.text.length, 0);

  return {
    summary,
    recentMessages,
    approxTokens: Math.ceil(usedChars / 3.7),
  };
}
