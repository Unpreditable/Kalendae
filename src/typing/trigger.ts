/**
 * Where a typed date query starts, and what has been typed into it.
 *
 * Pure, like `scan.ts` beside it: Obsidian's suggester hands over a line and a
 * caret, and every rule about whether those two amount to a query is testable
 * without an editor.
 */

/** A query in progress: where its trigger sits in the line, and what follows it. */
export interface TypedQuery {
  /** Offset within the line of the first character of the trigger. */
  from: number;
  /** Everything between the trigger and the caret. Empty is a real answer. */
  query: string;
}

/**
 * An opening bracket counts as the start of a word, so `(@1d` and `[@1d` open
 * the menu. A quote does too: it is how a date lands inside quoted text.
 */
const OPENERS = new Set(["(", "[", "{", '"', "'"]);

/**
 * The query the caret is in, or null when it is not in one.
 *
 * The trigger must **start a word**: the line's first character, or one after
 * whitespace or an opener. Without that rule every email address in the vault
 * opens a date menu, and no amount of filtering afterwards makes that pleasant.
 *
 * The trigger may be more than one character, and the word-start rule is still
 * a rule about the **first** of them: `@d` opens only where `@` would, so the
 * `d` never has to be safe on its own. `lastIndexOf` is given room for the
 * whole phrase rather than one character, so a half-typed `@` with `@@` set is
 * not a trigger yet.
 *
 * Spaces inside the query are kept, which is what lets a chain — `@2w EoW` —
 * stay one query. Nothing closes the menu here: an unmatched query is a
 * question for `entriesFor`, which answers it with a row rather than by giving
 * up, so backspace can still repair it.
 */
export function triggerAt(line: string, caret: number, trigger: string): TypedQuery | null {
  if (trigger.length === 0 || caret < trigger.length) return null;

  const from = line.lastIndexOf(trigger, caret - trigger.length);
  if (from === -1) return null;

  const before = from === 0 ? "" : line[from - 1];
  if (before !== "" && !/\s/.test(before) && !OPENERS.has(before)) return null;

  return { from, query: line.slice(from + trigger.length, caret) };
}
