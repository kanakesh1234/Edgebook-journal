/* ------------------------------------------------------------------ */
/*  Zero-dependency PKZIP archive builder (browser + Node)             */
/*                                                                      */
/*  - UTF-8 filenames (general purpose bit 11 = 0x0800)                */
/*  - Standard IEEE 802.3 CRC-32 checksums                             */
/*  - Raw DEFLATE via CompressionStream("deflate-raw") for text files  */
/*    when supported, with automatic STORE (method 0) fallback         */
/*  - STORE (method 0) for already-compressed media (jpg/png/webp/gif) */
/* ------------------------------------------------------------------ */

export interface ZipEntryInput {
  /** POSIX-style relative path inside the archive (e.g. "journal/trades.json"). */
  path: string;
  /** File content as UTF-8 string, Uint8Array, ArrayBuffer, or Blob. */
  data: string | Uint8Array | ArrayBuffer | Blob;
  /** Optional timestamp (ms since epoch). Defaults to Date.now(). */
  mtime?: number;
  /** Override compression decision. By default text/JSON/CSV/MD are deflated and media are stored. */
  compress?: boolean;
}

const textEncoder = new TextEncoder();

/* ----------------------------- CRC-32 ----------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/* ------------------------- DOS date / time ------------------------- */

function toDosDateTime(ms: number): { time: number; date: number } {
  const d = new Date(ms);
  const year = Math.max(1980, Math.min(2107, d.getFullYear()));
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = Math.floor(d.getSeconds() / 2);

  const time = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const date = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { time, date };
}

/* ----------------------- path normalization ----------------------- */

function normalizeZipPath(raw: string): string {
  return raw
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
}

const ALREADY_COMPRESSED_EXT = /\.(?:jpe?g|png|gif|webp|avif|mp4|webm|mov|mp3|m4a|ogg|zip|gz|br|pdf)$/i;

function shouldCompress(path: string, size: number, override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  if (size < 64) return false;
  return !ALREADY_COMPRESSED_EXT.test(path);
}

/* ------------------------ optional deflate ------------------------ */

async function deflateRaw(input: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    const copy = new Uint8Array(input.byteLength);
    copy.set(input);
    const writePromise = writer.write(copy).then(() => writer.close());

    const chunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
    await writePromise;

    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  } catch {
    return null;
  }
}

async function toBytes(data: ZipEntryInput["data"]): Promise<Uint8Array> {
  if (typeof data === "string") return textEncoder.encode(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(await data.arrayBuffer());
}

/* ---------------------------- ZIP writer ---------------------------- */

interface PreparedRecord {
  nameBytes: Uint8Array;
  method: number; // 0 = STORE, 8 = DEFLATE
  crc: number;
  compressed: Uint8Array;
  uncompressedSize: number;
  dosTime: number;
  dosDate: number;
  localHeaderOffset: number;
}

/**
 * Builds a valid PKZIP archive as a Uint8Array.
 * Duplicate normalized paths are automatically deduplicated with numeric suffixes.
 */
export async function buildZipBytes(entries: ZipEntryInput[]): Promise<Uint8Array> {
  const seen = new Set<string>();
  const records: PreparedRecord[] = [];
  const parts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    let cleanPath = normalizeZipPath(entry.path);
    if (!cleanPath) continue;

    if (seen.has(cleanPath)) {
      const dot = cleanPath.lastIndexOf(".");
      const slash = cleanPath.lastIndexOf("/");
      const hasExt = dot > slash;
      const base = hasExt ? cleanPath.slice(0, dot) : cleanPath;
      const ext = hasExt ? cleanPath.slice(dot) : "";
      let idx = 2;
      while (seen.has(`${base}_${idx}${ext}`)) idx++;
      cleanPath = `${base}_${idx}${ext}`;
    }
    seen.add(cleanPath);

    const rawBytes = await toBytes(entry.data);
    const checksum = crc32(rawBytes);
    const nameBytes = textEncoder.encode(cleanPath);
    const { time: dosTime, date: dosDate } = toDosDateTime(entry.mtime ?? Date.now());

    let method = 0;
    let payload = rawBytes;
    if (shouldCompress(cleanPath, rawBytes.byteLength, entry.compress)) {
      const deflated = await deflateRaw(rawBytes);
      if (deflated && deflated.byteLength < rawBytes.byteLength) {
        method = 8;
        payload = deflated;
      }
    }

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.byteLength);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version needed (2.0)
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, method, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, payload.byteLength, true);
    lv.setUint32(22, rawBytes.byteLength, true);
    lv.setUint16(26, nameBytes.byteLength, true);
    lv.setUint16(28, 0, true); // extra field length
    localHeader.set(nameBytes, 30);

    records.push({
      nameBytes,
      method,
      crc: checksum,
      compressed: payload,
      uncompressedSize: rawBytes.byteLength,
      dosTime,
      dosDate,
      localHeaderOffset: offset,
    });

    parts.push(localHeader, payload);
    offset += localHeader.byteLength + payload.byteLength;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;

  for (const r of records) {
    // Central directory header (46 bytes + filename)
    const cd = new Uint8Array(46 + r.nameBytes.byteLength);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, r.method, true);
    cv.setUint16(12, r.dosTime, true);
    cv.setUint16(14, r.dosDate, true);
    cv.setUint32(16, r.crc, true);
    cv.setUint32(20, r.compressed.byteLength, true);
    cv.setUint32(24, r.uncompressedSize, true);
    cv.setUint16(28, r.nameBytes.byteLength, true);
    cv.setUint16(30, 0, true); // extra length
    cv.setUint16(32, 0, true); // comment length
    cv.setUint16(34, 0, true); // disk number
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, r.localHeaderOffset, true);
    cd.set(r.nameBytes, 46);

    parts.push(cd);
    centralDirSize += cd.byteLength;
    offset += cd.byteLength;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true); // disk number
  ev.setUint16(6, 0, true); // start disk
  ev.setUint16(8, records.length, true);
  ev.setUint16(10, records.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true); // comment length
  parts.push(eocd);
  offset += eocd.byteLength;

  const out = new Uint8Array(offset);
  let pos = 0;
  for (const part of parts) {
    out.set(part, pos);
    pos += part.byteLength;
  }
  return out;
}

export async function buildZipBlob(entries: ZipEntryInput[]): Promise<Blob> {
  const bytes = await buildZipBytes(entries);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: "application/zip" });
}
