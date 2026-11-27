import type { Metadata } from "next";
import "@fontsource/instrument-serif/400-italic.css";
import "@/components/landing/landing.css";
import "@/components/landing/landing-theme.css";
import { LandingRoot } from "@/components/landing/landing-root";

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
  return <LandingRoot />;
}
