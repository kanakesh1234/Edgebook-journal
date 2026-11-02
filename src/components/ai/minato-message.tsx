"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { parseMinato, type MinatoBlock } from "@/lib/minato/format";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Inline: **bold**, `code`, *italic*, and +/− numbers tinted by sign  */
/* ------------------------------------------------------------------ */

const INLINE = /(\*\*[^*\n]+?\*\*|`[^`\n]+`|\*[^*\s][^*\n]*?\*)/g;
// "+$215", "−$35.5", "-0.4R", "+12%" — only when set apart from other text.
const SIGNED = /(^|[\s(])([+\u2212-]\$?\d[\d,]*(?:\.\d+)?(?:R|%)?)(?=$|[\s),.;·/])/g;

function tone(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(SIGNED)) {
    const start = (m.index ?? 0) + m[1]!.length;
    if (start > last) out.push(text.slice(last, start));
    const token = m[2]!;
    out.push(
      <span key={`${keyBase}-t${n++}`} className={token.startsWith("+") ? "mn-pos" : "mn-neg"}>
        {token}
      </span>,
    );
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderInline(text: string): React.ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null;
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="mn-strong">
          {tone(part.slice(2, -2), `b${i}`)}
        </strong>
      );
    }
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="mn-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
      return <em key={i}>{tone(part.slice(1, -1), `i${i}`)}</em>;
    }
    return <Fragment key={i}>{tone(part, `p${i}`)}</Fragment>;
  });
}

/* ------------------------------------------------------------------ */
/*  Blocks                                                             */
/* ------------------------------------------------------------------ */

function Block({ block, lead, index }: { block: MinatoBlock; lead?: boolean; index: number }) {
  const style = { "--i": index } as React.CSSProperties;
  switch (block.type) {
    case "p":
      return (
        <p className={cn("mn-block", lead ? "mn-lead" : "mn-p")} style={style}>
          {renderInline(block.text)}
        </p>
      );
    case "heading":
      return (
        <p className="mn-block mn-heading" style={style}>
          {renderInline(block.text)}
        </p>
      );
    case "kv":
      return (
        <dl className="mn-block mn-kv" style={style}>
          {block.rows.map((r, i) => (
            <div key={i} className="mn-kv-row">
              <dt>{renderInline(r.label)}</dt>
              <dd>{renderInline(r.value)}</dd>
            </div>
          ))}
        </dl>
      );
    case "list":
      return (
        <ul className="mn-block mn-list" style={style}>
          {block.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="mn-block mn-steps" style={style}>
          {block.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ol>
      );
    case "note":
      return (
        <div className="mn-block mn-note" style={style} role="note">
          {renderInline(block.text)}
        </div>
      );
    case "table":
      return (
        <div className="mn-block mn-table-wrap" style={style}>
          <table className="mn-table">
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i}>{renderInline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return (
        <pre className="mn-block mn-pre" style={style}>
          <code>{block.text}</code>
        </pre>
      );
  }
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className={cn("h-3.5 w-3.5 transition-transform duration-300", open && "rotate-90")}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="m9 6 6 6-6 6" />
  </svg>
);

/**
 * Smooth progressive text reveal.
 *
 * Works both for a finished reply and for one that is still being written: `text` may keep growing while it is
 * revealed. The reveal never restarts — it keeps its position and chases the end of the text, speeding up only
 * when it falls behind. It advances to the next whitespace so **bold** markers never flicker half-open.
 */
function useProgressiveText(text: string, animate: boolean): string {
  const textRef = useRef(text);
  textRef.current = text;
  const shownRef = useRef<number>(animate ? 0 : text.length);
  const timerRef = useRef<number | null>(null);
  const [shownLength, setShownLength] = useState<number>(() => (animate ? 0 : text.length));

  useEffect(() => {
    if (!animate) {
      shownRef.current = text.length;
      setShownLength(text.length);
      return;
    }
    if (shownRef.current > text.length) {
      shownRef.current = text.length; // the text was replaced by a shorter one
      setShownLength(text.length);
    }
    if (timerRef.current != null || shownRef.current >= text.length) return;
    timerRef.current = window.setInterval(() => {
      const full = textRef.current;
      const remaining = full.length - shownRef.current;
      if (remaining <= 0) {
        if (timerRef.current != null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        return;
      }
      let idx = Math.min(full.length, shownRef.current + Math.max(4, Math.ceil(remaining / 18)));
      // Advance to the next whitespace so markdown tokens don't flicker half-open
      while (idx < full.length && full[idx] !== " " && full[idx] !== "\n") idx++;
      shownRef.current = idx;
      setShownLength(idx);
    }, 18);
  }, [text, animate]);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    },
    [],
  );

  return shownLength >= text.length ? text : text.slice(0, shownLength);
}

/**
 * A Minato reply as a calm card: one lead sentence, quiet metric rows, an optional
 * note — and all the formulas / assumptions folded behind “Show working”.
 */
export function MinatoMessageBody({ text, animate = false }: { text: string; animate?: boolean }) {
  const revealedText = useProgressiveText(text, animate);
  const parsed = useMemo(() => parseMinato(revealedText), [revealedText]);
  const [open, setOpen] = useState(false);
  const regionId = `mn-work-${useId().replace(/:/g, "")}`;

  return (
    <div className={cn("mn-prose", animate && "mn-animate")}>
      {parsed.visible.map((b, i) => (
        <Block key={i} block={b} lead={i === 0 && b.type === "p"} index={i} />
      ))}

      {parsed.working.length > 0 && (
        <div className="mn-block mn-working" data-open={open || undefined} style={{ "--i": parsed.visible.length } as React.CSSProperties}>
          <button
            type="button"
            className="mn-working-toggle"
            aria-expanded={open}
            aria-controls={regionId}
            onClick={() => setOpen((v) => !v)}
          >
            <Chevron open={open} />
            <span>
              {open ? "Hide" : "Show"} {parsed.workingTitle}
            </span>
          </button>
          <div id={regionId} className="mn-working-body" role="region" aria-label={parsed.workingTitle}>
            <div className="mn-working-inner">
              {parsed.working.map((b, i) => (
                <Block key={i} block={b} index={0} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
