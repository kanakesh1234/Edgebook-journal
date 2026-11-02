import type { Metadata } from "next";
import "@/components/landing/landing.css";
import { LandingNav } from "@/components/landing/nav";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
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
    description: "Plan your intention, review your decisions, and practise away your mistakes. Your journal stays in your own Google Drive.",
    type: "website",
  },
};

export default function LandingPage() {
  return (
    <div className="lp-root relative">
      <SmoothScroll />
      <LandingNav />
      <main>
        <JourneyStage />
        <StoryFilmScroll />
        <DecisionRitualStage />
        <Gap />
        <MinatoDemo />
        <DriveStatement />
        <Toolkit />
        <Road />
        <Calm />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
