"use client";

import { useEffect } from "react";
import { useTheme } from "@/lib/theme";

/**
 * Matches the document canvas behind overscroll to the active theme on the landing page,
 * and restores the previous values when leaving.
 */
export function LandingShell() {
  const { resolved } = useTheme();

  useEffect(() => {
    const html = document.documentElement;
    const prev = { bg: html.style.backgroundColor, scheme: html.style.colorScheme };
    html.style.backgroundColor = resolved === "dark" ? "#0b0b0e" : "#f7f4ee";
    html.style.colorScheme = resolved;
    return () => {
      html.style.backgroundColor = prev.bg;
      html.style.colorScheme = prev.scheme;
    };
  }, [resolved]);
  return null;
}
