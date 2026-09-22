import { moment } from "obsidian";

/** One language the reader can turn on: what to store, and what to show. */
export interface LocaleChoice {
  /** moment's locale code, which is what `languages` stores. */
  code: string;
  /** The language's name in the reader's own language, or the code itself. */
  name: string;
}

/**
 * The languages worth offering, from the codes moment carries.
 *
 * The codes are handed in rather than read here. `moment.locales()` answers
 * with what has been *loaded* — 139 in Obsidian, which preloads them all, and
 * one under Node until something touches a locale — so a module calling it
 * itself could not be tested at all. Handing the data in is the rule
 * `absolute.ts` already follows for month names, for the same reason.
 *
 * **Deduplicated on the names, not on the code.** moment carries `en-gb`,
 * `en-au`, `en-ca` and `en-ie` alongside `en`, and `de-ch` alongside `de`,
 * with month and weekday names identical to their parent. Twenty-five of the
 * 139 are duplicates by that measure, and a row that changes nothing about
 * what can be typed is noise in a list already 111 long. The first code to
 * carry a set of names keeps it. `de-at` survives, because it really does
 * write Jänner.
 *
 * Names come from `Intl.DisplayNames`, which answers in the reader's own
 * language. That is the only reason offering every language is affordable at
 * all: a list of 111 adds no strings for anyone to translate.
 */
export function localeChoices(codes: readonly string[], uiLanguage: string): LocaleChoice[] {
  const display = displayNames(uiLanguage);
  const byNames = new Map<string, string>();

  for (const code of codes) {
    // Dropped where the platform has no name for it. moment carries a handful
    // of codes CLDR does not name — `x-pseudo`, a locale for testing; `tzl`,
    // a constructed language; `me` and `oc-lnc`, which CLDR spells otherwise
    // — and a row reading only `x-pseudo` is not a choice anyone can make.
    // Klingon and Tetum survive this, and should: they are named languages
    // somebody may well write in.
    if (display(code) === null) continue;

    const names = nameSet(code);
    const held = byNames.get(names);
    if (held === undefined || plainer(code, held)) byNames.set(names, code);
  }

  const survivors = [...byNames.values()];

  return survivors
    .map((code) => ({ code, name: label(code, survivors, display) }))
    .sort((a, b) => a.name.localeCompare(b.name, uiLanguage));
}

/**
 * What a language is called, with its region or script only where that is
 * telling the reader something.
 *
 * moment ships no bare `zh`, `hy`, `pa` or `ug`, so those arrive as `zh-cn`,
 * `hy-am`, `pa-in` and `ug-cn` and `Intl.DisplayNames` dutifully answers
 * "Chinese (China)" and "Armenian (Armenia)". There being only one Armenian
 * on the list, the country says nothing and reads as a mistake.
 *
 * Where several codes of one language do survive, the qualifier is the whole
 * point and is kept: the four Arabics write different month names, Brazilian
 * and European Portuguese differ, and Serbian, Konkani, Tamazight and Uzbek
 * each come in two scripts. Those rows are real choices, and only their
 * labels tell them apart.
 */
function label(
  code: string,
  survivors: readonly string[],
  display: (code: string) => string | null,
): string {
  const language = code.split("-")[0];
  // Every survivor of this language, this one included — not "every *other*
  // regional code", which missed the bare `pt` sitting beside `pt-br` and made
  // Brazilian Portuguese answer to plain Portuguese.
  const kin = survivors.filter((other) => other.split("-")[0] === language);
  const alone = kin.length === 1;

  return (alone ? display(language) : null) ?? (display(code) as string);
}

/**
 * Whether one code is the plainer way to name a set of month and weekday
 * names, where several codes share them.
 *
 * Fewest subtags wins, then the shorter, then alphabetical order to settle
 * the rest. Not "whichever came first": moment lists `es-do`, `es-mx` and
 * `es-us` ahead of `es`, and `it-ch` ahead of `it`, so taking the first left
 * the list offering Spanish (Dominican Republic) and Italian (Switzerland)
 * while Spanish and Italian were nowhere in it.
 */
function plainer(code: string, than: string): boolean {
  const parts = (value: string) => value.split("-").length;
  if (parts(code) !== parts(than)) return parts(code) < parts(than);
  if (code.length !== than.length) return code.length < than.length;

  return code < than;
}

/**
 * Every month and weekday name a locale has, as one string to compare on.
 *
 * No answer here for "moment does not carry this code": `localeData` falls
 * back to English rather than returning null, so a code with no data of its
 * own arrives carrying en's names and is dropped by the deduplication above.
 * That is the behaviour wanted and it needs no check — only this note, because
 * the obvious reading of the code is that every code survives.
 *
 * One moment, moved rather than twelve made: `clone()` is cheap and the month
 * a locale answers for is the month the moment is set to.
 */
function nameSet(code: string): string {
  const data = moment.localeData(code);
  const when = moment.utc({ year: 2026, month: 0, day: 1 });
  const months = MONTHS.map((month) => data.months(when.clone().month(month)));
  const weekdays = WEEKDAYS.map((day) => data.weekdays(when.clone().day(day)));

  return [...months, ...weekdays].join("|");
}

/**
 * A name for a language code, or null where the platform has none.
 *
 * `Intl.DisplayNames` throws a RangeError on a tag it cannot read and returns
 * undefined for one it simply has no name for. Both mean the same thing here
 * and both answer null, which is what drops the row: there is no honest way to
 * offer a language whose name we cannot say in the reader's own.
 */
function displayNames(uiLanguage: string): (code: string) => string | null {
  const names = new Intl.DisplayNames([uiLanguage], {
    type: "language",
    fallback: "none",
    // "Portuguese (Brazil)", not the default "Brazilian Portuguese". Two
    // reasons, and the second is the stronger: it is the form a reader expects
    // from a language picker, and it sorts every variant next to its parent
    // rather than filing Brazilian Portuguese under B and Austrian German
    // under A, half a list away from the language they qualify.
    languageDisplay: "standard",
  });

  return (code) => {
    try {
      return names.of(code) ?? null;
    } catch {
      return null;
    }
  };
}

const MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
