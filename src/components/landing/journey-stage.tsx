"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ChevronRightIcon } from "@/components/ui/icons";
import { clamp, lerp, prefersReducedMotion, smooth } from "./motion-utils";

/* -------------------------------------------------------------------------- */
/*  One trade, drawn once. Everything on the stage reads from this data.       */
/* -------------------------------------------------------------------------- */

const CLOSES = [
  18410, 18414, 18409, 18412, 18416, 18413, 18418, 18415, 18419, 18417,
  18421, 18418, 18422, 18419, 18423, 18420, 18424, 18421, 18425, 18422,
  18426, 18420, 18416, 18411, 18406, 18402, 18399, 18408, 18413, 18416,
  18420, 18418, 18424, 18429, 18427, 18433, 18436, 18434, 18439, 18443,
  18441, 18446, 18444, 18449, 18452, 18450, 18455, 18457,
];
const ENTRY = 18412;
const STOP = 18396;
const TARGET = 18457;
const ENTRY_IDX = 28;
const PRICE_MIN = 18392;
const PRICE_MAX = 18462;
const W = 640;
const H = 300;

const X = (i: number) => 22 + i * 13.1;
const Y = (p: number) => 14 + ((PRICE_MAX - p) / (PRICE_MAX - PRICE_MIN)) * (H - 28);
const pct = (p: number) => (Y(p) / H) * 100;

function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CANDLES = (() => {
  const r = seeded(11);
  let prev = 18408;
  return CLOSES.map((c, i) => {
    const o = prev;
    prev = c;
    const h = Math.max(o, c) + r() * 3;
    let l = Math.min(o, c) - r() * 3;
    if (i === 26) l = 18397; // the sweep
    return { o, c, h, l };
  });
})();

/* -------------------------------------------------------------------------- */
/*  Chapters                                                                   */
/* -------------------------------------------------------------------------- */

const STAGES = ["Plan", "Thought", "Setup", "Replay", "Autopsy", "Practise"] as const;

const CHAPTERS = [
  {
    title: "Start with a plan, not a position.",
    body: "Write your thesis, the liquidity you're targeting and how you feel. It takes a minute, and it's the part most journals skip.",
  },
  {
    title: "Say what you'll do before it happens.",
    body: "Add your if-then thoughts. Edgebook shows win odds from your own history and asks you to pause after back-to-back losses.",
  },
  {
    title: "Size the risk, then take the trade.",
    body: "Entry, stop and target go on the chart. You see the risk in R before you click.",
  },
  {
    title: "Watch it back, candle by candle.",
    body: "Every trade with an entry time becomes a replay you can scrub, with your own levels drawn on the chart.",
  },
  {
    title: "Find the one thing that cost you.",
    body: "Answer a few short questions. Edgebook tags the mistake and writes a two-line summary under the replay.",
  },
  {
    title: "Turn the mistake into a drill.",
    body: "Mistakes come back as practice questions on a spaced schedule, until you stop making them.",
  },
] as const;

/* ------------------------------ panels ----------------------------------- */

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-raised px-3 py-2.5">
      <p className="text-[11px] text-faint">{label}</p>
      <p className={`mt-0.5 text-[13px] font-medium leading-snug ${tone ?? "text-ink"}`}>{value}</p>
    </div>
  );
}

function PlanPanel() {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Cell label="Thesis" value="Asia low is swept, then reclaimed" />
      <Cell label="Liquidity" value="Previous day low" />
      <Cell label="State" value="Calm and rested" tone="text-profit" />
    </div>
  );
}

function ThoughtPanel() {
  return (
    <div className="space-y-2">
      {[
        "If price sweeps the Asia low, I wait for a 5m close back inside.",
        "If it chops at the open, I sit on my hands.",
      ].map((t) => (
        <p key={t} className="rounded-2xl border border-line bg-raised px-3 py-2 text-[12.5px] leading-snug text-ink">
          {t}
        </p>
      ))}
      <p className="px-1 text-[12px] text-muted">
        Win odds from your history: <span className="font-semibold text-profit">74%</span>
      </p>
    </div>
  );
}

