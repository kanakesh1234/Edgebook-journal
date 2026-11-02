/**
 * STREAM CLEAN — keeps model-internal markup out of the trader's view while the answer streams.
 *
 * Free and reasoning models sometimes emit `<think>…</think>` blocks, a leading "Minato:" label, or (in text-tool
 * mode) a `<tool_call>{…}</tool_call>` block. None of that may ever reach the screen, even for a moment, and
 * it can arrive split across network chunks ("<thi" + "nk>"). This incremental filter holds back only what could
 * still turn out to be markup and releases everything else immediately, so the stream stays live.
 */

interface Markup { open: string; close: string; kind: "think" | "tool" }

const MARKUP: Markup[] = [
  { open: "<think>", close: "</think>", kind: "think" },
  { open: "<thinking>", close: "</thinking>", kind: "think" },
  { open: "<reasoning>", close: "</reasoning>", kind: "think" },
  { open: "<tool_call>", close: "</tool_call>", kind: "tool" },
];
const LABEL = /^\s*(?:minato|assistant)\s*:\s*/i;
const LEAD_HOLD = 11;

export interface StreamCleaner {
  /** Feed a raw chunk; returns the text that is safe to show now. */
  push(chunk: string): string;
  /** End of stream; releases anything still held that turned out not to be markup. */
  flush(): string;
  /** True once a `<tool_call>` block was seen (everything after it is suppressed). */
  readonly sawToolMarkup: boolean;
}

export function createStreamCleaner(): StreamCleaner {
  let buf = "";
  let mode: "text" | "think" | "tool" = "text";
  let closeTag = "";
  let lead = true; // still deciding whether the reply starts with a "Minato:" label
  let leadBuf = "";
  let sawTool = false;

  const releaseLead = (text: string, force: boolean): string => {
    if (!lead) return text;
    leadBuf += text;
    const t = leadBuf.trim();
    // Only a reply that starts like "Minato:" / "Assistant:" needs holding; anything else streams immediately.
    const couldBeLabel = t.length > 0 && /^(m|a)/i.test(t) && !t.includes(":") && t.length < LEAD_HOLD;
    if (!force && (t.length === 0 || couldBeLabel)) return "";
    lead = false;
    const out = leadBuf.replace(LABEL, "").replace(/^\s+/, "");
    leadBuf = "";
    return out;
  };

  function drain(final: boolean): string {
    let out = "";
    for (;;) {
      if (mode === "tool") { buf = ""; return out; }
      if (mode === "think") {
        const i = buf.indexOf(closeTag);
        if (i >= 0) { buf = buf.slice(i + closeTag.length); mode = "text"; continue; }
        buf = final ? "" : buf.slice(Math.max(0, buf.length - (closeTag.length - 1)));
        return out;
      }
      const lt = buf.indexOf("<");
      if (lt < 0) { out += buf; buf = ""; return out; }
      const rest = buf.slice(lt);
      const full = MARKUP.find((m) => rest.startsWith(m.open));
      if (full) {
        out += buf.slice(0, lt);
        buf = rest.slice(full.open.length);
        mode = full.kind;
        closeTag = full.close;
        if (full.kind === "tool") sawTool = true;
        continue;
      }
      const partial = !final && MARKUP.some((m) => m.open.length > rest.length && m.open.startsWith(rest));
      if (partial) { out += buf.slice(0, lt); buf = rest; return out; }
      out += buf.slice(0, lt + 1);
      buf = buf.slice(lt + 1);
    }
  }

  return {
    push(chunk: string) {
      buf += chunk;
      return releaseLead(drain(false), false);
    },
    flush() {
      const tail = drain(true);
      return releaseLead(tail, true);
    },
    get sawToolMarkup() { return sawTool; },
  };
}

/** One-shot cleaning of a complete reply (same rules as the stream filter, plus fence/escape tidy-up). */
export function cleanFinalText(raw: string): string {
  const c = createStreamCleaner();
  let t = (c.push(raw ?? "") + c.flush()).trim();
  t = t.replace(/^```[a-z]*\n([\s\S]*?)\n```$/i, "$1").replace(/\\\*/g, "*").trim();
  return t;
}
