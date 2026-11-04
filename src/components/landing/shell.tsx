"use client";

import { useEffect } from "react";

/**
 * The landing is a night-to-dawn film, so it keeps its own palette regardless of the app
 * theme. Match the document background while mounted so overscroll never flashes the
 * light theme, and restore it on leave.
 */
export function LandingShell() {
  useEffect(() => {
    const html = document.documentElement;
    const prev = { bg: html.style.backgroundColor, scheme: html.style.colorScheme };
    html.style.backgroundColor = "#0e0b08";
    html.style.colorScheme = "dark";
    return () => {
      html.style.backgroundColor = prev.bg;
      html.style.colorScheme = prev.scheme;
    };
  }, []);
  return null;
}
