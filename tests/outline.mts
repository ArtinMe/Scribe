/**
 * Geometry regression tests for stroke outlining.
 *
 * Run with: npm run test:outline
 *
 * These guard three bugs that were all invisible to type checking and lint, and
 * all showed up only as visual artefacts:
 *   1. an unfilled circle at a stroke's start cap
 *   2. outlines breaking up when drawing slowly
 *   3. gaps at sharp direction changes, from missing joins
 *
 * Coverage is measured with a winding-number test on a dense grid, because that
 * is the rule canvas and CFF actually fill with. A self-intersection count is
 * NOT a valid check here: correct round joins self-intersect on the inner side
 * by design, and an earlier version of these tests passed on broken code for
 * exactly that reason.
 */
import { fitStroke } from "../app/lib/fitStroke.ts";
import { expandStroke, flattenCurves, toClockwise, signedArea } from "../app/lib/strokeToOutline.ts";
import { opticalSpacing } from "../app/lib/spacing.ts";

type V = [number, number];

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
}

/** Non-zero winding number of `p` against one or more contours. */
function winding(polys: V[][], p: V): number {
  let w = 0;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const side = (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]);
      if (a[1] <= p[1]) {
        if (b[1] > p[1] && side > 0) w++;
      } else if (b[1] <= p[1] && side < 0) w--;
    }
  }
  return w;
}

function distToPath(path: V[], q: V): number {
  let best = Infinity;
  for (let j = 0; j < path.length - 1; j++) {
    const a = path[j];
    const b = path[j + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / len));
    best = Math.min(best, Math.hypot(q[0] - (a[0] + vx * t), q[1] - (a[1] + vy * t)));
  }
  return best;
}

/**
 * Fraction of the ideal stroke body left unfilled. Samples out to 0.95 of the
 * half-width: the shortfall from a missing join sits at the outer edge, so a
 * test that only probes near the centerline reports a false clean bill.
 */
function uncoveredPct(centre: V[], contours: V[][], half: number, step = 0.4): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of centre) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  let tested = 0;
  let uncovered = 0;
  for (let x = minX - half - 2; x <= maxX + half + 2; x += step) {
    for (let y = minY - half - 2; y <= maxY + half + 2; y += step) {
      const q: V = [x, y];
      if (distToPath(centre, q) > half * 0.95) continue;
      tested++;
      if (winding(contours, q) === 0) uncovered++;
    }
  }
  return tested ? (100 * uncovered) / tested : 0;
}

const outlineOf = (raw: V[], pen: number, err = 4) => {
  const centre = flattenCurves(fitStroke(raw, err)) as V[];
  return { centre, outline: expandStroke(centre, pen) as V[] };
};

let seed = 999;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff - 0.5;
};

// ---------------------------------------------------------------- caps
console.log("\nround caps are filled (regression: unfilled circle at stroke start)");
{
  const shapes: [string, V[]][] = [
    ["down", Array.from({ length: 40 }, (_, i) => [100, 100 + i * 5] as V)],
    ["up", Array.from({ length: 40 }, (_, i) => [100, 300 - i * 5] as V)],
    ["right", Array.from({ length: 40 }, (_, i) => [100 + i * 5, 100] as V)],
    ["left", Array.from({ length: 40 }, (_, i) => [300 - i * 5, 100] as V)],
    ["diagonal", Array.from({ length: 40 }, (_, i) => [100 + i * 4, 300 - i * 5] as V)],
  ];
  const PEN = 18;
  for (const [name, raw] of shapes) {
    const { centre, outline } = outlineOf(raw, PEN);
    const u = (a: V, b: V): V => {
      const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1;
      return [dx / l, dy / l];
    };
    const back = u(centre[0], centre[1]);
    const fwd = u(centre[centre.length - 1], centre[centre.length - 2]);
    const inCap = (c: V, dir: V): V => [c[0] + dir[0] * PEN * 0.25, c[1] + dir[1] * PEN * 0.25];
    const s = winding([outline], inCap(centre[0], back)) !== 0;
    const e = winding([outline], inCap(centre[centre.length - 1], fwd)) !== 0;
    check(`${name}: both caps filled`, s && e, `start=${s} end=${e}`);
  }
}

