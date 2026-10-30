"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "./logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#how", label: "How it works", cls: "" },
  { href: "#minato", label: "Minato", cls: "" },
  { href: "#drive", label: "Your Drive", cls: "" },
  { href: "#toolkit", label: "Toolkit", cls: "hidden xl:inline" },
  { href: "#road", label: "Roadmap", cls: "hidden xl:inline" },
];

/** Frosted bar in the Apple tradition: quiet at the top, hairline once you scroll. */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color] duration-500",
        "border-b",
        scrolled ? "lp-glass border-line" : "border-transparent bg-transparent",
      )}
    >
      <nav aria-label="Primary" className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="Edgebook home" className="rounded-lg">
          <Wordmark />
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className={cn("text-[13.5px] text-muted transition-colors duration-200 hover:text-ink", l.cls)}>
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle className="rounded-full" />
          <Link
            href="/login"
            className="hidden rounded-full px-3.5 py-2 text-[13.5px] text-muted transition-colors hover:text-ink sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/login?mode=signup"
            className="inline-flex h-9 items-center rounded-full bg-gold-strong px-4 text-[13.5px] font-medium text-on-gold transition duration-200 hover:bg-gold-strong-hover active:scale-[0.97]"
          >
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}
