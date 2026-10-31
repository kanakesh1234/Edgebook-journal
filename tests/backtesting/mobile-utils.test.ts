/**
 * Mobile utility math tests — nearestSnapPoint, loupeOffset, isWithinHitArea.
 * These are pure-math helpers exported from mobile-sheet.tsx; no DOM needed.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nearestSnapPoint, loupeOffset, isWithinHitArea } from "../../src/components/backtesting/mobile-utils.ts";

// ──────────────────────────────────────────────────────────────────────────────
// nearestSnapPoint
// ──────────────────────────────────────────────────────────────────────────────

describe("nearestSnapPoint", () => {
  const H = 844; // iPhone 14 logical height

  it("snaps to peek when dragged low", () => {
    const peekTop = H * 0.1; // fraction 0.9 → top = H * (1-0.9) = 84.4
    const result = nearestSnapPoint(peekTop + 10, H);
    assert.ok(Math.abs(result - peekTop) < 1, `expected ≈${peekTop}, got ${result}`);
  });

  it("snaps to half-open when dragged to middle", () => {
    const halfTop = H * 0.5;
    const result = nearestSnapPoint(halfTop + 5, H);
    assert.ok(Math.abs(result - halfTop) < 1, `expected ≈${halfTop}, got ${result}`);
  });

  it("snaps to full when dragged near top", () => {
    const fullTop = H * 0.85;
    const result = nearestSnapPoint(fullTop - 5, H);
    assert.ok(Math.abs(result - fullTop) < 1, `expected ≈${fullTop}, got ${result}`);
  });

  it("handles a single snap point", () => {
    const result = nearestSnapPoint(200, 800, [0.75]);
    const expected = 800 * 0.25;
    assert.ok(Math.abs(result - expected) < 1, `expected ≈${expected}, got ${result}`);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// loupeOffset
// ──────────────────────────────────────────────────────────────────────────────

describe("loupeOffset", () => {
  const SW = 390, SH = 700, SIZE = 80;

  it("places loupe 90px above the finger, centred horizontally", () => {
    const { left, top } = loupeOffset(200, 400, SW, SH, SIZE);
    assert.strictEqual(left, 200 - SIZE / 2);
    assert.strictEqual(top, 400 - 90 - SIZE / 2);
  });

  it("clamps left to 0 at left edge", () => {
    const { left } = loupeOffset(0, 400, SW, SH, SIZE);
    assert.strictEqual(left, 0);
  });

  it("clamps left to stageW - loupeSize at right edge", () => {
    const { left } = loupeOffset(SW, 400, SW, SH, SIZE);
    assert.strictEqual(left, SW - SIZE);
  });

  it("clamps top to 0 when finger is near top", () => {
    const { top } = loupeOffset(200, 10, SW, SH, SIZE);
    assert.strictEqual(top, 0);
  });

  it("clamps top to stageH - loupeSize when loupe would overflow bottom", () => {
    // Use a touchY near the very bottom so rawTop = touchY - 90 - 40 > stageH - loupeSize
    // For SH=700, SIZE=80: rawTop = touchY - 130; clamp at 700-80=620 → need touchY-130 > 620 → touchY > 750 → use SH+100
    const { top } = loupeOffset(200, SH + 100, SW, SH, SIZE);
    assert.strictEqual(top, SH - SIZE);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// isWithinHitArea
// ──────────────────────────────────────────────────────────────────────────────

describe("isWithinHitArea", () => {
  it("returns true when touch is exactly on the handle", () => {
    assert.ok(isWithinHitArea(100, 200, 100, 200));
  });

  it("returns true within default 22px radius", () => {
    assert.ok(isWithinHitArea(100, 200, 115, 210)); // dist ≈ 18px
  });

  it("returns false just outside radius", () => {
    assert.ok(!isWithinHitArea(100, 200, 125, 215)); // dist ≈ 26px
  });

  it("returns true for a custom radius", () => {
    assert.ok(isWithinHitArea(0, 0, 30, 0, 35));
  });

  it("returns false just outside custom radius", () => {
    assert.ok(!isWithinHitArea(0, 0, 36, 0, 35));
  });

  it("works with negative coordinates", () => {
    assert.ok(isWithinHitArea(-10, -10, -10, -10));
    assert.ok(!isWithinHitArea(-10, -10, 20, 30, 22));
  });
});
