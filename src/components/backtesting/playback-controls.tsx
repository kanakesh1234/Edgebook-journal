"use client";

import { cn } from "@/lib/utils";
import { useBacktest } from "@/lib/backtesting/store";
import type { PlaybackSpeed } from "@/lib/backtesting/engine/clock";

const SPEEDS: PlaybackSpeed[] = [0.25, 0.5, 1, 2, 5, 10];

function IconButton({ onClick, disabled, title, children, className }: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition-colors",
        "hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5",
        className,
      )}
    >
      {children}
    </button>
  );
}

export default function PlaybackControls() {
  const playing = useBacktest((s) => s.playing);
  const speed = useBacktest((s) => s.speed);
  const status = useBacktest((s) => s.status);
  const setPlaying = useBacktest((s) => s.setPlaying);
  const setSpeed = useBacktest((s) => s.setSpeed);
  const advanceClock = useBacktest((s) => s.advanceClock);
  const stepBack = useBacktest((s) => s.stepBack);

  const isFinished = status === "completed" || status === "breached";

  return (
    <div className="flex items-center gap-2">
      {/* Step Back */}
      <IconButton onClick={stepBack} disabled={playing} title="Step back">
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M15.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 010 1.414zm-6 0a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 1.414L5.414 10l4.293 4.293a1 1 0 010 1.414z" />
        </svg>
      </IconButton>

      {/* Play / Pause */}
      <IconButton
        onClick={() => {
          if (playing) {
            setPlaying(false);
          } else if (!isFinished) {
            setPlaying(true);
          }
        }}
        disabled={isFinished}
        title={playing ? "Pause" : "Play"}
        className="h-10 w-10 rounded-xl"
      >
        {playing ? (
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zm7 0a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
        )}
      </IconButton>

      {/* Step Forward */}
      <IconButton onClick={advanceClock} disabled={playing || isFinished} title="Step forward">
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M4.293 15.707a1 1 0 010-1.414L8.586 10 4.293 5.707a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0zm6 0a1 1 0 010-1.414L14.586 10l-4.293-4.293a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" />
        </svg>
      </IconButton>

      {/* Divider */}
      <div className="mx-1 h-6 w-px bg-white/10" />

      {/* Speed selector */}
      <div className="flex items-center gap-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-mono font-medium transition-colors",
              speed === s
                ? "bg-gold/20 text-gold"
                : "text-white/40 hover:text-white/70",
            )}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
