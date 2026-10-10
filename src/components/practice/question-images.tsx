"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { EntryImage } from "@/lib/types";
import { useImageUrls } from "@/lib/hooks";
import { Lightbox } from "@/components/ui/lightbox";
import { cn } from "@/lib/utils";

const ExpandIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>
);

/**
 * The pictures a trader attached to their own question, framed exactly like a Time Machine chart:
 * a header with what you are looking at, a numbered switch when there are several, and a roomy
 * image that opens full-screen on tap. The round clock pauses while it is open.
 */
export function QuestionImages({ images, onOverlay, large, label = "Your chart" }: { images: EntryImage[]; onOverlay?: (open: boolean) => void; /** Give the picture more room (matches Time Machine). */ large?: boolean; label?: string }) {
  const reduce = useReducedMotion();
  const urls = useImageUrls(images.map((i) => i.id));
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState<string | null>(null);
  useEffect(() => { onOverlay?.(zoom !== null); return () => onOverlay?.(false); }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const img = images[Math.min(idx, images.length - 1)];
  if (!img) return null;
  const url = urls[img.id];
  const many = images.length > 1;

  return (
    <>
      <figure className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-[0_1px_2px_rgb(48_40_24/0.05)] dark:shadow-none">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">{label}</p>
            <p className="text-[10.5px] font-medium uppercase tracking-[.12em] text-faint">{many ? `Picture ${idx + 1} of ${images.length}` : "Tap to enlarge"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {many && (
              <div className="flex items-center gap-1 text-[11px] font-semibold text-muted">
                {images.map((m, i) => (
                  <button key={m.id} type="button" onClick={() => setIdx(i)} aria-label={`Show picture ${i + 1}`} aria-pressed={i === idx} className={cn("h-7 w-7 rounded-full border transition-colors", i === idx ? "border-gold-strong bg-gold-strong text-on-gold" : "border-line bg-canvas hover:border-line-strong")}>{i + 1}</button>
                ))}
              </div>
            )}
            <button type="button" disabled={!url} onClick={() => url && setZoom(url)} aria-label="Enlarge picture" className="grid h-8 w-8 place-items-center rounded-full border border-line-strong bg-raised text-ink transition-colors hover:border-gold-strong disabled:opacity-40"><ExpandIcon className="h-4 w-4" /></button>
          </div>
        </div>
        <button type="button" disabled={!url} onClick={() => url && setZoom(url)} className="block w-full cursor-zoom-in bg-canvas" aria-label={`Enlarge ${img.name}`}>
          {url ? (
            <AnimatePresence mode="wait" initial={false}>
              <motion.img
                key={img.id}
                // eslint-disable-next-line @next/next/no-img-element
                src={url} alt={img.name} width={img.width} height={img.height} draggable={false}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.18 }}
                className={cn("w-full object-contain", large ? "max-h-[44vh]" : "max-h-[34vh]")}
              />
            </AnimatePresence>
          ) : (
            <div className="grid h-40 animate-pulse place-items-center bg-ink/[0.03] text-xs text-muted">Loading chart…</div>
          )}
        </button>
      </figure>
      <Lightbox src={zoom} alt="Question picture" onClose={() => setZoom(null)} />
    </>
  );
}
