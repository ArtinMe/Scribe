/**
 * Character sets, ordered as the user is asked to draw them.
 *
 * Uppercase is its own set because it is the fallback shippable font: a
 * complete uppercase-only font is a working v1 on its own. Later sets are
 * additive, so a partly-drawn font still exports whatever exists.
 */
export const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const LOWERCASE = "abcdefghijklmnopqrstuvwxyz".split("");
export const DIGITS = "0123456789".split("");
export const PUNCTUATION = [".", ",", "!", "?", "'", '"', "-", ":"];

export type CharacterSetId = "uppercase" | "lowercase" | "both";

export const CHARACTER_SETS: Record<
  CharacterSetId,
  { label: string; characters: string[] }
> = {
  uppercase: { label: "A–Z", characters: UPPERCASE },
  lowercase: { label: "a–z", characters: LOWERCASE },
  both: { label: "A–Z + a–z", characters: [...UPPERCASE, ...LOWERCASE] },
};

/**
 * Letters whose shapes stress curve fitting hardest — tight reversals and
 * descenders. Worth reviewing before compiling a font.
 */
export const TRICKY = ["g", "y", "s", "j", "a", "e"];
