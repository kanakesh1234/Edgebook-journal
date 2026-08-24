import type { TradeDirection } from "./types";

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

/** Normalise a header cell to a canonical field name. */
function mapHeader(h: string): string | null {
  const key = h.toLowerCase().replace(/[^a-z]/g, "");
  if (["date", "tradedate", "day", "closedate", "entrydate"].includes(key)) return "date";
  if (["pnl", "profit", "profitloss", "pnlusd", "netpnl", "pl", "net", "result", "pnlcurrency"].includes(key)) return "pnl";
  if (["rr", "r", "rmultiple", "rmultiple", "riskreward", "riskrewardratio"].includes(key)) return "rr";
  if (["instrument", "symbol", "ticker", "market", "pair", "asset"].includes(key)) return "instrument";
  if (["direction", "side", "position", "type", "longshort"].includes(key)) return "direction";
  if (["setup", "strategy", "playbook", "pattern"].includes(key)) return "setup";
  if (["notes", "note", "comments", "comment", "journal", "remarks"].includes(key)) return "notes";
  return null;
}

/** Accept common date shapes; return YYYY-MM-DD or null. */
function normalizeDate(raw: string): string | null {
  const v = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(v);
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

function cleanNumber(raw: string): string {
  return raw.replace(/[$,\s]/g, "").replace(/^\(−?(.*)\)$/, "-$1").replace("−", "-");
}

/**
 * Parse a CSV of trades. The first non-empty line must be a header row;
 * columns are mapped flexibly (date/pnl/rr/instrument/direction/setup/notes).
 */
export function parseTradesCsv(text: string): CsvParseResult {
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
        headers = mapped.map((m) => m ?? "");
        continue; // header row consumed
      }
      // No recognisable header — assume canonical column order.
      headers = ["date", "pnl", "rr", "instrument", "direction", "setup", "notes"];
    }

    const get = (field: string): string => {
      const idx = headers.indexOf(field);
      return idx >= 0 ? (cells[idx] ?? "") : "";
    };

    const fail = (reason: string) => invalid.push({ line: i + 1, reason, raw: raw.trim().slice(0, 120) });

    const date = normalizeDate(get("date"));
    if (!date) { fail("Unrecognised date — use YYYY-MM-DD"); continue; }

    const pnlRaw = cleanNumber(get("pnl"));
    const pnl = Number(pnlRaw);
    if (pnlRaw === "" || !Number.isFinite(pnl)) { fail("Missing or non-numeric P&L"); continue; }

    const rrRaw = cleanNumber(get("rr"));
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
      notes: get("notes"),
    });
  }

  return { rows, invalid, headers };
}
