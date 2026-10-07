"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { EntryImage } from "@/lib/types";
import { MAX_IMAGES_PER_ENTRY } from "@/lib/types";
import { ImageError, processImageFile } from "@/lib/images";
import { useImageUrls } from "@/lib/hooks";
import { bytesToSize } from "@/lib/format";
import { toast, useToasts } from "@/components/ui/toast";
import { EyeIcon, ImageIcon, PlusIcon, XIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";
import { cn, uid } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Paste targeting                                                    */
/*  Several uploaders can be mounted at once (chart + compare chart).  */
/*  The one the user last hovered, focused or clicked receives a       */
/*  paste; with no interaction yet, the first mounted one does.        */
/* ------------------------------------------------------------------ */

const registry: string[] = [];
let lastActive: string | null = null;
const subscribers = new Set<() => void>();
const emit = () => subscribers.forEach((fn) => fn());
const resolveActive = (): string | null =>
  lastActive && registry.includes(lastActive) ? lastActive : registry[0] ?? null;
const snapshot = () => `${resolveActive() ?? ""}|${registry.length}`;
const subscribe = (fn: () => void) => {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
};

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type !== "file");
}

function imagesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  if (out.length === 0) {
    for (const f of Array.from(data.files ?? [])) if (f.type.startsWith("image/")) out.push(f);
  }
  return out;
}

/** Clipboard screenshots arrive as a generic "image.png" — give them a readable name. */
function nameClipboardFile(file: File, index: number): File {
  if (file.name && !/^image\.(png|jpe?g|gif|webp)$/i.test(file.name)) return file;
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
  return new File([file], `Pasted screenshot ${hh}.${mm}${index ? `-${index + 1}` : ""}.${ext}`, { type: file.type });
}

