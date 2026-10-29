import "@/components/landing/landing.css";
import { LandingNav } from "@/components/landing/nav";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { JourneyStage } from "@/components/landing/journey-stage";
import { DriveStatement } from "@/components/landing/drive-statement";
import { Toolkit } from "@/components/landing/toolkit";
import { Road } from "@/components/landing/road";
import { Calm } from "@/components/landing/calm";
import { FinalCta, SiteFooter } from "@/components/landing/footer-cta";

export default function LandingPage() {
  return (
    <div className="lp-root relative">
      <SmoothScroll />
      <LandingNav />
      {/* The page sits above a fixed footer and lifts away to reveal it. */}
      <div className="relative z-10 rounded-b-[44px] bg-canvas" style={{ marginBottom: "var(--lp-foot)" }}>
        <main>
          <JourneyStage />
          <DriveStatement />
          <Toolkit />
          <Road />
          <Calm />
          <FinalCta />
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
