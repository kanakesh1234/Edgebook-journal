import type { ActiveTool } from "@/lib/backtesting/store";
import { TOOLS } from "@/lib/backtesting/drawings/tools";
import type { DrawingToolType } from "@/lib/backtesting/types";

/** One selectable tool (a row in a flyout / a button in the favorites bar). */
export interface ToolItem { tool: ActiveTool & string; label: string; icon: string; hint?: string }

/** A rail button + its flyout. `section` decides which hairline-separated block it sits in. */
export interface ToolGroup { id: string; title: string; section: SectionId; items: ToolItem[] }

export type SectionId = "cursors" | "draw" | "measure" | "annotate";

export const SECTION_TITLES: Record<SectionId, string> = {
  cursors: "Cursors", draw: "Draw", measure: "Measure", annotate: "Annotate",
};
export const SECTION_ORDER: SectionId[] = ["cursors", "draw", "measure", "annotate"];

const t = (tool: DrawingToolType, icon: string): ToolItem => ({
  tool, icon, label: TOOLS[tool].label, hint: TOOLS[tool].shortcut ? `Alt+${TOOLS[tool].shortcut.toUpperCase()}` : undefined,
});

export const GROUPS: ToolGroup[] = [
  {
    id: "cursors", title: "Cursors", section: "cursors",
    items: [
      { tool: "crosshair", label: "Cross", icon: "cross" },
      { tool: "dot", label: "Dot", icon: "dot" },
      { tool: "pointer", label: "Arrow", icon: "arrow" },
      { tool: "eraser", label: "Eraser", icon: "eraser" },
    ],
  },
  {
    id: "lines", title: "Trend line tools", section: "draw",
    items: [
      t("trend-line", "trendLine"), t("ray", "ray"), t("info-line", "infoLine"), t("extended-line", "extendedLine"),
      t("horizontal-line", "hLine"), t("horizontal-ray", "hRay"), t("vertical-line", "vLine"), t("cross-line", "crossLine"),
      t("parallel-channel", "channel"), t("arrow", "arrowMarker"),
    ],
  },
  { id: "fib", title: "Fibonacci tools", section: "draw", items: [t("fib-retracement", "fib")] },
  {
    id: "shapes", title: "Brushes & shapes", section: "draw",
    items: [t("brush", "brush"), t("rectangle", "rect"), t("ellipse", "ellipse"), t("triangle", "triangle")],
  },
  {
    id: "measure", title: "Forecasting & measurement", section: "measure",
    items: [
      t("long-position", "longPos"), t("short-position", "shortPos"), t("price-range", "priceRange"),
      t("date-range", "dateRange"), t("date-price-range", "datePriceRange"), t("measure", "ruler"),
    ],
  },
  { id: "zoom", title: "Zoom", section: "measure", items: [{ tool: "zoom", label: "Zoom in", icon: "zoomIn" }] },
  { id: "text", title: "Text", section: "annotate", items: [t("text", "text")] },
  { id: "emoji", title: "Icons", section: "annotate", items: [t("emoji", "emoji")] },
];

/** tool id → item (+ owning group id). */
export const ITEM_BY_TOOL: Map<string, ToolItem & { group: string }> = new Map(
  GROUPS.flatMap((g) => g.items.map((it) => [it.tool, { ...it, group: g.id }] as const)),
);

export const isCursorTool = (tool: string | null | undefined) =>
  tool === "cursor" || tool === "crosshair" || tool === "dot" || tool === "pointer";
