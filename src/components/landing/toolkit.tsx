"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Eyebrow } from "./ledger";

/* ---------------------------- mini interfaces ---------------------------- */

function FeedMini() {
  return (
    <div className="relative h-full">
      <div className="absolute inset-x-5 top-3 h-24 rounded-2xl border border-line bg-raised/60" />
      <div className="absolute inset-x-2.5 top-6 h-28 rounded-2xl border border-line bg-raised/80" />
      <div className="absolute inset-x-0 top-10 rounded-2xl border border-line-strong bg-raised p-3.5 shadow-sm">
        <p className="text-[11.5px] text-faint">Because you saved Opening range reclaim</p>
        <p className="mt-1 text-[14px] font-medium text-ink">NQ long, replayed</p>
        <div className="mt-3 h-1 rounded-full bg-ink/[0.08]"><div className="h-full w-2/3 rounded-full bg-gold-strong" /></div>
      </div>
      <p className="absolute inset-x-0 bottom-2 text-center text-[13px] text-muted">You&apos;re all caught up.</p>
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
        <li key={n} className="flex items-center gap-3 rounded-xl border border-line bg-raised px-3 py-2 text-[13.5px] text-ink">
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
        <div className="mt-2.5 h-1.5 rounded-full bg-ink/[0.08]"><div className="h-full w-[68%] rounded-full bg-profit" /></div>
      </div>
      <div className="rounded-2xl border border-line bg-raised p-3.5">
        <div className="flex justify-between text-[12px] text-muted">
          <span>Drawdown room</span>
          <span className="num text-ink">$1,140 left</span>
        </div>
        <div className="mt-2.5 h-1.5 rounded-full bg-ink/[0.08]"><div className="h-full w-[24%] rounded-full bg-gold-strong" /></div>
      </div>
      <p className="px-1 text-[12.5px] text-muted">Playbook setups link to the trades that prove them.</p>
    </div>
  );
}

function MinatoMini() {
  return (
    <div className="space-y-2 text-[13px] leading-snug">
      <p className="ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-gold-strong px-3.5 py-2 text-on-gold">Why do I give back Fridays?</p>
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
          <li key={n} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-[13.5px] ${n === "You" ? "border-gold/40 bg-gold/10 text-ink" : "border-line bg-raised text-ink"}`}>
            <span>{n}</span>
            <span className="num text-muted">{v} on plan</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 px-1 text-[12.5px] text-muted">No balances. No trades. Just how well each of you followed the plan.</p>
    </div>
  );
}

function LessonsMini() {
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-line bg-raised p-3.5">
        <p className="text-[14px] font-medium text-ink">Opening range reclaim</p>
        <p className="mt-1 text-[12.5px] leading-snug text-muted">Wait for the first 15 minutes, then trade the reclaim, not the break.</p>
      </div>
      <div className="flex gap-1.5">
        {["84% win rate", "+2.1R average"].map((t) => (
          <span key={t} className="rounded-full bg-profit/12 px-2.5 py-1 text-[11.5px] font-medium text-profit">{t}</span>
        ))}
      </div>
    </div>
  );
}

const CARDS = [
  { title: "A feed that ends.", body: "Charts, replays and lessons from your own journal. Twenty cards, then you're done for the day.", Mini: FeedMini },
  { title: "Daily reps from your trades.", body: "Five practice modes built from your charts, your numbers and your repeat mistakes.", Mini: PractiseMini },
  { title: "Test it before you risk it.", body: "Challenges, a playbook and backtests in the Trading Lab, with drawdown room always in view.", Mini: LabMini },
  { title: "A coach that has read your journal.", body: "MINATO answers from your own history instead of generic advice.", Mini: MinatoMini },
  { title: "Compete on process.", body: "Friends compare how well they followed their plans. Dollar balances never leave your journal.", Mini: FriendsMini },
  { title: "Your playbook, written down.", body: "Write lessons once. Each one shows the win rate of the trades linked to it.", Mini: LessonsMini },
];

export function Toolkit() {
  const sec = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
      const s = sec.current!;
      const t = track.current!;
      let dist = 0;
      const size = () => {
        t.style.transform = "none";
        dist = Math.max(0, t.scrollWidth - window.innerWidth + 64);
        s.style.height = `${window.innerHeight + dist}px`;
      };
      size();
      ScrollTrigger.addEventListener("refreshInit", size);
      const st = ScrollTrigger.create({
        trigger: s,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => {
          t.style.transform = `translate3d(${-self.progress * dist}px, 0, 0)`;
          if (bar.current) bar.current.style.transform = `scaleX(${self.progress})`;
        },
      });
      return () => {
        ScrollTrigger.removeEventListener("refreshInit", size);
        st.kill();
        s.style.height = "";
        t.style.transform = "";
      };
    });
    return () => mm.revert();
  }, []);

  return (
    <section id="toolkit" ref={sec} className="relative" aria-label="Everything around the journal">
      <div ref={stage} className="lp-toolkit-stage py-20 sm:py-28 lg:py-0">
        <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
          <div className="mb-5"><Eyebrow n="05">The toolkit</Eyebrow></div>
          <h2 className="max-w-3xl font-display text-[clamp(2rem,5vw,3.8rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-ink">
            Everything around the journal.
          </h2>
          <p className="mt-4 max-w-xl text-[clamp(1rem,1.5vw,1.2rem)] leading-snug text-muted">
            Edgebook is more than a log. The rest of the app turns what you write down into things you can practise, test and share. Screens shown use sample data.
          </p>
        </div>

        <div className="mt-10 lg:mt-12 lg:pl-[max(2rem,calc((100vw-1200px)/2+2rem))]">
          <div ref={track} className="lp-toolkit-track flex gap-4 sm:gap-5">
            {CARDS.map(({ title, body, Mini }) => (
              <article
                key={title}
                className="lp-toolkit-card lp-sq flex h-[430px] w-[300px] shrink-0 flex-col justify-between rounded-[30px] border border-line bg-surface p-6 sm:w-[340px] lg:h-[460px] lg:w-[370px]"
              >
                <div>
                  <h3 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.025em] text-ink">{title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{body}</p>
                </div>
                <div className="relative min-h-[190px]">
                  <Mini />
                </div>
              </article>
            ))}
            <div className="w-1 shrink-0 lg:w-8" aria-hidden />
          </div>
        </div>

        <div className="mx-auto mt-10 hidden w-full max-w-[1200px] px-8 lg:block" aria-hidden>
          <div className="h-px w-full bg-line">
            <div ref={bar} className="h-px origin-left scale-x-0 bg-gold-strong" />
          </div>
        </div>
      </div>
    </section>
  );
}
