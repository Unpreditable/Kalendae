import { moment } from "obsidian";
import { DayKey } from "../picker/month";

/**
 * A day named outright, rather than counted from today.
 *
 * Everything else in `typing/` reads an offset — `1d`, `EoM`, `next friday` —
 * and resolves it through the quick-date language. This reads `nov 3`, which
 * that language cannot say at all: there is no anchor for an arbitrary day, so
 * a row from here carries a day and no rule.
 *
 * Pure, like `scan.ts` and `words.ts`. moment is here for calendar arithmetic
 * only — whether a month has a 29th, and which year the nearest one falls in —
 * never for the reader's language. The English names are a table below, as the
 * word grammar's vocabulary is; the reader's own arrive as data, so the one
 * file that asks moment what language it is in stays `date-suggest.ts`.
 */

export interface AbsoluteContext {
  today: DayKey;
  /**
   * Every spelling each month answers to in the reader's language, January
   * first. Empty is legal and means English alone.
   */
  months: readonly (readonly string[])[];
}

export interface AbsoluteRow {
  day: DayKey;
  /**
   * The query with the day and the year filled in, which is what Tab writes, or
   * null where nothing is missing — the row Tab writes rather than completes.
   */
  complete: string | null;
}

/** The months in English, which every reader can type whatever their language. */
const ENGLISH: readonly (readonly string[])[] = [
  ["january", "jan"],
  ["february", "feb"],
  ["march", "mar"],
  ["april", "apr"],
  ["may"],
  ["june", "jun"],
  ["july", "jul"],
  ["august", "aug"],
  ["september", "sep", "sept"],
  ["october", "oct"],
  ["november", "nov"],
  ["december", "dec"],
];

/**
 * One or two digits naming a day of the month, with the comma a format writes.
 *
 * Any two digits, not the range a month has: which days exist is moment's to
 * say and `daysIn` asks it, where a range spelled out here would be a second
 * opinion on 30 February kept in step by hand. The one thing the length does
 * say is that three digits are a year rather than a day.
 */
const DAY = /^([0-9]{1,2}),?$/;
const DIGITS = /^[0-9]+$/;

/** How far the search for an occurrence runs. Eight years covers 29 February. */
const YEARS = 8;

/**
 * Every day this query could name, or nothing where it names none.
 *
 * Two rows come back from a query with no year — the nearest forward and the
 * nearest back — and from a two-digit year, which is read as typed and with the
 * century in front. More than two come back where a prefix names more than one
 * month: `j` is January, June and July.
 */
export function absoluteDates(query: string, context: AbsoluteContext): AbsoluteRow[] {
  const tokens = query.split(/\s+/).filter((token) => token !== "");
  const read = readTokens(tokens);
  if (read === null) return [];

  return monthsNamed(read.month, context.months).flatMap((month) =>
    daysIn(read, month, context.today).map((day) => ({
      day,
      complete: completion(read, day.year),
    })),
  );
}

/** What the tokens said, before any of it becomes a day. */
interface Read {
  /** The month prefix as typed, case and all, for the completion to keep. */
  month: string;
  day: number;
  /** The year as typed, or undefined where none was. */
  year: string | undefined;
  /** The first two tokens as typed, which the completion is rebuilt from. */
  head: string;
}

/**
 * The three shapes a named day comes in, and nothing else.
 *
 * A month alone, a month and a day in either order, and either of those with a
 * year on the end. The comma is allowed only where a format writes one, after
 * the day in month-day order, which is why `dayIn` is asked twice with
 * different answers about it.
 */
function readTokens(tokens: string[]): Read | null {
  if (tokens.length === 0 || tokens.length > 3) return null;

  const [first, second, third] = tokens;
  if (tokens.length === 1) {
    return { month: first, day: 1, year: undefined, head: `${first} 1` };
  }

  const year = tokens.length === 3 ? third : undefined;
  if (year !== undefined && !DIGITS.test(year)) return null;

  const head = `${first} ${second}`;
  const afterMonth = dayIn(second, true);
  if (afterMonth !== null) {
    return { month: first, day: afterMonth, year, head };
  }

  const beforeMonth = dayIn(first, false);

  return beforeMonth === null ? null : { month: second, day: beforeMonth, year, head };
}

