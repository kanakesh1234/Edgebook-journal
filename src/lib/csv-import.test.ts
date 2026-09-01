/**
 * Regression tests for CSV import — Performance CSV format.
 *
 * Run with: npx tsx src/lib/csv-import.test.ts
 *
 * These tests verify the exact CSV format used by the trading journal's
 * Performance export and ensure structured fields are never dumped into Notes.
 */

// Inline the parser since we can't use vitest/jest (not installed)
import { parseTradesCsv, normalizePnl } from "./csv-import";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  } else {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  }
}

function assertEqual(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`  ❌ FAIL: ${msg}`);
    console.error(`     Expected: ${e}`);
    console.error(`     Actual:   ${a}`);
    failed++;
  } else {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  }
}

// ---- Test 1: Full Performance CSV format (single row) ----
console.log("\n=== Test 1: Single row Performance CSV ===");
{
  const csv = `symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration
MNQU6,0.01,0,0.25,123,456,1,29071.75,29055.00,"$(33.50)",09/01/2026 19:10:08,09/01/2026 19:10:24,16sec`;

  const result = parseTradesCsv(csv);

  assert(!result.error, "No parse error");
  assertEqual(result.rows.length, 1, "1 valid row");
  assertEqual(result.invalid.length, 0, "0 invalid rows");

  const row = result.rows[0];
  assertEqual(row.instrument, "MNQU6", "Instrument = MNQU6");
  assertEqual(row.quantity, 1, "Quantity = 1");
  assertEqual(row.entryPrice, 29071.75, "Entry price = 29071.75");
  assertEqual(row.exitPrice, 29055.00, "Exit price = 29055.00");
  assertEqual(row.pnl, -33.50, "P&L = -33.50");
  assert(row.entryTime !== null, "Entry time is populated");
  assert(row.exitTime !== null, "Exit time is populated");
  assertEqual(row.holdDuration, "16 seconds", "Hold duration = '16 seconds'");
  assertEqual(row.notes, "", "Notes is empty (no notes column in CSV)");
  assertEqual(row.rr, null, "R:R is null (no rr column)");
  assertEqual(row.direction, null, "Direction is null (no direction column)");
  assertEqual(row.setup, "", "Setup is empty (no setup column)");
}

// ---- Test 2: Multiple rows ----
console.log("\n=== Test 2: Multiple rows Performance CSV ===");
{
  const csv = `symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration
MNQU6,0.01,0,0.25,100,200,1,29071.75,29055.00,"$(33.50)",09/01/2026 19:10:08,09/01/2026 19:10:24,16sec
MNQU6,0.01,0,0.25,101,201,2,29060.00,29080.50,"$41.00",09/01/2026 19:15:00,09/01/2026 19:20:30,330sec
ESU6,0.01,0,0.25,102,202,1,5500.25,5495.00,"$(15.00)",09/01/2026 20:00:00,09/01/2026 20:02:00,120sec`;

  const result = parseTradesCsv(csv);

  assert(!result.error, "No parse error");
  assertEqual(result.rows.length, 3, "3 valid rows");
  assertEqual(result.invalid.length, 0, "0 invalid rows");

  // Row 1
  assertEqual(result.rows[0].instrument, "MNQU6", "Row 1 instrument");
  assertEqual(result.rows[0].pnl, -33.50, "Row 1 P&L");
  assertEqual(result.rows[0].quantity, 1, "Row 1 quantity");

  // Row 2
  assertEqual(result.rows[1].instrument, "MNQU6", "Row 2 instrument");
  assertEqual(result.rows[1].pnl, 41.00, "Row 2 P&L");
  assertEqual(result.rows[1].quantity, 2, "Row 2 quantity");
  assertEqual(result.rows[1].entryPrice, 29060.00, "Row 2 entry price");
  assertEqual(result.rows[1].exitPrice, 29080.50, "Row 2 exit price");
  assertEqual(result.rows[1].holdDuration, "5 minutes 30 seconds", "Row 2 hold duration 330sec");

  // Row 3
  assertEqual(result.rows[2].instrument, "ESU6", "Row 3 instrument");
  assertEqual(result.rows[2].pnl, -15.00, "Row 3 P&L");
  assertEqual(result.rows[2].holdDuration, "2 minutes", "Row 3 hold duration 120sec");

  // ALL rows must have empty notes
  for (let i = 0; i < result.rows.length; i++) {
    assertEqual(result.rows[i].notes, "", `Row ${i + 1} notes is empty`);
  }
}

// ---- Test 3: P&L parsing ----
console.log("\n=== Test 3: P&L parsing ===");
{
  assertEqual(normalizePnl("$(33.50)"), -33.50, "$(33.50) → -33.50");
  assertEqual(normalizePnl("$(15.00)"), -15.00, "$(15.00) → -15.00");
  assertEqual(normalizePnl("$33.50"), 33.50, "$33.50 → 33.50");
  assertEqual(normalizePnl("$(0.00)"), -0, "$(0.00) → -0");
  assertEqual(normalizePnl("$1,234.56"), 1234.56, "$1,234.56 → 1234.56");
  assertEqual(normalizePnl("−12"), -12, "−12 → -12");
  assertEqual(normalizePnl("$41.00"), 41.00, "$41.00 → 41.00");
  assertEqual(normalizePnl(""), null, "empty → null");
}