interface PendingItem {
  id: string;
  preview: string;
}

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
  const uploaderId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const existingIds = items.filter((i) => !i.blob).map((i) => i.meta.id);
  const existingUrls = useImageUrls(existingIds);
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});

  const localUrlsRef = useRef<Record<string, string>>({});
  /** Raw-file preview URLs, reused as the thumbnail until the processed blob's URL exists (no flash). */
  const previewByIdRef = useRef<Record<string, string>>({});
  const itemsRef = useRef(items);
  const pendingRef = useRef(0);
  const onChangeRef = useRef(onChange);
  itemsRef.current = items;
  onChangeRef.current = onChange;

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent));
  }, []);

  // Which uploader receives a paste.
  const snap = useSyncExternalStore(subscribe, snapshot, () => "|0");
  const [activeId, mountedCount] = snap.split("|");
  const isActive = activeId === uploaderId;
  const showTarget = isActive && Number(mountedCount) > 1;

  useEffect(() => {
    registry.push(uploaderId);
    emit();
    return () => {
      const i = registry.indexOf(uploaderId);
      if (i >= 0) registry.splice(i, 1);
      if (lastActive === uploaderId) lastActive = null;
      emit();
    };
  }, [uploaderId]);

  const claim = () => {
    if (lastActive === uploaderId) return;
    lastActive = uploaderId;
    emit();
  };

  // Object URL lifecycle: create for new blobs, revoke for removed ones.
  useEffect(() => {
    const prev = localUrlsRef.current;
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
    for (const id of Object.keys(previewByIdRef.current)) {
      if (!items.some((i) => i.meta.id === id)) {
        URL.revokeObjectURL(previewByIdRef.current[id]);
        delete previewByIdRef.current[id];
      }
    }
    localUrlsRef.current = next;
    setLocalUrls(next);
  }, [items]);

  // Revoke everything on unmount only.
  useEffect(
    () => () => {
      for (const url of Object.values(localUrlsRef.current)) URL.revokeObjectURL(url);
      for (const url of Object.values(previewByIdRef.current)) URL.revokeObjectURL(url);
    },
    [],
  );

  const urlFor = (item: UploadItem): string | undefined =>
    item.blob ? localUrls[item.meta.id] ?? previewByIdRef.current[item.meta.id] : existingUrls[item.meta.id] ?? undefined;

  const accept = async (fileList: FileList | File[]) => {
    const room = max - itemsRef.current.length - pendingRef.current;
    if (room <= 0) {
      toast.error(`Up to ${max} screenshot${max === 1 ? "" : "s"} here`);
      haptic.error();
      return;
    }
    const files = Array.from(fileList).slice(0, room);
    if (files.length === 0) return;
    if (fileList.length > room) toast.info(`Only ${room} more fit — added the first ${room}`);

    // Show every image immediately from the raw file, then swap in the processed copy.
    const batch = files.map((file) => ({ file, pending: { id: uid("pend"), preview: URL.createObjectURL(file) } }));
    pendingRef.current += batch.length;
    setPending((p) => [...p, ...batch.map((b) => b.pending)]);
    haptic.selection();

    const added: UploadItem[] = [];
    await Promise.all(
      batch.map(async ({ file, pending: pend }, i) => {
        try {
          const processed = await processImageFile(file);
          previewByIdRef.current[processed.meta.id] = pend.preview;
          added[i] = { meta: processed.meta, blob: processed.blob };
        } catch (err) {
          URL.revokeObjectURL(pend.preview);
          toast.error("Upload failed", err instanceof ImageError ? err.message : undefined);
        }
      }),
    );

    const ok = added.filter(Boolean);
    if (ok.length) {
      const next = [...itemsRef.current, ...ok].slice(0, max);
      itemsRef.current = next; // keep back-to-back pastes from clobbering each other
      onChangeRef.current(next);
      haptic.success();
    }
    pendingRef.current -= batch.length;
    setPending((p) => p.filter((x) => !batch.some((b) => b.pending.id === x.id)));
  };

  const acceptRef = useRef(accept);
  acceptRef.current = accept;

  // Clipboard paste → whichever uploader is the current target.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (resolveActive() !== uploaderId) return;
      const files = imagesFromClipboard(e.clipboardData);
      if (files.length === 0) return;
      // Let normal text paste win when the user is typing in a field and the clipboard carries text.
      if (isEditable(e.target) && e.clipboardData?.types.includes("text/plain")) return;
      e.preventDefault();
      void acceptRef.current(files.map(nameClipboardFile));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [uploaderId]);

  const [removingId, setRemovingId] = useState<string | null>(null);

  /** Apple-style delete: no confirmation dialog — the tile shrinks away and an Undo is offered instead. */
  const removeAt = (id: string) => {
    const index = itemsRef.current.findIndex((i) => i.meta.id === id);
    if (index < 0 || removingId) return;
    const removed = itemsRef.current[index];
    setRemovingId(id);
    haptic.selection();
    window.setTimeout(() => {
      const next = itemsRef.current.filter((i) => i.meta.id !== id);
      itemsRef.current = next;
      onChangeRef.current(next);
      setRemovingId(null);
      useToasts.getState().push("info", "Screenshot removed", undefined, {
        label: "Undo",
        onClick: () => {
          if (itemsRef.current.some((i) => i.meta.id === id) || itemsRef.current.length >= max) return;
          const restored = [...itemsRef.current];
          restored.splice(Math.min(index, restored.length), 0, removed);
          itemsRef.current = restored;
          onChangeRef.current(restored);
          haptic.success();
        },
      });
    }, 170);
  };

  const used = items.length + pending.length;
  const slots = Array.from({ length: max }, (_, i) => i);
  const pasteKey = isMac ? "⌘V" : "Ctrl+V";

  return (
    <div
      onPointerEnter={claim}
      onFocusCapture={claim}
      onPointerDown={claim}
      data-paste-target={isActive ? "true" : undefined}
      className={cn(
        "-m-2 rounded-2xl p-2 transition-shadow duration-300",
        showTarget && "shadow-[0_0_0_1px_color-mix(in_srgb,var(--gold-strong)_35%,transparent)]",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={max > 1}
        hidden
        onChange={(e) => {
          if (e.target.files) void accept(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        {slots.map((idx) => {
          const item = items[idx] ?? null;
          const pend = !item ? pending[idx - items.length] : undefined;
          const url = item ? urlFor(item) : undefined;

          if (pend) {
            return (
              <motion.div
                key={pend.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="relative aspect-[16/10] overflow-hidden rounded-xl border border-gold/40 bg-canvas"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pend.preview} alt="" className="h-full w-full object-cover opacity-80" draggable={false} />
                <div className="absolute inset-0 grid place-items-center bg-black/25 backdrop-blur-[1px]">
                  <Spinner className="h-5 w-5 text-white" />
                </div>
              </motion.div>
            );
          }

          if (!item) {
            const blocked = used >= max;
            return (
              <button
                key={`empty-${idx}`}
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  claim();
                  void accept(e.dataTransfer.files);
                }}
                className={cn(
                  "group relative flex aspect-[16/10] flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50",
                  dragging
                    ? "border-gold/60 bg-gold/[0.05]"
                    : "border-line-strong bg-raised/40 hover:border-faint hover:bg-raised",
                  blocked && "opacity-60",
                )}
              >
                <ImageIcon className="h-5 w-5 text-faint transition-colors group-hover:text-gold" />
                <span className="text-xs font-medium text-muted">Add screenshot</span>
                <span className="text-[10px] text-faint">
                  Click to browse · or paste <kbd className="rounded border border-line-strong bg-canvas/60 px-1 py-px font-mono text-[9px] text-muted">{pasteKey}</kbd>
                </span>
              </button>
            );
          }

          const leaving = removingId === item.meta.id;
          return (
            <motion.div
              key={item.meta.id}
              role="group"
              tabIndex={0}
              aria-label={`Screenshot ${idx + 1} of ${max}. Press Delete to remove.`}
              onKeyDown={(e) => {
                if (e.key === "Backspace" || e.key === "Delete") {
                  e.preventDefault();
                  removeAt(item.meta.id);
                }
              }}
              initial={previewByIdRef.current[item.meta.id] ? false : { opacity: 0, scale: 0.94 }}
              animate={leaving ? { opacity: 0, scale: 0.88 } : { opacity: 1, scale: 1 }}
              transition={{ duration: leaving ? 0.17 : 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="group relative aspect-[16/10] overflow-hidden rounded-xl border border-line-strong bg-canvas outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
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
                {/* Always visible, like the badge on an iOS attachment — works on touch, no hover needed. */}
                <button
                  type="button"
                  onClick={() => removeAt(item.meta.id)}
                  aria-label={`Remove screenshot ${idx + 1}`}
                  className="grid h-[22px] w-[22px] place-items-center rounded-full bg-black/45 text-white/90 shadow-[0_1px_4px_rgba(0,0,0,0.25),inset_0_0_0_0.5px_rgba(255,255,255,0.22)] backdrop-blur-xl transition-[transform,background-color] duration-150 hover:bg-black/65 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <XIcon className="h-3 w-3" />
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
