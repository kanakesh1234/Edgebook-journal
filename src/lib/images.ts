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
      reject(new ImageError("That file could not be read as an image."));
    };
    img.src = url;
  });
}

export async function processImageFile(file: File): Promise<ProcessedImage> {
  if (!file.type.startsWith("image/")) {
    throw new ImageError("Only image files are supported (PNG, JPG, WebP).");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageError("Image is larger than 12 MB.");
  }

  const img = await loadImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("Your browser blocked image processing.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) throw new ImageError("Could not encode the image.");

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
