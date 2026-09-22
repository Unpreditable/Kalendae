# Languages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One list of languages in settings; turning one on makes its month and weekday names typable in the date list and detectable in a note.

**Architecture:** The catalogue of languages is a pure module handed moment's locale codes as data, because `moment.locales()` returns only what has been touched — 1 under Node, 139 in Obsidian. Typing reaches the new names through data it already takes (`EntryContext.months`) plus one new field (`NamedDate.aliases`); detection reaches them through a module-level locale set on `formats.ts`, keyed into the cache that is already there. `quick.ts` is not modified: the token spelling stays ASCII in every language.

**Tech Stack:** TypeScript, Obsidian 1.13 API (`getSettingDefinitions`, `SettingPage`), moment (via `obsidian`), `Intl.DisplayNames`, i18next, Jest + ts-jest.

**Spec:** [docs/superpowers/specs/2026-09-19-languages-design.md](../specs/2026-09-19-languages-design.md)

## Global Constraints

- **Commits are proposed, never made.** Show the message and wait for an explicit yes before running `git commit`. Feature-level bullets of what changed, never why. No `Claude-Session` trailer.
- **English only until the end.** `src/i18n/locales/en.json` is the only locale to touch until Task 7. `npm run validate-translations` and `npm run release-check` fail before then, by design; use `npm run build` and `npm test` during the work.
- **Every user-visible string goes through `t()`** and gets a `<key>_comment` sibling in `en.json` explaining its context to translators.
- **`moment.utc(...)`, never a bare `moment(...)`** — the namespace stays callable under the Jest tsconfig's `esModuleInterop`, which the build tsconfig does not set.
- **Never mutate the global moment locale.** `moment.locale(x)` changes what Obsidian itself formats with. Use `moment.localeData(code)` to read another locale's names and `moment.utc(text, pattern, code, true)` to parse in one. Both were verified not to touch the global locale.
- **Never bundle `@codemirror/state`, `@codemirror/view` or `@codemirror/language`** — they stay in the `external` list in `esbuild.config.mjs`.
- **CSS:** no `!important`, no inline styles, no `column-gap` (use the `gap` shorthand), Obsidian CSS variables for every colour, font and space. A heading carrying a `border-top` also needs `border-radius: 0`, or `--setting-items-radius` draws a rounded box instead of a rule.
- **Settings tab implements `getSettingDefinitions()` only.** No `display()` fallback. Prefer a declarative `control` over `render`. The field is `desc`, not `description`.
- **Tests are pure logic only** — no Obsidian API, no DOM, no editor. `tests/__mocks__/obsidian.ts` stands in for the `obsidian` module and re-exports the real moment.
- **English is always in force** and is never written to `data.json`.

---

### Task 1: The catalogue of languages

The list the page offers: moment's locale codes, minus the ones whose month and weekday names duplicate another's, each with a name in the reader's own language.

**Files:**
- Create: `src/i18n/languages.ts`
- Test: `tests/i18n/languages.test.ts`

**Interfaces:**
- Produces: `interface LocaleChoice { code: string; name: string }` and
  `localeChoices(codes: readonly string[], uiLanguage: string): LocaleChoice[]`.
- `codes` is handed in rather than read from `moment.locales()`, because that call answers with what has been *loaded*: 1 under Node at startup, 139 in Obsidian. Handing it in is also what makes this module testable at all, and it is the same rule `absolute.ts` already follows for month names.

- [x] **Step 1: Write the failing test**

Create `tests/i18n/languages.test.ts`:

```ts
import { localeChoices } from "../../src/i18n/languages";

describe("localeChoices", () => {
  it("drops a locale whose names duplicate another's, keeping the first", () => {
    const codes = localeChoices(["en", "en-gb", "en-au", "de"], "en").map((c) => c.code);

    expect(codes).toContain("en");
    expect(codes).toContain("de");
    expect(codes).not.toContain("en-gb");
    expect(codes).not.toContain("en-au");
  });

  it("keeps a variant whose names really differ", () => {
    // de-at renames January and February; de-ch does not.
    const codes = localeChoices(["de", "de-at", "de-ch"], "en").map((c) => c.code);

    expect(codes).toContain("de");
    expect(codes).toContain("de-at");
    expect(codes).not.toContain("de-ch");
  });

  it("names each language in the reader's own", () => {
    const named = (codes: string[], ui: string) =>
      Object.fromEntries(localeChoices(codes, ui).map((c) => [c.code, c.name]));

    expect(named(["de", "fr"], "en")).toEqual({ de: "German", fr: "French" });
    expect(named(["de"], "ru").de).toBe("немецкий");
  });

  it("falls back to the code where there is no name for it", () => {
    const [only] = localeChoices(["x-pig-latin"], "en");

    expect(only.name).toBe("x-pig-latin");
  });

  it("sorts by the displayed name, not by the code", () => {
    const names = localeChoices(["ru", "de", "fr"], "en").map((c) => c.name);

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("drops a code moment does not carry, on the names it falls back to", () => {
    // `moment.localeData` answers with the English locale for a code it has no
    // data for, rather than with null. So a bogus code arrives carrying en's
    // names and is deduplicated away by them, needing no check of its own.
    expect(localeChoices(["en", "not-a-locale"], "en").map((c) => c.code)).toEqual(["en"]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/i18n/languages.test.ts`
