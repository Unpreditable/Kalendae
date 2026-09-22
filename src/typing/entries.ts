import { DateFormatEntry, renderPattern } from "../detect/formats";
import { DayKey } from "../picker/month";
import { Rule, canonicalTyped, parseTyped, resolveRule, suggestionsFor } from "../picker/quick";
import { Spelling, absoluteDates } from "./absolute";
import { countRefused, rulesFromWords } from "./words";

/**
 * What a typed query puts in the list.
 *
 * Pure, and free of i18n on purpose: names arrive as data from whoever built
 * them, and a step row carries its rule rather than its wording, so the one
 * place that calls `t()` is the renderer. That keeps every rule about what a
 * query means testable with plain objects.
 */

/** A date with a name someone can type: the catalogue's, and later the reader's own. */
export interface NamedDate {
  /** What the row reads, and what a query is matched against. */
  label: string;
  /**
   * The stored spelling, anchored on `today` — or null for today itself.
   *
   * Null because `today` alone is not a rule and should not become one: the
   * calendar's Today button is permanent, so a shortcut that moves nowhere
   * would duplicate a button already on screen, and `parseRule` says so. Typing
   * is the one place that row is worth having, and it needs no rule to resolve:
   * the day is today.
   */
  rule: string | null;
  /**
   * Extra spellings this row answers to, never shown.
   *
   * How a weekday becomes typable in a language the reader turned on. The row
   * already exists and is already labelled in the app's own language — what an
   * enabled language adds is another way to reach it, which is exactly what an
   * alias is. Teaching `quick.ts` the names instead would put a Spanish
   * weekday into the parser the settings builder shares, where a stored rule
   * is `today +1Fri` in every language.
   *
   * Each carries its language, so a row reached by `пятница` is written in
   * Russian. The label carries none: it is in the app's own language already.
   */
  aliases?: readonly Spelling[];
}

export interface EntryContext {
  today: DayKey;
  /** The week's first day as moment counts them, from `firstDayOf(settings.weekStart)`. */
  firstDay: number;
  names: NamedDate[];
  /**
   * Every spelling each month answers to in the languages in force, January
   * first, the app's own language leading. Handed through to `absoluteDates`,
   * which adds English itself.
   */
  months: readonly (readonly Spelling[])[];
  /** The formats a date can be written in, in the order settings lists them. */
  formats: readonly DateFormatEntry[];
  /** The character that turns a resolved query into the list of those formats. */
  formatChar: string;
}

/**
 * On the three rows that can carry one, `locale` is the language the date is to
 * be written in. Undefined means nothing typed named a language, and the app's
 * own is used — see `localeOf`.
 */
export type Entry =
  | {
      kind: "named";
      label: string;
      keyword: string;
      complete: string;
      day: DayKey;
      rule: Rule | null;
      locale?: string;
    }
  | { kind: "step"; keyword: string; complete: string; day: DayKey; rule: Rule }
  // Nothing but the day: the row shows no keyword by design, Tab writes rather
  // than completes on it, and its label is a word rather than a reading. The
  // fields the other rows need would all be dead weight here.
  | { kind: "accept"; day: DayKey }
  // A day named outright: no rule behind it, so no gloss and no keyword. Its
  // `complete` is null once nothing is missing, which is how Tab knows to write
  // rather than to fill the rest in.
  | { kind: "date"; day: DayKey; complete: string | null; locale: string }
  // One day, written one way. `text` is that day already rendered, because the
  // row shows it and nothing else about the format is worth a column; the
  // pattern rides along for the write.
  | { kind: "format"; pattern: string; text: string; day: DayKey; locale?: string }
  // `reason` is the difference between "that is not a date" and "that is a
  // date with a number I cannot take", which are different things to be told.
  | { kind: "invalid"; reason?: "count" };

/**
 * The rows for a query, never empty.
 *
 * The format switch is asked first and everything else falls through it, which
 * is also what keeps a second format character from being read as a second
 * switch: nothing below here re-enters it.
 */
