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
import { enrichActionsFromReplyText } from "@/lib/minato/actions";
import { verifyReply, withUnverifiedNote } from "@/lib/minato/verify";
import type { TraderDatabaseContext } from "@/lib/minato/db-tools";
import type { UserSemanticParams } from "@/lib/minato/extract";
import { buildSnapshot, cachedSnapshot, scopeSnapshot, storeSnapshot, type TraderSnapshot } from "@/lib/minato/agent/data-source";
import { admit, BadRequest, dedupeKey, parseChatBody, readBody } from "@/lib/minato/agent/guards";
import { failureMessage, getAgentLlmConfig, summarizeAttempts } from "@/lib/minato/agent/llm";
import { runAgent } from "@/lib/minato/agent/loop";
import { buildBrief } from "@/lib/minato/agent/brief";
import { openKnowledgeStore } from "@/lib/minato/agent/knowledge-store";
import { reflectOnTurn, saveCheckpoint, saveConversationNote } from "@/lib/minato/agent/memory-update";
import type { AgentToolContext } from "@/lib/minato/agent/tools";

export const dynamic = "force-dynamic";
// Raise on plans that allow longer functions (Vercel Pro: up to 300). The agent's own budget is set below.
export const maxDuration = 60;

const AGENT_BUDGET_MS = Number(process.env.MINATO_AGENT_BUDGET_MS) > 5_000 ? Number(process.env.MINATO_AGENT_BUDGET_MS) : 50_000;

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

    const knowledge = await openKnowledgeStore(session);
    const clientBeliefs = sanitizeMemoryPayload(body.memory)?.beliefs ?? [];
    const { brief } = await buildBrief({ db, clock, knowledge, clientBeliefs });
    const ctx: AgentToolContext = { db, knowledge, clientBeliefs, today };

    const history = body.messages;
    const question = history[history.length - 1]!.text;
    const userTexts = history.filter((m) => m.role === "user").map((m) => m.text);
    const priorAnswers = history.filter((m) => m.role === "buddy").map((m) => m.text);

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
            const diag = `${summarizeAttempts(result.attempts)}${result.detail ? ` | ${result.detail}` : ""}`;
            console.warn(`[minato:agent] failed (${result.failure}) rounds=${result.rounds} tools=${result.toolRuns.map((t) => t.name).join(",") || "-"} ${diag}`);
            send({ t: "error", code: result.failure ?? "empty", message: failureMessage(result.failure ?? "empty"), diag });
            return;
          }

          // Every $, % and R figure must trace to the brief, a tool result, the calculator or the trader's own words.
          const v = verifyReply(result.text, [brief, result.toolRuns.map((r) => r.value), userTexts, priorAnswers]);
          const finalText = withUnverifiedNote(result.text, v);
          const actions = enrichActionsFromReplyText(finalText, [], entries);
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
            await saveCheckpoint(knowledge, db).catch(() => false);
            await saveConversationNote(knowledge, today, userTexts).catch(() => false);
            await reflectOnTurn({ config, knowledge, question, answer: finalText, today, usedTools: result.toolRuns.length > 0 }).catch(() => 0);
          };
        } catch (e) {
          console.error("[minato:agent] error:", e instanceof Error ? `${e.name}: ${e.message}` : "unknown");
          send({ t: "error", code: "internal", message: "Something went wrong while I was thinking. Please try again." });
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
