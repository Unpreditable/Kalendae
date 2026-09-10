import { moment } from "obsidian";
import { DateFormatEntry, checkFormat, compileFormat } from "./formats";

/**
 * Finds the dates in a piece of text. Pure — no Obsidian editor, no syntax
 * tree — so the rules that decide what counts as a date are unit-testable in
 * full. Whether a date sits somewhere the user wants touched is a separate
 * question, answered by `context.ts` against the editor's syntax tree.
 *
 * Every regex hit comes back, accepted or rejected with a reason, because "why
 * did it ignore my date" and "why did it offer me a version number" are the same
 * question asked from either side. `shadow.ts` reads the rejections, and so does
 * the detection report on `debug/report-command`.
 */

export type RejectReason =
  /** Flanked by a word character, or by a dot that makes it part of a longer number. */
  | "boundary"
  /** Shaped like the format but not a real calendar date, e.g. 2026-02-30. */
  | "not-a-date"
  /** An earlier format in the list already claimed this range. */
  | "overlap";

export interface Candidate {
  /** Offset into the scanned text. */
  from: number;
  to: number;
  text: string;
  /** The `DateFormatEntry.id` that matched. */
  formatId: string;
  pattern: string;
  accepted: boolean;
  reason?: RejectReason;
}

export function scanText(text: string, entries: DateFormatEntry[]): Candidate[] {
  const candidates: Candidate[] = [];

  // List order is priority order: when two formats can read the same string,
  // the one the user put first wins. Reordering the list is how they say which.
  for (const entry of entries) {
    // Stored settings can predate a change to the token vocabulary, so an
    // unusable pattern is skipped rather than allowed to throw mid-scan.
    if (checkFormat(entry.pattern)) continue;

    for (const match of text.matchAll(compileFormat(entry.pattern).matcher)) {
      const from = match.index;
      const to = from + match[0].length;
      candidates.push({
        from,
        to,
        text: match[0],
        formatId: entry.id,
        pattern: entry.pattern,
        ...reasonFor(text, from, to, match[0], entry.pattern),
      });
    }
  }

  return resolveOverlaps(candidates).sort((a, b) => a.from - b.from);
}

function reasonFor(
  text: string,
  from: number,
  to: number,
  matched: string,
  pattern: string,
): Pick<Candidate, "accepted" | "reason"> {
  if (!hasCleanBoundaries(text, from, to)) return { accepted: false, reason: "boundary" };
  // moment's strict mode is the authority on whether this is a real date, so
  // the compiled regex never has to be more than a fast pre-filter. `utc`
  // rather than a bare `moment()` call for two reasons: validity is a question
  // about the calendar, not about the reader's timezone, and the namespace
  // member stays callable under esModuleInterop, which the Jest tsconfig sets
  // and the build tsconfig does not.
  if (!moment.utc(matched, pattern, true).isValid()) {
    return { accepted: false, reason: "not-a-date" };
  }
  return { accepted: true };
}

/**
 * What separates `2026-09-06.` at the end of a sentence from `12.11.2026.5`
 * in a numbered list: a letter or digit on either side always disqualifies a
 * match, while a dot and an underscore each disqualify only on what sits
 * beyond them.
 */
function hasCleanBoundaries(text: string, from: number, to: number): boolean {
  return isClean(text[from - 1], text[from - 2]) && isClean(text[to], text[to + 1]);
}

function isClean(adjacent: string | undefined, beyond: string | undefined): boolean {
  if (adjacent === undefined) return true;
  if (/[A-Za-z0-9]/.test(adjacent)) return false;

  // An underscore is Markdown emphasis as often as it is part of a name, and
  // the two are told apart by what follows it. `_2026-09-06_` and
  // `__2026-09-06__` are the italic and bold forms of a date the user wrote in
  // prose, and asterisk emphasis is already accepted, so refusing these read as
  // a bug rather than as a rule. `backup_2026-09-06_final` is a filename, where
  // the underscore joins the date to a word and the whole string is one token.
  // A second underscore beyond the first keeps bold working; a letter or digit
  // there is what marks the filename.
  if (adjacent === "_") return !(beyond !== undefined && /[A-Za-z0-9]/.test(beyond));

  return !(adjacent === "." && beyond !== undefined && /\d/.test(beyond));
}

/** Later formats lose a contested range, but stay in the result as rejected. */
function resolveOverlaps(candidates: Candidate[]): Candidate[] {
  const claimed: Candidate[] = [];

  return candidates.map((candidate) => {
    if (!candidate.accepted) return candidate;
    if (claimed.some((other) => candidate.from < other.to && other.from < candidate.to)) {
      return { ...candidate, accepted: false, reason: "overlap" as const };
    }
    claimed.push(candidate);
    return candidate;
  });
}
