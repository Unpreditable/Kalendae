import { moment } from "obsidian";
import { readDate } from "../detect/formats";
import { WEEK_STARTS, WeekStart } from "../settings";

/**
 * The calendar's arithmetic, with no DOM and no editor: what days a month grid
 * holds, which of them are marked, and where paging lands. Every rule about
 * dates that the panel obeys is therefore unit-testable.
 *
 * Months are 0-based, matching moment. Carrying a second convention across the
 * boundary to moment would be one conversion per call site, and each of those
 * is a place to be off by one.
 *
 * The grid is built in UTC. A calendar is a question about the calendar, not
 * about the reader's offset from Greenwich — the one place the reader's clock
 * does matter is `todayKey`, which reads their local date deliberately.
 */

export interface DayKey {
  year: number;
  /** 0-based, as moment counts them: January is 0. */
  month: number;
  day: number;
}

export interface DayCell extends DayKey {
  /** From an adjoining month, present only to fill the week out. */
  outside: boolean;
  /** The date the note currently holds. */
  selected: boolean;
  today: boolean;
}

export interface Week {
  weekNumber: number;
  /** Always seven, starting on the week's first day. */
  days: DayCell[];
}

export interface MonthOptions {
  /** 0 is Sunday, 1 Monday, as moment's `day()` counts. */
  firstDay: number;
  selected: DayKey | null;
  today: DayKey;
}

/**
 * The weeks of one month, led in and trailed out with the adjoining months'
 * days so every row holds seven.
 *
 * As many weeks as the month needs, never padded to a fixed six: a panel that
 * changes height between March and April is worse than one that does not.
 */
export function buildMonth(year: number, month: number, options: MonthOptions): Week[] {
  const first = moment.utc({ year, month, day: 1 });
  const lead = (first.day() - options.firstDay + 7) % 7;
  const start = first.clone().subtract(lead, "days");
  const rows = Math.ceil((lead + first.daysInMonth()) / 7);

  return Array.from({ length: rows }, (_unused, row) => {
    const days = Array.from({ length: 7 }, (_ignored, offset) =>
      cell(start.clone().add(row * 7 + offset, "days"), year, month, options),
    );

    // Numbered from the row's own first day, by the active locale's rule rather
    // than by ISO: the locale that says which day starts the week is the one
    // that should say how weeks are counted.
    return { weekNumber: start.clone().add(row * 7, "days").week(), days };
  });
}

/** The day, or the last of the month when the month is too short to hold it. */
export function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, moment.utc({ year, month, day: 1 }).daysInMonth());
}

/**
 * The same day of another month, clamped.
 *
 * Paging off the 31st of January lands on the 29th of February, not the 2nd of
 * March, which is where adding a month to a full date would put it.
 *
 * `meant` is the day of the month paging started from, clamped in place of the
 * day in front of it, so repeated pages do not drift: 31 January goes to the
 * 29th of February and back to the 31st of March, as `stepDay()` does for the
 * arrow keys on a date.
 */
export function shiftMonths(from: DayKey, months: number, meant: number = from.day): DayKey {
  const at = moment.utc({ year: from.year, month: from.month, day: 1 }).add(months, "months");
  const year = at.year();
  const month = at.month();

  return { year, month, day: clampDay(year, month, meant) };
}

/**
 * One entry of the days another plugin lets the reader pick: a range with both
 * ends included, or a single day. Always `YYYY-MM-DD`, whatever format the
 * caller reads and writes its own dates in.
 */
export type AllowedEntry = { from: string; to: string } | string;

/** The days that can be picked, read once from the caller's entries. */
export interface AllowedDays {
  test(day: DayKey): boolean;
  /**
   * The allowed days as `[first, last]` pairs of whole-day numbers, both ends
   * included, so the searches below compare against each range rather than
   * walking a day at a time.
   */
  ranges: readonly (readonly [number, number])[];
}

const DAY_MS = 86_400_000;

/** A day as a whole number, so ranges and steps are plain arithmetic. */
function ordinal(day: DayKey): number {
  return Math.round(moment.utc(day).valueOf() / DAY_MS);
}

function fromOrdinal(n: number): DayKey {
  const at = moment.utc(n * DAY_MS);

  return { year: at.year(), month: at.month(), day: at.date() };
}

