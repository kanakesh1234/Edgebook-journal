import type { Metadata } from "next";
import "@/components/landing/landing.css";
import { LandingNav } from "@/components/landing/nav";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { JourneyStage } from "@/components/landing/journey-stage";
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
    "Plan the trade, replay it candle by candle, tag the mistake and practise it away. A trading journal that keeps your data in your own Google Drive. For education only; not financial advice.",
  openGraph: {
    title: "Edgebook — the trading journal that reviews with you",
    description: "Plan, replay, review and practise your trades. Your journal stays in your own Google Drive.",
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
