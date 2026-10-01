import { moment } from "obsidian";

/**
 * Compiles a moment-token format string into a regex that finds candidates
 * for it in raw text.
 *
 * The regex only has to be non-lossy — it may admit strings that are not real
 * dates. `scan.ts` settles that question with moment's strict parser, so this
 * compiler is a fast pre-filter, not the authority.
 */

export interface CompiledFormat {
  pattern: string;
  matcher: RegExp;
}

/**
 * Why a format string can't be used. Carried as a code rather than a message
 * so the settings tab can translate it; nothing here is user-visible English.
 *
 * `unknown-tokens` means Kalendae cannot compile those letters — not that
 * moment would reject them. `ee` is a perfectly real moment token; we simply
 * do not support it, and the message must say so rather than call it invalid.
 */
export type FormatProblem =
  | { code: "unknown-tokens"; chars: string }
  | { code: "bracket-pair" }
  | { code: "missing-component"; component: "year" | "month" | "day" }
  | { code: "adjacent-numbers"; first: string; second: string; widen: TokenWidening[] };

/** A one-or-two-digit token and the fixed-width token that would settle it. */
export interface TokenWidening {
  from: string;
  to: string;
}

/** A format that works, but reaches further than it probably should. */
export type FormatWarning = { code: "number-run"; digits: number };

/**
 * Every token Kalendae compiles, grouped by the part of a date it supplies.
 *
 * The weekday group decorates a date without identifying one, so it is
 * optional; `Do` belongs to the day group, being the day of the month written
 * as an ordinal. The settings page renders this list, so the vocabulary the
 * user is shown cannot drift from the vocabulary that is implemented.
 */
export const TOKEN_GROUPS = [
  { key: "year", tokens: ["YY", "YYYY"], required: true },
  { key: "month", tokens: ["M", "MM", "MMM", "MMMM"], required: true },
  { key: "day", tokens: ["D", "DD", "Do"], required: true },
  { key: "weekday", tokens: ["d", "dd", "ddd", "dddd"], required: false },
] as const;

export type TokenGroupKey = (typeof TOKEN_GROUPS)[number]["key"];

/**
 * A sample of the punctuation a pattern may hold, for the table in settings.
 *
 * Not a rule, an illustration: the rule is that every character which is not a
 * letter is written out as typed — digits, emoji and non-latin letters
 * included — and letters that are not tokens are refused. Square brackets are
 * the one character this list must not carry, being the one thing a pattern
 * may not hold at all; the table sets an ellipsis after these to say the rest
 * is longer than a row.
 */
export const LITERAL_SAMPLE = ["-", "/", ".", ",", ":", "(", ")", "{", "}", "#"] as const;

const COMPONENT_TOKENS = {
  year: ["YYYY", "YY"],
  month: ["MMMM", "MMM", "MM", "M"],
  day: ["DD", "D", "Do"],
} as const;

export function compileFormat(pattern: string): CompiledFormat {
  const cache = tokenCache();

  let source = cache.sources.get(pattern);
  if (source === undefined) {
    source = split(pattern, cache)
      .map((piece) => (piece.isToken ? cache.tokens[piece.text] : escapeLiteral(piece.text)))
      .join("");
    cache.sources.set(pattern, source);
  }

  // A fresh RegExp per call even though the source is cached. The matcher is
  // global, so a shared instance would carry `lastIndex` between unrelated
  // scans the moment a caller reached for `exec` or `test` instead of
  // `matchAll`. Building one from a cached source is the part that was costly.
  return { pattern, matcher: new RegExp(source, "g") };
}