Expected: FAIL — `Cannot find module '../../src/i18n/languages'`.

- [x] **Step 3: Write the implementation**

Create `src/i18n/languages.ts`:

```ts
import { moment } from "obsidian";

/** One language the reader can turn on: what to store, and what to show. */
export interface LocaleChoice {
  /** moment's locale code, which is what `languages` stores. */
  code: string;
  /** The language's name in the reader's own language, or the code. */
  name: string;
}

/**
 * The languages worth offering, from the codes moment carries.
 *
 * The codes are handed in rather than read here. `moment.locales()` answers
 * with what has been *loaded* — 139 in Obsidian, which preloads them all, and
 * 1 under Node until something touches a locale — so a module that called it
 * itself could not be tested at all.
 *
 * **Deduplicated on the names, not on the code.** moment carries `en-gb`,
 * `en-au`, `en-ca` and `en-ie` alongside `en`, and `de-ch` alongside `de`,
 * with month and weekday names identical to their parent. Twenty-five of the
 * 139 are duplicates by that measure. A row that changes nothing about what
 * can be typed is noise in a list already 111 long, so the first code to carry
 * a set of names keeps it.
 *
 * Names come from `Intl.DisplayNames`, which answers in the reader's own
 * language. That is the only reason offering every language is affordable:
 * a list of 111 adds no strings for anyone to translate.
 */
export function localeChoices(codes: readonly string[], uiLanguage: string): LocaleChoice[] {
  const display = displayNames(uiLanguage);
  const seen = new Set<string>();
  const choices: LocaleChoice[] = [];

  for (const code of codes) {
    const names = nameSet(code);
    if (seen.has(names)) continue;

    seen.add(names);
    choices.push({ code, name: display(code) });
  }

  return choices.sort((a, b) => a.name.localeCompare(b.name, uiLanguage));
}

/**
 * Every month and weekday name a locale has, as one string to compare on.
 *
 * No answer for "moment does not carry this code": `localeData` falls back to
 * English rather than returning null, so a code with no data of its own
 * arrives carrying en's names and is deduplicated away on them. That is the
 * behaviour wanted, and it needs no check — only this note, because the
 * obvious reading of the code is that every code survives.
 */
function nameSet(code: string): string {
  const data = moment.localeData(code);
  const when = moment.utc({ year: 2026, month: 0, day: 1 });
  const months = MONTHS.map((month) => data.months(when.clone().month(month)));
  const weekdays = WEEKDAYS.map((day) => data.weekdays(when.clone().day(day)));

  return [...months, ...weekdays].join("|");
}

/**
 * A name for a language code, falling back to the code itself.
 *
 * `Intl.DisplayNames` throws on a code that is not well-formed and returns
 * undefined for one it simply has no name for, so both are answered the same
 * way: show what is stored. A reader who set an exotic code sees it rather
 * than a blank row.
 */
function displayNames(uiLanguage: string): (code: string) => string {
  const names = new Intl.DisplayNames([uiLanguage], { type: "language", fallback: "none" });

  return (code) => {
    try {
      return names.of(code) ?? code;
    } catch {
      return code;
    }
  };
}

const MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
```

- [x] **Step 4: Run the tests**

Run: `npx jest tests/i18n/languages.test.ts`
Expected: PASS, all six.

- [x] **Step 5: Check the real numbers**

Run:

```bash
node -e "const m=require('moment');require('moment/min/locales.min.js');console.log(m.locales().length)"
```

Expected: 136 for the npm package. Obsidian's own moment carries 139; the point of the check is that the deduplication removes roughly 25 either way, not the exact figure. If it removes none, `nameSet` is wrong.

- [ ] **Step 6: Propose the commit**

```
feat: list the languages a date can be typed in

- Offer every language moment carries, named in your own
```

---

### Task 2: The setting, and what is in force

**Files:**
- Modify: `src/settings.ts` (`KalendaeSettings`, `DEFAULT_SETTINGS`, new `enabledLocales`)
- Modify: `src/main.ts` (seed on first run, in `loadSettings`)
- Test: `tests/settings.test.ts` (append a `describe`)

**Interfaces:**
- `KalendaeSettings` gains `languages: string[]`; default `[]`.
- Produces `enabledLocales(settings: KalendaeSettings): string[]` — the codes in force, English first, deduplicated.

- [x] **Step 1: Write the failing test**

Append to `tests/settings.test.ts`, and add `enabledLocales` to the import list at the top:

```ts
describe("enabledLocales", () => {
  it("always puts English first, whether or not it is stored", () => {
    expect(enabledLocales({ ...DEFAULT_SETTINGS, languages: [] })).toEqual(["en"]);
    expect(enabledLocales({ ...DEFAULT_SETTINGS, languages: ["ru"] })).toEqual(["en", "ru"]);
  });

  it("does not list English twice when data.json holds it anyway", () => {
    expect(enabledLocales({ ...DEFAULT_SETTINGS, languages: ["en", "ru"] })).toEqual(["en", "ru"]);
  });

  it("keeps the reader's order after English", () => {
    const codes = enabledLocales({ ...DEFAULT_SETTINGS, languages: ["ru", "de"] });

    expect(codes).toEqual(["en", "ru", "de"]);
  });

  it("drops a duplicate rather than compiling it twice", () => {
    expect(enabledLocales({ ...DEFAULT_SETTINGS, languages: ["ru", "ru"] })).toEqual(["en", "ru"]);
  });

  it("starts empty, so a fresh install adds nothing to English", () => {
    expect(DEFAULT_SETTINGS.languages).toEqual([]);
  });
});
```

- [x] **Step 2: Run it**

Run: `npx jest tests/settings.test.ts -t enabledLocales`
Expected: FAIL — `enabledLocales is not a function`.

- [x] **Step 3: Implement**

In `src/settings.ts`, add the field to `KalendaeSettings` beside `formats`:

```ts
  /**
   * Locale codes whose month and weekday names can be typed, and are looked
   * for in a note.
   *
   * English is not in here and never is: it is always in force, so storing it
   * would invite a `data.json` that says otherwise. Seeded on first run with
   * the app's own language — see `loadSettings` — so a Russian vault goes on
   * typing `@ноя 3` without anyone visiting settings.
   */
  languages: string[];
```

`DEFAULT_SETTINGS` gains `languages: []`.

Then, beside `commandOnly`:

```ts
/** The one language that is always in force, whatever `languages` holds. */
export const BASE_LOCALE = "en";

/**
 * The locale codes whose names are typable and detectable, English first.
 *
 * English leads because it is the universal fallback: every other language's
 * names are additions to it, and the three languages that number their months
 * — Japanese, Korean, Chinese — have no letter prefix to type at all without
 * it. The reader's own order is kept after that, since it is the order they
 * see on the page.
 */
export function enabledLocales(settings: KalendaeSettings): string[] {
  return [...new Set([BASE_LOCALE, ...settings.languages])];
}
```

- [x] **Step 4: Seed on first run**

In `src/main.ts`, inside `loadSettings`, beside the `weekStart` line that already resolves a region default once:

```ts
      // Seeded once, like weekStart, and an ordinary setting afterwards. A
      // vault reading Russian types `@ноя 3` today; upgrading must not take
      // that away and wait to be asked for it back.
      languages: stored?.languages ?? defaultLanguages(),
```

and a module-level helper in the same file:

```ts
/**
 * The app's own language, unless that is English, which is always in force.
 *
 * `moment.locale()` rather than `getLanguage()`: the names this list governs
 * are moment's, so the code has to be one moment answers to.
 */
function defaultLanguages(): string[] {
  const locale = moment.locale();

  return locale === BASE_LOCALE ? [] : [locale];
}
```

Import `BASE_LOCALE` from `./settings` and `moment` from `obsidian`.

- [x] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.
Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Propose the commit**

```
feat: remember which languages you write dates in

- Start from your Obsidian language, and keep English always
```

---

### Task 3: Typing in the enabled languages

Months widen to the union of the enabled languages; weekdays get aliases on the rows they already have.

**Files:**
- Modify: `src/typing/entries.ts` (`NamedDate.aliases`, `matchesName`)
- Modify: `src/editor/date-suggest.ts` (`monthNames`, `weekdayRows`, `catalogue`)
- Test: `tests/typing/entries.test.ts` (append a `describe`)

**Interfaces:**
- `NamedDate` gains `aliases?: readonly string[]` — extra spellings the row answers to, never rendered.
- `monthNames(locales: string[]): string[][]` and `catalogue(today, firstDay, locales)` in `date-suggest.ts` take the enabled codes.

- [x] **Step 1: Write the failing test**

Append to `tests/typing/entries.test.ts`:

```ts
describe("a row reached by an alias", () => {
  const withAlias: EntryContext = {
    ...context,
    names: [
      { label: "Next Friday", rule: "today +1Fri", aliases: ["viernes", "vie."] },
      { label: "Tomorrow", rule: "today +1d" },
    ],
  };

  it("finds the row by a spelling that is not in its label", () => {
    const [entry] = entriesFor("viernes", withAlias);

    expect(entry).toEqual(
      expect.objectContaining({ kind: "named", label: "Next Friday", keyword: "+1Fri" }),
    );
  });

  it("matches an alias on a prefix, as it matches a label", () => {
    expect(entriesFor("vier", withAlias)[0]).toEqual(
      expect.objectContaining({ kind: "named", label: "Next Friday" }),
    );
  });

  it("ignores case in an alias", () => {
    expect(entriesFor("VIERNES", withAlias)[0]).toEqual(
      expect.objectContaining({ kind: "named", label: "Next Friday" }),
    );
  });

  it("produces one row where the label and an alias both match", () => {
    const both = {
      ...context,
      names: [{ label: "Next Friday", rule: "today +1Fri", aliases: ["friday"] }],
    };

    expect(entriesFor("frid", both)).toHaveLength(1);
  });

  it("never shows the alias", () => {
    const [entry] = entriesFor("viernes", withAlias);

    expect(JSON.stringify(entry)).not.toContain("viernes");
  });

  it("leaves a row with no aliases matching exactly as before", () => {
    expect(entriesFor("tom", withAlias)[0]).toEqual(
      expect.objectContaining({ kind: "named", label: "Tomorrow" }),
    );
  });
});
```

