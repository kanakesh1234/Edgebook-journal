"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { useBootstrap } from "@/lib/bootstrap";
import { LogoMark } from "@/components/landing/logo";
import { BottomTabs, MobileTopBar, Sidebar } from "@/components/shell/nav";
import { EntryFormModal } from "@/components/journal/entry-form-modal";

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="relative flex flex-col items-center gap-5"
      >
        <div className="relative">
          <motion.span
            className="absolute inset-0 rounded-2xl border border-gold/30"
            animate={{ scale: [1, 1.45], opacity: [0.7, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
            aria-hidden
          />
          <LogoMark className="h-14 w-14" />
        </div>
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-faint">Opening your journal</p>
      </motion.div>
    </div>
  );
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  useBootstrap();
  const status = useApp((s) => s.status);
  const router = useRouter();

  useEffect(() => {
    if (status === "guest") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") return <Splash />;

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Keyboard shortcut: jump straight past navigation */}
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-gold-strong focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-gold"
      >
        Skip to content
      </a>

      <Sidebar />
      <MobileTopBar />

      <main
        id="content"
        tabIndex={-1}
        className="relative mx-auto min-h-dvh w-full max-w-6xl px-4 pb-24 pt-6 outline-none sm:px-6 lg:pb-12 lg:pl-[264px] lg:pr-8 xl:pl-[272px]"
      >
        {children}
      </main>

      <BottomTabs />
      <EntryFormModal />
    </div>
  );
}
