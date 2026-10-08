import { TokenSpan, readDate, renderPattern, tokenSpans } from "../detect/formats";
import { MeridiemStyle } from "../detect/meridiem";
import { readTime, renderTime, timeSpans } from "../detect/time-formats";
import { DayKey, clampDay } from "./month";

/**
 * One press of the arrow keys on a date or a time: the part under the caret
 * moves by one.
 *
 * Pure, like `month.ts` beside it — no DOM, no editor. The editor layer finds
 * the date and writes the result; everything about what a step means is here,
 * where it can be tested.
 */

export type DatePart = "year" | "month" | "day";

/**
 * Which token the caret is on, as an index into the spans.
 *
 * Touching counts, on either side, so a caret just after `09` still steps the
 * day. Where two parts meet with nothing between them — `202610|09` — the one
 * on the left wins: it is the one just read, or just typed.
 */
export function partAt(spans: readonly TokenSpan[], offset: number): number | null {
  const inside = spans.findIndex((span) => span.from < offset && offset < span.to);
  if (inside !== -1) return inside;

  const ending = spans.findIndex((span) => span.to === offset);
  if (ending !== -1) return ending;

  const starting = spans.findIndex((span) => span.from === offset);
  return starting === -1 ? null : starting;
}

/** The part a token steps. A weekday is the day, written another way. */
function partOf(token: string): DatePart {
  if (token.startsWith("Y")) return "year";
  if (token.startsWith("M")) return "month";
  return "day";
}

/**
 * The day one step away, and the day of the month the next step should aim for.
 *
 * `meant` is what keeps repeated presses from drifting. A month or a year step
 * clamps it into the month it lands in rather than clamping the day in front of
 * it, so 30 January goes on to 28 February and back to 30 March, and a month-end
 * stays a month-end. A day step is a new choice of day, so it becomes the day
 * meant.
 */
export function stepDay(
  from: DayKey,
  part: DatePart,
  by: 1 | -1,
  meant: number,
): { day: DayKey; meant: number } {
  if (part === "day") {
    const at = new Date(Date.UTC(from.year, from.month, from.day + by));
    const day = { year: at.getUTCFullYear(), month: at.getUTCMonth(), day: at.getUTCDate() };

    return { day, meant: day.day };
  }

  const months = from.year * 12 + from.month + (part === "year" ? 12 * by : by);
  const year = Math.floor(months / 12);
  const month = months - year * 12;

  return { day: { year, month, day: clampDay(year, month, meant) }, meant };
}

export interface Nudge {
  /** The date as it should now be written. */
  text: string;
  /** Where the caret goes, as an offset into `text`. */
  caret: number;
  /** The day of the month the next step should aim for. */
  meant: number;
}

/**
 * The date one step on from `text`, with the caret at `offset` into it.
 *
 * Null when the caret touches no part, or the text does not read as a date in
 * the pattern — neither of which a detected date should be, but a null here
 * lets the key do whatever it would have done instead.
 *
 * The caret stays on the part it was on, as far into it as before and no
 * further than its end. A caret at the end of a part stays at the end, which is
 * what makes `February|` step to `March|` rather than to `Mar|ch`.
 */
export function nudge(
  text: string,
  pattern: string,
  locale: string | undefined,
  offset: number,
  by: 1 | -1,
  meant?: number,
): Nudge | null {
  const spans = tokenSpans(text, pattern);
  const index = spans === null ? null : partAt(spans, offset);
  const from = readDate(text, pattern, locale);
  if (spans === null || index === null || from === null) return null;

  const span = spans[index];
  const step = stepDay(from, partOf(span.token), by, meant ?? from.day);
  const next = renderPattern(pattern, step.day, locale);

  const caret = caretAfter(offset, span, tokenSpans(next, pattern)?.[index], next.length);

  return { text: next, caret, meant: step.meant };
}

/** Where the caret goes once the part it was on has been rewritten. */
function caretAfter(
  offset: number,
  span: TokenSpan,
  landed: TokenSpan | undefined,
  length: number,
): number {
  if (landed === undefined) return Math.min(offset, length);
  if (offset === span.to) return landed.to;

  return landed.from + Math.min(offset - span.from, landed.to - landed.from);
}

/** How far one press moves a time, in seconds, by the token under the caret. */
function secondsOf(token: string, by: 1 | -1): number {
  // am/pm has two values, so either key is the other one.
  if (token === "a" || token === "A") return 12 * 3600;
  if (token.startsWith("s")) return by;

  return token.startsWith("m") ? 60 * by : 3600 * by;
}

const DAY = 24 * 3600;

/**
 * The time one step on from `text`, with the caret at `offset` into it: `nudge`,
 * for a time.
 *
 * A step is the time moved by one of what the caret is on, so it carries as a
 * day step carries into the month — 14:59 goes on to 15:00. Midnight wraps: a
 * time on its own has no day to carry into. The seconds a time has are kept and
 * none are added, the pattern being the one that read it, and am/pm is written
 * in the spelling the note had it in.
 */
export function nudgeTime(
  text: string,
  pattern: string,
  locale: string | undefined,
  style: MeridiemStyle | undefined,
  offset: number,
  by: 1 | -1,
): Pick<Nudge, "text" | "caret"> | null {
  const spans = timeSpans(text, pattern);
  const index = spans === null ? null : partAt(spans, offset);
  const from = readTime(text, pattern, locale);
  if (spans === null || index === null || from === null) return null;

  const span = spans[index];
  const was = from.hour * 3600 + from.minute * 60 + from.second;
  const now = (was + secondsOf(span.token, by) + DAY) % DAY;
  const time = {
    hour: Math.floor(now / 3600),
    minute: Math.floor(now / 60) % 60,
    second: now % 60,
  };
  const next = renderTime(pattern, time, locale, style);

  return { text: next, caret: caretAfter(offset, span, timeSpans(next, pattern)?.[index], next.length) };
}
