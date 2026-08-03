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
 * Minimum gap between samples handed to the fitter, in canvas px.
 *
 * Pointer devices sample on a clock, not by distance, so how densely a stroke
 * is sampled depends entirely on drawing speed. Drawn slowly, consecutive
 * samples land closer together than the hand's own tremor, and the fitter then
 * has no way to tell tremor from intent.
 */
const MIN_SPACING = 2;

/** Passes of a [1,2,1]/4 kernel used to take the tremor back out. */
const SMOOTH_PASSES = 2;

/**
 * Drop samples closer together than `minSpacing`, so point density reflects the
 * path rather than how fast it was drawn. Endpoints are always kept: they carry
 * the stroke's true extent and its cap directions.
 */
export function resamplePoints(
  points: [number, number][],
  minSpacing = MIN_SPACING
): [number, number][] {
  if (points.length < 3) return points;
  const out: [number, number][] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const d = Math.hypot(points[i][0] - prev[0], points[i][1] - prev[1]);
    if (d >= minSpacing) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Endpoint-preserving moving average.
 *
 * Decimation alone keeps whichever noisy samples happen to survive; averaging
 * cancels the noise instead. Endpoints are pinned so the stroke neither shrinks
 * nor drifts off where it was started and finished.
 */
export function smoothPoints(
  points: [number, number][],
  passes = SMOOTH_PASSES
): [number, number][] {
  let current = points;
  for (let pass = 0; pass < passes; pass++) {
    if (current.length < 3) return current;
    const out: [number, number][] = [current[0]];
    for (let i = 1; i < current.length - 1; i++) {
      out.push([
        (current[i - 1][0] + current[i][0] * 2 + current[i + 1][0]) / 4,
        (current[i - 1][1] + current[i][1] * 2 + current[i + 1][1]) / 4,
      ]);
    }
    out.push(current[current.length - 1]);
    current = out;
  }
  return current;
}

/**
 * Fit a raw captured stroke to a series of cubic Béziers.
 *
 * `maxError` is a squared-distance tolerance in px: lower means more segments
 * that hug the input closely, higher means fewer, smoother segments. Returns an
 * empty array for strokes too short to fit (a dot, or a stroke that deduped
 * down to a single point) — those have no curve to speak of.
 *
 * Points are conditioned before fitting because the fit alone cannot separate
 * hand tremor from intended shape. Left in, tremor is fitted as real curve
 * detail, producing wiggles tighter than the pen radius; offsetting those makes
 * the stroke outline cross itself and render as gaps and blotches. It only
 * shows up when drawing slowly, because that is when samples fall closer
 * together than the tremor itself.
 */
export function fitStroke(
  points: [number, number][],
  maxError: number
): BezierCurve[] {
  const conditioned = smoothPoints(resamplePoints(points));
  const cleaned = dedupePoints(conditioned);
  if (cleaned.length < 2) return [];
  return fitCurve(cleaned, maxError) as BezierCurve[];
}

/** Total number of Bézier segments across every stroke — a compression signal. */
export function countSegments(curvesByStroke: BezierCurve[][]): number {
  return curvesByStroke.reduce((n, curves) => n + curves.length, 0);
}
