import type { Metadata } from "next";
import "@/components/landing/landing.css";
import { LandingNav } from "@/components/landing/nav";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { DirectorHud } from "@/components/landing/director-hud";
import { JourneyStage, DecisionRitualStage } from "@/components/landing/journey-stage";
import { StoryFilmScroll } from "@/components/landing/story-film-scroll";
import { Gap } from "@/components/landing/gap";
import { Toolkit } from "@/components/landing/toolkit";
import { MinatoDemo } from "@/components/landing/minato-demo";
import { Road } from "@/components/landing/road";
import { DriveStatement } from "@/components/landing/drive-statement";
import { Calm } from "@/components/landing/calm";
import { FinalCta, SiteFooter } from "@/components/landing/footer-cta";

export const metadata: Metadata = {
  title: {
    absolute:
      "Edgebook — The Operator's Trial · Most journals record the result. Edgebook records the decision.",
  },
  description:
    "Play through a full trading process session: lock your pre-bell intention, survive the 09:30 live tape, X-ray trade autopsies, battle across 5 practice arenas, and grow your ledger from $10k to $20k.",
  openGraph: {
    title: "Edgebook — the trading journal that reviews with you",
    description:
      "Plan your intention, review your decisions, and practise away your mistakes. Your journal stays in your own Google Drive.",
    type: "website",
  },
};

export default function LandingPage() {
  return (
    <div className="lp-root relative min-h-dvh">
      <SmoothScroll />
      <LandingNav />
      <DirectorHud />
      <main>
        {/* Quest 01: 08:45 AM Pre-Bell Intention Builder */}
        <JourneyStage />
        {/* Quest 02: 09:30 NY Live Tape & Impulse Defense Simulator */}
        <StoryFilmScroll />
        {/* 5-Gate Daily Operating Circuit */}
        <DecisionRitualStage />
        {/* Quest 03: The Autopsy X-Ray Detective Game */}
        <Gap />
        {/* Quest 04: The 5 Practice Arenas Gauntlet */}
        <Toolkit />
        {/* Quest 05: Minato AI Pattern Investigation & Memory Graph */}
        <MinatoDemo />
        {/* Quest 06: Interactive Equity Road ($10k -> $20k) & Sovereign Google Drive Vault */}
        <Road />
        <DriveStatement />
        {/* Evening Sanctuary & Final Operator Scorecard */}
        <Calm />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
