import { DAY_WORDS, UNITS, WEEKDAYS } from "../picker/quick";

/**
 * Dates said the way a reader would say them, in English.
 *
 * A closed vocabulary and three slots — a lead, a count, a subject — with an
 * optional word on the end for direction. Not a parser: every word it reads is
 * in a table below, and a query holding a word that is not is not a date. That
 * is the whole safety of it, and the reason a sentence cannot half-work.
 *
 * Pure, and English-only for now. The tables are the shape another language
 * would fill in; nothing else here would change.
 */

interface Lead {
  back: boolean;
  /** Whether a count may follow. `next 3 weeks` is not a date. */
  counted: boolean;
  /**
   * `this`, which is one word with two consequences: it means the nearest such
   * day with today counting — the bare weekday form — and it takes no unit at
   * all, because `this month` is not a day.
   */
  thisDay?: boolean;
}

const LEADS: Record<string, Lead> = {
  in: { back: false, counted: true },
  next: { back: false, counted: false },
  last: { back: true, counted: false },
  previous: { back: true, counted: false },
  prev: { back: true, counted: false },
  this: { back: false, counted: false, thisDay: true },
};

/**
 * A word on the end that says what a lead says, from the other side.
 *
 * Both of the two point backwards. Forward needs no word at the end: a count
 * with no direction on it already offers both ways, so `from now` would only be
 * a longer way to ask for a row that is on screen either way.
 *
 * Matched by prefix, like everything else here, so `3 weeks a` is three weeks
 * back rather than an invalid row for the keystrokes it takes to finish `ago`.
 * A trail is read only where what comes before it is already a whole phrase,
 * which is what keeps `in 3 f` meaning three Fridays.
 */
const TRAILS: Record<string, boolean> = { ago: true, back: true };

/**
 * The counts that are words rather than digits.
 *
 * Answered from two letters on, so `in th` is already three. One letter is
 * where it stops: `in t` is two, ten and twelve against every subject there is,
 * which is thirty-six rows for a single keystroke.
 */
const NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

/** The noun each unit answers to, in the order the language lists the units. */
const UNIT_WORDS: Record<(typeof UNITS)[number], string> = {
  d: "day",
  w: "week",
  M: "month",
  Q: "quarter",
  y: "year",
};

/**
 * Every rule these words could mean, as rule tails, or nothing when they are
 * not a date.
 *
 * More than one comes back from a prefix in the last word — `in 3 w` is three
 * weeks or three Wednesdays — and from a count that never said which way it
 * runs, which is offered both ways.
 */
export function rulesFromWords(query: string): string[] {
  const words = split(query);
  if (words.length === 0) return [];

  // Two readings: the words as they stand, and the words with their last taken
  // as a direction. Both can land — and where they do, both are offered,
  // because a list of suggestions is allowed to say "or". A rule reached twice
  // is collapsed by the list itself, which keys every row on its rule already.
  return [...read(words, undefined, false), ...trailReadings(words)];
}

/**
 * The words as one phrase, with the direction a trail has already contributed.
 *
 * `requireSubject` is what stops a trail being read off the end of something
 * that is not yet a phrase: `in 3 ` names every subject there is, which is a
 * useful list to offer and nothing to put an `ago` after.
 */
function read(words: string[], trailBack: boolean | undefined, requireSubject: boolean): string[] {
  const lead = LEADS[words[0]];
  const rest = lead === undefined ? words : words.slice(1);

  // A direction at both ends is not emphasis, it is two answers.
  if (lead !== undefined && trailBack !== undefined && (lead.back || trailBack)) return [];

  const count = countIn(rest);
  if (count === null) return [];
  if (count.given && lead !== undefined && !lead.counted) return [];
  if (requireSubject && count.subject === "") return [];

  // Nothing qualifying the subject at all: `week` is not a date, `friday` is.
  const bare = lead === undefined && !count.given && trailBack === undefined;
  const back = lead?.back === true || trailBack === true;

  // `friday` on its own is the nearest one, today counting — the reading the
  // bare token already has. `this friday` says it in words; a count, a lead or
  // a trail takes it away, because each of those has to move.
  const inclusive = (lead?.thisDay === true || bare) && count.value === 1;

  // A count with nothing saying which way it runs means either way, so both are
  // offered, paired subject by subject: `3 months` is three months on and three
  // months back. A lead or a trail settles it and the pair collapses to the one
  // that was asked for. A subject with no count keeps its single row — `friday`
  // already has next and last beside it in the list.
  const both = count.given && lead === undefined && trailBack === undefined;

  return subjects(count.subject, bare, lead?.thisDay === true).flatMap((subject) =>
    both
      ? [spell(subject, count.value, false, false), spell(subject, count.value, true, false)]
      : [spell(subject, count.value, back, inclusive)],
  );
}

