import { moment } from "obsidian";
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
 */
export function shiftMonths(from: DayKey, months: number): DayKey {
  const at = moment.utc({ year: from.year, month: from.month, day: 1 }).add(months, "months");
  const year = at.year();
  const month = at.month();

  return { year, month, day: clampDay(year, month, from.day) };
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

/** 0 to 6 from the machine's region, or null where the browser cannot say. */
function regionFirstDay(): number | null {
  type WithWeekInfo = { getWeekInfo?: () => { firstDay: number } };

  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & WithWeekInfo;
    const first = locale.getWeekInfo?.().firstDay;

    // Intl counts Monday as 1 through Sunday as 7; moment counts Sunday as 0.
    return first === undefined ? null : first % 7;
  } catch {
    return null;
  }
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
