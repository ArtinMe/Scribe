import type { BezierCurve } from "./fitStroke";

export type Vec2 = [number, number];

/**
 * Sample a run of cubic Béziers into a polyline.
 *
 * Outlines are emitted as straight-line contours rather than curves: TrueType
 * accepts them, and it keeps the offsetting math below honest (offsetting a
 * Bézier exactly is not possible — the true offset of a cubic is not a cubic).
 */
export function flattenCurves(curves: BezierCurve[], stepsPerCurve = 16): Vec2[] {
  const out: Vec2[] = [];
  for (const [p0, p1, p2, p3] of curves) {
    for (let i = 0; i <= stepsPerCurve; i++) {
      // Skip the seam point shared with the previous curve.
      if (i === 0 && out.length > 0) continue;
      const t = i / stepsPerCurve;
      const u = 1 - t;
      const x =
        u * u * u * p0[0] +
        3 * u * u * t * p1[0] +
        3 * u * t * t * p2[0] +
        t * t * t * p3[0];
      const y =
        u * u * u * p0[1] +
        3 * u * u * t * p1[1] +
        3 * u * t * t * p2[1] +
        t * t * t * p3[1];
      out.push([x, y]);
    }
  }
  return out;
}

function unitNormals(pts: Vec2[]): Vec2[] {
  const n = pts.length;
  return pts.map((_, i) => {
    // Central difference gives a smoother normal at joins than using one
    // adjacent segment, which would kink the outline at every vertex.
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    return [-ty / len, tx / len] as Vec2;
  });
}

function capArc(center: Vec2, from: Vec2, to: Vec2, steps = 8): Vec2[] {
  const a0 = Math.atan2(from[1] - center[1], from[0] - center[0]);
  let a1 = Math.atan2(to[1] - center[1], to[0] - center[0]);
  // Always sweep the short way so the cap stays a semicircle, not a loop.
  while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
  while (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
  const r = Math.hypot(from[0] - center[0], from[1] - center[1]);
  const arc: Vec2[] = [];
  for (let i = 1; i < steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    arc.push([center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r]);
  }
  return arc;
}

/** Twice the signed area; positive is counter-clockwise in a y-up space. */
export function signedArea(poly: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

/**
 * Expand a centerline polyline into a closed outline of the given width, with
 * round caps at both ends — the shape a round pen nib would leave.
 */
export function expandStroke(centerline: Vec2[], width: number): Vec2[] {
  const half = width / 2;

  // Drop repeated points: a zero-length segment has no direction, so its
  // normal would be undefined and poison the offset.
  const pts: Vec2[] = [];
  for (const p of centerline) {
    const prev = pts[pts.length - 1];
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-6) pts.push(p);
  }

  // A dot has no direction at all — represent it as a full circle.
  if (pts.length < 2) {
    if (pts.length === 0) return [];
    const [cx, cy] = pts[0];
    const circle: Vec2[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      circle.push([cx + Math.cos(a) * half, cy + Math.sin(a) * half]);
    }
    return circle;
  }

  const normals = unitNormals(pts);
  const left = pts.map((p, i): Vec2 => [
    p[0] + normals[i][0] * half,
    p[1] + normals[i][1] * half,
  ]);
  const right = pts.map((p, i): Vec2 => [
    p[0] - normals[i][0] * half,
    p[1] - normals[i][1] * half,
  ]);

  const last = pts.length - 1;
  return [
    ...left,
    ...capArc(pts[last], left[last], right[last]),
    ...right.slice().reverse(),
    ...capArc(pts[0], right[0], left[0]),
  ];
}

/**
 * Force a contour to clockwise-in-font-space (negative signed area with y up).
 *
 * Overlapping strokes — an "A" crossbar meeting its legs — only union under
 * the non-zero winding rule if every contour turns the same way. Mixed
 * directions would punch the overlaps out as holes.
 */
export function toClockwise(poly: Vec2[]): Vec2[] {
  return signedArea(poly) > 0 ? poly.slice().reverse() : poly;
}
