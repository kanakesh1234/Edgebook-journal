import Link from "next/link";
import { Reveal } from "./reveal";
import { Eyebrow } from "./ledger";

const POINTS = [
  { t: "It reads what you wrote.", d: "Journal notes, plans, reflections, practice sessions and screenshots all count." },
  { t: "It remembers the conversation.", d: "Pick up tomorrow where you stopped today." },
  { t: "It reviews process, not markets.", d: "No signals, no predictions, no financial advice." },
] as const;

function Bubble({ me, children }: { me?: boolean; children: React.ReactNode }) {
  return (
    <div className={me ? "flex justify-end" : "flex justify-start"}>
      <p className={`max-w-[86%] rounded-[20px] px-3.5 py-2.5 text-[14px] leading-[1.45] ${me ? "rounded-br-[6px] bg-ink text-canvas" : "rounded-bl-[6px] bg-ink/[0.06] text-ink"}`}>{children}</p>
    </div>
  );
}

export function MinatoDemo() {
  return (
    <section id="minato" className="px-5 py-24 sm:px-8 sm:py-36" aria-labelledby="minato-title">
      <div className="mx-auto grid max-w-[1200px] items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-24">
        <Reveal className="order-2 lg:order-1">
          <div className="lp-sq mx-auto w-full max-w-[460px] overflow-hidden rounded-[28px] border border-line-strong/80 bg-surface shadow-[0_50px_110px_-50px_rgba(0,0,0,0.55)]" role="img" aria-label="Sample conversation with Minato about a trading habit">
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/minato-avatar.jpg" alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-ink">Minato</p>
                <p className="flex items-center gap-1.5 text-[12px] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-profit" />Your trading companion</p>
              </div>
              <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">Sample</span>
            </div>
            <div className="space-y-2.5 px-4 py-5">
              <Bubble me>Why do I keep giving back my Friday gains?</Bubble>
              <Bubble>
                You tend to take a second trade right after a green one, and your notes in those trades mention feeling “ahead”. A simple rule may help: on Fridays, stop after the first winner.
              </Bubble>
              <Bubble me>Okay. What should I practise?</Bubble>
              <Bubble>Your last two mistakes were moving the stop early. A short Time Machine drill on that is a good next step.</Bubble>
            </div>
            <div className="px-3 pb-3">
              <div className="flex items-center gap-2 rounded-[22px] bg-ink/[0.06] py-1.5 pl-4 pr-1.5">
                <span className="flex-1 text-[15px] text-faint">Ask Minato…</span>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gold-strong text-on-gold" aria-hidden>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                </span>
              </div>
            </div>
          </div>
        </Reveal>

        <div className="order-1 lg:order-2">
          <Reveal>
            <Eyebrow n="03">Minato</Eyebrow>
            <h2 id="minato-title" className="mt-6 font-display text-[clamp(2.3rem,5.4vw,4.4rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink">
              Ask the one who has{" "}
              <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">read every entry.</span>
            </h2>
          </Reveal>
          <ul className="mt-10 divide-y divide-line border-y border-line">
            {POINTS.map((p, i) => (
              <li key={p.t}>
                <Reveal delay={0.06 * i} y={16}>
                  <div className="py-5">
                    <p className="font-display text-[clamp(1.2rem,2vw,1.5rem)] font-semibold tracking-[-0.025em] text-ink">{p.t}</p>
                    <p className="mt-1.5 max-w-md text-[15.5px] leading-relaxed text-muted">{p.d}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
          <Reveal delay={0.2}>
            <Link href="/login?mode=signup" className="group mt-8 inline-flex items-center gap-1 text-[17px] text-gold transition-colors hover:text-ink">
              Meet Minato
              <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