/** `null` when the pattern is usable, otherwise the first problem found. */
export function checkFormat(pattern: string): FormatProblem | null {
  const pieces = split(pattern, tokenCache());

  // A missing part is reported before a stray letter. Note the cost, which is
  // real: `YYYY-QQ-DD` is told it has no month when what it has is a month
  // written wrongly, and the Q that caused it goes unmentioned until the month
  // is supplied. The order was asked for; this is the case that pays for it.
  const used = new Set(pieces.filter((piece) => piece.isToken).map((piece) => piece.text));
  for (const [component, tokens] of Object.entries(COMPONENT_TOKENS)) {
    if (!tokens.some((token) => used.has(token))) {
      return { code: "missing-component", component: component as keyof typeof COMPONENT_TOKENS };
    }
  }

  // moment claims square brackets for its own escaping, reading a balanced
  // [...] as text to reproduce rather than as tokens to parse. "[[YYYY-MM-DD]]"
  // therefore compiles to a regex that finds a wiki-linked date and then fails
  // the strict parse — detection calls a real date invalid while the preview
  // shows it working. A bracket with no partner does parse, and is refused all
  // the same: no date format separates on one, and the rule a user is told is
  // the character rather than the pair.
  if (/[[\]]/.test(pattern)) return { code: "bracket-pair" };

  // Each run is reported on its own: joining them produced strings like "dee"
  // for "(dddd) M-d-YY ee", which appears nowhere in what the user typed.
  const strays = pieces
    .filter((piece) => !piece.isToken)
    .flatMap((piece) => piece.text.match(/[A-Za-z]+/g) ?? []);
  if (strays.length > 0) return { code: "unknown-tokens", chars: strays.join(", ") };

  // Digits meeting digits with nothing between them, where one of them is a
  // one-or-two-digit token. `DMMYYYY` runs to seven or eight digits and there
  // is no way to tell from the text where the day ends — the format cannot be
  // read back reliably, so it is refused outright. A run of fixed widths can
  // be read back, and is only a warning; see warnFormat.
  for (const [before, after] of adjacentNumbers(pieces)) {
    if (!isFixedWidth(before) || !isFixedWidth(after)) {
      // Separating them is one fix; making the widths fixed is the other, and
      // for M and D it is the better one — the format keeps its shape and only
      // stops being ambiguous. Offered only where it exists: Do has no
      // fixed-width sibling to widen to.
      const widen = [before, after]
        .filter((token) => token in WIDENINGS)
        .map((token) => ({ from: token, to: WIDENINGS[token] }));

      return { code: "adjacent-numbers", first: before, second: after, widen };
    }
  }

  return null;
}

/**
 * A date written in the pattern, using only the tokens Kalendae compiles.
 *
 * Deliberately not `moment().format(pattern)`. Moment's vocabulary is larger
 * than ours — it renders lowercase `yyyy` as the year, for one — so formatting
 * through it produced a preview that showed a working date for a pattern the
 * validator was rejecting at the same moment. Anything we do not compile is
 * left standing in the output, which is exactly what detection would do with
 * it.
 */
export function renderExample(pattern: string, on: Date = new Date()): string {
  // Built from the local calendar parts rather than moment(on): a bare
  // moment() call is not callable under the Jest tsconfig's esModuleInterop,
  // and converting a local Date to UTC would show yesterday's date near
  // midnight for anyone west of Greenwich.
  return renderPattern(pattern, {
    year: on.getFullYear(),
    month: on.getMonth(),
    day: on.getDate(),
  });
}

/**
 * One date, written in one pattern, using only the tokens Kalendae compiles.
 *
 * Every caller needs exactly this and none may use `moment().format(pattern)`
 * instead: the preview in settings would then show a working date for a pattern
 * the validator rejects, and write-back would put tokens into a note that
 * detection cannot read back. The month is 0-based, as moment counts.
 *
 * The pattern is handed to moment whole, with each literal wrapped in moment's
 * own `[...]` escape, rather than formatted a token at a time. It has to be:
 * moment reaches for a month's in-date spelling only where it can see a day
 * token beside the month in the same format string, so a token at a time wrote
 * the standalone `6 сентябрь 2026` into a Russian note where the language
 * says `6 сентября 2026`. Formatting whole also keeps that rule's other
 * half for free — `MMMM YYYY`, a month with no day in it, stays standalone,
 * which is the correct Russian for it.
 *
 * Escaping the literals is what keeps the old promise that anything Kalendae
 * does not compile stands in the output untouched: `yyyy` is a literal piece
 * here, so it comes back as `yyyy` rather than as a year. It cannot collide
 * with what the user typed either, because `checkFormat` refuses a pattern
 * holding a square bracket at all.
 */
