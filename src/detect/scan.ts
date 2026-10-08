import { DateFormatEntry, FormatKind, checkFormat, compileFormat, readIn } from "./formats";
import { markerBefore } from "./markers";
import { MeridiemStyle, meridiemStyleOf } from "./meridiem";
import { checkTimeFormat, compileTimeFormat, readTimeIn, withSeconds } from "./time-formats";

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
  /** Which list the format came from, and so which panel edits it. */
  kind: FormatKind;
  /**
   * Where the Tasks emoji in front of this date begins, spaces included, when
   * there is one. The rule is `markers.ts`; this only records what it found.
   *
   * Recorded whether or not the candidate was accepted, like every other field
   * here: a rejection carries the reason it was rejected for and nothing less.
   */
  markerFrom?: number;
  /**
   * The language that read this date, where one did.
   *
   * Carried so the calendar can open on the right day and the write-back can
   * keep the note's own language: `6 сентября 2026` edited in an English
   * vault has to come back Russian, not `7 September 2026`.
   */
  locale?: string;
  /** How a time spelled its am/pm, where it has the English-style pair. */
  meridiem?: MeridiemStyle;
  accepted: boolean;
  reason?: RejectReason;
}

export function scanText(
  text: string,
  entries: DateFormatEntry[],
  timeEntries: DateFormatEntry[] = [],
): Candidate[] {
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
        kind: "date",
        markerFrom: markerBefore(text, from) ?? undefined,
        ...reasonFor(text, from, to, match[0], entry.pattern),
      });
    }
  }

  // Times after dates, so a date wins a string both could read: `12.10.25`
  // is a date wherever a date format says so.
  const times: Candidate[] = [];
  for (const entry of timeEntries) {
    if (checkTimeFormat(entry.pattern)) continue;

    // The pattern a candidate carries is the one that read it, so a time
    // found with seconds is written back with them.
    for (const pattern of [withSeconds(entry.pattern), entry.pattern]) {
      if (pattern === null) continue;

      for (const match of text.matchAll(compileTimeFormat(pattern))) {
        const from = match.index;
        const to = from + match[0].length;
        times.push({
          from,
          to,
          text: match[0],
          formatId: entry.id,
          pattern,
          kind: "time",
          ...reasonForTime(text, from, to, match[0], pattern),
        });
      }
    }
  }

  // The fullest reading of a time wins, and list order only settles readings
  // of the same length. Without this `HH:mm` above `h:mm a` takes the `12:05`
  // out of `12:05 am` and strands the rest. The sort is stable, so equal
  // lengths stay in the order the list gave them.
  times.sort((a, b) => b.to - b.from - (a.to - a.from));
  candidates.push(...times);

  return resolveOverlaps(candidates).sort((a, b) => a.from - b.from);
}

function reasonFor(
  text: string,
  from: number,
  to: number,
  matched: string,
  pattern: string,
): Pick<Candidate, "accepted" | "reason" | "locale"> {
  if (!hasCleanBoundaries(text, from, to)) return { accepted: false, reason: "boundary" };
  // moment's strict mode is the authority on whether this is a real date, so
  // the compiled regex never has to be more than a fast pre-filter. Which
  // language did the reading is `readIn`'s own business, next to the lists the
  // spellings come from — and it is kept, because the calendar has to open on
  // this day and the write-back has to answer in this language.
  const locale = readIn(matched, pattern);
  if (locale === null) {
    return { accepted: false, reason: "not-a-date" };
  }
  return { accepted: true, locale };
}

function reasonForTime(
  text: string,
  from: number,
  to: number,
  matched: string,
  pattern: string,
): Pick<Candidate, "accepted" | "reason" | "locale" | "meridiem"> {
  const flanked = insideLongerTime(text, from, to) || isUtcOffset(text, from);
  if (!hasCleanBoundaries(text, from, to) || flanked) {
    return { accepted: false, reason: "boundary" };
  }

  // "not-a-date" for a time as well: the reason is that the strict parser
  // refused it, and one name for that serves both lists.
  const locale = readTimeIn(matched, pattern);
  if (locale === null) return { accepted: false, reason: "not-a-date" };

  return { accepted: true, locale, meridiem: meridiemStyleOf(matched) ?? undefined };
}

/**
 * A colon with a digit beyond it, on either side: this is the middle of
 * `14:05:09` or the tail of `1:14:05`, not a time of its own. The dot rule
 * already says the same of `14.05.09`.
 */
function insideLongerTime(text: string, from: number, to: number): boolean {
  const before = text[from - 1] === ":" && /\d/.test(text[from - 2] ?? "");
  const after = text[to] === ":" && /\d/.test(text[to + 1] ?? "");

  return before || after;
}

/**
 * What separates `2026-09-06.` at the end of a sentence from `12.11.2026.5`
 * in a numbered list: a letter or digit on either side always disqualifies a
 * match, while a dot and an underscore each disqualify only on what sits
 * beyond them.
 */
function hasCleanBoundaries(text: string, from: number, to: number): boolean {
  return cleanBoundaryBefore(text, from) && cleanBoundaryAfter(text, to);
}

/**
 * The same question asked of a date about to be written rather than one already
 * found: would the text on this side of `at` disqualify it?
 *
 * Exported as a side at a time because that is what the insert case needs. A
 * date written into `backup|final` has to carry a space on each side to be a
 * date the scanner ever finds again, and one written after `Due:` needs neither
 * — so the command that inserts one pads the side that objects and leaves the
 * other alone. A space is never a letter, digit, dot or underscore, so one is
 * always enough.
 */
export function cleanBoundaryBefore(text: string, at: number): boolean {
  return isClean(text[at - 1], text[at - 2]);
}

export function cleanBoundaryAfter(text: string, at: number): boolean {
  return isClean(text[at], text[at + 1]);
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

/**
 * The `+02:00` on the end of a timestamp: shaped like a time, and editing it
 * as one would corrupt the timestamp it belongs to.
 *
 * A plus sign in front is always an offset. A minus is one only where it is
 * written as an offset is — after a space, or straight after a time that is
 * glued to its date by a `T` — because `10:30-11:45` is a range, and both of
 * its ends are times.
 */
function isUtcOffset(text: string, from: number): boolean {
  const sign = text[from - 1];
  if (sign === "+") return true;
  if (sign !== "-") return false;

  const before = text.slice(0, from - 1);

  return before === "" || /\s$/.test(before) || /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(before);
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
