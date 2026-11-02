import type { Metadata } from "next";
import "@/components/landing/landing.css";
import { LandingNav } from "@/components/landing/nav";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { TheatreStageBackdrop } from "@/components/landing/theatre-stage-backdrop";
import { JourneyStage, DecisionRitualStage } from "@/components/landing/journey-stage";
import { StoryFilmScroll } from "@/components/landing/story-film-scroll";
import { DriveStatement } from "@/components/landing/drive-statement";
import { Gap } from "@/components/landing/gap";
import { MinatoDemo } from "@/components/landing/minato-demo";
import { Toolkit } from "@/components/landing/toolkit";
import { Road } from "@/components/landing/road";
import { Calm } from "@/components/landing/calm";
import { FinalCta, SiteFooter } from "@/components/landing/footer-cta";

export const metadata: Metadata = {
  title: { absolute: "Edgebook — Most journals record the result. Edgebook records the decision." },
  description:
    "Write your intention before the bell, review your discipline honestly, and turn every mistake into quiet mastery. A trading psychology and process journal that keeps your data in your own Google Drive.",
  openGraph: {
    title: "Edgebook — the trading journal that reviews with you",
    description:
      "Plan your intention, review your decisions, and practise away your mistakes. Your journal stays in your own Google Drive.",
    type: "website",
  },
};

export default function LandingPage() {
  return (
    <div className="lp-root relative">
      <SmoothScroll />
      <TheatreStageBackdrop />
      <LandingNav />
      <main className="relative z-10">
        {/* Dark 3D Theatre Acts (Acts 01 – 06) */}
        <JourneyStage />
        <StoryFilmScroll />
        <DecisionRitualStage />
        <Gap />
        <MinatoDemo />
        <DriveStatement />

        {/* Calm Cream Interlude — Camera pulls back and canvas fades out so content-heavy sections breathe */}
        <div className="lp-cream-backdrop relative z-10 border-y border-line transition-colors duration-700">
          <Toolkit />
          <Road />
          <Calm />
        </div>

        {/* Closing Full-Screen Keynote Statement */}
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
