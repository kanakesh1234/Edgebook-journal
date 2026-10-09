import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Journal glyphs — original, SF-Symbols-style line icons (24pt grid, 1.6 stroke, round caps).
 * Drawn for Edgebook rather than copied from Apple's SF Symbols, whose license limits use to Apple platforms.
 * Swap any of these for another licensed icon set without touching call sites.
 */
export type SymName =
  | "list" | "grid" | "folder" | "calendar" | "search" | "filter" | "sort" | "sidebar"
  | "chevronRight" | "chevronLeft" | "chevronDown" | "check" | "xmark" | "trash" | "pencil"
  | "sparkles" | "photo" | "tray" | "book" | "circleHalf" | "arrowUpRight" | "arrowDownRight" | "ellipsis" | "expand" | "note" | "target" | "heart" | "shield" | "bulb" | "checklist" | "chart" | "link" | "plus" | "unlink";

const D: Record<SymName, ReactNode> = {
  list: (<><path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20" /><circle cx="4.4" cy="6.5" r=".9" fill="currentColor" stroke="none" /><circle cx="4.4" cy="12" r=".9" fill="currentColor" stroke="none" /><circle cx="4.4" cy="17.5" r=".9" fill="currentColor" stroke="none" /></>),
  grid: (<><rect x="4" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" /></>),
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h3.2l1.8 2H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z" />,
  calendar: (<><rect x="4" y="5.5" width="16" height="14.5" rx="3" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>),
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>),
  filter: <path d="M4 7h16M7 12h10M10 17h4" />,
  sort: <path d="M8 19V5M4.5 8.5 8 5l3.5 3.5M16 5v14M12.5 15.5 16 19l3.5-3.5" />,
  sidebar: (<><rect x="3.5" y="5" width="17" height="14" rx="3" /><path d="M9.5 5v14" /></>),
  chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  chevronLeft: <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
  chevronDown: <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  xmark: <path d="m6 6 12 12M18 6 6 18" />,
  trash: <path d="M5 7h14M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l.8 11.2a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8L17.5 7M10 11v5M14 11v5" />,
  pencil: <path d="m4 20 1-4L16.5 4.5a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8 19zM14.5 6.5l3 3" />,
  sparkles: <path d="m11 3.5 1.7 5 5 1.7-5 1.7L11 17l-1.7-5.1-5-1.7 5-1.7zM19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />,
  photo: (<><rect x="3.5" y="5" width="17" height="14" rx="3" /><circle cx="9" cy="10.5" r="1.6" /><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" /></>),
  tray: <path d="m4 13 2.2-6.6A2 2 0 0 1 8.1 5h7.8a2 2 0 0 1 1.9 1.4L20 13v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 13h4.5a3.5 3.5 0 0 0 7 0H20" />,
  book: <path d="M5 4.5h10a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3zM5 16.5a3 3 0 0 1 3-3h10" />,
  circleHalf: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" /></>),
  arrowUpRight: <path d="M7 17 17 7M9 7h8v8" />,
  arrowDownRight: <path d="m7 7 10 10M17 9v8H9" />,
  expand: <path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" />,
  note: <path d="M7.5 3.5h6l5 5V19a1.5 1.5 0 0 1-1.5 1.5H7.5A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1.5-1.5zM13.5 3.5v5h5M9.5 12.5h6M9.5 16h4" />,
  target: (<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>),
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  shield: <path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.2 7 9 4.1-1.8 7-4.8 7-9V6zM9 12l2.3 2.3L15.5 10" />,
  bulb: <path d="M9.5 17.5h5M10 20.5h4M12 3.5a5.5 5.5 0 0 0-3.2 10c.5.4.7 1 .7 1.6V17h5v-1.9c0-.6.2-1.2.7-1.6A5.5 5.5 0 0 0 12 3.5z" />,
  checklist: <path d="M10.5 7H20M10.5 12H20M10.5 17H20M4 7l1.3 1.3L7.5 6M4 12l1.3 1.3 2.2-2.3M4 17l1.3 1.3 2.2-2.3" />,
  chart: <path d="M4 19.5v-15M4 19.5h16M7.5 15l3.5-4 3 2.5 5-6.5" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  unlink: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1M4 4l16 16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  ellipsis: (<><circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" /></>),
};

export function Sym({ name, className, ...rest }: { name: SymName; className?: string } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn("h-[18px] w-[18px] shrink-0", className)} {...rest}>
      {D[name]}
    </svg>
  );
}