export function renderPattern(
  pattern: string,
  on: { year: number; month: number; day: number },
  locale?: string,
): string {
  // `.locale()` on the moment, never `moment.locale()`: the global one is what
  // Obsidian formats its own dates through. Left off, this writes in the app's
  // language, which is what every caller wanted before a date could be read in
  // some other one.
  const when = locale === undefined ? moment.utc(on) : moment.utc(on).locale(locale);
  const pieces = split(pattern, tokenCache());

  // The one pattern that cannot be escaped is one that already carries a `[`,
  // since moment has no escape for that character. It is never a saved format
  // — checkFormat refuses it — but the format modal previews a draft as it is
  // typed, and `[[YYYY-MM-DD]]` is a thing people try. That draft keeps the
  // older piece-by-piece rendering, where a literal is simply copied: a
  // month spelled as the list spells it is a far better preview than the
  // scrambled text moment makes of an unclosed escape. An empty pattern takes
  // the same path, moment reading an empty format string as its default one.
  if (pieces.length === 0 || pattern.includes("[")) {
    return pieces.map((piece) => (piece.isToken ? when.format(piece.text) : piece.text)).join("");
  }

  return when.format(
    pieces.map((piece) => (piece.isToken ? piece.text : `[${piece.text}]`)).join(""),
  );
}

/** Where one token of a pattern sits in a date written in it. */
export interface TokenSpan {
  token: string;
  from: number;
  to: number;
}

/**
 * Where each token of the pattern sits in the text, or null when the pattern
 * does not cover the text whole.
 *
 * Read off the text rather than worked out from the pattern: a month name is
 * as long as the word the note holds, and in a language that declines months
 * that may be either of two words. Every piece becomes its own group, literals
 * included, so a token's offset is the sum of the groups before it and the
 * regex needs no match indices.
 */
export function tokenSpans(text: string, pattern: string): TokenSpan[] | null {
  const cache = tokenCache();
  const pieces = split(pattern, cache);
  const source = pieces
    .map((piece) => `(${piece.isToken ? cache.tokens[piece.text] : escapeLiteral(piece.text)})`)
    .join("");
  const match = new RegExp(`^${source}$`).exec(text);
  if (match === null) return null;

  const spans: TokenSpan[] = [];
  let at = 0;
  pieces.forEach((piece, index) => {
    const length = match[index + 1].length;
    if (piece.isToken) spans.push({ token: piece.text, from: at, to: at + length });
    at += length;
  });

  return spans;
}

/**
 * The day a date is, read in one language, or null where it does not read.
 *
 * The in-date spelling of a month is tried a second time as the listed one, for
 * the reason `parsesStrictly` gives: moment's strict parser knows only the
 * listed spelling in some of the languages that decline months.
 */
export function readDate(
  text: string,
  pattern: string,
  locale?: string,
): { year: number; month: number; day: number } | null {
  const parse = (input: string) =>
    locale === undefined ? moment.utc(input, pattern, true) : moment.utc(input, pattern, locale, true);

  let at = parse(text);
  if (!at.isValid()) at = parse(listedSpelling(text));

  return at.isValid() ? { year: at.year(), month: at.month(), day: at.date() } : null;
}

/** Which of TOKEN_GROUPS a pattern draws on, for the checklist in settings. */
export function tokenGroupsPresent(pattern: string): Set<TokenGroupKey> {
  const used = new Set(
    split(pattern, tokenCache())
      .filter((piece) => piece.isToken)
      .map((piece) => piece.text),
  );

  return new Set(
    TOKEN_GROUPS.filter((group) => group.tokens.some((token) => used.has(token))).map(
      (group) => group.key,
    ),
  );
}

interface Piece {
  text: string;
  isToken: boolean;
}

/** Splits a pattern into its tokens and the literal text between them. */
function split(pattern: string, cache: TokenCache): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;

  // `matchAll` clones the regex before walking it, so sharing one cached
  // instance across calls cannot leak `lastIndex` from one pattern to the next.
  for (const match of pattern.matchAll(cache.tokenRe)) {
    if (match.index > last) {
      pieces.push({ text: pattern.slice(last, match.index), isToken: false });
    }
    pieces.push({ text: match[0], isToken: true });
    last = match.index + match[0].length;
  }
  if (last < pattern.length) {
    pieces.push({ text: pattern.slice(last), isToken: false });
  }

  return pieces;
}

