import type { Vec2 } from "./strokeToOutline";

/**
 * Optical side bearings.
 *
 * A flat side bearing spaces by the bounding box, which is wrong for any letter
 * whose extremes are local: an "A" touches its box only at the feet, a "T" only
 * at the arm ends, so box-spacing leaves them looking adrift while an "H" or "O"
 * looks correctly snug. Measuring how far the ink typically *recedes* from each
 * edge, and tightening by that amount, spaces by apparent shape instead.
 *
 * This is per-glyph spacing, not pair kerning: opentype.js writes neither a
 * `kern` nor a `GPOS` table, so true pair adjustment cannot be exported.
 */

/** Vertical slices used to profile a glyph's left and right edges. */
const BANDS = 24;
/** How much of the average recess to take back. 1 would close the gap fully. */
const TIGHTEN = 0.55;
/** Never tighten past this fraction of the target, so letters can't collide. */
const MIN_FRACTION = 0.35;

export type Spacing = {
  leftSideBearing: number;
  rightSideBearing: number;
  /** Ink width plus both bearings. */
  advanceWidth: number;
};

/**
 * Profile the ink edges in horizontal bands and derive bearings from how far
 * the ink sits back from the bounding box on each side.
 *
 * `target` is the bearing a fully closed shape would get, in font units.
 */
export function opticalSpacing(contours: Vec2[][], target: number): Spacing {
  const points = contours.flat();
  if (points.length === 0) {
    return { leftSideBearing: target, rightSideBearing: target, advanceWidth: target * 2 };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const height = maxY - minY;
  const inkWidth = maxX - minX;
  if (height <= 0 || inkWidth <= 0) {
    return { leftSideBearing: target, rightSideBearing: target, advanceWidth: inkWidth + target * 2 };
  }

  // Sample the outline densely enough that a band is never missed between two
  // widely spaced contour points.
  const bandLeft = new Array<number>(BANDS).fill(Infinity);
  const bandRight = new Array<number>(BANDS).fill(-Infinity);
  const record = (x: number, y: number) => {
    const b = Math.min(BANDS - 1, Math.max(0, Math.floor(((y - minY) / height) * BANDS)));
    if (x < bandLeft[b]) bandLeft[b] = x;
    if (x > bandRight[b]) bandRight[b] = x;
  };
  for (const contour of contours) {
    for (let i = 0; i < contour.length; i++) {
      const [x0, y0] = contour[i];
      const [x1, y1] = contour[(i + 1) % contour.length];
      record(x0, y0);
      const steps = Math.ceil(Math.abs(y1 - y0) / (height / BANDS));
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        record(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      }
    }
  }

  let leftRecess = 0;
  let rightRecess = 0;
  let filled = 0;
  for (let b = 0; b < BANDS; b++) {
    if (bandLeft[b] === Infinity) continue;
    filled++;
    leftRecess += bandLeft[b] - minX;
    rightRecess += maxX - bandRight[b];
  }
  if (filled === 0) {
    return { leftSideBearing: target, rightSideBearing: target, advanceWidth: inkWidth + target * 2 };
  }
  leftRecess /= filled;
  rightRecess /= filled;

  const floor = target * MIN_FRACTION;
  const left = Math.max(floor, target - leftRecess * TIGHTEN);
  const right = Math.max(floor, target - rightRecess * TIGHTEN);

  return {
    leftSideBearing: Math.round(left),
    rightSideBearing: Math.round(right),
    advanceWidth: Math.round(inkWidth + left + right),
  };
}