function SetupPanel() {
  return (
    <div className="grid grid-cols-4 gap-2">
      <Cell label="Entry" value="18,412" />
      <Cell label="Stop" value="18,396" tone="text-loss" />
      <Cell label="Target" value="18,457" tone="text-profit" />
      <Cell label="Reward" value="2.8R" tone="text-gold" />
    </div>
  );
}

function ReplayPanel() {
  return (
    <div className="rounded-2xl border border-line bg-raised px-3.5 py-3">
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-medium text-ink">Long · 09:41 to 10:12</span>
        <span data-clock className="font-mono text-faint">00:00</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-ink/[0.09]">
        <div data-scrub className="h-full w-0 rounded-full bg-gold-strong" />
      </div>
    </div>
  );
}

function AutopsyPanel() {
  return (
    <div className="space-y-2">
      <p className="rounded-2xl border border-profit/25 bg-profit/[0.07] px-3 py-2 text-[12.5px] leading-snug text-ink">
        Waited for the 5m close back above the range before entering.
      </p>
      <p className="rounded-2xl border border-loss/25 bg-loss/[0.06] px-3 py-2 text-[12.5px] leading-snug text-ink">
        Mistake spotted: moved the stop at 09:52.
      </p>
    </div>
  );
}

function PractisePanel() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-raised px-3.5 py-3">
      <div>
        <p className="text-[13px] font-medium text-ink">Moving the stop early</p>
        <p className="mt-0.5 text-[12px] text-muted">Time Machine · due tomorrow</p>
      </div>
      <span className="shrink-0 rounded-full bg-gold/15 px-2.5 py-1 text-[11.5px] font-medium text-gold">Box 1 of 5</span>
    </div>
  );
}

const PANELS = [PlanPanel, ThoughtPanel, SetupPanel, ReplayPanel, AutopsyPanel, PractisePanel];

/* -------------------------------- chart ----------------------------------- */

function Chart({ full }: { full?: boolean }) {
  const lv = full ? undefined : { opacity: 0 };
  return (
    <div data-chart className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Candlestick chart of one example trade with entry, stop and target">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--color-line-soft)" strokeWidth="1" />
        ))}
        <g data-levels style={lv}>
          <line x1={X(ENTRY_IDX)} x2={W} y1={Y(ENTRY)} y2={Y(ENTRY)} stroke="var(--color-gold)" strokeWidth="1.2" strokeDasharray="4 5" />
          <line x1={X(ENTRY_IDX)} x2={W} y1={Y(STOP)} y2={Y(STOP)} stroke="var(--color-loss)" strokeWidth="1.2" strokeDasharray="4 5" />
          <line x1={X(ENTRY_IDX)} x2={W} y1={Y(TARGET)} y2={Y(TARGET)} stroke="var(--color-profit)" strokeWidth="1.2" strokeDasharray="4 5" />
          <circle cx={X(ENTRY_IDX)} cy={Y(ENTRY)} r="4.5" fill="var(--color-gold)" />
        </g>
        {CANDLES.map((c, i) => {
          const up = c.c >= c.o;
          const col = up ? "var(--color-profit)" : "var(--color-loss)";
          const top = Y(Math.max(c.o, c.c));
          const bh = Math.max(2.5, Math.abs(Y(c.o) - Y(c.c)));
          return (
            <g key={i} data-candle>
              <line x1={X(i)} x2={X(i)} y1={Y(c.h)} y2={Y(c.l)} stroke={col} strokeWidth="1.5" strokeLinecap="round" />
              <rect x={X(i) - 4} y={top} width="8" height={bh} rx="1.8" fill={col} />
            </g>
          );
        })}
      </svg>
      <div data-level-labels style={lv} aria-hidden>
        {[
          { p: TARGET, t: "Target", c: "text-profit", side: "left-2" },
          { p: ENTRY, t: "Entry", c: "text-gold", side: "right-2" },
          { p: STOP, t: "Stop", c: "text-loss", side: "right-2" },
        ].map((l) => (
          <span
            key={l.t}
            style={{ top: `${pct(l.p)}%` }}
            className={`absolute ${l.side} -translate-y-1/2 rounded-full border border-line bg-raised/90 px-2 py-0.5 text-[11px] font-medium ${l.c}`}
          >
            {l.t} {l.p.toLocaleString("en-US")}
          </span>
        ))}
      </div>
    </div>
  );
}

