import { CURRENCY_SYMBOLS, type CurrencyCode } from "./types";

/* ------------------------------ currency ------------------------------ */

export function currencySymbol(code: CurrencyCode): string {
  return CURRENCY_SYMBOLS[code] ?? "$";
}

export function formatMoney(value: number, code: CurrencyCode = "USD", opts?: { compact?: boolean; decimals?: number }): string {
  const sym = currencySymbol(code);
  const abs = Math.abs(value);
  let body: string;
  if (opts?.compact && abs >= 1_000_000) {
    body = `${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  } else if (opts?.compact && abs >= 10_000) {
    body = `${(abs / 1000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  } else if (opts?.decimals === 0 || (opts?.decimals === undefined && Number.isInteger(value))) {
    body = abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
  } else {
    body = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const sign = value < 0 ? "\u2212" : "";
  return `${sign}${sym}${body}`;
}

export function formatSignedMoney(value: number, code: CurrencyCode = "USD", opts?: { compact?: boolean }): string {
  const base = formatMoney(Math.abs(value), code, opts);
  if (value > 0) return `+${base}`;
  if (value < 0) return `\u2212${base}`;
  return base;
}

export function formatPct(fraction: number, decimals = 1): string {
  return `${(fraction * 100).toFixed(decimals)}%`;
}

/* -------------------------------- dates -------------------------------- */

/** Local calendar date key `YYYY-MM-DD`. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return dateKey(new Date());
}

const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function weekdayLong(key: string): string {
  return WEEKDAYS_LONG[parseDateKey(key).getDay()];
}
export function weekdayShort(key: string): string {
  return WEEKDAYS_SHORT[parseDateKey(key).getDay()];
}
export function monthName(index: number): string {
  return MONTHS_LONG[((index % 12) + 12) % 12];
}

/** "Mon 12 May" */
export function formatDateMedium(key: string): string {
  const d = parseDateKey(key);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()].slice(0, 3)}`;
}

/** "Monday, 12 May 2025" */
export function formatDateFull(key: string): string {
  const d = parseDateKey(key);
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function relativeDayLabel(key: string): string | null {
  const t = todayKey();
  if (key === t) return "Today";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === dateKey(y)) return "Yesterday";
  return null;
}

export function addDays(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

export function monthLabel(year: number, monthIndex0: number): string {
  return `${MONTHS_LONG[monthIndex0]} ${year}`;
}

export function bytesToSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