- [x] **Step 2: Run it**

Run: `npx jest tests/typing/entries.test.ts -t "reached by an alias"`
Expected: FAIL on the first case — `viernes` matches no name and produces the invalid row.

- [x] **Step 3: Implement**

In `src/typing/entries.ts`, `NamedDate` gains:

```ts
  /**
   * Extra spellings this row answers to, never shown.
   *
   * How a weekday becomes typable in a language the reader turned on. The row
   * already exists and is already labelled in the app's language — what an
   * enabled language adds is another way to reach it, which is exactly what
   * an alias is. Teaching `quick.ts` the names instead would put a Spanish
   * weekday into the parser the settings builder shares, where a stored rule
   * is `today +1Fri` in every language.
   */
  aliases?: readonly string[];
```

and `matchesName` takes them:

```ts
function matchesName(name: NamedDate, wanted: string): boolean {
  if (wanted === "") return true;

  return [name.label, ...(name.aliases ?? [])].some((spelling) => matchesSpelling(spelling, wanted));
}

/**
 * Whether one spelling answers to what has been typed.
 *
 * Any word of it, not only its first: the useful half of "Next Friday" is the
 * half a reader types, and `friday` finding nothing was the surprise that put
 * this here. The whole spelling is matched too, so a query with spaces of its
 * own — `end of this` — still narrows the way it reads.
 */
function matchesSpelling(spelling: string, wanted: string): boolean {
  const lower = spelling.toLowerCase();

  return lower.startsWith(wanted) || lower.split(" ").some((word) => word.startsWith(wanted));
}
```

The one call site in `namedEntries` becomes `if (!matchesName(name, wanted)) return [];`.

- [x] **Step 4: Run the tests**

Run: `npx jest tests/typing/entries.test.ts`
Expected: PASS, every earlier block included.

- [x] **Step 5: Feed the enabled languages in**

In `src/editor/date-suggest.ts`:

```ts
function monthNames(locales: string[]): string[][] {
  const when = moment.utc({ year: 2026, month: 0, day: 1 });

  return MONTHS.map((month) => {
    const on = when.clone().month(month);

    return [
      ...new Set(
        locales.flatMap((code) => {
          const data = moment.localeData(code);
          if (data === null) return [];

          // The three forms a month answers to: listed, short, and the one the
          // locale writes inside a date. Thirteen of moment's locales decline
          // that third one — Russian lists `ноябрь` and writes `3 ноября` —
          // and a reader types back what they are looking at.
          return [data.months(on), data.monthsShort(on), data.months(on, "D MMMM")];
        }),
      ),
    ];
  });
}

/**
 * Every spelling each weekday answers to, beyond the row's own label.
 *
 * Two forms, not the months' three: no locale moment carries writes a weekday
 * differently inside a date — checked element by element across all of them.
 * The declined Russian `в среду` is reachable only through a format carrying a
 * bracketed preposition, and `checkFormat()` refuses a bracket outright.
 */
function weekdayNames(locales: string[]): string[][] {
  const when = moment.utc({ year: 2026, month: 0, day: 1 });

  return WEEKDAYS.map((day) => {
    const on = when.clone().day(day);

    return [
      ...new Set(
        locales.flatMap((code) => {
          const data = moment.localeData(code);

          return data === null ? [] : [data.weekdays(on), data.weekdaysShort(on)];
        }),
      ),
    ];
  });
}

const MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
```

`weekdayRows(today, firstDay, aliases)` takes the weekday spellings and puts `aliases: aliases[index]` on every row it builds for that day. `catalogue(today, firstDay, locales)` threads both through. `getSuggestions` calls `enabledLocales(settings)` once and passes the result to `monthNames` and `catalogue`.

Delete the old no-argument `monthNames()` body; its long comment about `moment.months("D MMMM")` moves onto the new one, which is doing the same thing per locale.

- [ ] **Step 6: Try it**

With Spanish turned on by hand in `data.json` (`"languages": ["es"]`), `@viernes` finds the Friday rows and `@septiembre 6` finds 6 September. With it off, both are Invalid date. `@friday` and `@sep 6` are unchanged either way.

- [ ] **Step 7: Propose the commit**

```
feat: type month and weekday names in the languages you chose

- Reach a date by its name in any language you have turned on
```

---

### Task 4: Detecting a date in the enabled languages

**Files:**
- Modify: `src/detect/formats.ts` (`setDetectionLocales`, the cache key, `buildTokenPatterns`, `parsesStrictly`, `monthSpellings`)
- Modify: `src/main.ts` (tell `formats.ts` the locales on load and on save)
- Test: `tests/detect/formats.test.ts`, `tests/detect/scan.test.ts`