export function entriesFor(query: string, context: EntryContext): Entry[] {
  const chosen = formatEntries(query, context);
  if (chosen !== null) return chosen.length === 0 ? [{ kind: "invalid" }] : chosen;

  return ordinaryEntries(query, context);
}

/**
 * The day in each format, when the query asks for that, and null when it does
 * not ask.
 *
 * Null rather than an empty list, because "not asking" and "asking and getting
 * nothing" are different answers: the first falls through to the ordinary rows
 * and the second is an invalid row. Nothing happens at all with one format in
 * the list, which is the default — a menu offering one choice is not a choice.
 */
function formatEntries(query: string, context: EntryContext): Entry[] | null {
  if (context.formats.length < 2) return null;

  const at = query.indexOf(context.formatChar);
  if (at === -1) return null;

  const source = sourceFor(query.slice(0, at), context);
  if (source === null) return null;

  const { day, locale } = source;
  const wanted = query.slice(at + context.formatChar.length).toLowerCase();

  // Rendered in the language the day was read in, so `@ноя 3_` offers the
  // dates as Russian writes them and narrows on that text.
  return context.formats.flatMap((format): Entry[] => {
    const text = renderPattern(format.pattern, day, locale);

    return text.toLowerCase().startsWith(wanted)
      ? [{ kind: "format", pattern: format.pattern, text, day, locale }]
      : [];
  });
}

/**
 * The day the switch acts on, and the language it was read in: the first row
 * the text in front of it answers with.
 *
 * The first row, not the only row. On a desktop the character is a key, and by
 * the time this reads the text the handler has already completed the
 * highlighted row into it — so the first row is that row. Where no key event
 * arrives at all, as on a mobile keyboard, the first row is the one Enter would
 * have taken anyway. Either way it is a single day, which is what an earlier
 * draft's "exactly one row" test was reaching for and refused too much to get:
 * it left the switch inert on every query that answered more than once.
 */
function sourceFor(
  query: string,
  context: EntryContext,
): { day: DayKey; locale: string | undefined } | null {
  const [first] = ordinaryEntries(query, context);

  return first.kind === "invalid" ? null : { day: first.day, locale: localeOf(first) };
}

/**
 * The language a row is written in, or undefined for the app's own.
 *
 * Only a name that belongs to one language sets it: a month or weekday typed in
 * Russian is written in Russian. A step, a phrase and Accept name no language,
 * and neither does a label, which is the app's own already.
 */
export function localeOf(entry: Entry): string | undefined {
  return entry.kind === "named" || entry.kind === "date" || entry.kind === "format"
    ? entry.locale
    : undefined;
}

/**
 * Every row a query reaches that is not a format.
 *
 * Names are matched first and on the whole query, because a name may contain
 * spaces and so may a chain: `end of` is a name half-typed and `2w Eo` is a
 * rule half-typed, and trying rules first would call the former broken while
 * the reader is spelling it correctly.
 *
 * A named day leads the list only where nothing else answered the query;
 * otherwise it goes last. The rule was once "a day with a two-letter-or-longer
 * month leads", but a sweep of the shipped locales found a collision that
 * defeats it: in Lithuanian, `3 sa` names both 3 January (`sausis`) and
 * `+3Sat`, so the specific-looking reading would take Enter from three
 * Saturdays on — the exact harm the weak tier exists to prevent. Whether
 * another source answered is a fact about the *query*, not about which month
 * matched it, so the named-day rows go on the end of the other three: last
 * where those answered, and the whole list where they did not.
 *
 * Nothing here closes the menu. A query that matches nothing is a row saying
 * so, which is what leaves backspace able to repair it.
 */
