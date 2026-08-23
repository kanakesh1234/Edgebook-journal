"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { EntryImage } from "@/lib/types";
import { MAX_IMAGES_PER_ENTRY } from "@/lib/types";
import { ImageError, processImageFile } from "@/lib/images";
import { useImageUrls } from "@/lib/hooks";
import { bytesToSize } from "@/lib/format";
import { toast } from "@/components/ui/toast";
import { EyeIcon, ImageIcon, PlusIcon, XIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/button";
import { cn, uid } from "@/lib/utils";

export interface UploadItem {
  meta: EntryImage;
  /** Null when the binary is already persisted in the store. */
  blob: Blob | null;
}

export function ImageUploader({
  items,
  onChange,
  max = MAX_IMAGES_PER_ENTRY,
}: {
  items: UploadItem[];
  onChange: (items: UploadItem[]) => void;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [slotBusy, setSlotBusy] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const existingIds = items.filter((i) => !i.blob).map((i) => i.meta.id);
  const existingUrls = useImageUrls(existingIds);
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});

  const localUrlsRef = useRef<Record<string, string>>({});

  // Object URL lifecycle: create for new blobs, revoke for removed ones.
  useEffect(() => {
    setLocalUrls((prev) => {
      const next = { ...prev };
      const ids = new Set<string>();
      for (const item of items) {
        if (!item.blob) continue;
        ids.add(item.meta.id);
        if (!next[item.meta.id]) next[item.meta.id] = URL.createObjectURL(item.blob);
      }
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) {
          URL.revokeObjectURL(next[id]);
          delete next[id];
        }
      }
      localUrlsRef.current = next;
      return next;
    });
  }, [items]);

  // Revoke everything on unmount only.
  useEffect(
    () => () => {
      for (const url of Object.values(localUrlsRef.current)) URL.revokeObjectURL(url);
    },
    [],
  );

  const urlFor = (item: UploadItem): string | undefined =>
    item.blob ? localUrls[item.meta.id] : existingUrls[item.meta.id] ?? undefined;

  const accept = async (fileList: FileList | File[]) => {
    const room = max - items.length;
    if (room <= 0) {
      toast.error(`Up to ${max} screenshots per entry`);
      return;
    }
    const files = Array.from(fileList).slice(0, room);
    if (files.length === 0) return;

    setSlotBusy(items.length);
    const added: UploadItem[] = [];
    for (const file of files) {
      try {
        const processed = await processImageFile(file);
        added.push({ meta: processed.meta, blob: processed.blob });
      } catch (err) {
        toast.error("Upload failed", err instanceof ImageError ? err.message : undefined);
      }
    }
    if (added.length) onChange([...items, ...added]);
    setSlotBusy(null);
  };

  const removeAt = (id: string) => onChange(items.filter((i) => i.meta.id !== id));

  const slots = Array.from({ length: max }, (_, i) => items[i] ?? null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void accept(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        {slots.map((item, idx) => {
          const url = item ? urlFor(item) : undefined;
          const busyHere = slotBusy === idx;

          if (!item) {
            return (
              <button
                key={`empty-${idx}`}
                type="button"
                disabled={slotBusy !== null}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void accept(e.dataTransfer.files);
                }}
                className={cn(
                  "group relative flex aspect-[16/10] flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition-colors duration-200",
                  dragging && slotBusy === null
                    ? "border-gold/60 bg-gold/[0.05]"
                    : "border-line-strong bg-raised/40 hover:border-faint hover:bg-raised",
                  slotBusy !== null && "opacity-50",
                )}
              >
                {busyHere ? (
                  <>
                    <Spinner className="h-5 w-5 text-gold" />
                    <span className="text-xs text-faint">Processing…</span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-5 w-5 text-faint transition-colors group-hover:text-gold" />
                    <span className="text-xs font-medium text-muted">Add screenshot</span>
                    <span className="text-[10px] text-faint">or drop a file</span>
                  </>
                )}
              </button>
            );
          }

          return (
            <motion.div
              key={item.meta.id}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="group relative aspect-[16/10] overflow-hidden rounded-xl border border-line-strong bg-canvas"
            >
              {url ? (
                <img src={url} alt={item.meta.name} className="h-full w-full object-cover" draggable={false} />
              ) : (
                <div className="grid h-full place-items-center">
                  <Spinner className="h-4 w-4 text-faint" />
                </div>
              )}
              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-2">
                <span className="rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                  {idx + 1}/{max}
                </span>
                <button
                  type="button"
                  onClick={() => removeAt(item.meta.id)}
                  aria-label={`Remove ${item.meta.name}`}
                  className="grid h-6 w-6 place-items-center rounded-md bg-black/60 text-white/80 opacity-0 backdrop-blur-sm transition-all hover:bg-loss/80 hover:text-white group-hover:opacity-100"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              <AnimatePresence>
                {url && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <span className="truncate font-mono text-[10px] text-white/75">
                      {item.meta.width}×{item.meta.height} · {bytesToSize(item.meta.size)}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