**Interfaces:**
- Produces `setDetectionLocales(codes: string[]): void` — the codes the alternation and the strict parse span. Defaults to `["en"]` until called, so a test that never calls it behaves as the module does today.

- [x] **Step 1: Write the failing test**

Append to `tests/detect/formats.test.ts`:

```ts
describe("month names from a language that was turned on", () => {
  afterEach(() => {
    setDetectionLocales(["en"]);
  });

  it("matches a Spanish month once Spanish is on, and not before", () => {
    const matcher = () => compileFormat("D MMMM YYYY").regex;

    setDetectionLocales(["en"]);
    expect("6 septiembre 2026".match(matcher())).toBeNull();

    setDetectionLocales(["en", "es"]);
    expect("6 septiembre 2026".match(matcher())?.[0]).toBe("6 septiembre 2026");
  });

  it("keeps English matching when another language is added", () => {
    setDetectionLocales(["en", "es"]);

    expect("6 September 2026".match(compileFormat("D MMMM YYYY").regex)?.[0]).toBe(
      "6 September 2026",
    );
  });

  it("takes both spellings of a language that declines its months", () => {
    setDetectionLocales(["en", "uk"]);
    const regex = () => compileFormat("D MMMM YYYY").regex;

    expect("6 вересня 2026".match(regex())?.[0]).toBe("6 вересня 2026");
    expect("6 вересень 2026".match(regex())?.[0]).toBe("6 вересень 2026");
  });

  it("rebuilds when the set changes rather than serving a stale regex", () => {
    setDetectionLocales(["en", "es"]);
    expect("6 septiembre 2026".match(compileFormat("D MMMM YYYY").regex)).not.toBeNull();

    setDetectionLocales(["en"]);
    expect("6 septiembre 2026".match(compileFormat("D MMMM YYYY").regex)).toBeNull();
  });
});

describe("parsesStrictly, across the enabled languages", () => {
  afterEach(() => {
    setDetectionLocales(["en"]);
  });

  it("accepts a date written in a language that is on", () => {
    setDetectionLocales(["en", "fr"]);

    expect(parsesStrictly("6 septembre 2026", "D MMMM YYYY")).toBe(true);
  });

  it("refuses the same date when that language is off", () => {
    setDetectionLocales(["en"]);

    expect(parsesStrictly("6 septembre 2026", "D MMMM YYYY")).toBe(false);
  });

  it("still accepts the declined spelling a locale writes", () => {
    setDetectionLocales(["en", "uk"]);

    expect(parsesStrictly("6 вересня 2026", "D MMMM YYYY")).toBe(true);
  });

  it("refuses a day the month does not have, in any language", () => {
    setDetectionLocales(["en", "fr"]);

    expect(parsesStrictly("31 septembre 2026", "D MMMM YYYY")).toBe(false);
  });
});
```

Append to `tests/detect/scan.test.ts`:

```ts
describe("a note written in a language that was turned on", () => {
  const formats = [{ id: "long", pattern: "D MMMM YYYY" }];

  afterEach(() => {
    setDetectionLocales(["en"]);
  });

  it("finds a Spanish date with Spanish on and none with it off", () => {
    const text = "Vence el 6 septiembre 2026 sin falta.";

    setDetectionLocales(["en", "es"]);
    expect(scanText(text, formats).filter((c) => c.accepted)).toHaveLength(1);

    setDetectionLocales(["en"]);
    expect(scanText(text, formats).filter((c) => c.accepted)).toHaveLength(0);
  });
});
```

Import `setDetectionLocales` in both files, and `parsesStrictly` in the formats test.

- [x] **Step 2: Run them**

Run: `npx jest tests/detect`
Expected: FAIL — `setDetectionLocales is not a function`.

- [x] **Step 3: Implement the locale set and the cache key**

In `src/detect/formats.ts`, beside `let cache`:

```ts
/**
 * The languages detection reads, English first.
 *
 * A module-level value rather than an argument, because `compileFormat` is
 * called from six places that have no business knowing about settings, and the
 * cache below is already module-level for the same reason. `main.ts` sets it
 * on load and on every save; until then it is English, which is what this
 * module did before there was a list.
 */
let locales: string[] = ["en"];

export function setDetectionLocales(codes: string[]): void {
  if (codes.join("|") === locales.join("|")) return;

  locales = [...codes];
  cache = null;
}
```

`TokenCache` gains `locales: string`, and `tokenCache()` compares both:

```ts
function tokenCache(): TokenCache {
  const locale = moment.locale();
  const key = locales.join("|");
  if (cache !== null && cache.locale === locale && cache.locales === key) return cache;

  const tokens = buildTokenPatterns();
  const names = Object.keys(tokens).sort((a, b) => b.length - a.length);

  cache = {
    locale,
    locales: key,
    tokens,
    tokenRe: new RegExp(names.join("|"), "g"),
    sources: new Map(),
    monthSpellings: monthSpellings(),
  };
  return cache;
}
```

