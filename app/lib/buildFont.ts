// The ESM build exposes named exports only — there is no default export.
import { Font, Glyph, Path } from "opentype.js";
import type { BezierCurve } from "./fitStroke";
import {
  ASCENDER,
  CAP_HEIGHT,
  DESCENDER,
  SIDE_BEARING,
  UNITS_PER_EM,
  guideScale,
  type Guides,
} from "./fontMetrics";
import {
  expandStroke,
  flattenCurves,
  toClockwise,
  type Vec2,
} from "./strokeToOutline";

export { UNITS_PER_EM, ASCENDER, DESCENDER, CAP_HEIGHT };

export type StrokeLike = {
  curves: BezierCurve[] | null;
  points: { x: number; y: number }[];
};

export type GlyphOutlines = {
  contours: Vec2[][];
  advanceWidth: number;
};

/**
 * Turn one character's fitted strokes into closed, correctly-wound contours in
 * font units.
 *
 * Vertical position comes from the shared guides, not from the glyph's own
 * bounding box, so every letter lands on a common baseline at a common scale —
 * a letter drawn small stays small, and a descender stays below the line.
 * Horizontal position *is* normalised, so it doesn't matter where across the
 * canvas the user drew.
 */
export function strokesToGlyphOutlines(
  strokes: StrokeLike[],
  penWidth: number,
  guides: Guides
): GlyphOutlines | null {
  // Expand in canvas space first: pen width is a canvas-space quantity, and
  // scaling afterwards keeps stroke weight consistent across every glyph.
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
  let maxX = -Infinity;
  for (const contour of canvasContours) {
    for (const [x] of contour) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }

  const scale = guideScale(guides);
  const contours = canvasContours.map((contour) =>
    toClockwise(
      contour.map(([x, y]): Vec2 => [
        (x - minX) * scale + SIDE_BEARING,
        // Canvas y grows downward, font y upward, measured from the baseline.
        (guides.baselineY - y) * scale,
      ])
    )
  );

  return {
    contours,
    advanceWidth: Math.round((maxX - minX) * scale + SIDE_BEARING * 2),
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

/** opentype.js needs a glyph name; these are the standard ones for A–Z etc. */
function glyphName(character: string): string {
  if (/^[A-Za-z]$/.test(character)) return character;
  const named: Record<string, string> = {
    " ": "space",
    ".": "period",
    ",": "comma",
    "!": "exclam",
    "?": "question",
    "'": "quotesingle",
    '"': "quotedbl",
    "-": "hyphen",
    ":": "colon",
  };
  if (named[character]) return named[character];
  if (/^[0-9]$/.test(character)) {
    return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][
      Number(character)
    ];
  }
  return `uni${character.codePointAt(0)!.toString(16).padStart(4, "0").toUpperCase()}`;
}

export type DrawnGlyph = { character: string; outlines: GlyphOutlines };

/**
 * Compile a font from every drawn glyph.
 *
 * `.notdef` is included because the format requires glyph 0 to be the
 * missing-glyph box; without it the file is invalid and installers reject it.
 */
export function buildFont(
  glyphs: DrawnGlyph[],
  familyName = "Scribe Handwriting"
): Font {
  const notdef = new Glyph({
    name: ".notdef",
    unicode: 0,
    advanceWidth: UNITS_PER_EM / 2,
    path: new Path(),
  });

  // A space keeps the font usable for typing words rather than bare letters.
  const space = new Glyph({
    name: "space",
    unicode: 32,
    advanceWidth: Math.round(UNITS_PER_EM * 0.3),
    path: new Path(),
  });

  const drawn = glyphs.map(
    ({ character, outlines }) =>
      new Glyph({
        name: glyphName(character),
        unicode: character.codePointAt(0),
        advanceWidth: outlines.advanceWidth,
        path: contoursToPath(outlines.contours),
      })
  );

  return new Font({
    familyName,
    styleName: "Regular",
    unitsPerEm: UNITS_PER_EM,
    ascender: ASCENDER,
    descender: DESCENDER,
    glyphs: [notdef, space, ...drawn],
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
