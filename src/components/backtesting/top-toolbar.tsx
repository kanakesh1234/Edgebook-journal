"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useBacktest } from "@/lib/backtesting/store"
import { useTheme, setThemeChoice } from "@/lib/theme"
import { formatMoney } from "@/lib/format"
import { pnlClass } from "@/components/ui/misc"
import PlaybackControls from "@/components/backtesting/playback-controls"
import type { Timeframe } from "@/lib/backtesting/types"
import type { PlaybackSpeed } from "@/lib/backtesting/engine/clock"

interface TopToolbarProps {
  onBack: () => void;
}

const TIMEFRAME_BUTTONS: Timeframe[] = ['1m','3m','5m','15m','30m','1h','4h','1D']

export default function TopToolbar({ onBack }: TopToolbarProps) {
  const {
    config,
    instruments,
    activeInstrument,
    switchInstrument,
    timeframe,
    changeTimeframe,
    currentTime,
    playing,
    status,
    accountState,
    navigateNextDay,
    navigatePrevDay,
    endSession,
    setShowResults,
    saveSession
  } = useBacktest()

  const { resolved: theme, setChoice } = useTheme()

  const dateObj = new Date(currentTime * 1000)
  const timeStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(dateObj)
  
  const dateStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(dateObj)

  const handleEndSession = async () => {
    endSession()
    await saveSession()
    setShowResults(true)
  }

  return (
    <div className="flex items-center justify-between px-3 h-10 bg-[#131722] border-b border-white/10 text-white/90 select-none text-[12px]">
      {/* LEFT */}
      <div className="flex items-center space-x-4 h-full">
        <button onClick={onBack} className="hover:text-white text-white/70 transition-colors flex items-center">
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="font-semibold">{config?.sessionName || 'Session'}</span>
        </button>
        
        {instruments && instruments.length > 0 && (
          <div className="flex h-full items-center border-l border-white/10 pl-4 space-x-1">
            {instruments.map((sym) => (
              <button
                key={sym}
                onClick={() => switchInstrument(sym)}
                className={cn(
                  "px-2 py-1 rounded text-[11px] font-medium transition-colors",
                  activeInstrument === sym ? "text-[#E6B981] bg-white/5" : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                {sym}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* CENTER-LEFT */}
      <div className="flex items-center space-x-1 border-l border-white/10 pl-4">
        {TIMEFRAME_BUTTONS.map((tf) => (
          <button
            key={tf}
            onClick={() => changeTimeframe(tf)}
            className={cn(
              "px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors",
              timeframe === tf ? "text-[#E6B981] bg-white/5" : "text-white/60 hover:text-white hover:bg-white/5"
            )}
          >
            {tf}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-white/10 mx-4" />

      {/* CENTER */}
      <div className="flex items-center space-x-2">
        <PlaybackControls />
        
        <div className="flex items-center space-x-1 ml-2 border-l border-white/10 pl-2">
          <button onClick={navigatePrevDay} className="p-1 rounded text-white/60 hover:text-white hover:bg-white/5 transition-colors" title="Previous Day">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button onClick={navigateNextDay} className="p-1 rounded text-white/60 hover:text-white hover:bg-white/5 transition-colors" title="Next Day">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="w-px h-5 bg-white/10 mx-4" />

      {/* CENTER-RIGHT */}
      <div className="flex flex-col items-center justify-center min-w-[120px]">
        <div className="font-mono text-[13px] font-medium leading-none mb-1">
          {timeStr}
        </div>
        <div className="text-[10px] text-white/50 leading-none">
          {dateStr} <span className={cn("ml-1 font-bold", playing ? "text-[#26a69a]" : "text-[#E6B981]")}>{playing ? "LIVE" : "PAUSED"}</span>
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex items-center space-x-4 border-l border-white/10 pl-4">
        {accountState && (
          <div className="flex items-center space-x-3 text-[11px]">
            <div className="flex flex-col">
              <span className="text-white/50 leading-none mb-0.5">Balance</span>
              <span className="font-mono font-medium">{formatMoney(accountState.balance)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-white/50 leading-none mb-0.5">P&L</span>
              <span className={cn("font-mono font-medium", pnlClass(accountState.netPnl))}>
                {accountState.netPnl > 0 ? '+' : ''}{formatMoney(accountState.netPnl)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-white/50 leading-none mb-0.5">Trades</span>
              <span className="font-mono font-medium">{accountState.totalTrades}</span>
            </div>
          </div>
        )}
        
        <button 
          onClick={() => {
            setThemeChoice(theme === 'dark' ? 'light' : 'dark');
          }}
          className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          title="Toggle Theme"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </button>

        <button
          onClick={handleEndSession}
          className="px-3 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded text-[11px] font-medium transition-colors"
        >
          End Session
        </button>
      </div>
    </div>
  )
}