`moment.locale()` stays in the key as well: the app's own language decides `Do`, the ordinal token, which no list governs.

- [x] **Step 4: Widen the alternations**

```ts
/**
 * Every spelling a token can take, across the languages in force.
 *
 * Read through `moment.localeData(code)`, which answers for a named locale
 * without touching the global one — `moment.locale(code)` would change what
 * Obsidian itself formats dates with, which is not a plugin's to change.
 */
function buildTokenPatterns(): Record<string, string> {
  const when = moment.utc({ year: 2026, month: 0, day: 1 });
  const each = <T>(read: (data: moment.Locale, on: moment.Moment) => string, units: number[], set: (on: moment.Moment, unit: number) => moment.Moment) =>
    units.flatMap((unit) =>
      locales.flatMap((code) => {
        const data = moment.localeData(code);
        return data === null ? [] : [read(data, set(when.clone(), unit))];
      }),
    );

  const months = (format?: string) =>
    each((data, on) => (format === undefined ? data.months(on) : data.months(on, format)), MONTHS, (on, m) => on.month(m));
  const monthsShort = (format?: string) =>
    each((data, on) => (format === undefined ? data.monthsShort(on) : data.monthsShort(on, format)), MONTHS, (on, m) => on.month(m));

  return {
    YYYY: "\\d{4}",
    YY: "\\d{2}",
    MMMM: alternation([...months(), ...months("D MMMM")]),
    MMM: alternation([...monthsShort(), ...monthsShort("D MMM")]),
    MM: "\\d{2}",
    M: "\\d{1,2}",
    DD: "\\d{2}",
    Do: alternation(ordinals()),
    D: "\\d{1,2}",
    dddd: alternation(each((data, on) => data.weekdays(on), WEEKDAYS, (on, d) => on.day(d))),
    ddd: alternation(each((data, on) => data.weekdaysShort(on), WEEKDAYS, (on, d) => on.day(d))),
    dd: alternation(each((data, on) => data.weekdaysMin(on), WEEKDAYS, (on, d) => on.day(d))),
    d: "\\d",
  };
}

const MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
```

If that helper reads as too clever once written, unroll it: twelve lines of plain loops beat one line nobody can hold in their head. `alternation` already deduplicates, so a language sharing a name with another costs nothing.

`monthSpellings()` widens the same way, pairing each locale's in-date name with its own listed name — a pair from one locale must never be built against another's list.

- [x] **Step 5: Widen gate 3**

```ts
/**
 * Whether moment's strict parser accepts this text as this pattern.
 *
 * Tried in each language in force, because the strict parser reads the global
 * locale and a Spanish month in an English vault would otherwise be matched by
 * the regex and refused here — the same half-fix TODO 13 left behind, one gate
 * along. The locale argument does not touch the global locale.
 *
 * The listed-spelling retry stays: moment builds its strict table from the
 * standalone names only, so a locale that declines its months refuses the very
 * text the plugin wrote.
 */
export function parsesStrictly(text: string, pattern: string): boolean {
  const listed = listedSpelling(text);

  return locales.some(
    (code) =>
      moment.utc(text, pattern, code, true).isValid() ||
      (listed !== text && moment.utc(listed, pattern, code, true).isValid()),
  );
}
```

- [x] **Step 6: Tell it the locales**

In `src/main.ts`, after `loadSettings()` in `onload` and at the end of `saveSettings()`:

```ts
    setDetectionLocales(enabledLocales(this.settings));
```

Both, not one: the first makes detection right at startup, the second makes it right when the reader turns a language on without reloading.

- [x] **Step 7: Run everything**

Run: `npm test` — PASS.
Run: `npm run build` — clean.

In the app, with Spanish on: a note reading `6 septiembre 2026` and a `D MMMM YYYY` format outlines that date and opens the calendar on it. Turn Spanish off and reopen the note: nothing is outlined.

- [ ] **Step 8: Propose the commit**

```
feat: find dates written in the languages you chose

- Look for month and weekday names in every language you have turned on
```

---

### Task 5: The settings section and the Languages page

**Files:**
- Create: `src/settings/languages-page.ts`
- Modify: `src/settings/settings-tab.ts` (the **Recognising dates** group, both rows)
- Modify: `src/i18n/locales/en.json`
- Modify: `styles.css`

**Interfaces:**
- Produces `LanguagesPage` (a `SettingPage`) and `languagesSummary(settings: KalendaeSettings, uiLanguage: string): string`.

- [x] **Step 1: Rework the group**

In `src/settings/settings-tab.ts`, the group currently headed `settings.scopes.heading` with one nameless row becomes:

```ts
      {
        // Both rows govern both halves of the plugin, which is what earns them
        // one heading. The scope toggles are not detection-only: the typed list
        // reads them too, which is why `@tom` opens nothing in a code block.
        type: "group",
        cls: "kalendae-scope-group",
        heading: t("settings.recognising.heading"),
        items: [
          {
            // Its name back. It was nameless while the heading named it, and a
            // second row under that heading ends the arrangement.
            name: t("settings.scopes.heading"),
            type: "page",
            displayValue: () => scopeSummary(this.kalendae.settings),
            page: () => new SectionsPage(this.kalendae, () => this.update()),
          },
          {
            name: t("settings.languages.heading"),
            type: "page",
            displayValue: () => languagesSummary(this.kalendae.settings, moment.locale()),
            page: () => new LanguagesPage(this.kalendae, () => this.update()),
          },
        ],
      },
```

The comment above that group explaining the nameless row goes; the one above replaces it.

- [x] **Step 2: Write the page**

Create `src/settings/languages-page.ts`:

```ts
import { Setting, SettingPage, moment } from "obsidian";
import { LocaleChoice, localeChoices } from "../i18n/languages";
import { BASE_LOCALE, KalendaeSettings } from "../settings";
import { KalendaeHost } from "./host";
import { t } from "../i18n/i18n";

/**
 * Which languages' month and weekday names can be typed, and are looked for.
 *
 * A search field over the whole list rather than an add-and-remove list. The
 * format list is already the one page here that reads as too much machinery,
 * and this list is four times longer. A search field is one control, and what
 * is on is visible without opening anything.
 */
export class LanguagesPage extends SettingPage {
  private search = "";
  private listEl: HTMLElement | null = null;
  private changed = false;

  constructor(
    private readonly host: KalendaeHost,
    private readonly onChanged: () => void,
  ) {
    super();
    this.title = t("settings.languages.heading");
  }

  /** The tab behind this page shows the names; it has to be told they moved. */
  hide(): void {
    super.hide();
    if (!this.changed) return;
    this.changed = false;
    this.onChanged();
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.addClass("kalendae-settings-page", "kalendae-languages");

    new Setting(this.containerEl)
      .setClass("kalendae-languages-intro")
      .setName(t("settings.languages.description"));

    new Setting(this.containerEl).setName(t("settings.languages.search")).addText((text) =>
      text.setPlaceholder(t("settings.languages.searchPlaceholder")).onChange((value) => {
        this.search = value.trim().toLowerCase();
        this.renderList();
      }),
    );

    this.listEl = this.containerEl.createDiv({ cls: "kalendae-language-list" });
    this.renderList();
  }

  /**
   * English first and immovable, then what is on, then everything else.
   *
   * A reader looking for what they turned on should not have to scroll a list
   * of 111 to find it, and a reader looking for a language they have not
   * turned on is typing rather than scrolling.
   */
  private renderList(): void {
    const list = this.listEl;
    if (list === null) return;
    list.empty();

    const enabled = new Set(this.host.settings.languages);
    const all = localeChoices(moment.locales(), moment.locale());
    const matches = (choice: LocaleChoice) =>
      this.search === "" ||
      choice.name.toLowerCase().includes(this.search) ||
      choice.code.toLowerCase().includes(this.search);

    const base = all.find((choice) => choice.code === BASE_LOCALE);
    if (base !== undefined && matches(base)) this.row(list, base, true, true);

    for (const choice of all.filter((c) => enabled.has(c.code) && matches(c))) {
      this.row(list, choice, true, false);
    }
    for (const choice of all.filter((c) => !enabled.has(c.code) && c.code !== BASE_LOCALE && matches(c))) {
      this.row(list, choice, false, false);
    }
  }

  private row(parent: HTMLElement, choice: LocaleChoice, on: boolean, locked: boolean): void {
    new Setting(parent)
      .setClass("kalendae-language-row")
      .setName(choice.name)
      .addToggle((toggle) =>
        toggle
          .setValue(on)
          .setDisabled(locked)
          .onChange((value) => this.set(choice.code, value)),
      );
  }

  private set(code: string, on: boolean): void {
    const languages = this.host.settings.languages.filter((held) => held !== code);
    this.host.settings.languages = on ? [...languages, code] : languages;
    this.changed = true;
    void this.host.saveSettings();
    this.renderList();
  }
}

/**
 * The names in force, for the row on the tab behind the page.
 *
 * A middle dot rather than a comma and a space, which is English typography:
 * Chinese and Japanese enumerate with a comma of their own and no space. The
 * same separator the scope summary settled on, for the same reason.
 */
export function languagesSummary(settings: KalendaeSettings, uiLanguage: string): string {
  const named = new Map(localeChoices(moment.locales(), uiLanguage).map((c) => [c.code, c.name]));
  const codes = [BASE_LOCALE, ...settings.languages];

  return [...new Set(codes)].map((code) => named.get(code) ?? code).join(" · ");
}
```

- [x] **Step 3: The strings**

In `en.json`, under `settings`:

- `recognising.heading` — "Recognising dates". Comment: heading over the two rows deciding where dates are looked for and which languages' names count as one; both govern typing and detection.
- `languages.heading` — "Languages".
- `languages.description` — "Month and weekday names in these languages can be typed, and are found in your notes. Phrases like *next friday* stay English."
- `languages.search` — "Search".
- `languages.searchPlaceholder` — "Language name".

Each with its `_comment` sibling. British spelling: the plugin already says *recognises* in `settings.formats.description`.