function ordinaryEntries(query: string, context: EntryContext): Entry[] {
  // One set for the whole list rather than one per source. A date can be
  // reached as a name and as tokens — "End of this month" is `EoM` — and
  // whichever reaches it first is the row worth keeping, so the order never has
  // to be redone afterwards.
  const seen = new Set<string>();
  const opening = namesAllowed(query);
  const named = opening ? namedEntries(query, context, seen) : [];
  const words = opening ? wordEntries(query, context, seen) : [];
  const entries = [
    ...named,
    ...words,
    ...stepEntries(query, context, seen),
    ...dateEntries(query, context),
  ];
  if (entries.length > 0) return withoutRepeatedWeekdays(entries);

  return [countRefused(query) ? { kind: "invalid", reason: "count" } : { kind: "invalid" }];
}

/**
 * The rows a named day reaches.
 *
 * No deduplication against the other three sources. A row from here carries no
 * rule, so it has nothing to key on, and nothing else in the list reaches a day
 * this way: two rows of one query are different years by construction.
 */
function dateEntries(query: string, context: EntryContext): Entry[] {
  return absoluteDates(query, context).map((row) => ({
    kind: "date",
    day: row.day,
    complete: row.complete,
    locale: row.locale,
  }));
}

function namedEntries(query: string, context: EntryContext, seen: Set<string>): Entry[] {
  const wanted = query.trim().toLowerCase();

  return context.names.flatMap((name): Entry[] => {
    if (!matchesName(name, wanted)) return [];

    // Two names can hold one rule: the catalogue's Tomorrow and the generated
    // "1 day on" are both `+1d`. The curated one is listed first and is the one
    // that stays.
    const claim = name.rule ?? "today";
    if (seen.has(claim)) return [];
    seen.add(claim);

    if (name.rule === null) {
      return [
        {
          kind: "named",
          label: name.label,
          keyword: "today",
          complete: "today ",
          day: context.today,
          rule: null,
        },
      ];
    }

    const rule = parseTyped(name.rule);
    if (rule === null) return [];

    const keyword = keywordOf(name.rule);

    return [
      {
        kind: "named",
        label: name.label,
        keyword,
        complete: `${keyword} `,
        day: dayOf(rule, context),
        rule,
        locale: aliasLocale(name, wanted),
      },
    ];
  });
}

/**
 * The rows a phrase reaches.
 *
 * A phrase is the whole query and only ever the first thing in it, the same
 * gate a name passes — `@next friday eow` is four words and no phrase, and the
 * way to that date is Tab after `@next friday`, which leaves the canonical
 * `+1Fri ` in the note for `eow` to follow.
 *
 * A space after a phrase is not the same invitation a space after a token is.
 * `@2w ` offers Accept and the steps that could follow, because `2w` is already
 * the spelling a step is written in; `@next friday ` offers the date itself and
 * nothing to chain onto it, because the words are not that spelling. Tab is
 * what turns one into the other, and is the only route on.
 *
 * The row is a step row: it carries a rule, so it reads back in the reader's
 * own language through that rule's gloss rather than through the English that
 * found it, and Tab writes the canonical spelling rather than the words.
 */
function wordEntries(query: string, context: EntryContext, seen: Set<string>): Entry[] {
  return rulesFromWords(query).flatMap((tail): Entry[] => {
    const canonical = `today ${tail}`;
    if (seen.has(canonical)) return [];

    const rule = parseTyped(tail);
    if (rule === null) return [];

    seen.add(canonical);

    return [{ kind: "step", keyword: tail, complete: `${tail} `, day: dayOf(rule, context), rule }];
  });
}

/**
 * The rule rows: the chain as it stands, then every token that could stand
 * where the caret is.
 *
 * Each row carries the token it would add rather than the whole chain: that is
 * what the middle column shows, and what Tab appends to the text already there.
 * The chain as it stands is the exception — before a space it is the answer,
 * after one it is the row that accepts. See the comment on that push below.
 */
