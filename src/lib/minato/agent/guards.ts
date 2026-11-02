/**
 * GUARDS — everything that stands between "whatever arrived over HTTP" and the agent.
 *
 *  - Body decoding (plain or gzip) with hard size ceilings
 *  - Shape validation and bounding of the conversation
 *  - Duplicate-request protection (same trader, same message, still running or just finished)
 *  - Per-trader concurrency cap, so a stuck client cannot fan out paid LLM calls
 */
import type { ChallengeScope, WireSnapshot } from "./data-source";

export const MAX_COMPRESSED_BYTES = 8 * 1024 * 1024;
export const MAX_BODY_BYTES = 48 * 1024 * 1024;
export const MAX_MESSAGE_CHARS = 8_000;
export const MAX_TURNS = 40;

export interface ChatBody {
  requestId: string | null;
  messages: { role: "user" | "buddy"; text: string }[];
  traderName: string | null;
  dataRev: string | null;
  snapshot: WireSnapshot | null;
  primaryChallenge: ChallengeScope;
  focusTradeId: string | null;
  semanticParams: Record<string, unknown>;
  memory: unknown;
}

export class BadRequest extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export async function readBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_COMPRESSED_BYTES) throw new BadRequest("request too large", 413);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.byteLength > MAX_COMPRESSED_BYTES) throw new BadRequest("request too large", 413);
  let bytes = buf;
  if (request.headers.get("x-minato-encoding") === "gzip") {
    try {
      const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = stream.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new BadRequest("request too large", 413); }
        chunks.push(value);
      }
      bytes = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { bytes.set(c, off); off += c.byteLength; }
    } catch (e) {
      if (e instanceof BadRequest) throw e;
      throw new BadRequest("could not decode request");
    }
  }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new BadRequest("invalid JSON"); }
}

const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);

export function parseChatBody(raw: unknown): ChatBody {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new BadRequest("invalid request");
  const b = raw as Record<string, unknown>;
  const messages = (Array.isArray(b.messages) ? b.messages : [])
    .filter((m): m is { role: "user" | "buddy"; text: string } => !!m && typeof m === "object" && ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "buddy") && typeof (m as { text?: unknown }).text === "string")
    .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_MESSAGE_CHARS) }))
    .filter((m) => m.text.trim().length > 0)
    .slice(-MAX_TURNS);
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") throw new BadRequest("the last message must be from the trader");
  const snap = b.snapshot && typeof b.snapshot === "object" && !Array.isArray(b.snapshot) ? (b.snapshot as WireSnapshot) : null;
  const sem = b.semanticParams && typeof b.semanticParams === "object" && !Array.isArray(b.semanticParams) ? (b.semanticParams as Record<string, unknown>) : {};
  const ch = b.primaryChallenge && typeof b.primaryChallenge === "object" && typeof (b.primaryChallenge as { id?: unknown }).id === "string" ? (b.primaryChallenge as ChallengeScope) : null;
  return {
    requestId: str(b.requestId, 80),
    messages,
    traderName: str(b.traderName, 60),
    dataRev: str(b.dataRev, 120),
    snapshot: snap,
    primaryChallenge: ch,
    focusTradeId: str(b.focusTradeId, 80),
    semanticParams: JSON.stringify(sem).length < 20_000 ? sem : {},
    memory: b.memory ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Duplicate & concurrency protection                                 */
/* ------------------------------------------------------------------ */

const inflight = new Map<string, number>(); // dedupe key → started at
const perUser = new Map<string, number>();
const recent = new Map<string, number>(); // dedupe key → finished at
const COOLDOWN_MS = 2_000;
const STALE_MS = 150_000;
export const MAX_CONCURRENT = 3;

export function dedupeKey(userKey: string, body: ChatBody): string {
  const last = body.messages[body.messages.length - 1]!.text;
  return `${userKey}|${body.requestId ?? ""}|${body.messages.length}|${last.slice(0, 200)}`;
}

export type Admission = { ok: true; release(cooldown?: boolean): void } | { ok: false; reason: "duplicate" | "busy" };

export function admit(userKey: string, key: string, now = Date.now()): Admission {
  for (const [k, t] of inflight) if (now - t > STALE_MS) inflight.delete(k);
  for (const [k, t] of recent) if (now - t > COOLDOWN_MS) recent.delete(k);
  if (inflight.has(key) || recent.has(key)) return { ok: false, reason: "duplicate" };
  if ((perUser.get(userKey) ?? 0) >= MAX_CONCURRENT) return { ok: false, reason: "busy" };
  inflight.set(key, now);
  perUser.set(userKey, (perUser.get(userKey) ?? 0) + 1);
  let released = false;
  return {
    ok: true,
    release(cooldown = true) {
      if (released) return;
      released = true;
      inflight.delete(key);
      if (cooldown) recent.set(key, Date.now());
      const n = (perUser.get(userKey) ?? 1) - 1;
      if (n <= 0) perUser.delete(userKey); else perUser.set(userKey, n);
    },
  };
}

export const _resetGuards = () => { inflight.clear(); perUser.clear(); recent.clear(); };
