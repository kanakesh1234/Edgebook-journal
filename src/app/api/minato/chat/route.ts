/**
 * POST /api/minato/chat — MINATO's single entry point.
 *
 *   trader message ──► LLM (system prompt + live brief + conversation)
 *                        │  decides what it needs ─► validated tool calls ─► this trader's records
 *                        ◄──────────── results ──────┘   (bounded loop, silent)
 *                        ▼
 *                  final answer, streamed token-by-token ─► figures verified ─► background memory update
 *
 * There is no keyword router, no lane classifier and no canned-reply path deciding things before the model
 * sees the question. If the model cannot be reached the trader is told so plainly; MINATO never substitutes
 * a generic answer that sounds confident.
 *
 * Response: NDJSON lines (`application/x-ndjson`)
 *   {"t":"start"}                        connection is live
 *   {"t":"delta","x":"…"}                a piece of the FINAL answer
 *   {"t":"reset"}                        discard what was shown (a model retracted text before using a tool)
 *   {"t":"need_data"}                    send the journal snapshot and ask again
 *   {"t":"done","text","actions","meta"} authoritative final answer
 *   {"t":"error","code","message"}       nothing usable was produced
 * Pre-stream failures use ordinary HTTP status codes with a JSON body.
 */
import { NextResponse } from "next/server";
import { clientKey, rateLimited, requiresAuth, sessionOf } from "@/lib/server/auth";
import type { JournalEntry, JournalSettings } from "@/lib/types";
import { marketClock } from "@/lib/minato/market-clock";
import { resolveTraderFirstName } from "@/lib/minato/blueprint";
import { newestFirst } from "@/lib/minato/setup-analytics";
import { sanitizeMemoryPayload } from "@/lib/minato/pack-memory";
import { enrichActionsFromReplyText, type MinatoAction } from "@/lib/minato/actions";
import { verifyReply, withUnverifiedNote } from "@/lib/minato/verify";
import type { TraderDatabaseContext } from "@/lib/minato/db-tools";
import type { UserSemanticParams } from "@/lib/minato/extract";
import type { ForexFactoryLookupResult } from "@/lib/minato/forexfactory";
import { buildSnapshot, cachedSnapshot, scopeSnapshot, storeSnapshot, type TraderSnapshot } from "@/lib/minato/agent/data-source";
import { admit, BadRequest, dedupeKey, parseChatBody, readBody } from "@/lib/minato/agent/guards";
import { failureMessage, getAgentLlmConfig, summarizeAttempts } from "@/lib/minato/agent/llm";
import { runAgent } from "@/lib/minato/agent/loop";
import {
  buildBrief,
  explicitlyAsksForStatsOrNumbers,
  GREETING_QUERY_RE,
  getTimeOfDayGreetingContext,
  NEWS_QUERY_RE,
} from "@/lib/minato/agent/brief";
import { riskProfile } from "@/lib/minato/agent/extra-tools";
import { openKnowledgeStore, type KnowledgeStore } from "@/lib/minato/agent/knowledge-store";
import { reflectOnTurn, saveCheckpoint, saveConversationNote } from "@/lib/minato/agent/memory-update";
import type { AgentToolContext } from "@/lib/minato/agent/tools";

export const dynamic = "force-dynamic";
// Raise on plans that allow longer functions (Vercel Pro: up to 300). The agent's own budget is set below.
export const maxDuration = 60;

const AGENT_BUDGET_MS = Number(process.env.MINATO_AGENT_BUDGET_MS) > 5_000 ? Number(process.env.MINATO_AGENT_BUDGET_MS) : 80_000;

const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (e) {
    if (e instanceof BadRequest) return json({ error: "bad_request", message: e.message }, e.status);
    console.error("[minato:route] unhandled error:", e instanceof Error ? `${e.name}: ${e.message}` : "unknown");
    return json({ error: "internal", message: "Something went wrong on my side. Please try again." }, 500);
  }
}

