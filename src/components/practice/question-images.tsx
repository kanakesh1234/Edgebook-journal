"use client";

import { useEffect, useState } from "react";
import type { EntryImage } from "@/lib/types";
import { useImageUrls } from "@/lib/hooks";
import { Lightbox } from "@/components/ui/lightbox";
import { cn } from "@/lib/utils";

/**
 * The pictures a trader attached to their own question. Tap one to enlarge it; the round clock pauses while it is open.
 */
export function QuestionImages({ images, onOverlay }: { images: EntryImage[]; onOverlay?: (open: boolean) => void }) {
  const urls = useImageUrls(images.map((i) => i.id));
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { onOverlay?.(open !== null); return () => onOverlay?.(false); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className={cn("grid gap-2.5", images.length > 1 ? "sm:grid-cols-2" : "grid-cols-1")}>
        {images.map((img) => {
          const url = urls[img.id];
          return (
            <button
              key={img.id} type="button" disabled={!url} onClick={() => url && setOpen(url)}
              aria-label={`Enlarge ${img.name}`}
              className="group relative overflow-hidden rounded-[20px] border border-line bg-surface shadow-[0_1px_2px_rgb(48_40_24/0.05)] transition-transform active:scale-[0.99] dark:shadow-none"
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={img.name} width={img.width} height={img.height} className="max-h-[360px] w-full object-contain transition-transform duration-300 group-hover:scale-[1.01]" />
              ) : (
                <div className="grid h-40 place-items-center text-[12px] text-faint">Loading…</div>
              )}
            </button>
          );
        })}
      </div>
      <Lightbox src={open} alt="Question picture" onClose={() => setOpen(null)} />
    </>
  );
}
