"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useSpring } from "motion/react";
import { Wordmark } from "./logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#method", label: "Method" },
  { href: "#journey", label: "Journey" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 28 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "border-b border-line bg-canvas/80 backdrop-blur-xl" : "bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="Edgebook home">
          <Wordmark />
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="group relative text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              {l.label}
              <span className="absolute -bottom-1 left-0 h-px w-0 bg-gold transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink"
          >
            Log in
          </Link>
          <Link
            href="/login?mode=signup"
            className="rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-canvas transition-all duration-200 hover:opacity-85 active:scale-[0.97]"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Scroll progress */}
      <motion.div
        style={{ scaleX: progress }}
        className="h-[2px] origin-left bg-gradient-to-r from-profit via-gold to-profit"
        aria-hidden
      />
    </motion.header>
  );
}
