import fitCurve from "fit-curve";

/** A cubic Bézier segment: [start, control1, control2, end], each [x, y]. */
export type BezierCurve = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

/**
 * Schneider's algorithm computes unit tangents between neighbouring points, so
 * two identical points in a row produce a zero-length vector and the fit comes
 * back as NaN. Pointer devices emit repeats routinely — holding still, or the
 * sub-pixel jitter of a stylus resting on glass — so drop them before fitting.
 */
export function dedupePoints(
  points: [number, number][],
  epsilon = 0.001
): [number, number][] {
  const out: [number, number][] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || Math.abs(p[0] - prev[0]) > epsilon || Math.abs(p[1] - prev[1]) > epsilon) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Fit a raw captured stroke to a series of cubic Béziers.
 *
 * `maxError` is a squared-distance tolerance in px: lower means more segments
 * that hug the input closely, higher means fewer, smoother segments. Returns an
 * empty array for strokes too short to fit (a dot, or a stroke that deduped
 * down to a single point) — those have no curve to speak of.
 */
export function fitStroke(
  points: [number, number][],
  maxError: number
): BezierCurve[] {
  const cleaned = dedupePoints(points);
  if (cleaned.length < 2) return [];
  return fitCurve(cleaned, maxError) as BezierCurve[];
}

/** Total number of Bézier segments across every stroke — a compression signal. */
export function countSegments(curvesByStroke: BezierCurve[][]): number {
  return curvesByStroke.reduce((n, curves) => n + curves.length, 0);
}
