/**
 * MINATO REPLY FORMAT
 *
 * Minato answers in a small, strict dialect of Markdown so the panel can render
 * a calm, scannable card instead of a wall of text:
 *
 *   Headline sentence with the **key numbers** bolded.        → lead
 *   - **Label** · value                                       → metric row
 *   > One short warning or caveat                             → note
 *   | a | b |  tables                                         → table
 *   ---                                                       → everything below is "working"
 *   **Working**                                               (folded behind "Show working")
 *
 * This module is pure (no React) so it can be unit-tested.
 */

export type MinatoBlock =
  | { type: "p"; text: string }
  | { type: "heading"; text: string }
  | { type: "kv"; rows: { label: string; value: string }[] }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: string[] }
  | { type: "note"; text: string }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "code"; text: string };

export interface ParsedMinato {
  visible: MinatoBlock[];
  working: MinatoBlock[];
  /** Lower-case noun for the toggle: "working", "assumptions", "details"… */
  workingTitle: string;
}

/** Longest value that still reads well as a right-aligned metric. */
const KV_MAX_VALUE = 72;

const KV_OUTER = /^\*\*([^*\n]{1,44}?)\*\*\s*(?:[:：·—–]|-\s)\s*(.+)$/; // **Label** · value
const KV_INNER = /^\*\*([^*\n]{1,44}?)[:：]\*\*\s*(.+)$/; //            **Label:** value
const WORKING_RE =
  /^(?:working|assumptions?(?:\s*(?:&|and)\s*caveats?)?|caveats?|method(?:ology)?|formulas?|sample[-\s]size|how\s+(?:i|this\s+was)\s+(?:got|calculated|computed)|details?)\b/i;
const DIVIDER_RE = /^\s*(?:-{3,}|_{3,}|\*{3,}|—{2,})\s*$/;

