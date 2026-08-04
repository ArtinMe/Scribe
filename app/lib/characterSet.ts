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

export type CharacterSetId =
  | "uppercase"
  | "lowercase"
  | "digits"
  | "punctuation"
  | "full";

export const CHARACTER_SETS: Record<
  CharacterSetId,
  { label: string; characters: string[] }
> = {
  uppercase: { label: "A–Z", characters: UPPERCASE },
  lowercase: { label: "a–z", characters: LOWERCASE },
  digits: { label: "0–9", characters: DIGITS },
  punctuation: { label: ".,!?", characters: PUNCTUATION },
  full: {
    label: "everything",
    characters: [...UPPERCASE, ...LOWERCASE, ...DIGITS, ...PUNCTUATION],
  },
};

/**
 * Letters whose shapes stress curve fitting hardest — tight reversals and
 * descenders. Worth reviewing before compiling a font.
 */
export const TRICKY = ["g", "y", "s", "j", "a", "e", "?", "2"];

/**
 * Where each character should sit vertically. Digits are drawn to cap height
 * like capitals; punctuation is the fiddly case — a period belongs on the
 * baseline and a quote up at cap height, and nothing in the prompt would say so
 * otherwise.
 */
export function verticalHint(character: string): string {
  if (/[A-Z0-9]/.test(character)) return "cap height";
  if (/[a-z]/.test(character)) {
    if ("bdfhkl".includes(character)) return "ascender";
    if ("gjpqy".includes(character)) return "x-height, tail below baseline";
    return "x-height";
  }
  switch (character) {
    case ".":
    case ",":
      return "small, on the baseline";
    case ":":
      return "two dots, baseline to x-height";
    case "'":
    case '"':
      return "high, just under cap height";
    case "-":
      return "short dash, about half x-height";
    case "!":
    case "?":
      return "cap height down to the baseline";
    default:
      return "cap height";
  }
}
