import type { TradeDirection } from "./types";
import { hasTimeComponent, normalizeImportedTimestamp, IMPORT_SOURCE_TZ } from "./tz";

/* ------------------------------------------------------------------ */
/*  CSV trade import — parse & validate, never silently discard        */
/* ------------------------------------------------------------------ */

export interface ParsedTrade {
  line: number; // 1-based line in the file (including header)
  date: string; // YYYY-MM-DD
  pnl: number;
  rr: number | null;
  instrument: string;
  direction: TradeDirection | null;
  setup: string;
  notes: string;
}

export interface InvalidRow {
  line: number;
  reason: string;
  raw: string;
}

export interface CsvParseResult {
  rows: ParsedTrade[];
  invalid: InvalidRow[];
  headers: string[];
  /** Set when the CSV shape is genuinely unsupported (no date / no P&L column). */
  error?: string;
}

/** Split one CSV line into cells, honouring double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === "," || ch === ";" || ch === "\t") && !inQuotes) {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

/**
 * Normalise a header cell to a canonical field name.
 * Covers common broker/spreadsheet vocabulary; unknown columns are ignored.
 */
function mapHeader(h: string): string | null {
  const key = h.toLowerCase().replace(/[^a-z]/g, "");
  if (["date", "tradedate", "day", "closedate", "entrydate", "datetime"].includes(key)) return "date";
  // Broker timestamps — open/entry preferred over close/exit for the trade date.
  if (["boughttimestamp", "boughttime", "opentime", "opendatetime", "entrytime", "opendate"].includes(key)) return "date";
  if (["soldtimestamp", "soldtime", "closetime", "closedatetime", "exittime", "closedate2", "selldate"].includes(key)) return "date";
  if (["timestamp", "time"].includes(key)) return "date";
  if (["pnl", "profit", "profitloss", "pnlusd", "netpnl", "pl", "net", "result", "pnlcurrency"].includes(key)) return "pnl";
  if (["rr", "r", "rmultiple", "riskreward", "riskrewardratio"].includes(key)) return "rr";
  if (["instrument", "symbol", "ticker", "market", "pair", "asset"].includes(key)) return "instrument";
  if (["direction", "side", "position", "type", "longshort"].includes(key)) return "direction";
  if (["setup", "strategy", "playbook", "pattern"].includes(key)) return "setup";
  if (["notes", "note", "comments", "comment", "journal", "remarks"].includes(key)) return "notes";
  // Extra context columns — folded into notes, not stored as model fields.
  if (["qty", "quantity", "shares", "contracts", "size", "positionsize"].includes(key)) return "quantity";
  if (["buyprice", "entryprice", "openprice", "pricein"].includes(key)) return "entry";
  if (["sellprice", "exitprice", "closeprice", "priceout"].includes(key)) return "exit";
  if (["duration", "holdingtime", "tradeduration", "timedintrade"].includes(key)) return "duration";
  return null;
}

/** Accept common date shapes (optionally followed by a time); return YYYY-MM-DD or null. */
function normalizeDate(raw: string): string | null {
  const v = raw.trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // US style: MM/DD/YYYY (with optional HH:mm:ss)
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(v);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  // European style: DD.MM.YYYY
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+.*)?$/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function normalizeDirection(raw: string): TradeDirection | null | undefined {
  const v = raw.trim().toLowerCase();
  if (v === "") return undefined; // not provided
  if (["long", "buy", "b", "l"].includes(v)) return "long";
  if (["short", "sell", "s", "sh"].includes(v)) return "short";
  return null; // provided but unrecognised
}

/**
 * Normalise a currency P&L cell:
 *   "$22.50" → 22.5    "$(24.00)" → -24    "$1,234.56" → 1234.56    "−12" → -12
 */
export function normalizePnl(raw: string): number | null {
  let v = raw.trim();
  if (!v) return null;
  v = v.replace(/[$\s,]/g, "");
  const negParens = /^\((.*)\)$/.test(v);
  if (negParens) v = v.slice(1, -1);
  v = v.replace(/[−–]/g, "-");
  if (v.endsWith("-")) v = "-" + v.slice(0, -1); // trailing-minus style
  if (v === "" || v === "-") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return negParens ? -Math.abs(n) : n;
}

/** Format a raw duration cell for the notes suffix ("272" → "4m 32s", text kept as-is). */
function normalizeDuration(raw: string): string | null {
  const v = raw.trim();
  if (!v || v === "-") return null;
  if (/^\d+$/.test(v)) {
    const secs = Number(v);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }
  return v;
}

