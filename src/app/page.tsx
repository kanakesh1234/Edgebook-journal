import { LandingNav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { Ticker } from "@/components/landing/ticker";
import { Features } from "@/components/landing/features";
import { Method, Journey } from "@/components/landing/method-journey";
import { FinalCta, SiteFooter } from "@/components/landing/footer-cta";

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh">
      <LandingNav />
      <main>
        <Hero />
        <Ticker />
        <Features />
        <Method />
        <Journey />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
