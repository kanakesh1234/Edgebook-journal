/**
 * Pure-math mobile utilities — no JSX, no DOM.
 * Imported by mobile-sheet.tsx and by tests.
 */

/** Snap points math for sheet drag. Returns the nearest snap point in px from top. */
export function nearestSnapPoint(
  currentY: number,
  windowHeight: number,
  snapFractions: number[] = [0.9, 0.5, 0.15]
): number {
  const snapPx = snapFractions.map((f) => windowHeight * (1 - f));
  let best = snapPx[0];
  let bestDist = Math.abs(currentY - best);
  for (const s of snapPx) {
    const d = Math.abs(currentY - s);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

/** Loupe offset: returns CSS top/left so the loupe appears 90px above the touch point, clamped to stage. */
export function loupeOffset(
  touchX: number,
  touchY: number,
  stageW: number,
  stageH: number,
  loupeSize = 80
): { left: number; top: number } {
  const half = loupeSize / 2;
  const rawTop = touchY - 90 - half;
  const rawLeft = touchX - half;
  return {
    left: Math.max(0, Math.min(stageW - loupeSize, rawLeft)),
    top: Math.max(0, Math.min(stageH - loupeSize, rawTop)),
  };
}

/** Returns true when (touchX, touchY) is within `radius` px of (handleX, handleY). */
export function isWithinHitArea(
  touchX: number,
  touchY: number,
  handleX: number,
  handleY: number,
  radius = 22
): boolean {
  const dx = touchX - handleX;
  const dy = touchY - handleY;
  return dx * dx + dy * dy <= radius * radius;
}
