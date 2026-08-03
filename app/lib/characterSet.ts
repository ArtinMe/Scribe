/**
 * Character sets, ordered as the user is asked to draw them.
 *
 * Uppercase is its own set because it is the fallback shippable font: a
 * complete uppercase-only font is a working v1 on its own.
 */
export const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const LOWERCASE = "abcdefghijklmnopqrstuvwxyz".split("");
export const DIGITS = "0123456789".split("");
export const PUNCTUATION = [".", ",", "!", "?", "'", '"', "-", ":"];

export type CharacterSetId = "uppercase";

export const CHARACTER_SETS: Record<
  CharacterSetId,
  { label: string; characters: string[] }
> = {
  uppercase: { label: "Uppercase A–Z", characters: UPPERCASE },
};
