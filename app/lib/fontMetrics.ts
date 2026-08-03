/** Standard 1000-unit em. Ascender/descender define the vertical design space. */
export const UNITS_PER_EM = 1000;
export const ASCENDER = 800;
export const DESCENDER = -200;
/** Where a capital letter's top sits, in font units above the baseline. */
export const CAP_HEIGHT = 700;
/** Blank space left either side of a glyph's inked area. */
export const SIDE_BEARING = 60;

/**
 * Where the writing guides sit on the canvas, in CSS pixels.
 *
 * Glyphs are measured against these shared lines rather than against their own
 * bounding box. Per-glyph normalisation would force every letter to identical
 * height and its own baseline — "Q" would lose its tail, and in later phases
 * lowercase x-height could not differ from ascenders.
 */
export type Guides = {
  capY: number;
  baselineY: number;
  descenderY: number;
  left: number;
  right: number;
};

export function computeGuides(width: number, height: number): Guides {
  const capToBaseline = Math.min(height * 0.5, 420);
  const centre = height / 2;
  const baselineY = centre + capToBaseline / 2;
  const capY = centre - capToBaseline / 2;
  // Keep the descender guide proportional to the real font metrics.
  const descenderY = baselineY + (capToBaseline * -DESCENDER) / CAP_HEIGHT;
  const margin = Math.min(width * 0.2, 260);
  return {
    capY,
    baselineY,
    descenderY,
    left: margin,
    right: width - margin,
  };
}

/**
 * Scale factor taking canvas pixels to font units, fixed by the guide spacing
 * so every glyph in the font shares one scale.
 */
export function guideScale(guides: Guides): number {
  const px = guides.baselineY - guides.capY;
  return px > 0 ? CAP_HEIGHT / px : 1;
}
