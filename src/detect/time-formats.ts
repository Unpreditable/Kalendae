import { moment } from "obsidian";
import { DateFormatEntry, detectionLocales } from "./formats";
import { MeridiemStyle, styleMeridiem } from "./meridiem";

/**
 * Time formats: what one is, what it reads, and how a time is written in one.
 *
 * Beside the date formats rather than inside them. A format is a date or a
 * time and never both, the two lists are scanned separately, and a time's
 * vocabulary is ten tokens with no month names in it — sharing the date
 * compiler would have bought a locale cache this does not need and a token
 * table in which `m` and `M` sit one typo apart.
 *
 * The regex here is a pre-filter, as the date one is: `readTimeIn` asks
 * moment's strict parser, and that has the final say.
 */

/** A time of day; hours 0–23 whatever the pattern shows. */
export interface TimeOfDay {
  hour: number;
  minute: number;
  second: number;
}

/** Every token a time format may hold, by the part of a time it supplies. */
export const TIME_TOKEN_GROUPS = [
  { key: "hour", tokens: ["H", "HH", "h", "hh"], required: true },
  { key: "minute", tokens: ["m", "mm"], required: true },
  { key: "second", tokens: ["s", "ss"], required: false },
  { key: "meridiem", tokens: ["a", "A"], required: false },
] as const;

export type TimeTokenGroupKey = (typeof TIME_TOKEN_GROUPS)[number]["key"];

export type TimeFormatProblem =
  | { code: "missing-component"; component: "hour" | "minute" }
  | { code: "bracket-pair" }
  | { code: "unknown-tokens"; chars: string }
  /** A 12-hour hour with nothing to say which half of the day. */
  | { code: "meridiem-missing" }
  /** am/pm beside a 24-hour hour, where it can only contradict it. */
  | { code: "meridiem-stray" }
  | { code: "adjacent-numbers"; first: string; second: string };

/** The formats offered in the add menu. Each also reads its time with seconds. */
export const BUILT_IN_TIME_FORMATS: readonly DateFormatEntry[] = [
  { id: "time-24", pattern: "HH:mm" },
  { id: "time-24-short", pattern: "H:mm" },
  { id: "time-12", pattern: "h:mm a" },
  { id: "time-12-tight", pattern: "h:mma" },
  { id: "time-12-padded", pattern: "hh:mm a" },
  // am/pm first, as Korean, Hindi and others write it: `오후 2:05`.
  { id: "time-12-leading", pattern: "a h:mm" },
];

// Longest first, so HH is never read as H followed by a stray H.
const TOKEN = /HH|H|hh|h|mm|m|ss|s|a|A/g;

const NUMBERS: Record<string, string> = {
  HH: "\\d{2}",
  H: "\\d{1,2}",
  hh: "\\d{2}",
  h: "\\d{1,2}",
  mm: "\\d{2}",
  m: "\\d{1,2}",
  ss: "\\d{2}",
  s: "\\d{1,2}",
};

/** The number tokens that always write two digits, and so can run together. */
const FIXED_WIDTH = new Set(["HH", "hh", "mm", "ss"]);

interface Piece {
  text: string;
  isToken: boolean;
}

function split(pattern: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;

  for (const match of pattern.matchAll(TOKEN)) {
    if (match.index > last) pieces.push({ text: pattern.slice(last, match.index), isToken: false });
    pieces.push({ text: match[0], isToken: true });
    last = match.index + match[0].length;
  }
  if (last < pattern.length) pieces.push({ text: pattern.slice(last), isToken: false });

  return pieces;
}

const isHour = (piece: Piece) => piece.isToken && /^[Hh]/.test(piece.text);
const isMinute = (piece: Piece) => piece.isToken && piece.text.startsWith("m");
const isSecond = (piece: Piece) => piece.isToken && piece.text.startsWith("s");
const isMeridiem = (piece: Piece) => piece.isToken && /^[aA]$/.test(piece.text);

