"use client";

import { useEffect, useRef } from "react";
import { computeScrollProgress, prefersReducedMotion } from "./motion-utils";
import { Eyebrow } from "./ledger";

/* ---------------------------- mini interfaces ---------------------------- */

function FeedMini() {
  return (
    <div className="relative h-full">
      <div className="absolute inset-x-5 top-3 h-24 rounded-2xl border border-line bg-raised/60" />
      <div className="absolute inset-x-2.5 top-6 h-28 rounded-2xl border border-line bg-raised/80" />
      <div className="absolute inset-x-0 top-10 rounded-2xl border border-line-strong bg-raised p-3.5 shadow-sm">
        <p className="text-[11.5px] text-faint">Because you saved Opening range reclaim</p>
        <p className="mt-1 text-[14px] font-medium text-ink">Patience on the 5m close</p>
        <div className="mt-3 h-1 rounded-full bg-ink/[0.08]">
          <div className="h-full w-2/3 rounded-full bg-gold-strong" />
        </div>
      </div>
      <p className="absolute inset-x-0 bottom-2 text-center text-[13px] text-muted">
        You&apos;re all caught up.
      </p>
    </div>
  );
}

function PractiseMini() {
  const modes = [
    ["Matrix", "var(--info)"],
    ["Time Machine", "var(--profit)"],
    ["Math Duel", "var(--gold-strong)"],
    ["Weekend Boss", "var(--loss)"],
    ["ICT Lab", "color-mix(in srgb, var(--info) 58%, var(--loss))"],
  ];
  return (
    <ul className="space-y-1.5">
      {modes.map(([n, c]) => (
        <li
          key={n}
          className="flex items-center gap-3 rounded-xl border border-line bg-raised px-3 py-2 text-[13.5px] text-ink"
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
          {n}
        </li>
      ))}
    </ul>
  );
}

function LabMini() {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line bg-raised p-3.5">
        <div className="flex justify-between text-[12px] text-muted">
          <span>Challenge</span>
          <span className="num text-ink">$10,820 of $12,000</span>
        </div>
        <div className="mt-2.5 h-1.5 rounded-full bg-ink/[0.08]">
          <div className="h-full w-[68%] rounded-full bg-profit" />
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-raised p-3.5">
        <div className="flex justify-between text-[12px] text-muted">
          <span>Drawdown room</span>
          <span className="num text-ink">$1,140 left</span>
        </div>
        <div className="mt-2.5 h-1.5 rounded-full bg-ink/[0.08]">
          <div className="h-full w-[24%] rounded-full bg-gold-strong" />
        </div>
      </div>
      <p className="px-1 text-[12.5px] text-muted">
        Playbook setups link to the decisions that prove them.
      </p>
    </div>
  );
}

function MinatoMini() {
  return (
    <div className="space-y-2 text-[13px] leading-snug">
      <p className="ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-gold-strong px-3.5 py-2 text-on-gold">
        Why do I give back Fridays?
      </p>
      <p className="max-w-[88%] rounded-2xl rounded-bl-md border border-line bg-raised px-3.5 py-2 text-ink">
        Four of your last five Friday losses came after a second entry within ten minutes.
      </p>
    </div>
  );
}