/**
 * The token table and everything derived from it, held until the locale moves.
 *
 * Not built at module load: the month and weekday names come from moment's
 * active locale, and Obsidian sets that from the app language after our module
 * is first evaluated. Taking them live is also what keeps this matcher
 * agreeing with the strict parser that has the final say.
 *
 * Not rebuilt per call either, which is what it used to do. A rebuild is 31
 * ordinal lookups and four sorted, escaped alternations, and `scanText` asks
 * for one per format per scan while `shadowedFormats` scans once per format
 * per sample date — so a ten-format list paid for it some two thousand times
 * on every keystroke-free redraw of the settings tab. Keying on
 * `moment.locale()` keeps the liveness and drops the repetition.
 */
interface TokenCache {
  locale: string;
  /** The enabled languages this entry was built for, joined. */
  locales: string;
  tokens: Record<string, string>;
  /** Longest token first, so MMMM is never read as MMM followed by a stray M. */
  tokenRe: RegExp;
  /** Compiled regex source per pattern, valid only for this locale. */
  sources: Map<string, string>;
  /** In-date month name to listed name, for the months this locale declines. */
  monthSpellings: [string, string][];
}

let cache: TokenCache | null = null;

/**
 * The languages detection reads, English first.
 *
 * Module state rather than an argument, because `compileFormat` is called from
 * six places with no business knowing about settings, and the cache above is
 * already module state for that same reason. `main.ts` sets it on load and on
 * every save; until it does, English — which is what this module read before
 * there was a list at all.
 */
let locales: string[] = ["en"];

/** Tells detection which languages to read. Rebuilds the cache on a change. */
export function setDetectionLocales(codes: readonly string[]): void {
  const next = [...codes];
  if (next.join("|") === locales.join("|")) return;

  locales = next;
  cache = null;
}

function tokenCache(): TokenCache {
  const locale = moment.locale();
  const enabled = locales.join("|");
  // `moment.locale()` stays in the key beside the enabled set: the app's own
  // language decides `Do`, the ordinal token, which no list governs.
  if (cache !== null && cache.locale === locale && cache.locales === enabled) return cache;

  const tokens = buildTokenPatterns();
  const names = Object.keys(tokens).sort((a, b) => b.length - a.length);

  cache = {
    locale,
    locales: enabled,
    tokens,
    tokenRe: new RegExp(names.join("|"), "g"),
    sources: new Map(),
    monthSpellings: monthSpellings(),
  };
  return cache;
}

/**
 * The regex source for every token, in the locale's own words.
 *
 * Both spellings of a month, which is the whole of what the two-list calls
 * below are doing. A language that declines its months has two words for one
 * month and a note may hold either: `moment.months()` lists the standalone
 * name, which is what a calendar shows and what a reader copying one types,
 * while a date written out carries the in-date name — Russian lists `сентябрь`
 * and writes `6 сентября 2026`, Lithuanian lists `rugsėjis` and writes
 * `rugsėjo`. Compiling the standalone list alone meant a format carrying a
 * month name found nothing at all in ru, uk and lt — silently, since a format
 * that matches nothing looks exactly like a note with no dates in it. The
 * in-date list is asked for by handing `months()` the format the name would be
 * written in, which is all `D MMMM` is: nothing is rendered, the day only tells
 * the locale which of its two lists to answer from. `alternation` throws the
 * duplicates away, so a language with one spelling pays nothing for this.
 *
 * The weekday tokens are deliberately asked for one way. Every one of the
 * thirteen languages this plugin ships answers `weekdays(false, "dddd")` with
 * exactly `weekdays()`, and the same for the short and min forms — the case a
 * declining language puts a weekday in is the one moment writes after a
 * preposition, `[в] dddd`, and no pattern Kalendae compiles can hold a
 * bracketed literal at all. A second list there would be seven copies of the
 * first.
 */