/** `null` when the pattern is usable, otherwise the first problem found. */
export function checkTimeFormat(pattern: string): TimeFormatProblem | null {
  const pieces = split(pattern);
  const strays = pieces
    .filter((piece) => !piece.isToken)
    .flatMap((piece) => piece.text.match(/[A-Za-z]+/g) ?? []);

  const hour = pieces.find(isHour);
  if (hour === undefined) return { code: "missing-component", component: "hour" };
  if (!pieces.some(isMinute)) return { code: "missing-component", component: "minute" };

  // Brackets are moment's escape, and `renderTime` wraps every literal in
  // them; a pattern that brings its own cannot be written back.
  if (/[[\]]/.test(pattern)) return { code: "bracket-pair" };
  if (strays.length > 0) return { code: "unknown-tokens", chars: strays.join(", ") };

  const twelveHour = hour.text.startsWith("h");
  const meridiem = pieces.some(isMeridiem);
  if (twelveHour && !meridiem) return { code: "meridiem-missing" };
  if (!twelveHour && meridiem) return { code: "meridiem-stray" };

  // `Hmm` runs to three or four digits with no way to tell where the hour
  // ends. `HHmm` always writes four, and reads back.
  for (let at = 1; at < pieces.length; at += 1) {
    const before = pieces[at - 1];
    const after = pieces[at];
    const numbers = before.text in NUMBERS && after.text in NUMBERS;
    if (before.isToken && after.isToken && numbers) {
      if (!FIXED_WIDTH.has(before.text) || !FIXED_WIDTH.has(after.text)) {
        return { code: "adjacent-numbers", first: before.text, second: after.text };
      }
    }
  }

  return null;
}

/**
 * The same format with seconds, or null where it has none to add.
 *
 * Every time format reads its time with seconds too — `HH:mm` reads `14:05:09`
 * — joined by whatever stands between its hour and its minute. The format names
 * the family and the note decides the exact shape. Nothing to add where the
 * format spells seconds out itself, or where hour and minute touch: `HHmmss`
 * would read any six-digit number.
 */
export function withSeconds(pattern: string): string | null {
  const pieces = split(pattern);
  if (pieces.some(isSecond)) return null;

  const at = pieces.findIndex(isMinute);
  const separator = pieces[at - 1];
  const hour = pieces[at - 2];
  if (at < 2 || separator.isToken || !isHour(hour)) return null;

  return [
    ...pieces.slice(0, at + 1).map((piece) => piece.text),
    `${separator.text}ss`,
    ...pieces.slice(at + 1).map((piece) => piece.text),
  ].join("");
}

/** A fresh global regex for the pattern; see `compileFormat` for why fresh. */
export function compileTimeFormat(pattern: string): RegExp {
  const pieces = split(pattern);
  const source = pieces
    .map((piece, index) => {
      if (!piece.isToken) return escapeLiteral(piece.text);
      if (piece.text in NUMBERS) return NUMBERS[piece.text];

      // A bare `a` or `p` is a time's only when it is attached to one. After a
      // space it is as likely the next word: "at 2:05 a friend called".
      const attached = index > 0 && pieces[index - 1].isToken;
      return meridiemSource(attached);
    })
    .join("");

  return new RegExp(source, "g");
}

/**
 * Everything am/pm can be written as: the English-style pair in each of its
 * spellings, and the words of every other language in force.
 *
 * Dotted both times or not at all, so a sentence's own full stop after `pm`
 * is never taken for half of `p.m.`.
 */
function meridiemSource(attached: boolean): string {
  const forms = [
    ...foreignMeridiems().map(escapeLiteral),
    "[AaPp]\\.[Mm]\\.",
    "[AaPp][Mm]",
    ...(attached ? ["[AaPp]"] : []),
  ];

  return `(?:${forms.join("|")})`;
}

/** The am/pm words of the languages in force that are not the English pair. */
function foreignMeridiems(): string[] {
  const words = new Set<string>();

  for (const code of detectionLocales()) {
    const data = moment.localeData(code);
    for (let hour = 0; hour < 24; hour += 1) {
      // Half hours too: Chinese turns to its word for noon at 11:30.
      for (const minute of [0, 30]) {
        for (const lower of [true, false]) {
          const word = data.meridiem(hour, minute, lower);
          if (!/^[ap]m$/i.test(word)) words.add(word);
        }
      }
    }
  }

  return [...words].sort((a, b) => b.length - a.length);
}

/**
 * The language that reads this text as a time in this pattern, or null where
 * none does. The app's own language first, as `readIn` does for dates.
 */
export function readTimeIn(text: string, pattern: string): string | null {
  const codes = detectionLocales();
  const preferred = moment.locale();
  const order = codes.includes(preferred)
    ? [preferred, ...codes.filter((code) => code !== preferred)]
    : codes;

  for (const code of order) {
    if (moment.utc(text, pattern, code, true).isValid()) return code;
  }

  return null;
}

