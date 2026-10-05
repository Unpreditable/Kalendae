import { moment } from "obsidian";

/**
 * The clock's arithmetic: no DOM, no editor, no settings.
 *
 * A time is hours 0–23 whatever the pattern shows, and the pattern only decides
 * how it is drawn and written. The dial's coordinates put its centre at 0,0 and
 * its edge at distance 1, y growing downwards as it does on screen; angles run
 * clockwise from 12 o'clock, in degrees.
 */

export interface TimeValue {
  hour: number;
  minute: number;
  second: number;
}

export type ClockUnit = "hour" | "minute" | "second";

/** What the pattern a time was written in asks of the panel. */
export interface ClockShape {
  /** `h`: one ring of 12 and an AM/PM toggle. `H`: two rings, 0–23. */
  twelveHour: boolean;
  /** The pattern's AM/PM token, which is also the case its words are written in. */
  meridiemToken: "a" | "A" | null;
  seconds: boolean;
  padHour: boolean;
  padMinute: boolean;
  padSecond: boolean;
}

/** One number on the dial. */
export interface DialMark {
  /** What picking it sets, in `dialValue`'s terms. */
  value: number;
  label: string;
  degrees: number;
  /** On the inner ring of a 24-hour dial. */
  inner: boolean;
}

/**
 * Where the inner ring of a 24-hour dial ends and the outer begins, as a share
 * of the radius: halfway between the two rings' labels.
 */
export const RING_SPLIT = 0.66;

export function shapeOf(pattern: string): ClockShape {
  // Bracketed text is literal in moment and may hold any letter.
  const tokens = pattern.replace(/\[[^\]]*\]/g, "");

  return {
    twelveHour: tokens.includes("h"),
    meridiemToken: tokens.includes("a") ? "a" : tokens.includes("A") ? "A" : null,
    seconds: tokens.includes("s"),
    padHour: /HH|hh/.test(tokens),
    padMinute: tokens.includes("mm"),
    padSecond: tokens.includes("ss"),
  };
}

/**
 * The units a pick walks through. Snap drops seconds: a dial that lands on five
 * minutes is not one anybody is setting seconds on.
 */
export function unitsOf(shape: ClockShape, snap: boolean): ClockUnit[] {
  return shape.seconds && !snap ? ["hour", "minute", "second"] : ["hour", "minute"];
}

/** A unit as the big numbers at the top show it. */
export function unitText(unit: ClockUnit, time: TimeValue, shape: ClockShape): string {
  if (unit === "hour") {
    return pad(shape.twelveHour ? time.hour % 12 || 12 : time.hour, shape.padHour);
  }

  return unit === "minute"
    ? pad(time.minute, shape.padMinute)
    : pad(time.second, shape.padSecond);
}

/**
 * The numbers around the dial. A 24-hour dial is Material's: 1–12 outside with
 * 12 at the top, 13–23 inside with 00 at the top.
 */
export function marksFor(unit: ClockUnit, shape: ClockShape): DialMark[] {
  const twelve = Array.from({ length: 12 }, (_, index) => index);

  if (unit !== "hour") {
    return twelve.map((index) => ({
      value: index * 5,
      label: pad(index * 5, true),
      degrees: index * 30,
      inner: false,
    }));
  }

  if (shape.twelveHour) {
    return twelve.map((index) => ({
      value: index,
      label: String(index || 12),
      degrees: index * 30,
      inner: false,
    }));
  }

  return [
    ...twelve.map((index) => ({
      value: index || 12,
      label: String(index || 12),
      degrees: index * 30,
      inner: false,
    })),
    ...twelve.map((index) => ({
      value: index ? index + 12 : 0,
      label: index ? String(index + 12) : "00",
      degrees: index * 30,
      inner: true,
    })),
  ];
}

/** A time in the dial's terms: a 12-hour dial does not know which half it is in. */
export function dialValue(unit: ClockUnit, time: TimeValue, shape: ClockShape): number {
  if (unit === "hour") return shape.twelveHour ? time.hour % 12 : time.hour;

  return unit === "minute" ? time.minute : time.second;
}

/** Where the hand points, and whether it reaches only the inner ring. */
export function handOf(
  unit: ClockUnit,
  time: TimeValue,
  shape: ClockShape,
): { degrees: number; inner: boolean } {
  if (unit === "hour") {
    return {
      degrees: (time.hour % 12) * 30,
      inner: !shape.twelveHour && (time.hour === 0 || time.hour > 12),
    };
  }

  return { degrees: (unit === "minute" ? time.minute : time.second) * 6, inner: false };
}

