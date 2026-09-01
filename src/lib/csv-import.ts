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
  /** NY-local entry time (HH:MM 24-hour). */
  entryTime: string | null;
  /** NY-local exit time (HH:MM 24-hour). */
  exitTime: string | null;
  /** Entry price. */
  entryPrice: number | null;
  /** Exit price. */
  exitPrice: number | null;
  /** Trade quantity (contracts/shares). */
  quantity: number | null;
  /** Human-readable hold duration, e.g. "16 seconds". */
  holdDuration: string | null;
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
 * Covers common broker/spreadsheet vocabulary; unknown columns are ignored
 * (metadata like _priceFormat, buyFillId, sellFillId are silently skipped).
 */
function mapHeader(h: string): string | null {
  const key = h.toLowerCase().replace(/[^a-z]/g, "");
  // Plain date columns (no time component expected)
  if (["date", "tradedate", "day", "entrydate", "datetime"].includes(key)) return "date";
  // Entry timestamp — full date+time for the buy/open side
  if (["boughttimestamp", "boughttime", "opentime", "opendatetime", "entrytime", "opendate"].includes(key)) return "entryTimestamp";
  // Exit timestamp — full date+time for the sell/close side
  if (["soldtimestamp", "soldtime", "closetime", "closedatetime", "exittime", "closedate", "selldate"].includes(key)) return "exitTimestamp";
  // Generic timestamp — treat as entry
  if (["timestamp", "time"].includes(key)) return "entryTimestamp";
  // P&L
  if (["pnl", "profit", "profitloss", "pnlusd", "netpnl", "pl", "net", "result", "pnlcurrency"].includes(key)) return "pnl";
  if (["rr", "r", "rmultiple", "riskreward", "riskrewardratio"].includes(key)) return "rr";
  if (["instrument", "symbol", "ticker", "market", "pair", "asset"].includes(key)) return "instrument";
  if (["direction", "side", "position", "type", "longshort"].includes(key)) return "direction";
  if (["setup", "strategy", "playbook", "pattern"].includes(key)) return "setup";
  if (["notes", "note", "comments", "comment", "journal", "remarks"].includes(key)) return "notes";
  // Structured trade fields — stored as proper fields, NOT folded into notes
  if (["qty", "quantity", "shares", "contracts", "size", "positionsize"].includes(key)) return "quantity";
  if (["buyprice", "entryprice", "openprice", "pricein"].includes(key)) return "entryPrice";
  if (["sellprice", "exitprice", "closeprice", "priceout"].includes(key)) return "exitPrice";
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
  const negParens = /^\(.*\)$/.test(v);
  if (negParens) v = v.slice(1, -1);
  v = v.replace(/[−–]/g, "-");
  if (v.endsWith("-")) v = "-" + v.slice(0, -1); // trailing-minus style
  if (v === "" || v === "-") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return negParens ? -Math.abs(n) : n;
}

/**
 * Format a raw duration cell into a human-readable string:
 *   "16sec" → "16 seconds"    "8sec" → "8 seconds"
 *   "272"   → "4 minutes 32 seconds"   (pure numeric = seconds)
 *   "5min"  → "5 minutes"
 */
function normalizeDuration(raw: string): string | null {
  const v = raw.trim();
  if (!v || v === "-") return null;

  const formatSecs = (secs: number): string => {
    if (secs >= 60) {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return s > 0
        ? `${m} minute${m !== 1 ? "s" : ""} ${s} second${s !== 1 ? "s" : ""}`
        : `${m} minute${m !== 1 ? "s" : ""}`;
    }
    return `${secs} second${secs !== 1 ? "s" : ""}`;
  };

  // "16sec", "8 sec", "120seconds"
  const secMatch = /^(\d+)\s*sec(?:onds?)?$/i.exec(v);
  if (secMatch) return formatSecs(Number(secMatch[1]));

  // "5min", "5 mins", "5 minutes"
  const minMatch = /^(\d+)\s*min(?:utes?|s)?$/i.exec(v);
  if (minMatch) {
    const mins = Number(minMatch[1]);
    return `${mins} minute${mins !== 1 ? "s" : ""}`;
  }

  // Pure numeric (assumed seconds)
  if (/^\d+$/.test(v)) return formatSecs(Number(v));

  return v; // unrecognised format — preserve as-is
}

