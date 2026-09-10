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
 * Both callers need exactly this and neither may use `moment().format(pattern)`
 * instead: the preview in settings would then show a working date for a pattern
 * the validator rejects, and write-back would put tokens into a note that
 * detection cannot read back. The month is 0-based, as moment counts.
 */
export function renderPattern(
  pattern: string,
  on: { year: number; month: number; day: number },
): string {
  const when = moment.utc(on);

  return split(pattern, tokenCache())
    .map((piece) => (piece.isToken ? when.format(piece.text) : piece.text))
    .join("");
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
  tokens: Record<string, string>;
  /** Longest token first, so MMMM is never read as MMM followed by a stray M. */
  tokenRe: RegExp;
  /** Compiled regex source per pattern, valid only for this locale. */
  sources: Map<string, string>;
}

let cache: TokenCache | null = null;

function tokenCache(): TokenCache {
  const locale = moment.locale();
  if (cache !== null && cache.locale === locale) return cache;

  const tokens = buildTokenPatterns();
  const names = Object.keys(tokens).sort((a, b) => b.length - a.length);

  cache = { locale, tokens, tokenRe: new RegExp(names.join("|"), "g"), sources: new Map() };
  return cache;
}

function buildTokenPatterns(): Record<string, string> {
  return {
    YYYY: "\\d{4}",
    YY: "\\d{2}",
    MMMM: alternation(moment.months()),
    MMM: alternation(moment.monthsShort()),
    MM: "\\d{2}",
    M: "\\d{1,2}",
    DD: "\\d{2}",
    Do: alternation(ordinals()),
    D: "\\d{1,2}",
    dddd: alternation(moment.weekdays()),
    ddd: alternation(moment.weekdaysShort()),
    dd: alternation(moment.weekdaysMin()),
    d: "\\d",
  };
}

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
function ordinals(): string[] {
  const locale = moment.localeData();
  return Array.from({ length: 31 }, (_, i) => locale.ordinal(i + 1));
}

/** Longest name first, so a short name never shadows a longer sibling. */
function alternation(names: string[]): string {
  const ordered = [...names].sort((a, b) => b.length - a.length).map(escapeLiteral);
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