// ---- Test 4: Metadata columns are NOT in notes ----
console.log("\n=== Test 4: Metadata columns ignored (not in notes) ===");
{
  const csv = `symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration
MNQU6,0.01,0,0.25,ABC123,DEF456,1,29071.75,29055.00,"$(33.50)",09/01/2026 19:10:08,09/01/2026 19:10:24,16sec`;

  const result = parseTradesCsv(csv);
  const row = result.rows[0];

  assertEqual(row.notes, "", "Notes does not contain metadata");
  assert(!row.notes.includes("priceFormat"), "No _priceFormat in notes");
  assert(!row.notes.includes("tickSize"), "No _tickSize in notes");
  assert(!row.notes.includes("buyFillId"), "No buyFillId in notes");
  assert(!row.notes.includes("sellFillId"), "No sellFillId in notes");
  assert(!row.notes.includes("Qty"), "No 'Qty' prefix in notes");
  assert(!row.notes.includes("→"), "No arrow in notes");
  assert(!row.notes.includes("entry"), "No 'entry' time text in notes");
}

// ---- Test 5: Duration parsing ----
console.log("\n=== Test 5: Duration parsing ===");
{
  const csv = `symbol,pnl,boughtTimestamp,soldTimestamp,duration
A,"$10",09/01/2026 19:10:08,09/01/2026 19:10:24,16sec
B,"$20",09/01/2026 19:10:08,09/01/2026 19:10:16,8sec
C,"$30",09/01/2026 19:10:08,09/01/2026 19:14:40,272`;

  const result = parseTradesCsv(csv);
  assertEqual(result.rows[0].holdDuration, "16 seconds", "16sec → '16 seconds'");
  assertEqual(result.rows[1].holdDuration, "8 seconds", "8sec → '8 seconds'");
  assertEqual(result.rows[2].holdDuration, "4 minutes 32 seconds", "272 → '4 minutes 32 seconds'");
}

// ---- Test 6: Entry/exit timestamps are populated and date is derived ----
console.log("\n=== Test 6: Timestamps populate entry/exit time and derive date ===");
{
  const csv = `symbol,pnl,boughtTimestamp,soldTimestamp,duration
MNQU6,"$(33.50)",09/01/2026 19:10:08,09/01/2026 19:10:24,16sec`;

  const result = parseTradesCsv(csv);
  const row = result.rows[0];

  assert(row.entryTime !== null, "Entry time is not null");
  assert(row.exitTime !== null, "Exit time is not null");
  // Date should be derived from boughtTimestamp (after IST→NY conversion)
  assert(row.date.length === 10, "Date is YYYY-MM-DD format");
  assert(row.date.startsWith("2026-"), "Date year is 2026");
}

// ---- Test 7: CSV with Notes/Comments column keeps notes separate ----
console.log("\n=== Test 7: Notes column preserved separately ===");
{
  const csv = `symbol,pnl,boughtTimestamp,soldTimestamp,qty,buyPrice,sellPrice,duration,notes
MNQU6,"$(33.50)",09/01/2026 19:10:08,09/01/2026 19:10:24,1,29071.75,29055.00,16sec,Good setup but bad timing`;

  const result = parseTradesCsv(csv);
  const row = result.rows[0];

  assertEqual(row.notes, "Good setup but bad timing", "Notes contains only the notes column value");
  assertEqual(row.quantity, 1, "Quantity is separate from notes");
  assertEqual(row.entryPrice, 29071.75, "Entry price is separate from notes");
}

// ---- Test 8: No sourceTz means no timezone conversion ----
console.log("\n=== Test 8: Null timezone skips conversion, raw times extracted ===");
{
  const csv = `symbol,pnl,boughtTimestamp,soldTimestamp,duration
MNQU6,"$(33.50)",09/01/2026 09:40:08,09/01/2026 09:40:24,16sec`;

  const result = parseTradesCsv(csv, { timestampSourceTz: null });
  const row = result.rows[0];

  // Without timezone conversion, date is just extracted from the raw timestamp
  assertEqual(row.date, "2026-09-01", "Date extracted without tz conversion");
  // Times should be null (no sourceTz means normalizeImportedTimestamp not called)
  assertEqual(row.entryTime, null, "Entry time null without tz");
  assertEqual(row.exitTime, null, "Exit time null without tz");
}

// ---- Summary ----
console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failed > 0) {
  console.error("\n🔴 REGRESSION TESTS FAILED");
  process.exit(1);
} else {
  console.log("\n🟢 ALL REGRESSION TESTS PASSED");
}