function buildTokenPatterns(): Record<string, string> {
  return {
    YYYY: "\\d{4}",
    YY: "\\d{2}",
    MMMM: alternation(months((data, on) => [data.months(on), data.months(on, "D MMMM")])),
    MMM: alternation(months((data, on) => [data.monthsShort(on), data.monthsShort(on, "D MMM")])),
    MM: "\\d{2}",
    M: "\\d{1,2}",
    DD: "\\d{2}",
    // The app's own language, not the enabled set: an ordinal is how *this*
    // reader's Obsidian writes a day number, and no list governs it.
    Do: alternation(ordinals()),
    D: "\\d{1,2}",
    dddd: alternation(weekdays((data, on) => [data.weekdays(on)])),
    ddd: alternation(weekdays((data, on) => [data.weekdaysShort(on)])),
    dd: alternation(weekdays((data, on) => [data.weekdaysMin(on)])),
    d: "\\d",
  };
}

/** Names for every month, across the languages in force. */
function months(read: (data: LocaleData, on: moment.Moment) => string[]): string[] {
  return names(MONTH_INDEXES, (on, month) => on.month(month), read);
}

/** Names for every weekday, across the languages in force. */
function weekdays(read: (data: LocaleData, on: moment.Moment) => string[]): string[] {
  return names(WEEKDAY_INDEXES, (on, day) => on.day(day), read);
}

/**
 * One token's every spelling, across the languages in force.
 *
 * `moment.localeData(code)` rather than switching locales: `moment.locale(code)`
 * changes what Obsidian itself formats dates with, which is not a plugin's to
 * change even for the instant it would take to read a list and switch back.
 *
 * `alternation` deduplicates, so a language sharing a name with another — and
 * most of them share several — costs the compiled pattern nothing.
 */
function names(
  units: readonly number[],
  set: (on: moment.Moment, unit: number) => moment.Moment,
  read: (data: LocaleData, on: moment.Moment) => string[],
): string[] {
  const when = moment.utc({ year: 2026, month: 0, day: 1 });

  return units.flatMap((unit) =>
    locales.flatMap((code) => read(moment.localeData(code), set(when.clone(), unit))),
  );
}

type LocaleData = ReturnType<typeof moment.localeData>;

const MONTH_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];

/**
 * A format made of nothing but numbers, which will match more than dates.
 *
 * `YYYYMMDD` is eight digits and nothing else, so every eight-digit number in
 * the vault that happens to be a valid date is picked up as one. A format with
 * anything else in it — a separator, a month name, a bracket — cannot match a
 * bare number and is left alone. Separate from checkFormat because it does not
 * make a format unusable: the user is told, and decides. Returning it from
 * checkFormat would also mark such a format unfinished everywhere else in the
 * settings, which it is not.
 */
export function warnFormat(pattern: string): FormatWarning | null {
  const pieces = split(pattern, tokenCache());

  // Every piece, not merely the run: a format warns only when it has nothing
  // in it but numbers. "(dddd) MMM-DDYYYY" ends in six digits, but it can only
  // ever match text that also carries a weekday, a month name, brackets and a
  // dash — a bare number will not match it, so there is nothing to warn about.
  // Any literal at all counts, because a matched date then contains something
  // that is not a digit and is no longer a plain number.
  const bare = pieces.length > 1 && pieces.every((piece) => piece.isToken && isFixedWidth(piece.text));
  if (!bare) return null;

  const digits = pieces.reduce((total, piece) => total + WIDTHS[piece.text], 0);
  return { code: "number-run", digits };
}

/** Every pair of number tokens that touch, in order. */
function adjacentNumbers(pieces: Piece[]): [string, string][] {
  const pairs: [string, string][] = [];

  for (let at = 1; at < pieces.length; at += 1) {
    const before = pieces[at - 1];
    const after = pieces[at];
    if (!before.isToken || !after.isToken) continue;
    if (endsInDigit(before.text) && startsWithDigit(after.text)) {
      pairs.push([before.text, after.text]);
    }
  }

  return pairs;
}

/** The fixed-width form of each token that is one digit or two. */
const WIDENINGS: Record<string, string> = { M: "MM", D: "DD" };

