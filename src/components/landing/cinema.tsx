import Link from "next/link";
import type { CSSProperties } from "react";
import {
  DoorLeftLayer,
  DoorRightLayer,
  FarLayer,
  GateCoreLayer,
  MidLayer,
  SkyLayer,
  WaterLayer,
} from "./scene-art";
import { CatalogRail } from "./catalog-rail";
import { COPY, MARKERS } from "./scene-config";

/**
 * THE FILM — one continuous 2.5D scene on a pinned stage.
 *
 * Structure:  section.cx (tall; its height IS the scroll timeline)
 *               └ div.cx-stage (sticky, 100svh)
 *                   ├ .cx-world   depth layers (z 0–9)
 *                   ├ .cx-shade   tint + vignette + grain (z 10–19)
 *                   ├ copy        intro, panels, quote, catalog (z 20–29)
 *
 * Z-index bands: 0–9 world · 10–19 shade/framing · 20–29 narrative · 30–39 nav/controls
 * (header + rail buttons) · 40+ overlays (none yet).
 *
 * All text is real HTML. Markup is static; scroll-controller.tsx only writes CSS variables.
 */
export function Cinema() {
  const c = COPY;
  return (
    <section className="cx" data-cinema aria-label="Edgebook: the film">
      {/* Real in-page anchors at exact timeline positions (position = --at × travel). */}
      {MARKERS.map((m) => (
        <span key={m.id} id={m.id} data-flow={m.flow ?? undefined} className="cx-marker" style={{ "--at": m.p } as CSSProperties} aria-hidden="true" />
      ))}

      <div className="cx-stage" data-cinema-stage data-beat="hero">
        {/* WORLD (00–41) — depth layers, back to front */}
        <div className="cx-world" aria-hidden="true">
          <div className="cx-layer cx-l-sky"><SkyLayer /></div>
          <div className="cx-layer cx-l-far"><FarLayer /></div>
          <div className="cx-layer cx-l-mid"><MidLayer /></div>
          <div className="cx-layer cx-l-water"><WaterLayer /></div>
          <div className="cx-layer cx-l-hero">
            <div className="cx-fill cx-core"><GateCoreLayer /></div>
            <div className="cx-fill cx-door cx-door-l"><DoorLeftLayer /></div>
            <div className="cx-fill cx-door cx-door-r"><DoorRightLayer /></div>
          </div>
        </div>
        <div className="cx-shade" aria-hidden="true" />

        {/* BEAT 1 — hero */}
        <div className="cx-intro" data-cx-show="0-0.1">
          <p className="lp-eyebrow">{c.intro.eyebrow}</p>
          <h1 className="cx-title">
            {c.intro.titleLead} <em>{c.intro.titleAccent}</em>
          </h1>
          <p className="cx-sub">{c.intro.sub}</p>
          <div className="cx-cta">
            <Link href={c.intro.primary.href} className="lp-pill">{c.intro.primary.label}</Link>
            <a href={c.intro.secondary.href} className="lp-text-link lp-text-link--chev">{c.intro.secondary.label}</a>
          </div>
        </div>
        <div className="cx-cue" aria-hidden="true"><span>{c.intro.cue}</span><i /></div>

        {/* BEAT 3 — narrative A, inside the opened gate */}
        <div id="flow-method" className="cx-panel cx-a">
          <article className="cx-paper">
            <p className="lp-eyebrow lp-eyebrow--ink">{c.panelA.eyebrow}</p>
            <h2>{c.panelA.title}</h2>
            <p>{c.panelA.body}</p>
            <p className="cx-chip"><b>{c.panelA.chip.time}</b>{c.panelA.chip.label}</p>
          </article>
          <p className="cx-pop cx-pop-a1">{c.panelA.pops[0]}</p>
          <p className="cx-pop cx-pop-a2">{c.panelA.pops[1]}</p>
        </div>

        {/* BEAT 5 — panorama quote */}
        <figure className="cx-quote">
          <blockquote>{c.quote}</blockquote>
        </figure>

        {/* BEAT 6 — narrative B over the softened world */}
        <div id="flow-minato" className="cx-panel cx-b">
          <div className="cx-b-copy">
            <p className="lp-eyebrow">{c.panelB.eyebrow}</p>
            <h2>{c.panelB.title}</h2>
            <p>{c.panelB.body}</p>
          </div>
          <div className="cx-chat" role="group" aria-label={c.panelB.tag}>
            <p className="cx-chat-tag">{c.panelB.tag}</p>
            <p className="cx-bubble cx-bubble--you cx-pop-b1">{c.panelB.ask}</p>
            <p className="cx-bubble cx-bubble--ai cx-pop-b2"><span>Minato</span>{c.panelB.answer}</p>
          </div>
        </div>

        {/* BEAT 8–9 — catalog rail + final call to action */}
        <div id="flow-features" className="cx-cat" data-cx-show="0.9-1">
          <div className="cx-cat-head">
            <div>
              <p className="lp-eyebrow">{c.catalog.eyebrow}</p>
              <h2>{c.catalog.title}</h2>
            </div>
            <div className="cx-cta">
              <Link href={c.catalog.primary.href} className="lp-pill">{c.catalog.primary.label}</Link>
              <Link href={c.catalog.secondary.href} className="lp-text-link lp-text-link--chev">{c.catalog.secondary.label}</Link>
            </div>
          </div>
          <CatalogRail />
        </div>
      </div>
    </section>
  );
}
