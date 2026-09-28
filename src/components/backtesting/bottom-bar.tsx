"use client"

import * as React from "react"
import { useBacktest } from "@/lib/backtesting/store"
import { cn } from "@/lib/utils"

export default function BottomBar() {
  const {
    activeInstrument,
    timeframe,
    candleData,
    playing,
    status,
    currentTime
  } = useBacktest()

  // Calculate candle count, handling different possible structures of candleData
  const count = activeInstrument && (candleData as any)?.[activeInstrument] 
    ? (candleData as any)[activeInstrument].length 
    : (Array.isArray(candleData) ? candleData.length : 0)

  let statusBadge = "PAUSED"
  let badgeColor = "text-[#E6B981] bg-[#E6B981]/10"
  
  if (status === "completed") {
    statusBadge = "COMPLETED"
    badgeColor = "text-[#26a69a] bg-[#26a69a]/10"
  } else if (status === "breached") {
    statusBadge = "BREACHED"
    badgeColor = "text-[#ef5350] bg-[#ef5350]/10"
  } else if (playing) {
    statusBadge = "LIVE REPLAY"
    badgeColor = "text-[#26a69a] bg-[#26a69a]/10 animate-pulse"
  }

  const timeStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(currentTime * 1000))

  return (
    <div className="flex items-center justify-between px-3 h-7 bg-[#131722] border-t border-white/10 text-[10px] text-white/60 select-none">
      {/* LEFT */}
      <div className="flex items-center space-x-3">
        <span className="font-semibold text-white/80">{timeframe}</span>
        <div className="w-px h-3 bg-white/20" />
        <span className="font-semibold text-[#E6B981]">{activeInstrument || 'N/A'}</span>
        <div className="w-px h-3 bg-white/20" />
        <span>{count} candles</span>
      </div>

      {/* CENTER */}
      <div className="flex items-center">
        <span className={cn("px-2 py-0.5 rounded font-bold tracking-wider text-[9px]", badgeColor)}>
          {statusBadge}
        </span>
      </div>

      {/* RIGHT */}
      <div className="flex items-center space-x-3">
        <span>London Strategic Edge</span>
        <div className="w-px h-3 bg-white/20" />
        <span>America/New_York</span>
        <div className="w-px h-3 bg-white/20" />
        <span className="font-mono">{timeStr}</span>
      </div>
    </div>
  )
}
