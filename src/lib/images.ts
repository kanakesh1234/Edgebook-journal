import type { EntryImage } from "./types";
import { uid } from "./utils";

/* ------------------------------------------------------------------ */
/*  Image intake pipeline                                              */
/*  Validates, downscales to a max edge and re-encodes to JPEG so      */
/*  screenshots stay crisp but storage stays sane.                     */
/* ------------------------------------------------------------------ */

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // hard stop before decode
const MAX_EDGE = 1800;
const QUALITY = 0.86;

export class ImageError extends Error {}

export interface ProcessedImage {
  meta: EntryImage;
  blob: Blob;
}

const EXT_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", jfif: "image/jpeg", pjpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", avif: "image/avif", bmp: "image/bmp",
  heic: "image/heic", heif: "image/heif",
};

/** MIME type of a picked file. Falls back to the extension — some browsers/OSes leave `file.type` empty (HEIC, .jfif, drag from some apps). */
export function imageTypeOf(file: File): string | null {
  if (file.type.startsWith("image/")) return file.type.toLowerCase();
  if (file.type && file.type !== "application/octet-stream") return null;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPES[ext] ?? null;
}

const HEIC_HELP =
  "This browser can't open HEIC/HEIF photos. Save it as JPG or PNG first (on iPhone: Settings → Camera → Formats → Most Compatible).";

function loadImageBitmap(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const t = imageTypeOf(file);
      reject(new ImageError(t === "image/heic" || t === "image/heif" ? HEIC_HELP : "That file could not be read as an image."));
    };
    img.src = url;
  });
}

/** Decode, optionally downscale, and re-encode. Transparent areas are flattened onto white (JPEG has no alpha). */
async function renderToBlob(file: File, maxEdge: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("Your browser blocked image processing.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new ImageError("Could not encode the image.");
  return { blob, width, height };
}

export async function processImageFile(file: File): Promise<ProcessedImage> {
  if (!imageTypeOf(file)) {
    throw new ImageError("Only image files are supported (PNG, JPG, WebP).");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageError("Image is larger than 12 MB.");
  }

  const { blob, width, height } = await renderToBlob(file, MAX_EDGE, QUALITY);

  return {
    blob,
    meta: {
      id: uid("img"),
      name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
      width,
      height,
      size: blob.size,
    },
  };
}

/**
 * Prepare an image for the Lessons media upload.
 * - GIFs are sent untouched (re-encoding would kill the animation).
 * - PNG / JPEG / WebP that are already small are sent untouched.
 * - Everything else (HEIC on Safari, AVIF, BMP, or anything too big for a request body)
 *   is converted to a JPEG that fits comfortably under common 4.5 MB request limits.
 */
const LESSON_PASSTHROUGH_BYTES = 3.5 * 1024 * 1024;
const LESSON_MAX_EDGE = 2400;
export async function prepareLessonImage(file: File): Promise<File> {
  const type = imageTypeOf(file);
  if (!type) throw new ImageError("Use a PNG, JPG, GIF or WebP image.");
  if (type === "image/gif") {
    if (file.size > 25 * 1024 * 1024) throw new ImageError("That GIF is over 25 MB.");
    return file;
  }
  const direct = type === "image/png" || type === "image/jpeg" || type === "image/webp";
  if (direct && file.size <= LESSON_PASSTHROUGH_BYTES) {
    // Make sure the server sees a usable MIME type even when the browser left it empty.
    return file.type === type ? file : new File([file], file.name, { type });
  }
  let { blob } = await renderToBlob(file, LESSON_MAX_EDGE, 0.88);
  if (blob.size > LESSON_PASSTHROUGH_BYTES) ({ blob } = await renderToBlob(file, 1600, 0.8));
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

/* --------------------------- object-URL cache --------------------------- */

const urlCache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/** Resolve (and memoize) an object URL for a stored image id. */
export function resolveImageUrl(
  id: string,
  fetcher: (id: string) => Promise<Blob | undefined>,
): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return Promise.resolve(cached);

  let p = pending.get(id);
  if (!p) {
    p = fetcher(id)
      .then((blob) => {
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        urlCache.set(id, url);
        return url;
      })
      .catch(() => null)
      .finally(() => pending.delete(id));
    pending.set(id, p);
  }
  return p;
}

export function dropImageUrl(id: string) {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}