function readDay(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const at = moment.utc(text, "YYYY-MM-DD", true);

  return at.isValid() ? ordinal({ year: at.year(), month: at.month(), day: at.date() }) : null;
}

/**
 * The caller's entries as something the calendar can ask, or null for no limit.
 *
 * An entry that cannot be read is skipped, and so is a range written backwards,
 * rather than either lifting the limit or being guessed at. Anything that is not
 * a list, or a list where nothing at all can be read, is no limit: the caller
 * checks the day it gets back, and a calendar where no day can be picked is one
 * the reader can only close.
 */
export function allowedDays(entries: readonly AllowedEntry[] | undefined): AllowedDays | null {
  if (!Array.isArray(entries)) return null;
  const ranges: [number, number][] = [];

  for (const entry of entries as readonly unknown[]) {
    const [from, to] =
      typeof entry === "string"
        ? [readDay(entry), readDay(entry)]
        : typeof entry === "object" && entry !== null
          ? [readDay((entry as { from?: unknown }).from), readDay((entry as { to?: unknown }).to)]
          : [null, null];
    if (from !== null && to !== null && from <= to) ranges.push([from, to]);
  }

  if (ranges.length === 0) return null;

  return {
    test: (day) => {
      const n = ordinal(day);
      return ranges.some(([from, to]) => from <= n && n <= to);
    },
    ranges,
  };
}

/** The earliest allowed day from `low` to `high`, both included, or null. */
function earliestIn(allowed: AllowedDays, low: number, high: number): number | null {
  let best: number | null = null;
  for (const [from, to] of allowed.ranges) {
    if (to < low || from > high) continue;
    const n = Math.max(from, low);
    if (best === null || n < best) best = n;
  }

  return best;
}

/** The latest allowed day from `low` to `high`, both included, or null. */
function latestIn(allowed: AllowedDays, low: number, high: number): number | null {
  let best: number | null = null;
  for (const [from, to] of allowed.ranges) {
    if (to < low || from > high) continue;
    const n = Math.min(to, high);
    if (best === null || n > best) best = n;
  }

  return best;
}

/**
 * Where a key or a chevron aimed at `target` lands when only some days can be
 * picked: the target itself when allowed; else the allowed day nearest it,
 * short of it, without going back past `from`; else the next allowed day beyond
 * it, across a gap; else nowhere, and the ring stays on `from`.
 */
export function stepTo(from: DayKey, target: DayKey, allowed: AllowedDays): DayKey {
  const start = ordinal(from);
  const aim = ordinal(target);
  if (aim === start || allowed.test(target)) return target;

  const landed =
    aim > start
      ? latestIn(allowed, start + 1, aim - 1) ?? earliestIn(allowed, aim + 1, Infinity)
      : earliestIn(allowed, aim + 1, start - 1) ?? latestIn(allowed, -Infinity, aim - 1);

  return landed === null ? from : fromOrdinal(landed);
}

/**
 * Where a month or year step aimed at `target` lands when only some days can be
 * picked: the allowed day nearest the target, among the months past the one on
 * show in the step's direction, the later one on a tie. A month with nothing to
 * pick is skipped, and a step that would land back in the month on show goes
 * nowhere: the ring stays on `from`.
 */
export function pageTo(from: DayKey, target: DayKey, allowed: AllowedDays): DayKey {
  const aim = ordinal(target);
  const shown = ordinal({ ...from, day: 1 });
  const forward = aim > ordinal(from);
  const low = forward ? ordinal(shiftMonths(from, 1, 1)) : -Infinity;
  const high = forward ? Infinity : shown - 1;

  const after = earliestIn(allowed, Math.max(aim, low), high);
  const before = latestIn(allowed, low, Math.min(aim, high));
  if (after !== null && (before === null || after - aim <= aim - before)) return fromOrdinal(after);

  return before === null ? from : fromOrdinal(before);
}

/**
 * The day the calendar opens on: `value` when it can be picked, otherwise the
 * nearest day that can, the later one on a tie — a reader rescheduling is more
 * often pushing a date on than pulling it back.
 */
export function openingDay(value: DayKey, allowed: AllowedDays): DayKey {
  if (allowed.test(value)) return value;

  const at = ordinal(value);
  const after = earliestIn(allowed, at + 1, Infinity);
  const before = latestIn(allowed, -Infinity, at - 1);
  if (after === null) return fromOrdinal(before ?? at);
  if (before === null || after - at <= at - before) return fromOrdinal(after);

  return fromOrdinal(before);
}