/** How many digits each number token always writes; M and D are absent, being one or two. */
const WIDTHS: Record<string, number> = { YYYY: 4, YY: 2, MM: 2, DD: 2, d: 1 };

function isFixedWidth(token: string): boolean {
  return token in WIDTHS;
}

/**
 * Whether a token's output runs into its neighbour's.
 *
 * `Do` is the awkward one and the reason these are two questions rather than
 * one: it renders "1st", so it begins with a digit but does not end with one.
 * Everything spelled out in words — month and weekday names — is safe at both
 * ends, which is what makes `D MMMM YYYY` legible with no separators at all.
 */
const DIGIT_TOKENS = new Set(["YYYY", "YY", "MM", "M", "DD", "D", "d"]);

function endsInDigit(token: string): boolean {
  return DIGIT_TOKENS.has(token);
}

function startsWithDigit(token: string): boolean {
  return DIGIT_TOKENS.has(token) || token === "Do";
}

/** Every ordinal a day of the month can take, "1st" through "31st". */
/**
 * The 31 ordinals `Do` can write, in the locale's own spelling.
 *
 * The period matters and is not optional. moment's `ordinal` takes the unit the
 * number stands in, because a language may decline it: Russian writes the day
 * of the month as `16-го` and a month as `1-й`. Four of the languages this
 * plugin ships — ru, uk, ja, ko — return the bare **number** when asked with no
 * period, which is not a string, and `escapeLiteral` took the settings tab down
 * with it on the first format check.
 *
 * `"D"` is the period `Do` is, and is what `format("Do")` itself passes, so the
 * alternation now matches what moment writes rather than the digits it does not.
 * The declared return type said `string[]` throughout and was simply wrong.
 */
function ordinals(): string[] {
  // moment's own typings declare one argument where its implementation takes
  // two, and declare a string return where four locales hand back a number.
  // Both halves of that gap are why this reached a release: the call type-checked
  // and the value did not survive contact with `escapeLiteral`.
  const locale = moment.localeData() as unknown as {
    ordinal: (value: number, period: string) => string | number;
  };

  return Array.from({ length: 31 }, (_, i) => String(locale.ordinal(i + 1, "D")));
}

/**
 * Whether moment reads the text as a real date written in this pattern.
 *
 * This is gate 3, the final say on every candidate the compiled regex turns
 * up, and it lives here rather than in `scan.ts` because of the second
 * attempt: a month is spelled two ways in a language that declines them, and
 * the two lists it takes them from are built a few lines above.
 *
 * The second attempt is needed because moment's strict parser knows one of the
 * two. It builds its month table from the standalone list, so `6 вересня
 * 2026` — how Ukrainian writes that date, and what moment's own `format()`
 * writes — is refused in uk and lt, while ru and lv answer for both spellings
 * unaided. Rewriting the name to its standalone twin and asking again is the
 * one fix that stays inside this plugin: `updateLocale` would answer it in a
 * line and would change the locale object Obsidian formats its own dates
 * through. The rewrite cannot turn one month into another, both spellings
 * being the same entry in the locale's two lists, and a text that still does
 * not parse is still refused.
 *
 * Tried in each language in force, because the strict parser otherwise reads
 * the global locale: a Spanish month in an English vault would be matched by
 * the regex and refused here, which is the half-fix TODO 13 left behind, one
 * gate along. The locale argument does not touch the global locale.
 *
 * `utc` rather than a bare `moment()` call for two reasons: validity is a
 * question about the calendar, not about the reader's timezone, and the
 * namespace member stays callable under esModuleInterop, which the Jest
 * tsconfig sets and the build tsconfig does not.
 */
export function parsesStrictly(text: string, pattern: string): boolean {
  return readIn(text, pattern) !== null;
}

/**
 * Which language read this date, or null where none of them did.
 *
 * The app's own language is tried first, so a date several languages read the
 * same way is kept in the one the reader is already in. That matters only when
 * the day is then changed: `6 September 2026` is the same text in English,
 * German and Dutch, but picking October writes `October` or `Oktober`, and the
 * reader's own is the right guess.
 */
