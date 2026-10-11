/* ------------------------------------------------------------------ */
/*  Drawing tool registry — what each tool is, how many clicks it     */
/*  needs, and its default look. Pure data, no DOM.                    */
/* ------------------------------------------------------------------ */

import type { DrawingToolType, DrawingLineStyle } from "../types";

export interface ToolDef {
  id: DrawingToolType;
  label: string;
  /** Anchor points the user places. "free" = brush (press, drag, release). */
  points: number | "free";
  /** Alt+key shortcut (TradingView), lower-case. */
  shortcut?: string;
  color: string;
  lineWidth: number;
  lineStyle?: DrawingLineStyle;
  fillOpacity?: number;
  /** Rectangle-like tools expose four corner handles instead of two anchors. */
  box?: boolean;
}

const BLUE = "#2962FF";
const GRAY = "#787B86";

export const TOOLS: Record<DrawingToolType, ToolDef> = {
  "trend-line": { id: "trend-line", label: "Trend line", points: 2, shortcut: "t", color: BLUE, lineWidth: 2 },
  ray: { id: "ray", label: "Ray", points: 2, color: BLUE, lineWidth: 2 },
  "info-line": { id: "info-line", label: "Info line", points: 2, color: BLUE, lineWidth: 2 },
  "extended-line": { id: "extended-line", label: "Extended line", points: 2, color: BLUE, lineWidth: 2 },
  "horizontal-line": { id: "horizontal-line", label: "Horizontal line", points: 1, shortcut: "h", color: BLUE, lineWidth: 2 },
  "horizontal-ray": { id: "horizontal-ray", label: "Horizontal ray", points: 1, shortcut: "j", color: BLUE, lineWidth: 2 },
  "vertical-line": { id: "vertical-line", label: "Vertical line", points: 1, shortcut: "v", color: BLUE, lineWidth: 2 },
  "cross-line": { id: "cross-line", label: "Cross line", points: 1, shortcut: "c", color: BLUE, lineWidth: 2 },
  "parallel-channel": { id: "parallel-channel", label: "Parallel channel", points: 3, color: BLUE, lineWidth: 2, fillOpacity: 0.1 },
  arrow: { id: "arrow", label: "Arrow", points: 2, color: BLUE, lineWidth: 2 },
  "fib-retracement": { id: "fib-retracement", label: "Fib retracement", points: 2, shortcut: "f", color: GRAY, lineWidth: 1, fillOpacity: 0.1 },
  "long-position": { id: "long-position", label: "Long position", points: 1, color: "#089981", lineWidth: 1, fillOpacity: 0.2 },
  "short-position": { id: "short-position", label: "Short position", points: 1, color: "#F23645", lineWidth: 1, fillOpacity: 0.2 },
  "price-range": { id: "price-range", label: "Price range", points: 2, color: BLUE, lineWidth: 1, fillOpacity: 0.12, box: true },
  "date-range": { id: "date-range", label: "Date range", points: 2, color: BLUE, lineWidth: 1, fillOpacity: 0.12, box: true },
  "date-price-range": { id: "date-price-range", label: "Date and price range", points: 2, color: BLUE, lineWidth: 1, fillOpacity: 0.12, box: true },
  measure: { id: "measure", label: "Measure", points: 2, color: BLUE, lineWidth: 1, fillOpacity: 0.15, box: true },
  brush: { id: "brush", label: "Brush", points: "free", color: BLUE, lineWidth: 3 },
  rectangle: { id: "rectangle", label: "Rectangle", points: 2, color: BLUE, lineWidth: 2, fillOpacity: 0.15, box: true },
  ellipse: { id: "ellipse", label: "Ellipse", points: 2, color: BLUE, lineWidth: 2, fillOpacity: 0.15, box: true },
  triangle: { id: "triangle", label: "Triangle", points: 3, color: BLUE, lineWidth: 2, fillOpacity: 0.15 },
  text: { id: "text", label: "Text", points: 1, color: "#B2B5BE", lineWidth: 1 },
  emoji: { id: "emoji", label: "Emoji", points: 1, color: "#FFFFFF", lineWidth: 1 },
};

export const isDrawingTool = (id: string | null | undefined): id is DrawingToolType =>
  !!id && Object.prototype.hasOwnProperty.call(TOOLS, id);

export const FIB_LEVELS: Array<{ v: number; color: string }> = [
  { v: 0, color: "#787B86" },
  { v: 0.236, color: "#F23645" },
  { v: 0.382, color: "#FF9800" },
  { v: 0.5, color: "#4CAF50" },
  { v: 0.618, color: "#089981" },
  { v: 0.786, color: "#00BCD4" },
  { v: 1, color: "#787B86" },
];

export const EMOJI_CHOICES = ["✅", "❌", "⭐", "🔥", "⚠️", "💰", "🚀", "👀", "📈", "📉", "🎯", "🛑"];

/** TradingView-like swatch palette for the drawing properties toolbar. */
export const SWATCHES = [
  "#FFFFFF", "#B2B5BE", "#787B86", "#363A45", "#000000",
  "#F23645", "#FF9800", "#FFEB3B", "#4CAF50", "#089981",
  "#00BCD4", "#2962FF", "#673AB7", "#9C27B0", "#E91E63",
];