function Segmented() {
  return (
    <div className="relative grid grid-cols-6 rounded-full bg-ink/[0.07] p-1" role="tablist" aria-label="Trade stages">
      <span aria-hidden className="lp-pill absolute inset-y-1 left-1 rounded-full border border-line-soft bg-raised shadow-sm" style={{ width: "calc((100% - 0.5rem) / 6)" }} />
      {STAGES.map((s, i) => (
        <span
          key={s}
          role="tab"
          aria-selected={i === 0}
          data-tab
          data-on={i === 0}
          className="lp-stage-tab relative truncate px-0 py-1.5 text-center text-[10.5px] font-medium text-faint sm:px-1 sm:text-[12.5px]"
        >
          {s}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------- hero copy -------------------------------- */

function HeroCopy({ rise }: { rise?: boolean }) {
  const r = (d: string) => (rise ? { className: "lp-rise", style: { "--d": d } as React.CSSProperties } : {});
  return (
    <>
      <h1
        style={rise ? ({ "--d": "0.05s" } as React.CSSProperties) : undefined}
        className={`${rise ? "lp-rise " : ""}font-display text-[clamp(2.6rem,7.2vw,5.9rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink`}
      >
        Where disciplined traders{" "}
        <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">compound their edge.</span>
      </h1>
      <p
        {...r("0.18s")}
        className={`${rise ? "lp-rise " : ""}mt-6 max-w-2xl text-[clamp(1.05rem,1.7vw,1.35rem)] leading-snug text-muted`}
      >
        Edgebook connects your plan, your trade and your review, then keeps all of it in your own Google Drive.
      </p>
      <div
        {...r("0.3s")}
        className={`${rise ? "lp-rise " : ""}mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-3`}
      >
        <Link
          href="/login?mode=signup"
          className="inline-flex h-12 items-center rounded-full bg-gold-strong px-7 text-[17px] font-medium text-on-gold transition duration-200 hover:bg-gold-strong-hover active:scale-[0.98]"
        >
          Start your journal
        </Link>
        <a href="#how" className="group inline-flex items-center gap-1 text-[17px] text-gold transition-colors hover:text-ink">
          See how it works
          <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </a>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  The stage                                                                  */
/* -------------------------------------------------------------------------- */

const N = CHAPTERS.length;
const INTRO = 0.1;

export function JourneyStage() {
  const trackRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    gsap.registerPlugin(ScrollTrigger);
    const track = trackRef.current;
    if (!track) return;

    const hero = track.querySelector<HTMLElement>("[data-hero]")!;
    const win = track.querySelector<HTMLElement>("[data-win]")!;
    const chartEl = track.querySelector<HTMLElement>("[data-chart]")!;
    const levels = track.querySelector<SVGGElement>("[data-levels]")!;
    const labels = track.querySelector<HTMLElement>("[data-level-labels]")!;
    const readout = track.querySelector<HTMLElement>("[data-readout]")!;
    const scrub = track.querySelector<HTMLElement>("[data-scrub]")!;
    const clock = track.querySelector<HTMLElement>("[data-clock]")!;
    const pill = track.querySelector<HTMLElement>(".lp-pill")!;
    const tabs = Array.from(track.querySelectorAll<HTMLElement>("[data-tab]"));
    const candles = Array.from(track.querySelectorAll<SVGGElement>("[data-candle]"));
    const caps = Array.from(track.querySelectorAll<HTMLElement>("[data-cap]"));
    const panels = Array.from(track.querySelectorAll<HTMLElement>("[data-panel]"));

    let dx = 0;
    let dy = 0;
    let s0 = 1.1;
    let lastStage = -1;
    let lastReadout = "";

    const measure = () => {
      win.style.transform = "none";
      const r = win.getBoundingClientRect();
      dx = window.innerWidth / 2 - (r.left + r.width / 2);
      dy = window.innerHeight * 0.5;
      s0 = window.innerWidth >= 1024 ? 1.18 : 1.02;
    };

    /** Fade/slide for chapter i at chapter-position c. Last chapter holds. */
    const chapterVis = (i: number, c: number) => {
      const f = c - i;
      if (f < 0) return { v: 0, dir: 1 };
      if (i === N - 1) return { v: smooth(f / 0.14), dir: 1 };
      if (f > 1) return { v: 0, dir: -1 };
      return { v: smooth(Math.min(f / 0.14, (1 - f) / 0.14)), dir: f < 0.5 ? 1 : -1 };
    };

    const priceAt = (count: number) => {
      const pos = clamp(count - 1, 0, CLOSES.length - 1);
      const i = Math.floor(pos);
      return lerp(CLOSES[i], CLOSES[Math.min(i + 1, CLOSES.length - 1)], pos - i);
    };

    const render = (p: number) => {
      /* intro: headline leaves, window takes the stage */
      const t = clamp(p / INTRO);
      const e = smooth(t);
      win.style.transform = `translate3d(${(1 - e) * dx}px, ${(1 - e) * dy}px, 0) rotateX(${(1 - e) * 18}deg) scale(${lerp(s0, 1, e)})`;
      hero.style.opacity = String(1 - clamp(t / 0.65));
      hero.style.transform = `translate3d(0, ${-t * 70}px, 0)`;
      hero.style.pointerEvents = t > 0.4 ? "none" : "auto";

      const c = clamp((p - INTRO) / (1 - INTRO)) * N;

      /* captions + panels */
      for (let i = 0; i < N; i++) {
        const { v, dir } = chapterVis(i, c);
        const o = v * e;
        const y = dir * (1 - v) * 26;
        caps[i].style.opacity = String(o);
        caps[i].style.transform = `translate3d(0, ${y}px, 0)`;
        caps[i].style.visibility = o < 0.01 ? "hidden" : "visible";
        panels[i].style.opacity = String(o);
        panels[i].style.transform = `translate3d(0, ${y * 0.7}px, 0)`;
        panels[i].style.visibility = o < 0.01 ? "hidden" : "visible";
      }

      /* the chart builds with the story */
      let count: number;
      if (c < 1) count = lerp(3, 27, smooth(c / 0.92));
      else if (c < 2) count = 27;
      else if (c < 3) count = lerp(27, ENTRY_IDX + 1, smooth(clamp((c - 2) / 0.6)));
      else if (c < 4) count = lerp(ENTRY_IDX + 1, CLOSES.length, smooth(clamp((c - 3) / 0.92)));
      else count = CLOSES.length;
      for (let i = 0; i < candles.length; i++) {
        const o = clamp(count - i);
        candles[i].style.opacity = String(o);
        candles[i].style.transform = `scaleY(${0.35 + 0.65 * o})`;
      }
      const lvl = String(smooth(clamp((c - 2.05) / 0.4)));
      levels.style.opacity = lvl;
      labels.style.opacity = lvl;
      chartEl.style.opacity = String(1 - 0.6 * smooth(clamp((c - 5.0) / 0.35)));

      /* readout + replay scrubber */
      let text: string;
      let tone = "text-faint";
      if (c < 2) text = "Planning";
      else if (c < 3) text = "Risk 1R";
      else {
        const r = (priceAt(count) - ENTRY) / (ENTRY - STOP);
        text = `${r >= 0 ? "+" : ""}${r.toFixed(1)}R`;
        tone = r >= 0 ? "text-profit" : "text-loss";
      }
      if (text !== lastReadout) {
        readout.textContent = text;
        readout.className = `num text-[13px] font-semibold ${tone}`;
        lastReadout = text;
      }
      const replay = clamp((c - 3) / 0.92);
      scrub.style.width = `${replay * 100}%`;
      const m = 41 + Math.round(replay * 31);
      clock.textContent = `${String(9 + Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

      /* segmented control */
      const stage = e < 0.5 ? 0 : Math.min(N - 1, Math.floor(c));
      if (stage !== lastStage) {
        pill.style.setProperty("--i", String(stage));
        tabs.forEach((tb, i) => tb.setAttribute("data-on", String(i === stage)));
        lastStage = stage;
      }
    };

    const st = ScrollTrigger.create({
      trigger: track,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => render(self.progress),
      onRefresh: (self) => {
        measure();
        render(self.progress);
      },
    });
    measure();
    render(st.progress);

    return () => {
      st.kill();
      win.style.transform = "";
    };
  }, []);

  return (
    <>
      {/* -------------------- pinned, scroll-driven -------------------- */}
      <section id="story" ref={trackRef} className="lp-pinned relative" aria-label="How Edgebook works">
        <span id="how" aria-hidden className="absolute left-0 top-[118svh]" />
        <div className="sticky top-0 h-svh overflow-hidden">
          <div data-hero className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-5xl flex-col items-center px-5 pt-[clamp(88px,15svh,150px)] text-center will-change-transform">
            <HeroCopy rise />
          </div>

          <div className="relative mx-auto grid h-full max-w-[1200px] grid-rows-[auto_auto] content-center gap-5 px-5 pb-6 pt-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:grid-rows-1 lg:items-center lg:gap-14 lg:pb-0 lg:pt-12">
            {/* captions */}
            <div className="relative order-2 grid lg:order-1">
              {CHAPTERS.map((ch, i) => (
                <div key={ch.title} data-cap className="invisible col-start-1 row-start-1 will-change-transform">
                  <h2 className="font-display text-[clamp(1.5rem,3.6vw,2.9rem)] font-semibold leading-[1.06] tracking-[-0.035em] text-ink">{ch.title}</h2>
                  <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted sm:text-[17.5px]">{ch.body}</p>
                  <p className="sr-only">Stage {i + 1} of {N}: {STAGES[i]}</p>
                </div>
              ))}
            </div>

            {/* the window */}
            <div className="order-1 [perspective:1600px] lg:order-2">
              <div className="lp-win-in">
                <div
                  data-win
                  className="lp-sq mx-auto w-full max-w-[600px] overflow-hidden rounded-[28px] border border-line-strong/80 bg-surface p-3.5 shadow-[0_50px_110px_-40px_rgba(0,0,0,0.55)] will-change-transform sm:p-5 lg:max-w-none"
                >
                  <Segmented />
                  <div className="mt-3 flex items-center justify-between px-1 sm:mt-4">
                    <p className="text-[13px] font-medium text-ink">
                      MNQ <span className="font-normal text-faint">· Long · 5m</span>
                    </p>
                    <span data-readout className="num text-[13px] font-semibold text-faint">Planning</span>
                  </div>
                  <div className="mt-2 rounded-2xl border border-line bg-canvas/70 p-1.5 sm:mt-3 sm:p-2.5">
                    <Chart />
                  </div>
                  <div className="relative mt-3 grid min-h-[118px] sm:mt-4 sm:min-h-[128px]">
                    {PANELS.map((Panel, i) => (
                      <div key={i} data-panel className="invisible col-start-1 row-start-1 self-start will-change-transform">
                        <Panel />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------- reduced motion: plain, stacked -------------------- */}
      <section className="lp-static px-5 pb-16 pt-28 sm:px-8" aria-label="How Edgebook works">
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          <HeroCopy />
        </div>
        <div className="mx-auto mt-14 max-w-[1100px] space-y-6">
          <div className="lp-sq rounded-[28px] border border-line-strong/80 bg-surface p-4 sm:p-6">
            <Chart full />
          </div>
          {CHAPTERS.map((ch, i) => {
            const Panel = PANELS[i];
            return (
              <div key={ch.title} className="grid items-center gap-5 rounded-[24px] border border-line bg-surface p-5 sm:p-7 md:grid-cols-2">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl">{ch.title}</h2>
                  <p className="mt-2 text-base leading-relaxed text-muted">{ch.body}</p>
                </div>
                <div>
                  <Panel />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
