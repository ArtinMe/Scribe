// The ESM build exposes named exports only — there is no default export.
import { Font, Glyph, Path } from "opentype.js";
import type { BezierCurve } from "./fitStroke";
import {
  expandStroke,
  flattenCurves,
  toClockwise,
  type Vec2,
} from "./strokeToOutline";

/** Standard 1000-unit em. Ascender/descender define the vertical design space. */
export const UNITS_PER_EM = 1000;
export const ASCENDER = 800;
export const DESCENDER = -200;
/** Height the drawn glyph is scaled to occupy, and its padding either side. */
const CAP_HEIGHT = 700;
const SIDE_BEARING = 60;

export type GlyphOutlines = {
  contours: Vec2[][];
  advanceWidth: number;
};

/**
 * Turn fitted strokes into closed, correctly-wound contours in font units.
 *
 * Canvas y grows downward and font y grows upward, so the vertical axis is
 * flipped here; the drawing is also scaled to a standard cap height and sat on
 * the baseline, so glyph size no longer depends on how big the user drew.
 */
export function strokesToGlyphOutlines(
  strokes: { curves: BezierCurve[] | null; points: { x: number; y: number }[] }[],
  penWidth: number
): GlyphOutlines | null {
  // Expand in canvas space first: pen width is a canvas-space quantity, and
  // scaling afterwards keeps the stroke weight proportional to the drawing.
  const canvasContours: Vec2[][] = [];
  for (const stroke of strokes) {
    const centerline =
      stroke.curves && stroke.curves.length > 0
        ? flattenCurves(stroke.curves)
        : stroke.points.map((p): Vec2 => [p.x, p.y]);
    if (centerline.length === 0) continue;
    const outline = expandStroke(centerline, penWidth);
    if (outline.length >= 3) canvasContours.push(outline);
  }
  if (canvasContours.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const contour of canvasContours) {
    for (const [x, y] of contour) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const drawnHeight = maxY - minY;
  const drawnWidth = maxX - minX;
  // Uniform scale from height keeps the letter's aspect ratio intact; scaling
  // width independently would stretch it to fill the em and distort the hand.
  const scale = drawnHeight > 0 ? CAP_HEIGHT / drawnHeight : 1;

  const contours = canvasContours.map((contour) =>
    toClockwise(
      contour.map(([x, y]): Vec2 => [
        (x - minX) * scale + SIDE_BEARING,
        // Flip: canvas maxY (bottom of drawing) becomes the baseline at 0.
        (maxY - y) * scale,
      ])
    )
  );

  return {
    contours,
    advanceWidth: Math.round(drawnWidth * scale + SIDE_BEARING * 2),
  };
}

function contoursToPath(contours: Vec2[][]): Path {
  const path = new Path();
  for (const contour of contours) {
    if (contour.length < 3) continue;
    path.moveTo(contour[0][0], contour[0][1]);
    for (const [x, y] of contour.slice(1)) path.lineTo(x, y);
    path.closePath();
  }
  return path;
}

/**
 * Compile a font containing a single drawn glyph.
 *
 * `.notdef` is included because the format requires glyph 0 to be the
 * missing-glyph box; without it the file is invalid and installers reject it.
 */
export function buildSingleGlyphFont(
  character: string,
  outlines: GlyphOutlines,
  familyName = "Scribe Handwriting"
): Font {
  const notdef = new Glyph({
    name: ".notdef",
    unicode: 0,
    advanceWidth: UNITS_PER_EM / 2,
    path: new Path(),
  });

  const glyph = new Glyph({
    name: character,
    unicode: character.codePointAt(0),
    advanceWidth: outlines.advanceWidth,
    path: contoursToPath(outlines.contours),
  });

  // A space keeps the font usable for typing words rather than one bare letter.
  const space = new Glyph({
    name: "space",
    unicode: 32,
    advanceWidth: Math.round(UNITS_PER_EM * 0.3),
    path: new Path(),
  });

  return new Font({
    familyName,
    styleName: "Regular",
    unitsPerEm: UNITS_PER_EM,
    ascender: ASCENDER,
    descender: DESCENDER,
    glyphs: [notdef, space, glyph],
  });
}

/**
 * Trigger a browser download of the compiled font.
 *
 * The file is OpenType/CFF (an `OTTO` sfnt), not TrueType `glyf` — opentype.js
 * only writes CFF outlines. Hence `.otf`: the bytes install identically on
 * macOS and Windows, but labelling them `.ttf` would misstate the format.
 */
export function downloadFont(font: Font, fileName: string) {
  const buffer = font.toArrayBuffer();
  const blob = new Blob([buffer], { type: "font/otf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
