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
      <div className="relative z-10 rounded-b-[44px] border-b border-line bg-canvas shadow-[0_40px_80px_-30px_rgb(48_40_24/0.28)]" style={{ marginBottom: "var(--lp-foot)" }}>
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