/** The readings where the last word is a trail, whole or being typed. */
function trailReadings(words: string[]): string[] {
  if (words.length < 2) return [];

  const tail = words[words.length - 1];

  return Object.entries(TRAILS).flatMap(([trail, back]) =>
    trail.startsWith(tail) ? read(words.slice(0, -1), back, true) : [],
  );
}

/** The words, lowercased, with the empty one a blank query leaves behind. */
function split(query: string): string[] {
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((word) => word !== "");
}

/** The count and what is left after it, or null when the count is out of range. */
function countIn(body: string[]): { value: number; given: boolean; subject: string } | null {
  const head = body[0] ?? "";
  const value = /^[0-9]+$/.test(head) ? Number(head) : numberWord(head);

  if (value === undefined) return { value: 1, given: false, subject: body.join(" ") };
  if (value < 1 || value > 999) return null;

  return { value, given: true, subject: body.slice(1).join(" ") };
}

/** A number word, whole or from two letters on, when exactly one answers to it. */
function numberWord(word: string): number | undefined {
  // A whole word answers whatever its length: `a` is one, and `in a week` was
  // a date long before prefixes were.
  if (NUMBERS[word] !== undefined) return NUMBERS[word];
  if (word.length < 2) return undefined;

  const answering = Object.entries(NUMBERS).filter(([name]) => name.startsWith(word));

  return answering.length === 1 ? answering[0][1] : undefined;
}

/**
 * Whether the only thing wrong with these words is how big the number is —
 * and only where what follows it is a subject a count could take.
 *
 * `in 1000 days` is a phrase the reader got right and a number the rules cannot
 * take. Saying so is worth a row of its own: "Invalid date" sends them looking
 * for a spelling mistake that is not there. `0 nov` is a day no month has, not
 * a count of Novembers, and the count message would send the reader hunting
 * for a spelling mistake in a number they meant as a day.
 *
 * A trail on the end is dropped first, the same way `trailReadings` drops one —
 * matched by prefix against `TRAILS` — because what is left after the count is
 * a single word answering to a subject, not a phrase. Without this, `1000 days
 * ago` handed `subjects()` the two words joined, which answers to nothing and
 * reads as "Invalid date" instead of the count refusal it is.
 */
export function countRefused(query: string): boolean {
  const words = split(query);
  const rest = LEADS[words[0]] === undefined ? words : words.slice(1);
  const head = rest[0] ?? "";

  if (!/^[0-9]+$/.test(head)) return false;

  const value = Number(head);
  if (value >= 1 && value <= 999) return false;

  return subjects(dropTrail(rest.slice(1)).join(" "), false, false).length > 0;
}

/**
 * The words with a trailing trail word removed, matched by prefix like `trailReadings`
 * matches one.
 *
 * Only when there would be a word left in front of it: a trail with nothing before it is
 * not a count phrase with a direction, it is not a phrase at all. Dropping it anyway left
 * `subjects("")` naming every subject there is, so `1000 back`, `1000 ago` and `0 back`
 * read as the count refusal instead of "Invalid date".
 */
function dropTrail(words: string[]): string[] {
  if (words.length <= 1) return words;

  const tail = words[words.length - 1];

  return Object.keys(TRAILS).some((trail) => trail.startsWith(tail)) ? words.slice(0, -1) : words;
}

/**
 * The subjects a word could name: `d`…`y` for a unit, `Mon`…`Sun` for a day.
 *
 * The last word may be a prefix, so an empty one names them all — which is what
 * makes `in 3 ` a list of everything three of something could be.
 */
function subjects(word: string, bare: boolean, weekdayOnly: boolean): string[] {
  const wanted = singular(word);
  const units = bare
    ? []
    : UNITS.filter((unit) => UNIT_WORDS[unit].startsWith(wanted));
  const days = DAY_WORDS.flatMap((name, index) =>
    name.startsWith(wanted) ? [WEEKDAYS[index]] : [],
  );

  return weekdayOnly ? days : [...units, ...days];
}

/**
 * `weeks` and `fridays` name what `week` and `friday` name.
 *
 * A lone `s` is not a plural, it is someone a letter into Sunday. Stripping it
 * left the empty string, which every subject starts with, so `next s` offered
 * all twelve.
 */
function singular(word: string): string {
  return word.length > 1 && word.endsWith("s") ? word.slice(0, -1) : word;
}

/** One subject in the stored spelling. */
function spell(subject: string, count: number, back: boolean, inclusive: boolean): string {
  const weekday = WEEKDAYS.includes(subject as (typeof WEEKDAYS)[number]);
  if (weekday && inclusive) return subject;

  return `${back ? "-" : "+"}${count}${subject}`;
}