function stepEntries(query: string, context: EntryContext, seen: Set<string>): Entry[] {
  if (query.trim() === "") return [];

  const head = query.slice(0, lastTokenStart(query));
  const partial = query.slice(lastTokenStart(query));

  const asTyped = [{ text: query, token: null }];
  const offered = completions(head, partial).flatMap((token) => twinned(head, partial, token));

  const entries: Entry[] = [];

  for (const candidate of [...asTyped, ...offered]) {
    const resolved = resolve(candidate.text, context);
    if (resolved === null) continue;

    // The bare anchor is a day but not a rule, so it has nothing to gloss. It
    // needs no row of its own before the space — the Today name is right there
    // — and after one it can only be the row that accepts.
    if (resolved.rule === null && !query.endsWith(" ")) continue;

    const canonical = canonicalTyped(candidate.text) ?? "today";
    if (seen.has(canonical)) continue;

    const rule = resolved.rule;
    seen.add(canonical);

    // The row for what is already typed. Before the space it is the answer —
    // `@Sun` means this Sunday and Enter writes it. After the space the reader
    // has asked for another step, so it stays only as the way back: an explicit
    // "leave it as it is", first in the list, one Enter away.
    if (candidate.token === null) {
      // Written as two pushes rather than one with a computed `kind`: the rows
      // carry different fields, and a union narrows on a literal.
      if (query.endsWith(" ")) entries.push({ kind: "accept", day: resolved.day });
      else if (rule !== null) {
        entries.push({
          kind: "step",
          // The token it ends on, not the chain that got there: `@2w eow` is a
          // row that says `EoW`, because `+2w` is on screen already.
          keyword: lastTokenOf(canonical),
          complete: `${query.trim()} `,
          day: resolved.day,
          rule,
        });
      }

      continue;
    }

    if (rule === null) continue;

    entries.push({
      kind: "step",
      keyword: candidate.token,
      // What the reader typed is kept exactly as they typed it, and the token
      // goes on the end. Rewriting `today +1d` as `+1d` because the anchor is
      // implicit takes away a word they chose to type.
      complete: `${head}${candidate.token} `,
      day: resolved.day,
      rule,
    });
  }

  return entries;
}

/**
 * Whether a name or a phrase can still be what is being typed.
 *
 * First position only. Today, Tomorrow and Yesterday are places to start from,
 * not steps to add, and offering Today again after `@today ` offers to start
 * over.
 *
 * The question is asked of everything before the last word **together**, not of
 * each word in turn. A word can be a step on its own and no step at all in
 * company: `friday` is `Fri`, but `next friday` is a phrase, and asking word by
 * word made `@next friday ` an invalid date while `@next friday` was a date —
 * the sort of rule a reader can only experience as randomness.
 */
function namesAllowed(query: string): boolean {
  const head = query.slice(0, lastTokenStart(query)).trim();

  return head === "" || (head.toLowerCase() !== "today" && canonicalTyped(head) === null);
}

/**
 * A token, and the same token the other way when nothing said which way.
 *
 * `2w` is the token spelling of what `2 weeks` says in words, and the words are
 * already offered both ways — an unsigned count names no direction, so the list
 * shows each one. A sign the reader typed settles it and the twin does not
 * appear: `-2w` is back and `+2w` is on, and neither is a question.
 *
 * The twin follows its own row rather than trailing at the end of the list, so
 * the pairs read subject by subject: two weeks on, two weeks back, two
 * Wednesdays on, two Wednesdays back.
 */
function twinned(head: string, partial: string, token: string): { text: string; token: string }[] {
  const row = { text: `${head}${token}`, token };
  if (!/^[0-9]/.test(partial) || !token.startsWith("+")) return [row];

  const back = `-${token.slice(1)}`;

  return [row, { text: `${head}${back}`, token: back }];
}

/**
 * Every token that could complete the one the caret is in.
 *
 * Two translations happen here, both from the typed spelling into the stored
 * one `suggestionsFor` speaks. The anchor goes on the front, since that grammar
 * has one and this one does not. And an unsigned count gets its `+` before being
 * offered: `suggestionsFor` builds its candidates from the sign and digits
 * already typed, so a bare `2` would come back offering `+1d` — every step for a
 * count of one, none of them matching what was typed.
 */