export function stripMarkup(s: string): string {
  return s.replace(/\*\*/g, "").replace(/`/g, "").replace(/(^|\s)\*([^*]+)\*(?=\s|$)/g, "$1$2").trim();
}

function splitKv(text: string): { label: string; value: string } | null {
  const m = text.match(KV_INNER) ?? text.match(KV_OUTER);
  if (!m) return null;
  const label = m[1]!.replace(/[:：]\s*$/, "").trim();
  const value = m[2]!.trim();
  if (!label || !value || stripMarkup(value).length > KV_MAX_VALUE) return null;
  return { label, value };
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Parses a block of lines (no divider handling) into blocks. */
function parseLines(lines: string[]): MinatoBlock[] {
  const blocks: MinatoBlock[] = [];
  let i = 0;

  const flushItems = (items: { text: string; numbered: boolean }[]) => {
    let run: { label: string; value: string }[] = [];
    let plain: { text: string; numbered: boolean }[] = [];
    const flushRun = () => {
      if (run.length) blocks.push({ type: "kv", rows: run });
      run = [];
    };
    const flushPlain = () => {
      if (plain.length) {
        const numbered = plain.every((p) => p.numbered);
        blocks.push({ type: numbered ? "steps" : "list", items: plain.map((p) => p.text) });
      }
      plain = [];
    };
    for (const it of items) {
      const kv = splitKv(it.text);
      if (kv) {
        flushPlain();
        run.push(kv);
      } else {
        flushRun();
        plain.push(it);
      }
    }
    flushRun();
    flushPlain();
  };

  while (i < lines.length) {
    const raw = lines[i]!;
    const line = raw.trimEnd();
    if (!line.trim()) {
      i++;
      continue;
    }

    // fenced code
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) body.push(lines[i++]!);
      i++;
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }

    // table
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1]!)) {
      const head = splitTableRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) rows.push(splitTableRow(lines[i++]!));
      blocks.push({ type: "table", head, rows });
      continue;
    }

    // blockquote → note
    if (/^\s*>/.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) parts.push(lines[i++]!.replace(/^\s*>\s?/, "").trim());
      const text = parts.filter(Boolean).join(" ");
      if (text) blocks.push({ type: "note", text });
      continue;
    }

    // headings: "## Title" or a line that is only **Label** / **Label:**
    const h = line.match(/^\s*#{1,4}\s+(.+)$/) ?? line.match(/^\s*\*\*([^*\n]{2,48}?)\*\*[:：]?\s*$/);
    if (h) {
      blocks.push({ type: "heading", text: h[1]!.replace(/[:：]\s*$/, "").trim() });
      i++;
      continue;
    }

    // bullets / numbered runs
    if (/^\s*(?:[-•–]|\*(?=\s))\s+\S/.test(line) || /^\s*\d+[.)]\s+\S/.test(line)) {
      const items: { text: string; numbered: boolean }[] = [];
      while (i < lines.length) {
        const l = lines[i]!.trimEnd();
        const b = l.match(/^\s*(?:[-•–]|\*(?=\s))\s+(\S.*)$/);
        const n = l.match(/^\s*\d+[.)]\s+(\S.*)$/);
        if (b) items.push({ text: b[1]!.trim(), numbered: false });
        else if (n) items.push({ text: n[1]!.trim(), numbered: true });
        else break;
        i++;
      }
      flushItems(items);
      continue;
    }

    // plain paragraph (one line = one paragraph, like a chat message)
    blocks.push({ type: "p", text: line.trim() });
    i++;
  }
  return blocks;
}

function blockLead(b: MinatoBlock): string {
  switch (b.type) {
    case "p":
    case "heading":
    case "note":
      return stripMarkup(b.text);
    case "kv":
      return stripMarkup(b.rows[0]?.label ?? "");
    case "list":
    case "steps":
      return stripMarkup(b.items[0] ?? "");
    default:
      return "";
  }
}

/** Splits kv/list blocks so only the working-ish rows move into the fold. */
function partitionWorking(blocks: MinatoBlock[]): { visible: MinatoBlock[]; working: MinatoBlock[] } {
  const visible: MinatoBlock[] = [];
  const working: MinatoBlock[] = [];
  let inWorking = false;
  blocks.forEach((b, idx) => {
    if (idx === 0) {
      visible.push(b);
      return;
    }
    if (b.type === "kv") {
      const keep = b.rows.filter((r) => !WORKING_RE.test(stripMarkup(r.label)));
      const move = b.rows.filter((r) => WORKING_RE.test(stripMarkup(r.label)));
      if (keep.length) visible.push({ type: "kv", rows: keep });
      if (move.length) working.push({ type: "kv", rows: move });
      return;
    }
    if (b.type === "list" || b.type === "steps") {
      const keep = b.items.filter((it) => !WORKING_RE.test(stripMarkup(it)));
      const move = b.items.filter((it) => WORKING_RE.test(stripMarkup(it)));
      if (keep.length) visible.push({ type: b.type, items: keep });
      if (move.length) working.push({ type: "list", items: move });
      return;
    }
    if ((b.type === "p" || b.type === "heading") && WORKING_RE.test(blockLead(b))) {
      inWorking = b.type === "heading"; // a heading opens a section; a lone paragraph does not
      working.push(b);
      return;
    }
    if (inWorking && b.type !== "heading") {
      working.push(b);
      return;
    }
    inWorking = false;
    visible.push(b);
  });
  return { visible, working };
}

export function parseMinato(input: string): ParsedMinato {
  const text = (input ?? "").replace(/\r/g, "").replace(/\\\*/g, "*").trim();
  const lines = text.split("\n");

  // Explicit divider wins — but only when there is an answer above it.
  const dividerIdx = lines.findIndex((l) => DIVIDER_RE.test(l));
  const hasAnswerAbove = dividerIdx > 0 && lines.slice(0, dividerIdx).some((l) => l.trim());

  let visible: MinatoBlock[];
  let working: MinatoBlock[] = [];

  if (hasAnswerAbove) {
    visible = parseLines(lines.slice(0, dividerIdx));
    working = parseLines(lines.slice(dividerIdx + 1).filter((l) => !DIVIDER_RE.test(l)));
  } else {
    const all = parseLines(lines.filter((l) => !DIVIDER_RE.test(l)));
    ({ visible, working } = partitionWorking(all));
  }

  // The working section may start with its own label ("**Working**", "## Assumptions").
  let workingTitle = "working";
  const first = working[0];
  if (first && (first.type === "heading" || first.type === "p")) {
    const label = blockLead(first).toLowerCase().replace(/[:：]\s*$/, "");
    if (first.type === "heading" && label.length <= 28) {
      workingTitle = label || workingTitle;
      working = working.slice(1);
    }
  }

  // Never leave the reader with an empty answer.
  if (visible.length === 0 && working.length > 0) {
    visible = working;
    working = [];
  }

  return { visible, working, workingTitle };
}

/** Plain text for the clipboard — no markup, no fold markers. */
export function minatoPlainText(input: string): string {
  return (input ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => !DIVIDER_RE.test(l))
    .map((l) => stripMarkup(l.replace(/^\s*>\s?/, "").replace(/^\s*#{1,4}\s+/, "")))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
