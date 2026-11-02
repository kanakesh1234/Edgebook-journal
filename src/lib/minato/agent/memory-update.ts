/**
 * MEMORY UPDATE — runs invisibly AFTER the answer has been delivered.
 *
 *  1. Daily progress checkpoint (deterministic, from the live records): lets MINATO notice "3 new trades since
 *     last time" and compare progress even if old entries are later edited or removed.
 *  2. Conversation note (deterministic): what was discussed today, so a later chat can pick it up.
 *  3. Reflection (one small LLM call): durable notes the exchange established — goals, decisions, preferences,
 *     data-verified patterns. Every note is validated, de-duplicated and dated; nothing is stored unless it
 *     passes the same checks the explicit `save_trader_insight` tool uses.
 *
 * A failure here is logged and ignored: memory is best-effort and must never affect the trader's answer.
 */
import { complete, type LlmConfig } from "./llm";
import { REFLECTION_PROMPT } from "./prompt";
import { checkpointFrom } from "./brief";
import { INSIGHT_KINDS, type InsightKind, type KnowledgeStore } from "./knowledge-store";
import type { TraderDatabaseContext } from "../db-tools";

export async function saveCheckpoint(knowledge: KnowledgeStore, db: TraderDatabaseContext): Promise<boolean> {
  if (db.entries.length === 0) return false;
  const cp = checkpointFrom(db, db.today);
  const res = await knowledge.save({
    kind: "progress",
    source: "checkpoint",
    fingerprint: `checkpoint:${db.today}`,
    asOf: db.today,
    confidence: 1,
    data: { ...cp },
    content: `Progress checkpoint ${cp.date}: ${cp.trades} trades over ${cp.tradingDays} days, net P&L ${cp.totalPnl}, trade win rate ${cp.winRateTradePct ?? "n/a"}%, drawdown room ${cp.drawdownRoom}.`,
  });
  return res.ok;
}

export async function saveConversationNote(knowledge: KnowledgeStore, today: string, userQuestions: string[]): Promise<boolean> {
  const topics = userQuestions.map((q) => q.replace(/\s+/g, " ").trim().slice(0, 90)).filter((q) => q.length > 3).slice(-5);
  if (topics.length === 0) return false;
  const res = await knowledge.save({
    kind: "conversation",
    source: "conversation",
    fingerprint: `conversation:${today}`,
    asOf: today,
    confidence: 0.9,
    content: `On ${today} the trader asked about: ${topics.join(" | ")}`.slice(0, 590),
  });
  return res.ok;
}

export function parseReflection(text: string): { kind: InsightKind; content: string; source: "trader_stated" | "analysis" }[] {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const o = JSON.parse(m[0]) as { notes?: unknown };
    if (!Array.isArray(o.notes)) return [];
    return o.notes.slice(0, 3).flatMap((n) => {
      const x = n as { kind?: unknown; content?: unknown; source?: unknown };
      if (typeof x?.content !== "string" || typeof x.kind !== "string" || !INSIGHT_KINDS.includes(x.kind as InsightKind)) return [];
      if (x.kind === "progress" || x.kind === "conversation") return [];
      return [{ kind: x.kind as InsightKind, content: x.content, source: x.source === "analysis" ? ("analysis" as const) : ("trader_stated" as const) }];
    });
  } catch {
    return [];
  }
}

export async function reflectOnTurn(opts: {
  config: LlmConfig;
  knowledge: KnowledgeStore;
  question: string;
  answer: string;
  today: string;
  usedTools: boolean;
  fetchImpl?: typeof fetch;
}): Promise<number> {
  if (opts.question.trim().length < 20 && !opts.usedTools) return 0; // greetings and acknowledgements teach nothing
  const res = await complete({
    config: opts.config,
    stream: false,
    maxTokens: 700,
    temperature: 0,
    deadline: Date.now() + 15_000,
    fetchImpl: opts.fetchImpl,
    messages: [
      { role: "system", content: REFLECTION_PROMPT },
      { role: "user", content: `TRADER: ${opts.question.slice(0, 1500)}\n\nMINATO: ${opts.answer.slice(0, 3000)}` },
    ],
  });
  if (!res.ok) return 0;
  let saved = 0;
  for (const n of parseReflection(res.content)) {
    const r = await opts.knowledge.save({ ...n, asOf: n.source === "analysis" ? opts.today : null });
    if (r.ok) saved++;
  }
  return saved;
}