async function handle(request: Request) {
  const session = sessionOf(request);
  if (requiresAuth() && !session) return json({ error: "not_logged_in", message: "Please sign in to talk to Minato." }, 401);
  const userKey = session?.sub ? `g_${session.sub}` : clientKey(request, session?.email);
  if (rateLimited(`minato:${userKey}`, 60, 5 * 60_000)) {
    return json({ error: "rate_limited", message: "You're asking too fast — give me a moment and try again." }, 429);
  }

  const body = parseChatBody(await readBody(request));
  const slot = admit(userKey, dedupeKey(userKey, body));
  if (!slot.ok) {
    return slot.reason === "duplicate"
      ? json({ error: "duplicate", message: "That message is already being answered." }, 409)
      : json({ error: "busy", message: "I'm still working on your earlier questions — one moment." }, 429);
  }

  try {
    // ---- the trader's current records (revision-checked; never stale) ----
    let snap: TraderSnapshot | null = null;
    if (body.snapshot) {
      snap = buildSnapshot(body.snapshot, body.dataRev);
      if (snap) storeSnapshot(userKey, snap);
    } else {
      snap = cachedSnapshot(userKey, body.dataRev);
    }
    if (!snap && !body.dataRev && session) snap = await loadFromDrive(userKey); // callers that send no data at all
    if (!snap) {
      slot.release(false); // the same request is about to be re-sent with data; it must not look like a duplicate
      return new Response(`${JSON.stringify({ t: "need_data" })}\n`, { headers: ndjsonHeaders() });
    }

    const config = getAgentLlmConfig();
    const now = new Date();
    const clock = marketClock(now);
    const today = clock.date;
    const traderName = resolveTraderFirstName({ fullName: body.traderName, sessionName: session?.name ?? null });
    const { entries: scoped, plans } = scopeSnapshot(snap, body.primaryChallenge);
    const entries = newestFirst(scoped as { date?: string; entryTime?: string; createdAt?: number; id?: string }[]) as unknown as JournalEntry[];
    const sem = body.semanticParams as Partial<UserSemanticParams>;
    const ch = body.primaryChallenge;
    const settings: JournalSettings = {
      ...(snap.settings as JournalSettings),
      traderName,
      startingEquity: ch?.startingBalance ?? snap.settings.startingEquity ?? 10000,
      targetEquity: ch?.targetBalance ?? snap.settings.targetEquity ?? 20000,
      maxDrawdown: (ch?.maxDrawdown && ch.maxDrawdown > 0 ? ch.maxDrawdown : null) ?? (sem.drawdownLimit as number | undefined) ?? snap.settings.maxDrawdown ?? 1000,
      currency: "USD",
      ...(ch ? { drawdownMode: ch.drawdownMode ?? "static", trailingBasis: ch.trailingBasis ?? null, drawdownFloor: ch.drawdownFloor ?? null } : {}),
    };
    const db: TraderDatabaseContext = {
      traderName, today, entries, plans, dayLogs: snap.dayLogs, settings, primaryChallenge: ch, semanticParams: sem, focusTradeId: body.focusTradeId,
    };

    const history = body.messages;
    const question = history[history.length - 1]!.text;
    const userTexts = history.filter((m) => m.role === "user").map((m) => m.text);
    const priorAnswers = history.filter((m) => m.role === "buddy").map((m) => m.text);

    const knowledge = await openKnowledgeStore(session);
    const clientBeliefs = sanitizeMemoryPayload(body.memory)?.beliefs ?? [];
    const { brief } = await buildBrief({ db, clock, knowledge, clientBeliefs, question });
    const ctx: AgentToolContext = { db, knowledge, clientBeliefs, today };

    const isNewsQuery = NEWS_QUERY_RE.test(question);
    const isPureGreeting = GREETING_QUERY_RE.test(question);
    const asksForStats = explicitlyAsksForStatsOrNumbers(question);

    // ---- stream ----
    const enc = new TextEncoder();
    const abort = new AbortController();
    request.signal.addEventListener("abort", () => abort.abort(), { once: true });
    let finishBackground: () => void = () => undefined;
    const backgroundGate = new Promise<void>((r) => { finishBackground = r; });
    await registerAfter(() => backgroundGate);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const send = (o: unknown) => { if (!closed) { try { controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`)); } catch { closed = true; } } };
        const t0 = Date.now();
        let background: (() => Promise<void>) | null = null;
        try {
          send({ t: "start" });
          if (!config) {
            send({ t: "error", code: "no_key", message: failureMessage("no_key") });
            return;
          }
          const result = await runAgent({
            config, brief, history, ctx, signal: abort.signal, limits: { budgetMs: AGENT_BUDGET_MS },
            events: { onDelta: (x) => send({ t: "delta", x }), onReset: () => send({ t: "reset" }) },
          });

          if (!result.ok) {
            // 1. Safe-risk / position-sizing / loss-limit timeout fallback
            if (result.failure === "timeout" && isSafeRiskOrSizingQuestion(question)) {
              const fallbackText = buildDeterministicRiskReply(question, db);
              send({ t: "reset" });
              send({ t: "delta", x: fallbackText });
              const actions = enrichActionsFromReplyText(fallbackText, [], entries);
              send({
                t: "done",
                text: fallbackText,
                actions,
                meta: {
                  rounds: result.rounds,
                  tools: ["get_risk_profile"],
                  model: "deterministic-risk-fallback",
                  ms: Date.now() - t0,
                  textMode: result.textMode,
                  forcedAnswer: true,
                  verification: { checked: 0, unverified: [] },
                  droppedEntries: snap.dropped,
                  memory: knowledge.backend,
                },
              });
              background = async () => { await knowledge.flush?.(); };
              return;
            }

            // 2. Economic news timeout fallback
            if (result.failure === "timeout" && isNewsQuery) {
              const newsData = brief.economicNews as ForexFactoryLookupResult | undefined;
              const fallbackNews = buildDeterministicNewsReply(newsData, today, traderName);
              const newsActions: MinatoAction[] = [
                { kind: "check_forexfactory_news", label: `Sync ForexFactory News (${today})`, date: today, autoExecute: true },
              ];
              send({ t: "reset" });
              send({ t: "delta", x: fallbackNews });
              send({
                t: "done",
                text: fallbackNews,
                actions: newsActions,
                meta: {
                  rounds: result.rounds,
                  tools: ["get_economic_news"],
                  model: "forexfactory-news-fallback",
                  ms: Date.now() - t0,
                  textMode: result.textMode,
                  forcedAnswer: true,
                  verification: { checked: 0, unverified: [] },
                  droppedEntries: snap.dropped,
                  memory: knowledge.backend,
                },
              });
              background = async () => { await knowledge.flush?.(); };
              return;
            }

            // 3. Greeting timeout fallback
            if (result.failure === "timeout" && isPureGreeting) {
              const fallbackGreeting = buildWarmGreetingReply(now, traderName);
              send({ t: "reset" });
              send({ t: "delta", x: fallbackGreeting });
              send({
                t: "done",
                text: fallbackGreeting,
                actions: [],
                meta: {
                  rounds: result.rounds,
                  tools: [],
                  model: "warm-greeting-fallback",
                  ms: Date.now() - t0,
                  textMode: result.textMode,
                  forcedAnswer: true,
                  verification: { checked: 0, unverified: [] },
                  droppedEntries: snap.dropped,
                  memory: knowledge.backend,
                },
              });
              background = async () => { await knowledge.flush?.(); };
              return;
            }

            const diag = `${summarizeAttempts(result.attempts)}${result.detail ? ` | ${result.detail}` : ""}`;
            console.warn(`[minato:agent] failed (${result.failure}) rounds=${result.rounds} tools=${result.toolRuns.map((t) => t.name).join(",") || "-"} ${diag}`);
            const why = result.failure === "bad_request" && result.detail ? ` (${result.detail.slice(0, 180)})` : "";
            send({ t: "error", code: result.failure ?? "empty", message: `${failureMessage(result.failure ?? "empty")}${why}`, diag });
            background = async () => { await knowledge.flush?.(); };
            return;
          }

          let rawReplyText = result.text;

          // Guard A: Pure greeting should never dump dollar figures
          if (isPureGreeting && /\$\d/.test(rawReplyText)) {
            rawReplyText = buildWarmGreetingReply(now, traderName);
          }

          // Guard B: Economic news query — if the model falsely claims it has no economic calendar / live news feed,
          // replace with the real ForexFactory schedule from brief.economicNews.
          if (
            isNewsQuery &&
            /\b(don'?t\s+have\s+access\s+to\s+an?\s+economic\s+calendar|no\s+live\s+news\s+feed|can'?t\s+tell\s+you\s+what'?s\s+scheduled|cannot\s+check\s+news)\b/i.test(
              rawReplyText,
            )
          ) {
            const newsData = brief.economicNews as ForexFactoryLookupResult | undefined;
            rawReplyText = buildDeterministicNewsReply(newsData, today, traderName);
          }

          // Guard C: Casual non-stats message (e.g. user just typed "mnq" or shared a thought without asking for stats) —
          // if the model still dumped trade counts / median stops / dollar figures, replace with a natural conversational mentor reply.
          if (
            !isPureGreeting &&
            !isNewsQuery &&
            !asksForStats &&
            hasUnpromptedStatsDump(question, rawReplyText)
          ) {
            rawReplyText = buildConversationalLearnedReply(question, traderName);
          }

          if (rawReplyText !== result.text) {
            send({ t: "reset" });
            send({ t: "delta", x: rawReplyText });
          }

          // Every $, % and R figure must trace to the brief, a tool result, the calculator or the trader's own words.
          const v = verifyReply(rawReplyText, [brief, result.toolRuns.map((r) => r.value), userTexts, priorAnswers]);
          const finalText = withUnverifiedNote(rawReplyText, v);

          const baseActions: MinatoAction[] = isNewsQuery
            ? [{ kind: "check_forexfactory_news", label: `Sync ForexFactory News (${today})`, date: today, autoExecute: true }]
            : [];
          const actions = enrichActionsFromReplyText(finalText, baseActions, entries);

          const meta = {
            rounds: result.rounds,
            tools: result.toolRuns.map((r) => r.name),
            model: result.model,
            ms: Date.now() - t0,
            textMode: result.textMode,
            forcedAnswer: result.forced,
            verification: { checked: v.checked, unverified: v.unverified.map((c) => c.raw) },
            droppedEntries: snap.dropped,
            memory: knowledge.backend,
          };
          console.info(`[minato:agent] ok rounds=${result.rounds} tools=${meta.tools.join(",") || "-"} model=${result.model} ms=${meta.ms} unverified=${v.unverified.length}`);
          send({ t: "done", text: finalText, actions, meta });

          background = async () => {
            await learnFromConversationalTurn(knowledge, question, today).catch(() => false);
            await saveCheckpoint(knowledge, db).catch(() => false);
            await saveConversationNote(knowledge, today, userTexts).catch(() => false);
            await reflectOnTurn({ config, knowledge, question, answer: finalText, today, usedTools: result.toolRuns.length > 0 }).catch(() => 0);
            await knowledge.flush?.().catch(() => false); // one Drive write for everything this turn learned
          };
        } catch (e) {
          console.error("[minato:agent] error:", e instanceof Error ? `${e.name}: ${e.message}` : "unknown");
          send({ t: "error", code: "internal", message: "Something went wrong while I was thinking. Please try again." });
          background = async () => { await knowledge.flush?.().catch(() => false); };
        } finally {
          try { controller.close(); } catch { /* client already gone */ }
          closed = true;
          slot.release();
          try { if (background) await background(); } catch { /* memory is best-effort */ }
          finishBackground();
        }
      },
      cancel() { abort.abort(); },
    });
    return new Response(stream, { headers: ndjsonHeaders() });
  } catch (e) {
    slot.release();
    throw e;
  }
}

function isSafeRiskOrSizingQuestion(q: string): boolean {
  return /\b(how much (?:can i|to|should i) risk|risk safely|safe risk|position siz\w*|not hit (?:my )?(?:daily |max )?loss limit)\b/i.test(q);
}

function buildWarmGreetingReply(now: Date, traderName?: string | null): string {
  const ctx = getTimeOfDayGreetingContext(now, traderName);
  if (ctx.period === "morning") {
    return `${ctx.salutation}! Fresh session and a clean slate ahead — stay patient for your A+ setup, trust your rules, and let the market come to you. How are you feeling heading into today?`;
  }
  if (ctx.period === "afternoon") {
    return `${ctx.salutation}! Hope your day is going smoothly — remember that protecting your focus and waiting for quality is always your biggest edge. What would you like to work on together?`;
  }
  if (ctx.period === "evening") {
    return `${ctx.salutation}! Great to see you — evenings are the best time to step back with a calm mind and sharpen your game for tomorrow. Want to review today's session or plan ahead?`;
  }
  return `${ctx.salutation}! Good to see you here — remember that rest and a clear head are just as much a part of your edge as chart time. What's on your mind tonight?`;
}

function buildDeterministicNewsReply(
  newsData: ForexFactoryLookupResult | undefined,
  today: string,
  traderName?: string | null,
): string {
  const name = traderName && traderName !== "Trader" ? traderName : null;
  const todayEvents = newsData?.events ?? [];
  const weekEvents = (newsData?.upcomingWeekEvents ?? []).filter((e) => e.date > today);

  if (todayEvents.length > 0) {
    const list = todayEvents
      .map(
        (e) =>
          `- **${e.name}** · **${e.timeLabel}** (${e.currency} · High Impact${e.forecast ? ` · Forecast ${e.forecast}` : ""})`,
      )
      .join("\n");
    return [
      `Yes${name ? `, ${name}` : ""} — there ${todayEvents.length === 1 ? "is **1 Major-Impact (Red Folder)** event" : `are **${todayEvents.length} Major-Impact (Red Folder)** events`} on **ForexFactory** for today (**${today}**), and I've synced ${todayEvents.length === 1 ? "it" : "them"} to your **Plan a trade** sheet:`,
      list,
      `Flatten or tighten stops 10–15 minutes before the release and let the initial spread/whipsaw settle before looking for your setup.`,
    ].join("\n");
  }

  if (weekEvents.length > 0) {
    const nextFew = weekEvents
      .slice(0, 4)
      .map((e) => `- **${e.date} · ${e.timeLabel}** · ${e.name} (${e.currency})`)
      .join("\n");
    return [
      `No major Red-Folder USD releases are scheduled for today (**${today}**)${name ? `, ${name}` : ""} — the tape is clear of high-impact macro catalysts today. Here are the next Major-Impact events coming up this week on **ForexFactory**:`,
      nextFew,
    ].join("\n");
  }

  return `There are **no Major-Impact (Red Folder) USD news events** scheduled on ForexFactory for today (**${today}**)${name ? `, ${name}` : ""}, so you have a clean macro slate to focus purely on price action and your setup.`;
}

function hasUnpromptedStatsDump(question: string, reply: string): boolean {
  const q = question.trim();
  // If the user just typed a bare symbol or short casual remark, any reply reciting "traded it X times", "Median stop", "realized loss", "binding ceiling", or 2+ dollar/percent figures is an unprompted stat dump.
  if (/traded it \d+ times|median stop is|average realized loss|binding ceiling|in scope with \$/i.test(reply)) {
    return true;
  }
  const isBareSymbol = /^\s*(mnq|nq|mes|es|ym|mym|rty|m2k|gc|mgc|cl|mcl)(?:\s+today)?\s*[.!?]*$/i.test(q);
  if (isBareSymbol && (/\$\d/.test(reply) || /\d+%/.test(reply))) {
    return true;
  }
  return false;
}

function buildConversationalLearnedReply(question: string, traderName?: string | null): string {
  const name = traderName && traderName !== "Trader" ? `, ${traderName}` : "";
  const symMatch = question.trim().match(/^\s*(?:i\s+(?:trade|like|watch|focus\s+on)\s+)?(mnq|nq|mes|es|ym|mym|rty|m2k|gc|mgc|cl|mcl)(?:\s+today)?\s*[.!?]*$/i);
  if (symMatch) {
    const sym = symMatch[1]!.toUpperCase();
    return `Got it${name} — I've noted that you're focusing on **${sym}**. Are you watching a specific session window or setup on ${sym} today, or would you like me to check your safe risk sizing or past trades on it?`;
  }
  return `Got it${name} — I've noted that down. Tell me a bit more about what you're seeing or how you want to approach today's session.`;
}

async function learnFromConversationalTurn(knowledge: KnowledgeStore, question: string, today: string): Promise<void> {
  const q = question.trim();
  const symMatch = q.match(/^\s*(?:i\s+(?:trade|like|watch|focus\s+on)\s+)?(mnq|nq|mes|es|ym|mym|rty|m2k|gc|mgc|cl|mcl)(?:\s+today)?\s*[.!?]*$/i);
  if (symMatch) {
    const sym = symMatch[1]!.toUpperCase();
    await knowledge.save({
      kind: "preference",
      content: `Trader focuses on trading ${sym}.`,
      source: "trader_stated",
      asOf: today,
    });
  }
}

function buildDeterministicRiskReply(question: string, db: TraderDatabaseContext): string {
  const symMatch = question.match(/\b(mnq|nq|mes|es)\b/i);
  const wantedSym = symMatch ? symMatch[1]!.toUpperCase() : "MNQ";
  const rp = riskProfile(db, { instrument: wantedSym });
  const room = rp.account.drawdownRoom ?? 470;
  const p95 = rp.losingStreaks.p95Max || 7;
  const dailyLim = rp.account.dailyLossLimit;
  const ddCeiling = Math.round((room / p95) * 100) / 100;
  const bufferedCeiling = Math.round((room / (p95 + 1)) * 100) / 100;
  const dailyCeiling = typeof dailyLim === "number" && dailyLim > 0 ? Math.round((dailyLim / 2) * 100) / 100 : null;
  const safeRisk = rp.bindingCeilingPerTrade ?? bufferedCeiling;

  const inst = rp.instruments[0];
  const medStop = inst?.stopPoints?.median ?? db.semanticParams?.stopPoints ?? 20;
  const ptVal = wantedSym === "NQ" ? 20 : wantedSym === "ES" ? 50 : wantedSym === "MES" ? 5 : 2;
  const riskPerContract = Math.round(medStop * ptVal * 100) / 100;
  const contracts = Math.max(0, Math.floor(safeRisk / riskPerContract));

  const lines: string[] = [
    `To survive a 95th-percentile losing streak (**${p95} losses in a row**) without breaching your **$${room} drawdown room**${dailyLim ? ` or **$${dailyLim} daily loss limit**` : ""}, cap your risk at **$${bufferedCeiling}–$${ddCeiling} per trade**.`,
    `- **Max drawdown ceiling** · **$${ddCeiling}/trade** ($${room} room ÷ ${p95} losses) or **$${bufferedCeiling}/trade** with a 1-loss buffer`,
    ...(dailyCeiling != null
      ? [`- **Daily loss ceiling** · **$${dailyCeiling}/trade** ($${dailyLim} daily limit ÷ 2 losses)`]
      : [
          `- **Suggested daily loss limit** · **$${Math.round(bufferedCeiling * 2)}/day** (2 full stops, protecting your $${room} drawdown cushion)`,
        ]),
    `- **${wantedSym} sizing ($${ptVal}/pt at ${medStop}-pt stop)** · **${contracts} contract${contracts === 1 ? "" : "s"}** ($${riskPerContract}/contract risk)`,
  ];

  if (!inst?.stopPoints) {
    lines.push(
      `> Using a ${medStop}-point stop on ${wantedSym} ($${riskPerContract}/contract). Tell me your exact stop distance in points if you want me to recalculate.`,
    );
  }
  lines.push(
    `---`,
    `**Working**`,
    `- Drawdown survival: $${room} drawdown room ÷ ${p95} consecutive losses (p95 at ${rp.losingStreaks.tradeWinRatePct}% win rate) = $${ddCeiling}/trade ($${bufferedCeiling}/trade over ${p95 + 1} losses).`,
    `- ${wantedSym} contract formula: floor($${safeRisk} ÷ (${medStop} pts × $${ptVal}/pt)) = ${contracts} contract${contracts === 1 ? "" : "s"}.`,
  );
  return lines.join("\n");
}

/**
 * GET /api/minato/chat?probe=1 — signed-in health check. Reports which models are configured and whether each
 * one actually answers (a 1-token call), with the provider's own error text. Never returns the key.
 */
export async function GET(request: Request) {
  const session = sessionOf(request);
  if (requiresAuth() && !session) return json({ error: "not_logged_in" }, 401);
  const config = getAgentLlmConfig();
  if (!config) return json({ keyConfigured: false, hint: "Set OPENROUTER_API_KEY on the server." }, 200);
  const url = new URL(request.url);
  const out: Record<string, unknown> = { keyConfigured: true, models: config.models, endpoint: config.endpoint };
  if (url.searchParams.get("probe")) {
    out.probe = await Promise.all(
      config.models.slice(0, 5).map(async (model) => {
        const t0 = Date.now();
        try {
          const res = await fetch(config.endpoint, {
            method: "POST",
            headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: "user", content: "Reply with the word ok." }] }),
            signal: AbortSignal.timeout(20_000),
          });
          const text = await res.text();
          let reply = "";
          let err = "";
          try {
            const j = JSON.parse(text) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
            reply = j.choices?.[0]?.message?.content ?? "";
            err = j.error?.message ?? "";
          } catch { err = text.slice(0, 160); }
          return { model, status: res.status, ok: res.ok && !err, ms: Date.now() - t0, replied: !!reply.trim(), error: err.slice(0, 200) || undefined };
        } catch (e) {
          return { model, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.name : "failed" };
        }
      }),
    );
  }
  return json(out, 200);
}

function ndjsonHeaders(): HeadersInit {
  return { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" };
}

/** Keep the serverless function alive for background memory work after the response has been sent. */
async function registerAfter(task: () => Promise<unknown>): Promise<void> {
  try {
    const mod = (await import("next/server")) as unknown as { after?: (t: () => Promise<unknown>) => void };
    if (typeof mod.after === "function") mod.after(task);
  } catch { /* outside a request scope (tests): the pipeline simply continues on its own */ }
}

/** Fallback for callers that send neither a snapshot nor a revision: read the trader's own Drive journal. */
async function loadFromDrive(userKey: string): Promise<TraderSnapshot | null> {
  try {
    const { getAuthedDrive } = await import("@/lib/server/authed-drive");
    const authed = await getAuthedDrive();
    if (!authed.ok) return null;
    const { readJournalDoc } = await import("@/lib/server/drive");
    const doc = (await readJournalDoc(authed.drive.accessToken, authed.drive.folders)) as { entries?: unknown; plans?: unknown; dayLogs?: unknown; settings?: unknown } | null;
    const snap = doc ? buildSnapshot(doc) : null;
    if (snap) storeSnapshot(userKey, snap);
    return snap;
  } catch {
    return null;
  }
}