/** The day a token names, or null when it names none. */
function dayIn(token: string, comma: boolean): number | null {
  if (!DAY.test(token)) return null;
  if (!comma && token.endsWith(",")) return null;

  return Number(token.replace(",", ""));
}

/**
 * Which months a prefix names.
 *
 * Any prefix, one character up, so `n` is November and `j` is three months. A
 * prefix of digits alone is not a month: Japanese, Korean and Chinese name
 * theirs `1月`…`12月`, and without this rule `@3` would stop meaning three days
 * on for every reader of those languages.
 *
 * A name with a space in it cannot be typed at all, since the grammar splits on
 * spaces — Vietnamese `tháng 11` is the case, and it is not one of the thirteen
 * locales. Dropping it here is what keeps it from matching a bare `tháng`.
 */
function monthsNamed(prefix: string, reader: readonly (readonly string[])[]): number[] {
  const wanted = prefix.toLowerCase();
  if (wanted === "" || DIGITS.test(wanted)) return [];

  return ENGLISH.flatMap((english, month) =>
    [...english, ...(reader[month] ?? [])].some(
      (name) => !/\s/.test(name) && name.toLowerCase().startsWith(wanted),
    )
      ? [month]
      : [],
  );
}

/**
 * The days one month gives this reading, forward first.
 *
 * With a year typed there is one row per year the digits could mean. With none
 * there are two, the nearest each way, and they are occurrences rather than
 * years: `feb 29` is 2028 and 2024, where taking this year and next and
 * clamping would have offered 28 February twice.
 */
function daysIn(read: Read, month: number, today: DayKey): DayKey[] {
  if (read.year === undefined) {
    return [occurrence(month, read.day, today, 1), occurrence(month, read.day, today, -1)].filter(
      (day) => day !== null,
    );
  }

  return yearsTyped(read.year, today)
    .map((year) => ({ year, month, day: read.day }))
    .filter((day) => moment.utc(day).isValid());
}

/**
 * The years a run of digits could mean.
 *
 * As typed, always. Two digits are the one length with something to complete,
 * so they also mean the century the reader is in — first, since that is what a
 * two-digit year nearly always means. The century comes from today rather than
 * from the clock, which is what keeps this testable.
 */
function yearsTyped(text: string, today: DayKey): number[] {
  const literal = Number(text);

  return text.length === 2 ? [Math.floor(today.year / 100) * 100 + literal, literal] : [literal];
}

/**
 * The nearest year in which this day exists and falls the right side of today.
 *
 * Forward counts today, which is the reading the bare `fri` already has: on
 * 3 November, `nov 3` is today and last year.
 */
function occurrence(month: number, day: number, today: DayKey, step: 1 | -1): DayKey | null {
  const from = moment.utc(today);

  for (let offset = 0; offset <= YEARS; offset += 1) {
    const candidate = { year: today.year + step * offset, month, day };
    const at = moment.utc(candidate);
    if (!at.isValid()) continue;

    const past = at.isBefore(from);
    if (step === 1 ? !past : past) return candidate;
  }

  return null;
}

/**
 * The query with what is missing added, or null where nothing is.
 *
 * What the reader typed is kept exactly — the month's case, the comma, the
 * order they put the day in — and only the gaps are filled, which is what Tab
 * does everywhere else in this list. A two-digit year is the one thing rewritten
 * rather than kept: both rows spell it in four digits, so the text left behind
 * names one day instead of the two it named before.
 */
function completion(read: Read, year: number): string | null {
  if (read.year !== undefined && read.year.length !== 2) return null;

  const text = read.year === undefined ? String(year) : String(year).padStart(4, "0");

  return `${read.head} ${text}`;
}