function completions(head: string, partial: string): string[] {
  const typed = /^[0-9]/.test(partial) ? `+${partial}` : partial;
  const text = `today ${head}${typed}`;

  // Filtered again, and deliberately. `suggestionsFor` hands back every token
  // unfiltered once the one under the caret is complete, so that the builder in
  // settings can offer what could stand *instead* — stand in `Sun` there and
  // every weekday is on the menu. Typing asks the other question: `@Sun` has
  // been answered, and twenty-seven ways to un-answer it are not a list.
  return suggestionsFor(text, text.length).filter((token) =>
    token.toLowerCase().startsWith(typed.toLowerCase()),
  );
}

function lastTokenStart(query: string): number {
  return query.lastIndexOf(" ") + 1;
}

/**
 * Whether a name answers to what has been typed.
 *
 * Any word of the name, not only its first: the useful half of "Next Friday" is
 * the half a reader types, and `friday` finding nothing was the surprise that
 * put this here. The whole label is matched too, so a query with spaces of its
 * own — `end of this` — still narrows the way it reads.
 */
function matchesName(name: NamedDate, wanted: string): boolean {
  if (wanted === "") return true;

  return [name.label, ...(name.aliases ?? []).map((alias) => alias.text)].some((spelling) =>
    matchesSpelling(spelling, wanted),
  );
}

/**
 * The language of the alias that reached a row, or undefined where the label
 * did.
 *
 * The label is asked first because it is the app's own language, and the app's
 * own wins wherever two read what was typed. After it, the first alias that
 * matches — which is why the caller lists the app's language first among them
 * too.
 */
function aliasLocale(name: NamedDate, wanted: string): string | undefined {
  if (wanted === "" || matchesSpelling(name.label, wanted)) return undefined;

  return name.aliases?.find((alias) => matchesSpelling(alias.text, wanted))?.locale;
}

/** One spelling against what has been typed, on the whole or on any word. */
function matchesSpelling(spelling: string, wanted: string): boolean {
  const lower = spelling.toLowerCase();

  return lower.startsWith(wanted) || lower.split(" ").some((word) => word.startsWith(wanted));
}

/**
 * The day a query lands on, and the rule that got it there.
 *
 * `today` on its own is the exception the whole function exists for: it is a
 * date a reader can mean — `@today ` — but not a rule, because a step that
 * moves nowhere is not a step. Null rule, real day.
 */
function resolve(text: string, context: EntryContext): { day: DayKey; rule: Rule | null } | null {
  if (text.trim().toLowerCase() === "today") return { day: context.today, rule: null };

  const rule = parseTyped(text);

  return rule === null ? null : { day: dayOf(rule, context), rule };
}

function dayOf(rule: Rule, context: EntryContext): DayKey {
  return resolveRule(rule, {
    value: context.today,
    today: context.today,
    firstDay: context.firstDay,
  });
}

/**
 * One row per weekday, per day.
 *
 * `Fri` and `+1Fri` are the same date on every day but Friday — the nearest one
 * counting today, and the next one not counting today. Offering both is
 * offering one answer twice under two names a reader cannot tell apart, so the
 * second is dropped. Only rules that are a single weekday step claim a day:
 * Next Friday and End of week land together often enough, and they mean
 * different things.
 */
function withoutRepeatedWeekdays(entries: Entry[]): Entry[] {
  const taken = new Set<string>();

  return entries.filter((entry) => {
    if (entry.kind !== "named" && entry.kind !== "step") return true;
    if (entry.rule === null || entry.rule.steps.length !== 1) return true;
    if (entry.rule.steps[0].kind !== "weekday") return true;

    const day = `${entry.day.year}-${entry.day.month}-${entry.day.day}`;
    if (taken.has(day)) return false;
    taken.add(day);

    return true;
  });
}

function lastTokenOf(text: string): string {
  return text.slice(text.lastIndexOf(" ") + 1);
}

/** The keyword a row advertises: the stored rule without the anchor nobody types. */
function keywordOf(rule: string): string {
  return rule.startsWith("today ") ? rule.slice("today ".length) : rule;
}
