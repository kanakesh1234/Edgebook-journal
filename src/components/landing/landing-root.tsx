"use client";

import { LandingShell } from "./shell";
import { ScrollController } from "./scroll-controller";
import { LandingHeader } from "./header";
import { Cinema } from "./cinema";
import { Statement, Quotes } from "./statement";
import { Finale, LandingFooter } from "./finale";
import { MobileLanding } from "./mobile-landing";
import { TabletLanding } from "./tablet-landing";

export function LandingRoot() {
  return (
    <div className="lp-root" data-lp-root data-fx="full">
      <LandingShell />

      <div className="lp-tier-mobile">
        <MobileLanding />
      </div>

      <div className="lp-tier-tablet">
        <TabletLanding />
      </div>

      <div className="lp-tier-desktop">
        <ScrollController />
        <LandingHeader />
        <main>
          <Cinema />
          <Statement />
          <Quotes />
          <Finale />
        </main>
        <LandingFooter />
      </div>
    </div>
  );
}
