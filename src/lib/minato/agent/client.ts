/**
 * CLIENT STREAM — the browser side of /api/minato/chat.
 *
 * Sends the conversation (plus a content revision of the journal), reads the NDJSON stream and reports the
 * growing final answer. If the server has no up-to-date copy of the journal it answers `need_data`; this
 * module then re-sends once with the snapshot. Everything in between (tool rounds) is invisible by design:
 * only `delta`/`done` events carry text.
 */
import type { WireSnapshot } from "./data-source";

export interface StreamArgs {
  body: Record<string, unknown>;
  /** Called only when the server asks for the journal. */
  getSnapshot: () => WireSnapshot;
  /** Receives the full answer so far (replaces, never appends). */
  onText: (text: string) => void;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  url?: string;
  gzipOverBytes?: number;
}

export interface StreamDone { text: string; actions: unknown[]; meta: Record<string, unknown> }
export type StreamOutcome =
  | ({ ok: true } & StreamDone)
  | { ok: false; code: string; message: string; partial: string };

async function encode(body: unknown, gzipOver: number): Promise<{ payload: BodyInit; headers: Record<string, string> }> {
  const text = JSON.stringify(body);
  if (text.length > gzipOver && typeof CompressionStream !== "undefined") {
    try {
      const gz = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
      const blob = await new Response(gz).blob();
      return { payload: blob, headers: { "Content-Type": "application/json", "x-minato-encoding": "gzip" } };
    } catch { /* fall through to plain */ }
  }
  return { payload: text, headers: { "Content-Type": "application/json" } };
}

async function once(args: StreamArgs, body: Record<string, unknown>): Promise<StreamOutcome | { needData: true }> {
  const doFetch = args.fetchImpl ?? fetch;
  const { payload, headers } = await encode(body, args.gzipOverBytes ?? 300_000);
  let res: Response;
  try {
    res = await doFetch(args.url ?? "/api/minato/chat", { method: "POST", headers, body: payload, signal: args.signal });
  } catch {
    return { ok: false, code: "network", message: "I couldn't reach the server. Check your connection and try again.", partial: "" };
  }
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    return { ok: false, code: j?.error ?? `http_${res.status}`, message: j?.message ?? "Something went wrong. Please try again.", partial: "" };
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let pending = "";
  let text = "";
  let done: StreamDone | null = null;
  let err: { code: string; message: string; diag?: string } | null = null;
  let need = false;

  const handle = (line: string) => {
    if (!line) return;
    let e: { t?: string; x?: string; text?: string; actions?: unknown[]; meta?: Record<string, unknown>; code?: string; message?: string; diag?: string };
    try { e = JSON.parse(line); } catch { return; }
    switch (e.t) {
      case "delta": if (typeof e.x === "string") { text += e.x; args.onText(text); } break;
      case "reset": text = ""; args.onText(""); break;
      case "need_data": need = true; break;
      case "done": done = { text: String(e.text ?? text), actions: Array.isArray(e.actions) ? e.actions : [], meta: e.meta ?? {} }; break;
      case "error": err = { code: e.code ?? "error", message: e.message ?? "Something went wrong. Please try again.", diag: e.diag }; break;
    }
    if (e.t === "error" && e.diag && typeof console !== "undefined") console.warn("[minato] engine error:", e.code, e.diag);
  };

  try {
    for (;;) {
      const { value, done: fin } = await reader.read();
      if (fin) break;
      pending += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = pending.indexOf("\n")) >= 0) { handle(pending.slice(0, nl).trim()); pending = pending.slice(nl + 1); }
    }
    if (pending.trim()) handle(pending.trim());
  } catch {
    if (!done) return { ok: false, code: "network", message: "The connection dropped while I was answering. Please ask again.", partial: text };
  }
  if (need) return { needData: true };
  if (done) { const d = done as StreamDone; if (d.text !== text) args.onText(d.text); return { ok: true, ...d }; }
  const e = err as { code: string; message: string; diag?: string } | null;
  return { ok: false, code: e?.code ?? "incomplete", message: e?.message ?? "The answer was cut off. Please ask again.", partial: text };
}

export async function streamMinato(args: StreamArgs): Promise<StreamOutcome> {
  const first = await once(args, args.body);
  if (!("needData" in first)) return first;
  const second = await once(args, { ...args.body, snapshot: args.getSnapshot() });
  if ("needData" in second) return { ok: false, code: "need_data", message: "I couldn't load your journal just now. Please try again.", partial: "" };
  return second;
}