/** The value under a point on the dial, in `dialValue`'s terms. */
export function pointToValue(
  unit: ClockUnit,
  shape: ClockShape,
  snap: boolean,
  x: number,
  y: number,
): number {
  // A share of a full turn, 0 at the top and growing clockwise.
  const turn = (Math.atan2(x, -y) / (2 * Math.PI) + 1) % 1;

  if (unit === "hour") {
    const hour = Math.round(turn * 12) % 12;
    if (shape.twelveHour) return hour;

    const inner = Math.hypot(x, y) < RING_SPLIT;
    if (inner) return hour ? hour + 12 : 0;

    return hour || 12;
  }

  const step = unit === "minute" && snap ? 5 : 1;

  return (Math.round((turn * 60) / step) * step) % 60;
}

/** A time with one unit set from the dial. */
export function withDialValue(
  unit: ClockUnit,
  value: number,
  time: TimeValue,
  shape: ClockShape,
): TimeValue {
  if (unit === "hour") {
    // A 12-hour dial picks within the half the time is already in; the
    // toggle is what crosses noon.
    const hour = shape.twelveHour ? value + (time.hour >= 12 ? 12 : 0) : value;
    return { ...time, hour };
  }

  return unit === "minute" ? { ...time, minute: value } : { ...time, second: value };
}

/**
 * An arrow key's step. Hours wrap through the whole day, which is what flips
 * AM and PM past 11; minutes and seconds wrap within themselves and never carry,
 * so one key never changes two numbers. With Snap on, an odd minute steps to
 * the five on either side of it rather than by five from where it is.
 */
export function stepped(
  unit: ClockUnit,
  time: TimeValue,
  delta: 1 | -1,
  snap: boolean,
): TimeValue {
  if (unit === "hour") return { ...time, hour: (time.hour + delta + 24) % 24 };

  const step = unit === "minute" && snap ? 5 : 1;
  const current = unit === "minute" ? time.minute : time.second;
  const next =
    delta > 0
      ? Math.floor(current / step) * step + step
      : Math.ceil(current / step) * step - step;
  const value = (next + 60) % 60;

  return unit === "minute" ? { ...time, minute: value } : { ...time, second: value };
}

/** The same hour on the dial, in the other half of the day. */
export function withMeridiem(time: TimeValue, pm: boolean): TimeValue {
  return { ...time, hour: (time.hour % 12) + (pm ? 12 : 0) };
}

/**
 * The words on the toggle's two halves: what the pattern would write at this
 * hour on each side of noon. Not a fixed pair — Ukrainian and Russian have four
 * words and Chinese six, chosen by the hour.
 */
export function meridiemWords(
  time: TimeValue,
  token: "a" | "A",
  locale?: string,
): { am: string; pm: string } {
  return {
    am: formatTime(token, withMeridiem(time, false), locale),
    pm: formatTime(token, withMeridiem(time, true), locale),
  };
}

/**
 * Every word a language writes for AM/PM across the day, in the order they
 * come. The toggle sizes itself to the longest so it does not jump as the hour
 * changes.
 */
export function meridiemVocabulary(token: "a" | "A", locale?: string): string[] {
  const words = Array.from({ length: 24 }, (_, hour) =>
    formatTime(token, { hour, minute: 0, second: 0 }, locale),
  );

  return [...new Set(words)];
}

/** The text a time is written as. */
export function formatTime(pattern: string, time: TimeValue, locale?: string): string {
  const at = moment.utc({ year: 2000, month: 0, date: 1, ...time });

  return (locale ? at.locale(locale) : at).format(pattern);
}

/**
 * What OK writes, or null for nothing at all.
 *
 * Unchanged is Cancel, so opening `14:32:47` and pressing OK keeps its seconds.
 * Once something did change, Snap writes the seconds as zero: they were never
 * on offer.
 */
export function committed(
  initial: TimeValue,
  current: TimeValue,
  shape: ClockShape,
  snap: boolean,
): TimeValue | null {
  const same =
    initial.hour === current.hour &&
    initial.minute === current.minute &&
    initial.second === current.second;
  if (same) return null;

  return shape.seconds && snap ? { ...current, second: 0 } : current;
}

/** The local time of day in a Date. */
export function timeOf(date: Date): TimeValue {
  return { hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds() };
}

function pad(value: number, padded: boolean): string {
  return padded ? String(value).padStart(2, "0") : String(value);
}