/**
 * The day a date reads back as, or today when there is no date to read.
 *
 * Both of the picker's cases in one: it opens on the date the note holds, and on
 * today when the command is inserting a date where there was none — an empty
 * range at the caret, whose text is the empty string. Text that does not parse
 * answers today as well, rather than a day built out of NaN.
 *
 * The locale is the one that read the date, which detection kept for exactly
 * this. Without it, strict mode reads the *app's* language and a Russian date
 * in an English vault parses as nothing at all — so the calendar opened on
 * today, silently, rather than on the day under the pointer.
 *
 * Read through `readDate()`, which retries a declined month name in the
 * spelling moment lists, so `6 вересня 2026` opens on 6 September too.
 */
export function dayFor(text: string, pattern: string, locale?: string): DayKey {
  return readDate(text, pattern, locale) ?? todayKey();
}

/** Today by the reader's own clock, which is the only place local time is right. */
export function todayKey(now: Date = new Date()): DayKey {
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

/**
 * The setting's answer to "which day starts a week", as moment counts days.
 *
 * `WEEK_STARTS` is in moment's own order, so an entry's index in it is the day
 * number moment uses.
 */
export function firstDayOf(weekStart: WeekStart): number {
  return WEEK_STARTS.indexOf(weekStart);
}

/**
 * The day to start weeks on for a reader who has never said, written down on
 * first run and an ordinary setting from then on.
 *
 * The machine's own region is asked first: `Intl.Locale.getWeekInfo()` reports
 * what the browser knows about where it is set up, so a machine in Germany
 * gets Monday and one in the United States gets Sunday, whatever language
 * Obsidian is displaying in. Where that is unavailable, the app's language
 * answers through moment instead, which is the next best thing to knowing.
 */
export function defaultWeekStart(): WeekStart {
  return WEEK_STARTS[regionFirstDay() ?? moment.localeData().firstDayOfWeek()];
}

/**
 * The weekend for a reader who has never said, asked of the region the way
 * `defaultWeekStart()` is, and Saturday and Sunday where the browser cannot
 * say. moment has nothing to fall back on here: it knows a locale's first day
 * of the week but not its weekend.
 */
export function defaultWeekend(): WeekStart[] {
  const days = regionWeekInfo()?.weekend;
  if (days === undefined) return ["sunday", "saturday"];

  // Intl counts Monday as 1 through Sunday as 7; moment counts Sunday as 0.
  return WEEK_STARTS.filter((_, day) => days.some((intl) => intl % 7 === day));
}

/** 0 to 6 from the machine's region, or null where the browser cannot say. */
function regionFirstDay(): number | null {
  const first = regionWeekInfo()?.firstDay;

  // Intl counts Monday as 1 through Sunday as 7; moment counts Sunday as 0.
  return first === undefined ? null : first % 7;
}

/** What `Intl.Locale.getWeekInfo()` reports for the machine's region, if anything. */
function regionWeekInfo(): { firstDay?: number; weekend?: number[] } | null {
  type WithWeekInfo = { getWeekInfo?: () => { firstDay?: number; weekend?: number[] } };

  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & WithWeekInfo;

    return locale.getWeekInfo?.() ?? null;
  } catch {
    return null;
  }
}

/** Whether moment's day `day` (0 is Sunday) is one the reader counts as the weekend. */
export function isWeekend(weekend: readonly WeekStart[], day: number): boolean {
  return weekend.includes(WEEK_STARTS[day]);
}

export function sameDay(one: DayKey, other: DayKey): boolean {
  return one.year === other.year && one.month === other.month && one.day === other.day;
}

function cell(
  at: ReturnType<typeof moment.utc>,
  year: number,
  month: number,
  options: MonthOptions,
): DayCell {
  const key: DayKey = { year: at.year(), month: at.month(), day: at.date() };

  return {
    ...key,
    // Compared on the year as well as the month: December's trailing days are
    // January's, and a bare month comparison calls them the same month.
    outside: !(key.year === year && key.month === month),
    selected: options.selected !== null && sameDay(key, options.selected),
    today: sameDay(key, options.today),
  };
}