// ---------------------------------------------------------------- joins
console.log("\nsharp direction changes leave no gaps (regression: missing round joins)");
{
  const hairpin = (deg: number, spacing = 8, arm = 120): V[] => {
    const a = (deg * Math.PI) / 180;
    const out: V[] = [];
    const n = Math.round(arm / spacing);
    for (let i = 0; i < n; i++) out.push([200 + i * spacing, 200]);
    const tip = out[out.length - 1];
    for (let i = 1; i <= n; i++) out.push([tip[0] - Math.cos(a) * i * spacing, tip[1] - Math.sin(a) * i * spacing]);
    return out;
  };
  for (const pen of [18, 44]) {
    for (const deg of [90, 60, 40, 25, 15]) {
      const { centre, outline } = outlineOf(hairpin(deg), pen);
      const pct = uncoveredPct(centre, [outline], pen / 2);
      check(`pen ${pen}, ${deg}deg hairpin`, pct === 0, `uncovered ${pct.toFixed(3)}%`);
    }
  }
}

// ---------------------------------------------------------------- smooth curves
console.log("\nsmooth curves stay covered at every pen width");
{
  const bend = (radius: number): V[] => {
    const sweep = Math.PI * 1.5;
    const n = Math.max(24, Math.round((radius * sweep) / 1.5));
    return Array.from({ length: n }, (_, i) => {
      const t = (i / (n - 1)) * sweep;
      return [200 + Math.cos(t) * radius, 200 + Math.sin(t) * radius] as V;
    });
  };
  for (const pen of [8, 30, 60]) {
    for (const r of [40, 14]) {
      const { centre, outline } = outlineOf(bend(r), pen);
      const pct = uncoveredPct(centre, [outline], pen / 2, 0.5);
      check(`pen ${pen}, bend radius ${r}`, pct === 0, `uncovered ${pct.toFixed(3)}%`);
    }
  }
}

// ---------------------------------------------------------------- slow drawing
console.log("\nslow drawing survives tremor (regression: dense samples fitted as detail)");
{
  // Same 300px line at different sampling densities: slow drawing packs samples
  // closer together than the hand's own tremor.
  for (const [label, spacing] of [["fast 12px", 12], ["slow 0.8px", 0.8], ["very slow 0.3px", 0.3]] as [string, number][]) {
    for (const jitter of [0.4, 0.8]) {
      seed = 999;
      const n = Math.round(300 / spacing);
      const raw: V[] = Array.from({ length: n }, (_, i) => [
        200 + rnd() * jitter * 2,
        100 + (i / (n - 1)) * 300 + rnd() * jitter * 2,
      ]);
      const { centre, outline } = outlineOf(raw, 30);
      const pct = uncoveredPct(centre, [outline], 15, 0.5);
      check(`${label}, jitter ±${jitter}px`, pct === 0, `uncovered ${pct.toFixed(3)}%`);
    }
  }
}

// ---------------------------------------------------------------- glyph union
console.log("\noverlapping strokes union instead of cancelling");
{
  // Contours must all wind the same way or overlaps punch holes under non-zero
  // winding. signedArea is an algebraic sum, so a self-intersecting contour
  // could in principle flip sign and be reversed by toClockwise.
  seed = 4242;
  const PEN = 30;
  const bowl: V[] = Array.from({ length: 90 }, (_, i) => {
    const t = Math.PI * 0.25 + (i / 89) * Math.PI * 1.55;
    return [200 + Math.cos(t) * 70, 200 + Math.sin(t) * 70] as V;
  });
  const legA: V[] = Array.from({ length: 50 }, (_, i) => [150 + i * 2, 260 - i * 3] as V);
  const legB: V[] = Array.from({ length: 50 }, (_, i) => [250 - i * 2, 260 - i * 3] as V);
  const centres = [bowl, legA, legB].map((s) => flattenCurves(fitStroke(s, 4)) as V[]);
  const wound = centres.map((c) => toClockwise(expandStroke(c, PEN) as V[]) as V[]);
  const signs = wound.map((p) => Math.sign(signedArea(p)));
  check("all contours share one orientation", new Set(signs).size === 1, `signs=${signs.join(",")}`);
  let worst = 0;
  for (const c of centres) worst = Math.max(worst, uncoveredPct(c, wound, PEN / 2, 0.5));
  check("union has no holes", worst === 0, `uncovered ${worst.toFixed(3)}%`);
}