/** The time of day a text holds, or null where it does not read. */
export function readTime(text: string, pattern: string, locale?: string): TimeOfDay | null {
  const at =
    locale === undefined ? moment.utc(text, pattern, true) : moment.utc(text, pattern, locale, true);

  return at.isValid() ? { hour: at.hour(), minute: at.minute(), second: at.second() } : null;
}

/**
 * One time, written in one pattern.
 *
 * Handed to moment whole with each literal in moment's own `[...]` escape, as
 * `renderPattern` does and for its reason: what Kalendae does not compile
 * stands in the output untouched. Given a style, am/pm is written in it rather
 * than as moment would — the style is the note's own spelling, and the token's
 * case is only what a new time is written in.
 */
export function renderTime(
  pattern: string,
  time: TimeOfDay,
  locale?: string,
  style?: MeridiemStyle,
): string {
  const at = moment.utc({ year: 2000, month: 0, date: 1, ...time });
  const when = locale === undefined ? at : at.locale(locale);
  const pieces = split(pattern);

  // A draft in the format editor may hold a `[`, which moment cannot escape;
  // it is rendered a piece at a time, as `renderPattern` renders its drafts.
  if (pieces.length === 0 || pattern.includes("[")) {
    return pieces.map((piece) => (piece.isToken ? when.format(piece.text) : piece.text)).join("");
  }

  return when.format(
    pieces
      .map((piece) => {
        if (!piece.isToken) return `[${piece.text}]`;
        if (style !== undefined && isMeridiem(piece)) {
          return `[${styleMeridiem(time.hour < 12 ? "am" : "pm", style)}]`;
        }
        return piece.text;
      })
      .join(""),
  );
}

/** The current time in this pattern, for a row in settings. */
export function renderTimeExample(pattern: string, on: Date = new Date()): string {
  return renderTime(pattern, {
    hour: on.getHours(),
    minute: on.getMinutes(),
    second: on.getSeconds(),
  });
}

/**
 * A time to show a format by, in settings: now, unless now would hide what the
 * format does.
 *
 * At 22:41 `H:mm` and `HH:mm` both read 22:41, and the rows exist to show the
 * two apart. So once the hour would take two digits the sample is five past
 * nine instead, in the same half of the day — the one hour that shows a leading
 * zero where there is one and its absence where there is not.
 */
export function renderTimeSample(pattern: string, on: Date = new Date()): string {
  const hour = on.getHours();
  const shown = hourStyle(pattern) === "12" ? hour % 12 || 12 : hour;
  if (shown < 10) return renderTimeExample(pattern, on);

  const nine = hourStyle(pattern) === "12" && hour >= 12 ? 21 : 9;

  return renderTime(pattern, { hour: nine, minute: 5, second: 7 });
}

/**
 * The sample time for a format, with the seconds it also reads set apart, so a
 * row can show `9:05[:07] pm` — one time, and where the seconds would go.
 *
 * Found by laying the two renderings side by side rather than by walking the
 * pattern: the one with seconds is the plain one with a piece put in, so what
 * they share from the front is `before` and the rest of the plain one is
 * `after`. Nothing set apart where the format names its own seconds or has
 * nowhere to add them.
 */
export function timeSampleParts(
  pattern: string,
  on: Date = new Date(),
): { before: string; seconds: string; after: string } {
  const plain = renderTimeSample(pattern, on);
  const variant = withSeconds(pattern);
  if (variant === null) return { before: plain, seconds: "", after: "" };

  const full = renderTimeSample(variant, on);
  let shared = 0;
  while (shared < plain.length && plain[shared] === full[shared]) shared += 1;

  const after = plain.slice(shared);

  return {
    before: plain.slice(0, shared),
    seconds: full.slice(shared, full.length - after.length),
    after,
  };
}

/** Which clock a pattern's hour is on, or null where it has no hour yet. */
export function hourStyle(pattern: string): "12" | "24" | null {
  const hour = split(pattern).find(isHour);
  if (hour === undefined) return null;

  return hour.text.startsWith("h") ? "12" : "24";
}

/** Which of TIME_TOKEN_GROUPS a pattern draws on, for the checklist in settings. */
export function timeTokenGroupsPresent(pattern: string): Set<TimeTokenGroupKey> {
  const used = new Set(
    split(pattern)
      .filter((piece) => piece.isToken)
      .map((piece) => piece.text),
  );

  return new Set(
    TIME_TOKEN_GROUPS.filter((group) => group.tokens.some((token) => used.has(token))).map(
      (group) => group.key,
    ),
  );
}

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
