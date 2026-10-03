import { moment } from "obsidian";
import { t } from "../i18n/i18n";
import { HoverOrb } from "../settings";
import { DayKey } from "./month";

/**
 * What the hover hint says about a date: how far it is from today, which day
 * of the week it falls on, and which colour its orb is.
 *
 * Pure, like `month.ts` beside it. The editor's hint and the settings preview
 * both draw from this, so the two cannot disagree about what a date reads as.
 *
 * The wording is moment's, in the app's language, which is what makes "in 45
 * days" and "a year ago" come out right in every locale Obsidian ships —
 * plural forms and all — without a string of our own. Only the three nearest
 * days are ours, because moment has no "tomorrow" that is not also a time.
 */

/** How the distance is worded; "off" is the setting's, and draws no hint at all. */
export type DistanceWording = "days" | "rounded";

export interface Hint {
  orb: "green" | "red" | null;
  /** Null when the date already names its weekday, or is one of the nearest three. */
  weekday: string | null;
  distance: string;
}

/** Whole days from `today` to `day`: negative in the past. */
export function daysFrom(today: DayKey, day: DayKey): number {
  return moment.utc(day).diff(moment.utc(today), "days");
}

/**
 * Whether a pattern writes the weekday out, as `dddd`, `ddd` or `dd`.
 *
 * Bracketed text is literal and does not count. A lone `d` is the weekday as a
 * number, which nobody reads as a day's name, so the hint still says it.
 */
export function namesWeekday(pattern: string): boolean {
  return /dd/.test(pattern.replace(/\[[^\]]*\]/g, ""));
}

export function hintFor(
  day: DayKey,
  today: DayKey,
  pattern: string,
  wording: DistanceWording,
  orb: HoverOrb,
): Hint {
  const days = daysFrom(today, day);
  const nearby = NEARBY[days];
  const ahead = days >= 0;

  return {
    orb: orb === "off" ? null : ahead === (orb === "green-red") ? "green" : "red",
    weekday: nearby !== undefined || namesWeekday(pattern) ? null : moment.utc(day).format("dddd"),
    distance: nearby !== undefined ? t(nearby) : distanceText(day, today, days, wording),
  };
}

const NEARBY: Record<number, string> = {
  [-1]: "hint.yesterday",
  0: "hint.today",
  1: "hint.tomorrow",
};

function distanceText(day: DayKey, today: DayKey, days: number, wording: DistanceWording): string {
  if (wording === "rounded") return moment.utc(day).from(moment.utc(today));

  // What `from()` does on its way to "in 45 days", minus the rounding: the
  // locale's own phrase for a count of days, then its own "in" or "ago".
  const locale = moment.localeData();
  const count = locale.relativeTime(Math.abs(days), false, "dd", days > 0);
  return locale.pastFuture(days, count);
}
