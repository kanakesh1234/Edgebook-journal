import type { CSSProperties } from "react";
import { QUOTES, STATEMENT } from "./scene-config";

/** Pinned statement: words light up as you scroll, then two pop-ups land beside it. */
/** Words picked out in gold. */
const GOLD = new Set(["Google", "Drive.", "yours."]);

export function Statement() {
  const words = STATEMENT.text.split(" ");
  return (
    <section id="vault" className="st" data-scrub="statement" style={{ "--n": words.length } as CSSProperties} aria-label="Ownership">
      <div className="st-pin">
        <p className="st-text">
          {words.map((w, i) => (
            <span key={i} className={GOLD.has(w) ? "st-gold" : undefined} style={{ "--i": i } as CSSProperties}>{w} </span>
          ))}
        </p>
        <div className="st-pops">
          <figure className="st-card">
            <figcaption>journal.json <i>· {STATEMENT.sample}</i></figcaption>
            <pre><code>{JSON.stringify(STATEMENT.json, null, 2)}</code></pre>
          </figure>
          <p className="st-note">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 10.5 8.5 14.5 15.5 6" /></svg>
            <b>{STATEMENT.note.title}</b>
            <i>{STATEMENT.note.meta}</i>
          </p>
        </div>
      </div>
    </section>
  );
}

/** Pinned motivational lines that cross-fade as you scroll. */
export function Quotes() {
  return (
    <section className="qs" data-scrub="quotes" aria-label="Principles">
      <div className="qs-pin">
        <span className="qs-rule" aria-hidden="true" />
        {QUOTES.map((q, i) => (
          <figure key={q} className="qs-q" style={{ "--qv": `var(--q${i})`, "--qyv": `var(--qy${i})` } as CSSProperties}>
            <blockquote>{q}</blockquote>
          </figure>
        ))}
      </div>
    </section>
  );
}