// ---------------------------------------------------------------- degenerate
console.log("\ndegenerate strokes produce sane geometry");
{
  check("empty stroke -> no contour", expandStroke([], 18).length === 0);
  check("single point -> closed circle", expandStroke([[10, 10]], 18).length >= 3);
  const held: V[] = Array.from({ length: 20 }, () => [50, 50] as V);
  check("stroke held still -> circle, not NaN", expandStroke(held, 18).every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
  check("fit of a single point -> no curves", fitStroke([[5, 5]], 4).length === 0);
}

// ---------------------------------------------------------------- spacing
console.log("\noptical spacing tightens open shapes, not closed ones");
{
  const T = 100;
  const rect = (x0: number, y0: number, x1: number, y1: number): V[] => [
    [x0, y0], [x1, y0], [x1, y1], [x0, y1],
  ];
  const H = [rect(0, 0, 80, 700), rect(320, 0, 400, 700), rect(80, 300, 320, 380)];
  const A = [[[0, 0], [200, 700], [400, 0]] as V[]];
  const T_ = [rect(0, 620, 400, 700), rect(160, 0, 240, 620)];
  const L = [rect(0, 0, 80, 700), rect(0, 0, 320, 80)];
  const dot = [rect(0, 0, 90, 90)];

  const sH = opticalSpacing(H, T);
  const sA = opticalSpacing(A, T);
  const sT = opticalSpacing(T_, T);
  const sL = opticalSpacing(L, T);
  const sDot = opticalSpacing(dot, T);

  check("closed 'H' keeps ~full bearings", sH.leftSideBearing > T * 0.85 && sH.rightSideBearing > T * 0.85,
    `L=${sH.leftSideBearing} R=${sH.rightSideBearing}`);
  check("open 'A' is tightened", sA.leftSideBearing < T * 0.7 && sA.rightSideBearing < T * 0.7,
    `L=${sA.leftSideBearing} R=${sA.rightSideBearing}`);
  check("open 'T' is tightened both sides", sT.leftSideBearing < T * 0.6 && sT.rightSideBearing < T * 0.6,
    `L=${sT.leftSideBearing} R=${sT.rightSideBearing}`);
  // The asymmetric case is the real proof: a full-height stem on the left, only
  // a foot on the right, so the two sides must not come out equal.
  check("'L' keeps left bearing but tightens right", sL.leftSideBearing > T * 0.8 && sL.rightSideBearing < T * 0.6,
    `L=${sL.leftSideBearing} R=${sL.rightSideBearing}`);
  check("a lone dot is not tightened", sDot.leftSideBearing >= T * 0.95 && sDot.rightSideBearing >= T * 0.95,
    `L=${sDot.leftSideBearing} R=${sDot.rightSideBearing}`);
  check("bearings never go below the collision floor",
    [sH, sA, sT, sL, sDot].every((s) => s.leftSideBearing >= T * 0.34 && s.rightSideBearing >= T * 0.34));
  check("advance = ink width + both bearings",
    sH.advanceWidth === Math.round(400 + sH.leftSideBearing + sH.rightSideBearing));
  check("empty glyph does not crash", opticalSpacing([], T).advanceWidth === T * 2);
}

console.log(failures === 0 ? "\nAll outline geometry tests passed.\n" : `\n${failures} test(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
