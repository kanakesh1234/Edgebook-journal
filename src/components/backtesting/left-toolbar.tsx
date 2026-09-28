"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useBacktest } from "@/lib/backtesting/store";
import type { DrawingToolType } from "@/lib/backtesting/types";

export default function LeftToolbar() {
  const { activeDrawingTool, setActiveDrawingTool, clearDrawings, activeInstrument } = useBacktest();

  return (
    <div className="flex flex-col items-center gap-1 py-2 w-10 bg-[#131722] border-r border-white/10 h-full">
      <button
        title="Cursor"
        onClick={() => setActiveDrawingTool("cursor")}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded hover:bg-white/10 text-white/70",
          activeDrawingTool === "cursor" && "bg-gold/20 text-gold border border-gold/50"
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
          <path d="M13 13l6 6" />
        </svg>
      </button>

      <button
        title="Crosshair"
        onClick={() => setActiveDrawingTool("crosshair")}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded hover:bg-white/10 text-white/70",
          activeDrawingTool === "crosshair" && "bg-gold/20 text-gold border border-gold/50"
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <div className="w-6 h-px bg-white/10 my-1" />

      <button
        title="Horizontal Line"
        onClick={() => setActiveDrawingTool("horizontal-line")}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded hover:bg-white/10 text-white/70",
          activeDrawingTool === "horizontal-line" && "bg-gold/20 text-gold border border-gold/50"
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12h16" />
        </svg>
      </button>

      <button
        title="Trend Line"
        onClick={() => setActiveDrawingTool("trend-line")}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded hover:bg-white/10 text-white/70",
          activeDrawingTool === "trend-line" && "bg-gold/20 text-gold border border-gold/50"
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 19L19 5" />
        </svg>
      </button>

      <button
        title="Ray"
        onClick={() => setActiveDrawingTool("ray")}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded hover:bg-white/10 text-white/70",
          activeDrawingTool === "ray" && "bg-gold/20 text-gold border border-gold/50"
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12h16" />
          <path d="M14 6l6 6-6 6" />
        </svg>
      </button>

      <button
        title="Rectangle"
        onClick={() => setActiveDrawingTool("rectangle")}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded hover:bg-white/10 text-white/70",
          activeDrawingTool === "rectangle" && "bg-gold/20 text-gold border border-gold/50"
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
        </svg>
      </button>

      <button
        title="Price Range"
        onClick={() => setActiveDrawingTool("price-range")}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded hover:bg-white/10 text-white/70",
          activeDrawingTool === "price-range" && "bg-gold/20 text-gold border border-gold/50"
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 8L3 8" />
          <path d="M21 16L3 16" />
          <path d="M12 4v16" />
        </svg>
      </button>

      <div className="w-6 h-px bg-white/10 my-1" />

      <button
        title="Delete All Drawings"
        onClick={() => activeInstrument && clearDrawings(activeInstrument)}
        className="flex items-center justify-center w-8 h-8 rounded hover:bg-red-500/20 text-white/70 hover:text-red-500"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
      </button>
    </div>
  );
}
