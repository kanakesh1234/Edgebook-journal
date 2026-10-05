"use client";

import { createPortal } from "react-dom";

/**
 * Renders floating UI (sheets, docks, action bars) on <body>.
 * Sticky/blurred ancestors create containing blocks for `position: fixed`, so anything
 * that must stay pinned to the viewport lives outside them. Only mount this after a
 * user action or after client data has loaded — never during the server render.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