/** Parse a numeric price cell, return null for blanks. */
function parsePrice(raw: string): number | null {
  const v = raw.trim().replace(/[$,\s]/g, "");
  if (!v || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Parse a numeric quantity cell. */
function parseQuantity(raw: string): number | null {
  const v = raw.trim().replace(/[,\s]/g, "");
  if (!v || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Parse a CSV of trades. The first non-empty line must be a header row;
 * columns are mapped flexibly (date/pnl/rr/instrument/direction/setup/notes).
 *
 * Timestamp cells (date + time) are normalized from `opts.timestampSourceTz`
 * (default IST — broker exports) into the trading timezone (America/New_York)
 * immediately at this seam; the derived NY date becomes the journal date and
 * the NY entry/exit times are preserved as structured HH:MM fields.
 *
 * All structured data (qty, prices, duration, timestamps) is stored in
 * dedicated ParsedTrade fields — NEVER concatenated into notes.
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
        // First occurrence wins for each canonical field.
        const taken = new Set<string>();
        headers = mapped.map((m) => {
          if (!m || taken.has(m)) return "";
          taken.add(m);
          return m;
        });
        // A recognised file needs at least a date source + P&L.
        if (!(taken.has("date") || taken.has("entryTimestamp")) || !taken.has("pnl")) {
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

    // --- Resolve trade date and entry/exit times ---
    let date: string | null = null;
    let nyEntryTime: string | null = null;
    let nyExitTime: string | null = null;

    const rawDate = get("date");
    const rawEntryTs = get("entryTimestamp");
    const rawExitTs = get("exitTimestamp");

    // 1) Explicit date column
    if (rawDate) {
      date = normalizeDate(rawDate);
      if (date && hasTimeComponent(rawDate) && sourceTz) {
        const ny = normalizeImportedTimestamp(rawDate, sourceTz);
        if (ny) { date = ny.date; nyEntryTime = ny.time; }
      }
    }

    // 2) Entry timestamp → trade date (if no explicit date) + entry time
    if (rawEntryTs) {
      if (hasTimeComponent(rawEntryTs) && sourceTz) {
        const ny = normalizeImportedTimestamp(rawEntryTs, sourceTz);
        if (ny) {
          if (!date) date = ny.date;
          nyEntryTime = ny.time;
        }
      } else if (!date) {
        date = normalizeDate(rawEntryTs);
      }
    }

    // 3) Exit timestamp → exit time
    if (rawExitTs) {
      if (hasTimeComponent(rawExitTs) && sourceTz) {
        const ny = normalizeImportedTimestamp(rawExitTs, sourceTz);
        if (ny) { nyExitTime = ny.time; }
      }
    }

    if (!date) { fail(`Unrecognised date "${(rawDate || rawEntryTs || "").slice(0, 24)}" — use MM/DD/YYYY or YYYY-MM-DD`); continue; }

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
      // Notes comes ONLY from the actual notes/comments column — never auto-generated
      notes: get("notes"),
      entryTime: nyEntryTime,
      exitTime: nyExitTime,
      entryPrice: parsePrice(get("entryPrice")),
      exitPrice: parsePrice(get("exitPrice")),
      quantity: parseQuantity(get("quantity")),
      holdDuration: normalizeDuration(get("duration")),
    });
  }

  if (headers.length === 0) {
    return { rows: [], invalid: [], headers: [], error: "No rows found in that file." };
  }

  return { rows, invalid, headers };
}
