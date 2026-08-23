import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/instrument-serif";
import "./globals.css";
import { Toaster } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: {
    default: "Edgebook — The trading journal for disciplined operators",
    template: "%s · Edgebook",
  },
  description:
    "Record every trade, measure your edge, and watch your equity journey unfold. A premium local-first trading journal with performance analytics, a progress roadmap and a monthly P&L calendar.",
};

export const viewport: Viewport = {
  themeColor: "#05070b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