export function readIn(text: string, pattern: string): string | null {
  const listed = listedSpelling(text);
  const preferred = moment.locale();
  const order = locales.includes(preferred)
    ? [preferred, ...locales.filter((code) => code !== preferred)]
    : locales;

  for (const code of order) {
    if (moment.utc(text, pattern, code, true).isValid()) return code;
    if (listed !== text && moment.utc(listed, pattern, code, true).isValid()) return code;
  }

  return null;
}

/** The text with its month name rewritten to the spelling a list gives it. */
function listedSpelling(text: string): string {
  for (const [inDate, standalone] of tokenCache().monthSpellings) {
    if (text.includes(inDate)) return text.replace(inDate, standalone);
  }

  return text;
}

/**
 * Every month name a date is written with that a list spells differently,
 * paired with the listed spelling and longest first — so `сентября` is
 * tried before a short name that could sit inside it.
 *
 * Empty in most languages, which is the answer to why this is a list of pairs
 * rather than a table of twelve: nothing is stored for a language that spells
 * a month one way.
 */
function monthSpellings(): [string, string][] {
  // Paired inside one locale, never across two. A pair is "this language
  // writes X where it lists Y", and building it from another language's list
  // would rewrite a Ukrainian month into a Russian one.
  const pairs = locales.flatMap((code) => {
    const data = moment.localeData(code);
    const when = moment.utc({ year: 2026, month: 0, day: 1 });

    return MONTH_INDEXES.flatMap((month): [string, string][] => {
      const on = when.clone().month(month);

      return [
        [data.months(on, "D MMMM"), data.months(on)],
        [data.monthsShort(on, "D MMM"), data.monthsShort(on)],
      ];
    });
  });

  return pairs
    .filter(([inDate, listed]) => inDate !== listed)
    .sort((a, b) => b[0].length - a[0].length);
}

/**
 * Longest name first, so a short name never shadows a longer sibling.
 *
 * Deduplicated because the month tokens hand in two lists that are the same
 * list in most languages — an alternation of twenty-four names where twelve
 * would do, on a regex that runs over every line in view.
 */
function alternation(names: string[]): string {
  const ordered = [...new Set(names)].sort((a, b) => b.length - a.length).map(escapeLiteral);
  return `(?:${ordered.join("|")})`;
}

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * One entry in the user's ordered format list.
 *
 * There is no enabled flag: being in the list is what makes a format active,
 * so removing it is how you switch it off.
 */
export interface DateFormatEntry {
  /** Stable across edits to the pattern: "iso", or "custom-<n>". */
  id: string;
  /** Moment tokens, e.g. "YYYY-MM-DD". */
  pattern: string;
}

/**
 * The catalogue the settings offer when adding a format — not the list a user
 * starts with. A fresh install gets ISO alone; everything else is here to be
 * picked.
 *
 * Every non-ISO entry is a format a real user of the closest prior art asked
 * for — `DD.MM.YYYY` (issue #9), `MM/DD/YY` and `YYYY-MM-DD (ddd)` (#15),
 * `dddd, MMMM D, YYYY` (#20) — but shipping any of them active would be
 * choosing a reading for `03/09/2026` on the user's behalf, which is how that
 * plugin ended up offering version numbers as dates.
 *
 * Adding an entry here is safe for existing installs precisely because nothing
 * merges it into their list; it simply becomes available in the add menu.
 */
export const BUILT_IN_FORMATS: readonly DateFormatEntry[] = [
  { id: "iso", pattern: "YYYY-MM-DD" },
  { id: "iso-weekday", pattern: "YYYY-MM-DD (ddd)" },
  { id: "slash-ymd", pattern: "YYYY/MM/DD" },
  { id: "dot-dmy", pattern: "DD.MM.YYYY" },
  { id: "slash-dmy", pattern: "DD/MM/YYYY" },
  { id: "slash-mdy", pattern: "MM/DD/YYYY" },
  { id: "slash-mdy-short", pattern: "MM/DD/YY" },
  { id: "long-dmy", pattern: "D MMMM YYYY" },
  { id: "long-mdy", pattern: "MMMM D, YYYY" },
  { id: "long-weekday", pattern: "dddd, MMMM D, YYYY" },
];
