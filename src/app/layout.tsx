import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter/opsz.css";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#15120d" },
  ],
  width: "device-width",
  initialScale: 1,
};

/** Runs before first paint — prevents theme flash. Mirrors lib/theme.ts. */
const noFlashScript = `(function(){try{var t=localStorage.getItem("edgebook.theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