function FriendsMini() {
  const rows = [
    ["Aarav", "92%"],
    ["You", "88%"],
    ["Mei", "81%"],
  ];
  return (
    <div>
      <ul className="space-y-1.5">
        {rows.map(([n, v]) => (
          <li
            key={n}
            className={`flex items-center justify-between rounded-xl border px-3 py-2 text-[13.5px] ${
              n === "You"
                ? "border-gold/40 bg-gold/10 text-ink"
                : "border-line bg-raised text-ink"
            }`}
          >
            <span>{n}</span>
            <span className="num text-muted">{v} on plan</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 px-1 text-[12.5px] text-muted">
        No balances. No trades. Just how well each of you followed the plan.
      </p>
    </div>
  );
}

function LessonsMini() {
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-line bg-raised p-3.5">
        <p className="text-[14px] font-medium text-ink">Opening range reclaim</p>
        <p className="mt-1 text-[12.5px] leading-snug text-muted">
          Wait for the first 15 minutes, then act on the reclaim, not the impulse.
        </p>
      </div>
      <div className="flex gap-1.5">
        {["84% clean process", "+2.1R average"].map((t) => (
          <span
            key={t}
            className="rounded-full bg-profit/12 px-2.5 py-1 text-[11.5px] font-medium text-profit"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

const CARDS = [
  {
    code: "ARENA 01",
    title: "A feed that ends.",
    body: "Reflections, autopsies and lessons from your own journal. Twenty cards, then you're done for the day.",
    quote: "“Enough is a decision, not an amount.”",
    Mini: FeedMini,
  },
  {
    code: "ARENA 02",
    title: "Daily reps from your decisions.",
    body: "Five practice modes built from your rules, your numbers and your repeat mistakes.",
    quote: "“Practise the mistake until the reflex disappears.”",
    Mini: PractiseMini,
  },
  {
    code: "ARENA 03",
    title: "Test it before you risk it.",
    body: "Challenges, a playbook and scenario tests in the Trading Lab, with drawdown room always in view.",
    quote: "“Survive the drawdown first; the upside takes care of itself.”",
    Mini: LabMini,
  },
  {
    code: "ARENA 04",
    title: "A coach that has read your journal.",
    body: "MINATO answers from your own history instead of generic advice.",
    quote: "“Your own past entries already hold the answer.”",
    Mini: MinatoMini,
  },
  {
    code: "ARENA 05",
    title: "Compete on process.",
    body: "Friends compare how well they followed their plans. Dollar balances never leave your journal.",
    quote: "“Compare discipline, never bankrolls.”",
    Mini: FriendsMini,
  },
  {
    code: "ARENA 06",
    title: "Your playbook, written down.",
    body: "Write lessons once. Each one shows the win rate of the decisions linked to it.",
    quote: "“A setup is only an edge when your log proves it.”",
    Mini: LessonsMini,
  },
];

export function Toolkit() {
  const sec = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const s = sec.current;
    const t = track.current;
    if (!s || !t) return;

    let dist = 0;
    let enabled = false;
    let rafId = 0;

    const measure = () => {
      enabled = window.innerWidth >= 1024 && !prefersReducedMotion();
      if (!enabled) {
        s.style.height = "";
        t.style.transform = "";
        if (bar.current) bar.current.style.transform = "";
        return;
      }
      t.style.transform = "none";
      dist = Math.max(0, t.scrollWidth - window.innerWidth + 96);
      s.style.height = `${window.innerHeight + dist}px`;
      render();
    };

    const render = () => {
      if (!enabled) return;
      const p = computeScrollProgress(s, { pinned: true });
      t.style.transform = `translate3d(${-p * dist}px, 0, 0)`;
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
    };

    const onScroll = () => {
      if (!enabled) return;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(render);
    };

    measure();
    window.addEventListener("resize", measure, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll);
      s.style.height = "";
      t.style.transform = "";
    };
  }, []);

  return (
    <section id="toolkit" ref={sec} className="relative w-full" aria-label="Everything around the journal">
      <div ref={stage} className="lp-toolkit-stage py-20 sm:py-28 lg:py-0">
        <div className="lp-wide flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <div className="mb-4">
              <Eyebrow n="07">The Practice &amp; Mastery Arenas</Eyebrow>
            </div>
            <h2 className="font-display text-[clamp(2rem,4.6vw,3.6rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-ink">
              Everything around the journal.
            </h2>
          </div>
          <p className="max-w-xl text-[15.5px] leading-snug text-muted">
            Edgebook turns what you write down into five deliberate practice arenas, scenario labs, and process leaderboards. Scroll to glide across the full deck.
          </p>
        </div>

        <div className="mt-10 lg:mt-11 lg:pl-12 xl:pl-16">
          <div ref={track} className="lp-toolkit-track flex gap-5 sm:gap-6">
            {CARDS.map(({ code, title, body, quote, Mini }) => (
              <article
                key={title}
                className="lp-toolkit-card lp-sq flex h-[450px] w-[320px] shrink-0 flex-col justify-between rounded-[30px] border border-line-strong/75 bg-surface p-6 shadow-[var(--shadow-rest)] sm:w-[360px] lg:h-[470px] lg:w-[400px]"
              >
                <div>
                  <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.12em] text-gold">
                    <span>{code}</span>
                    <span className="text-faint">Interactive Module</span>
                  </div>
                  <h3 className="mt-2 font-display text-[22px] font-semibold leading-tight tracking-[-0.025em] text-ink">
                    {title}
                  </h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{body}</p>
                </div>

                <div className="relative min-h-[175px]">
                  <Mini />
                </div>

                <p className="border-t border-line pt-3 font-serif text-[15.5px] italic text-gold">
                  {quote}
                </p>
              </article>
            ))}
            <div className="w-4 shrink-0 lg:w-12" aria-hidden="true" />
          </div>
        </div>

        <div className="lp-wide mt-8 hidden lg:block" aria-hidden="true">
          <div className="h-1 w-full overflow-hidden rounded-full bg-line">
            <div ref={bar} className="h-full origin-left scale-x-0 bg-gold-strong" />
          </div>
        </div>
      </div>
    </section>
  );
}