- [x] **Step 4: The styles**

Append to `styles.css`:

```css
/* The languages list. Its rows are a name and a toggle and nothing else, so
   they take less room than a settings row is given by default, and the list
   scrolls rather than pushing the search field off the top of the page. */
.kalendae-languages .setting-item.kalendae-languages-intro {
  border-top: none;
  padding-block-start: 0;
}

.kalendae-language-list {
  max-height: 24em;
  overflow-y: auto;
}

.kalendae-languages .setting-item.kalendae-language-row {
  border-top: none;
  padding-block: var(--size-2-2);
}
```

- [x] **Step 5: Run everything**

Run: `npm test` — PASS.
Run: `npm run build` — clean.

In the app: the section reads *Recognising dates* with two rows; the Languages row shows `English`; opening it lists English first, on and greyed; typing `spa` narrows to Spanish; turning it on moves it up under English and the row behind reads `English · Spanish`.

- [ ] **Step 6: Propose the commit**

```
feat: choose the languages Kalendae reads dates in

- Pick them on a new Languages page, under Recognising dates
```

---

### Task 6: The guide page says what a language reaches

**Files:**
- Modify: `src/settings/typing-help-page.ts`
- Modify: `src/i18n/locales/en.json`

- [x] **Step 1: Reword the two lines**

`settings.typingHelp.named.desc` becomes "type the date, in any language you have turned on." — the row that languages reach.

`settings.typingHelp.words.desc` keeps "use common phrases. English only." unchanged. It is the boundary, and it stays true: `next`, `in` and `ago` are matched against `DAY_WORDS` and `UNIT_WORDS` in `quick.ts`, which no language setting touches.

Update the `_comment` on `named.desc` to say the two lines are a pair and that the contrast between them is the point, so a translator does not soften either.

- [x] **Step 2: Check the prefix example still reads**

`settings.typingHelp.named.prefix` already says "a date for each month starting this way, in every language you have turned on" — written for this change. `sharedMonthPrefix()` in `typing-help-page.ts` computes its prefix from `moment.months()`, the app's language only. Widen it to the enabled languages, so a reader who turned Spanish on in an English vault sees a prefix that names months in both.

- [x] **Step 3: Run everything**

Run: `npm test` — PASS.
Run: `npm run build` — clean.

- [ ] **Step 4: Propose the commit**

```
docs: say which part of typing a language reaches

- Name the languages on the By name line, and keep In words English
```

---

### Task 7: The other twelve locales

The last step, once the English has stopped moving.

**Files:**
- Modify: `src/i18n/locales/{de,es,et,fr,ja,ko,lt,lv,pt,ru,uk,zh}.json`

- [x] **Step 1: List what is new**

```bash
node -e "const fs=require('fs');const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v!==null?flat(v,p+k+'.'):[[p+k,v]]);const en=Object.fromEntries(flat(JSON.parse(fs.readFileSync('src/i18n/locales/en.json','utf8'))));const de=Object.fromEntries(flat(JSON.parse(fs.readFileSync('src/i18n/locales/de.json','utf8'))));console.log(Object.keys(en).filter(k=>!k.endsWith('_comment')&&!(k in de)).join('\n'))"
```

- [x] **Step 2: Translate**

Every locale gets exactly en's key set, no blanks, `_comment` keys excluded. Each string's `_comment` in `en.json` is the brief. `sample_lang.json` is the blank template and is exempt.

Rebuild each file from `en.json`'s key order rather than patching it, so ordering cannot drift and a missed string is reported rather than written blank.

- [x] **Step 3: Verify**

Run: `npm run validate-translations` — PASS.
Run: `npm run release-check` — PASS, all three in the order the Release workflow runs them.

Check every `{{marker}}` survives in all twelve.

- [ ] **Step 4: Propose the commit**

```
chore: translate the language settings strings
```

---

## Self-review notes

**Spec coverage.** The list and its deduplication → Task 1. The setting, English always in force, the first-run seed → Task 2. Typing: months union, weekday aliases → Task 3. Detection: alternation and gate 3 → Task 4. *Recognising dates*, the page, the summary → Task 5. The guide page → Task 6. i18n → Tasks 5 and 6 for English, Task 7 for the rest.

**Not covered, deliberately:** the phrase grammar, weekday prepositions, ordinals — all listed out of scope in the spec.

**Two decisions taken here that the spec does not settle:**

1. **`localeChoices` is handed the codes** rather than reading `moment.locales()` itself. That call answers with what has been *loaded* — 139 in Obsidian, 1 under Node until a locale is touched — so a module calling it could not be tested. Same rule `absolute.ts` follows for month names.
2. **`formats.ts` takes the locales through a module-level setter**, not an argument. `compileFormat` is called from six places with no business knowing about settings, and the cache it feeds is already module-level.

**One thing worth watching in review:** Task 4's `buildTokenPatterns` is written with a shared `each` helper to avoid twelve near-identical loops. If it reads as clever rather than short once it exists, unroll it — the step says so, and a reviewer should hold it to that.
