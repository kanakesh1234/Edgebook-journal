import type { Metadata } from "next";
import "@fontsource/instrument-serif/400-italic.css";
import "@/components/landing/landing.css";
import { LandingHeader } from "@/components/landing/header";
import { LandingShell } from "@/components/landing/shell";
import { ScrollController } from "@/components/landing/scroll-controller";
import { Cinema } from "@/components/landing/cinema";
import { Quotes, Statement } from "@/components/landing/statement";
import { Finale, LandingFooter } from "@/components/landing/finale";

export const metadata: Metadata = {
  title: { absolute: "Edgebook — Record the decision" },
  description:
    "Edgebook is the trading journal that reviews with you. Plan before the bell, review every decision, replay, practise, and ask Minato. Your journal stays in your own Google Drive.",
  openGraph: {
    title: "Edgebook — the trading journal that reviews with you",
    description:
      "Plan your intention, review your decisions, and practise away your mistakes. Your journal stays in your own Google Drive.",
    type: "website",
  },
};

export default function LandingPage() {
  return (
    // data-theme="dark" scopes the app's dark tokens to the landing, whatever theme the app uses.
    <div className="lp-root" data-theme="dark" data-lp-root data-fx="full">
      <LandingShell />
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
  );
}