function buildNotes(base: string, qty: string, entry: string, exit: string, duration: string, nyTime: string | null): string {
  const parts: string[] = [];
  if (qty) parts.push(`Qty ${qty}`);
  if (entry) parts.push(`${entry} → ${exit || "?"}`);
  const dur = normalizeDuration(duration);
  if (dur) parts.push(dur);
  if (nyTime) parts.push(`entry ${nyTime} NY`);
  if (parts.length === 0) return base;
  const suffix = parts.join(" · ");
  return base ? `${base} · ${suffix}` : suffix;
}

/**
 * Parse a CSV of trades. The first non-empty line must be a header row;
 * columns are mapped flexibly (date/pnl/rr/instrument/direction/setup/notes).
 *
 * Timestamp cells (date + time) are normalized from `opts.timestampSourceTz`
 * (default IST — broker exports) into the trading timezone (America/New_York)
 * immediately at this seam; the derived NY date becomes the journal date and
 * the NY entry time is preserved in notes. Plain calendar dates pass through.
 */
export function parseTradesCsv(
  text: string,
  opts?: { timestampSourceTz?: string | null },
): CsvParseResult {
  const sourceTz = opts?.timestampSourceTz === null ? null : opts?.timestampSourceTz ?? IMPORT_SOURCE_TZ;
  const lines = text.split(/\r\n|\n|\r/);
  const rows: ParsedTrade[] = [];
  const invalid: InvalidRow[] = [];
  let headers: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cells = splitCsvLine(raw);

    if (headers.length === 0) {
      const mapped = cells.map(mapHeader);
      if (mapped.some(Boolean)) {
        // First occurrence wins (e.g. boughtTimestamp beats soldTimestamp for date).
        const taken = new Set<string>();
        headers = mapped.map((m) => {
          if (!m || taken.has(m)) return "";
          taken.add(m);
          return m;
        });
        // A recognised file still needs the two essentials.
        if (!taken.has("date") || !taken.has("pnl")) {
          return {
            rows: [],
            invalid: [],
            headers: cells,
            error:
              "This CSV doesn't contain recognisable date and P&L columns, so trades can't be mapped. " +
              "Expected columns like Date/Time, P&L, Symbol — or the canonical order date, pnl, rr, instrument, direction, setup, notes.",
          };
        }
        continue; // header row consumed
      }
      // No recognisable header — probe whether this line fits the canonical order
      // (date, pnl, …). If not, the format is genuinely unsupported.
      if (!normalizeDate(cells[0] ?? "") || normalizePnl(cells[1] ?? "") === null) {
        return {
          rows: [],
          invalid: [],
          headers: cells,
          error:
            "Unrecognised CSV format — couldn't find date and P&L columns. " +
            "Expected a header row (Date, P&L, Symbol, …) or rows starting with date and P&L.",
        };
      }
      headers = ["date", "pnl", "rr", "instrument", "direction", "setup", "notes"];
    }

    const get = (field: string): string => {
      const idx = headers.indexOf(field);
      return idx >= 0 ? (cells[idx] ?? "") : "";
    };

    const fail = (reason: string) => invalid.push({ line: i + 1, reason, raw: raw.trim().slice(0, 120) });

    // Timestamp cells normalize IST → New York at the import seam.
    let date = normalizeDate(get("date"));
    let nyEntryTime: string | null = null;
    if (date && hasTimeComponent(get("date")) && sourceTz) {
      const ny = normalizeImportedTimestamp(get("date"), sourceTz);
      if (ny) {
        date = ny.date;
        nyEntryTime = ny.time;
      }
    }
    if (!date) { fail(`Unrecognised date "${get("date").slice(0, 24)}" — use MM/DD/YYYY or YYYY-MM-DD`); continue; }

    const pnl = normalizePnl(get("pnl"));
    if (pnl === null) { fail("Missing or non-numeric P&L"); continue; }

    const rrRaw = get("rr").replace(/[$,\s]/g, "").replace(/[−–]/g, "-");
    let rr: number | null = null;
    if (rrRaw !== "" && rrRaw !== "-") {
      rr = Number(rrRaw.replace(/[rR]$/, ""));
      if (!Number.isFinite(rr)) { fail(`Unrecognised R:R value "${get("rr")}"`); continue; }
    }

    const direction = normalizeDirection(get("direction"));
    if (direction === null) { fail(`Unrecognised direction "${get("direction")}" — use long/short`); continue; }

    rows.push({
      line: i + 1,
      date,
      pnl: Math.round(pnl * 100) / 100,
      rr,
      instrument: get("instrument") || "—",
      direction: direction ?? null,
      setup: get("setup"),
      notes: buildNotes(get("notes"), get("quantity"), get("entry"), get("exit"), get("duration"), nyEntryTime),
    });
  }

  if (headers.length === 0) {
    return { rows: [], invalid: [], headers: [], error: "No rows found in that file." };
  }

  return { rows, invalid, headers };
}
