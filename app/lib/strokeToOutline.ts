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

/** Unit normal to the left of travel, one per segment rather than per point. */
function segmentNormals(pts: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    const dy = pts[i + 1][1] - pts[i][1];
    const len = Math.hypot(dx, dy) || 1;
    out.push([-dy / len, dx / len]);
  }
  return out;
}

/**
 * Round join: arc around a shared vertex from one segment's offset direction to
 * the next's, excluding both endpoints (the segments already supply those).
 *
 * Where the path turns, the two segments' offset edges no longer meet — on the
 * outside of the turn they leave a wedge of missing material. Averaging the two
 * normals into one offset point, as this used to do, closes that wedge only for
 * gentle turns: the true outer offset needs half/cos(θ/2), so a flat half falls
 * progressively shorter as the turn sharpens, which is why gaps appeared at
 * tight bends and not on smooth curves.
 *
 * A gentle turn yields no interior points at all, so smooth paths cost nothing.
 */
function joinArc(center: Vec2, from: Vec2, to: Vec2, radius: number): Vec2[] {
  const a0 = Math.atan2(from[1], from[0]);
  let delta = Math.atan2(to[1], to[0]) - a0;
  // Take the short way round; a join turn is always less than a half-turn.
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 12)));
  const arc: Vec2[] = [];
  for (let i = 1; i < steps; i++) {
    const a = a0 + (delta * i) / steps;
    arc.push([center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius]);
  }
  return arc;
}

/**
 * Half-circle from `from` around `center`, bulging towards `outward`.
 *
 * The two cap endpoints sit exactly opposite each other across the centerline,
 * so the angle between them is exactly ±π and "sweep the shorter way" is
 * undefined — the direction then falls out of atan2's branch cut, which sent
 * the start cap arcing forward *into* the stroke instead of behind it. That
 * folded the contour back on itself and left an unfilled lens at the start.
 * Direction is therefore taken from the outward tangent, and since the sweep is
 * a known half-turn it is rotated by exactly π rather than interpolated.
 */
function capArc(center: Vec2, from: Vec2, outward: Vec2, steps = 8): Vec2[] {
  const vx = from[0] - center[0];
  const vy = from[1] - center[1];
  // Cross product picks the turn direction that carries `from` towards
  // `outward`, i.e. around the outside of the stroke end.
  const dir = vx * outward[1] - vy * outward[0] >= 0 ? 1 : -1;
  const arc: Vec2[] = [];
  for (let i = 1; i < steps; i++) {
    const a = (dir * Math.PI * i) / steps;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    arc.push([
      center[0] + vx * cos - vy * sin,
      center[1] + vx * sin + vy * cos,
    ]);
  }
  return arc;
}

/** Unit vector pointing from `b` towards `a`. */
function unit(a: Vec2, b: Vec2): Vec2 {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
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
 *
 * `width` is deliberately a single scalar, not per-point: stroke weight is
 * uniform along the whole path and identical for every input device. Pointer
 * pressure (which an Apple Pencil reports on every sample) is captured with the
 * raw points but must never modulate width — a font's letterforms should not
 * depend on how hard the pen was pressed, and varying width per segment is
 * exactly what would make offset joins disagree and open seams.
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

  // Offset each segment by its own normal and bridge the vertices with round
  // joins, rather than offsetting each point by one averaged normal. Both sides
  // get the join: on the outside it fills the wedge the turn opens up, and on
  // the inside it laps over itself, which the non-zero winding rule unions.
  const normals = segmentNormals(pts);
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < normals.length; i++) {
    const [nx, ny] = normals[i];
    left.push([pts[i][0] + nx * half, pts[i][1] + ny * half]);
    left.push([pts[i + 1][0] + nx * half, pts[i + 1][1] + ny * half]);
    right.push([pts[i][0] - nx * half, pts[i][1] - ny * half]);
    right.push([pts[i + 1][0] - nx * half, pts[i + 1][1] - ny * half]);

    const next = normals[i + 1];
    if (next) {
      const vertex = pts[i + 1];
      left.push(...joinArc(vertex, normals[i], next, half));
      right.push(
        ...joinArc(
          vertex,
          [-normals[i][0], -normals[i][1]],
          [-next[0], -next[1]],
          half
        )
      );
    }
  }

  const last = pts.length - 1;
  // Each cap bulges away from the stroke: forward past the final point, and
  // backward behind the first.
  const forward = unit(pts[last], pts[last - 1]);
  const backward = unit(pts[0], pts[1]);
  return [
    ...left,
    // The sides now carry join points too, so the caps hinge on the ends of the
    // offset arrays rather than on any point index.
    ...capArc(pts[last], left[left.length - 1], forward),
    ...right.slice().reverse(),
    ...capArc(pts[0], right[0], backward),
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
