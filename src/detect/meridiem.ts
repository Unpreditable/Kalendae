/**
 * How a note spells am/pm.
 *
 * moment reads `pm`, `PM`, `p.m.` and a bare `p` alike and writes only the
 * first. A time edited through it would come back restyled, which is the one
 * thing an edit must never do — so the spelling is read off the time that was
 * found and put back on the one that replaces it.
 *
 * The English-style pair only. A language with words of its own — `вечора`,
 * `午後`, `ös` — has one spelling for each, and moment writes it.
 */

export interface MeridiemStyle {
  /** `PM` rather than `pm`. */
  upper: boolean;
  /** `p.m.` rather than `pm`. */
  dots: boolean;
  /** `p` rather than `pm`. */
  short: boolean;
}

// An a or a p that is not part of a longer Latin word, with its m if it has
// one: dotted both times or not at all. A time holds nothing else in Latin
// letters, so the first one found is the one.
const SPELLING = /(?<![A-Za-z])([AaPp])(?:\.([Mm])\.|([Mm]))?(?![A-Za-z])/;

/** The spelling a time's am/pm is in, or null where it has no English-style one. */
export function meridiemStyleOf(text: string): MeridiemStyle | null {
  const match = SPELLING.exec(text);
  if (match === null) return null;

  const letters = match[1] + (match[2] ?? match[3] ?? "");

  return {
    upper: letters === letters.toUpperCase(),
    dots: match[2] !== undefined,
    short: match[2] === undefined && match[3] === undefined,
  };
}

/** One half of the day, written in a style. */
export function styleMeridiem(half: "am" | "pm", style: MeridiemStyle): string {
  const word = style.short ? half[0] : style.dots ? `${half[0]}.m.` : half;

  return style.upper ? word.toUpperCase() : word;
}
