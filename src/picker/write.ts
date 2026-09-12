import { renderPattern } from "../detect/formats";
import { cleanBoundaryAfter, cleanBoundaryBefore } from "../detect/scan";
import { DayKey } from "./month";

/**
 * What replaces a date in the note, and whether it is safe to replace it.
 *
 * Pure on purpose: the transaction that carries this is three lines in the
 * editor, and none of the rules about what gets written need an editor to be
 * tested.
 */

/**
 * The picked day, written in the format the old date was written in.
 *
 * The pattern comes from the detection that opened the picker, so nothing is
 * guessed a second time and a date is never restyled: a note that says
 * `22.03.2024` goes on saying dates that way, and one that spells the weekday
 * out gets the new day's weekday, not the old one's.
 */
export function replacementFor(pattern: string, day: DayKey): string {
  return renderPattern(pattern, day);
}

/**
 * The date to write at a range, with whatever spacing the boundary rule needs.
 *
 * Two cases, and no branch between them. Replacing a date passed the boundary
 * rule to have been detected at all, so neither side objects and the date is
 * written exactly as before. Inserting one at the caret — an empty range — has
 * no such guarantee: a caret inside a word would leave `back2026-09-06up`, which
 * the scanner will never find again, so the offending side gets a space and the
 * plugin can go on editing what it just wrote.
 */
export function insertionFor(
  doc: string,
  from: number,
  to: number,
  pattern: string,
  day: DayKey,
): string {
  const before = cleanBoundaryBefore(doc, from) ? "" : " ";
  const after = cleanBoundaryAfter(doc, to) ? "" : " ";

  return before + replacementFor(pattern, day) + after;
}

/**
 * Whether the text at a range is still the date that was detected there.
 *
 * The picker closes on any change to the document, but a change can land in
 * the same tick as a pick — from another pane, from a sync, from a plugin. The
 * range is mapped through it, and this is the question asked before writing:
 * if the answer is no, the write is abandoned rather than aimed at whatever
 * moved into place.
 */
export function stillThere(doc: string, from: number, to: number, expected: string): boolean {
  if (from < 0 || to > doc.length) return false;

  return doc.slice(from, to) === expected;
}
