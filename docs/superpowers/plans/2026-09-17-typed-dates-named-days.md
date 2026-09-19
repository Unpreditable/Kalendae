# Typed Dates: Naming the Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Type the day itself — `@nov 3` — and get it, instead of only offsets from today.

**Architecture:** A fourth source of rows, in a pure module that knows nothing of the quick-date
language. `absolute.ts` takes a query, today, and the reader's month names, and returns days. A row
built from it carries a day and no rule, which is why it needs a row kind of its own: there is
nothing to gloss and no keyword to advertise. `entries.ts` places those rows in one of two positions
depending on how specific the query was, and `date-suggest.ts` gathers the month names from moment
and draws the row. No new strings, in any locale.

**Tech Stack:** TypeScript, Obsidian 1.13 API, moment (via `obsidian`), Jest + ts-jest.

**Spec:** [docs/superpowers/specs/2026-09-13-typed-dates-design.md](../specs/2026-09-13-typed-dates-design.md), section *Naming the day itself*

## Global Constraints

- **This plan adds no user-visible strings.** The row's label is `moment.format("LL")` and its
  right-hand column `format("ddd")`, both localised by Obsidian already. If a task seems to need a
  string, stop and ask — it means a decision was missed. Nothing in `src/i18n/` is touched, so
  `npm run validate-translations` and `npm run release-check` stay green throughout, unlike the two
  earlier plans.
- **Commits are proposed, never made.** Show the message and wait for an explicit yes. Feature-level
  bullets of what changed, never why. No `Claude-Session` trailer.
- **`src/typing/` stays pure** — no Obsidian API, no DOM, no editor, no `t()`. moment arrives
  through the `obsidian` module, which `tests/__mocks__/obsidian.ts` re-exports as the real moment,
  and is used only for calendar arithmetic. Never the reader's locale: `moment.months()` and
  anything else locale-dependent belongs in `date-suggest.ts`, which cannot be unit-tested anyway.
- **`moment.utc(...)`, never a bare `moment(...)`** — the namespace stays callable under the Jest
  tsconfig's `esModuleInterop`, which the build tsconfig does not set.
- **Months are 0-based**, as everywhere else in this codebase, matching moment.
- **No CSS.** The row reuses `.kalendae-suggest-row`, `-label`, `-keyword` and `-day`; a named day
  needs no rule of its own.
- **Never bundle `@codemirror/state`, `@codemirror/view` or `@codemirror/language`.**
- Tests live beside the existing ones in `tests/typing/`.

---

### Task 1: The module that reads a named day

Pure, and with no caller: nothing in the app changes in this task. Every rule the spec's grammar
states is decided here and tested here.

**Files:**
- Create: `src/typing/absolute.ts`
- Test: `tests/typing/absolute.test.ts`

**Interfaces:**
- Consumes: `DayKey` from `src/picker/month.ts`; `moment` from `obsidian`.
- Produces, from `src/typing/absolute.ts`:
  - `interface AbsoluteContext { today: DayKey; months: readonly (readonly string[])[] }` — `months`
    holds twelve entries, January first, each the spellings that month answers to in the reader's
    language. An empty array is legal and means English only.
  - `interface AbsoluteRow { day: DayKey; complete: string | null; strong: boolean }` — `complete` is
    the query with the day and the year filled in, or null when nothing is missing; `strong` says a
    day was typed and the month named in more than one character.
  - `absoluteDates(query: string, context: AbsoluteContext): AbsoluteRow[]` — empty when the query
    is not a named day. Never throws.

- [ ] **Step 1: Write the failing test**

Create `tests/typing/absolute.test.ts`:

```ts
import { AbsoluteContext, absoluteDates } from "../../src/typing/absolute";

/**
 * A day named outright. Today is Sunday 13 September 2026 throughout, as in the
 * entries tests, and months are 0-based: November is 10.
 *
 * `months` is empty in most cases, which leaves the module's own English table
 * as the only one — that is the shape a vault in English hands over anyway.
 */
const context: AbsoluteContext = {
  today: { year: 2026, month: 8, day: 13 },
  months: [],
};

/** The days a query lands on, which is what most cases here are about. */
const daysFor = (query: string, on: AbsoluteContext = context) =>
  absoluteDates(query, on).map((row) => row.day);

describe("absoluteDates", () => {
  it("reads a month and a day, in either order", () => {
    expect(daysFor("nov 3")).toEqual([
      { year: 2026, month: 10, day: 3 },
      { year: 2025, month: 10, day: 3 },
    ]);
    expect(daysFor("3 nov")).toEqual(daysFor("nov 3"));
    expect(daysFor("november 3")).toEqual(daysFor("nov 3"));
  });

  it("offers the nearest forward first, counting today", () => {
    // 13 September is today, so forward is today itself.
    expect(daysFor("sep 13")).toEqual([
      { year: 2026, month: 8, day: 13 },
      { year: 2025, month: 8, day: 13 },
    ]);
    // 12 September has gone, so forward is next year.
    expect(daysFor("sep 12")).toEqual([
      { year: 2027, month: 8, day: 12 },
      { year: 2026, month: 8, day: 12 },
    ]);
  });

  it("finds the nearest occurrence rather than the nearest year", () => {
    expect(daysFor("feb 29")).toEqual([
      { year: 2028, month: 1, day: 29 },
      { year: 2024, month: 1, day: 29 },
    ]);
  });

  it("reads a month alone as the 1st of it", () => {
    expect(daysFor("nov")).toEqual([
      { year: 2026, month: 10, day: 1 },
      { year: 2025, month: 10, day: 1 },
    ]);
  });

  it("takes a year as the year it says", () => {
    expect(daysFor("nov 3 2027")).toEqual([{ year: 2027, month: 10, day: 3 }]);
    expect(daysFor("3 nov 2027")).toEqual([{ year: 2027, month: 10, day: 3 }]);
    expect(daysFor("nov 3 198")).toEqual([{ year: 198, month: 10, day: 3 }]);
    expect(daysFor("nov 3 1")).toEqual([{ year: 1, month: 10, day: 3 }]);
    expect(daysFor("nov 3 0026")).toEqual([{ year: 26, month: 10, day: 3 }]);
    expect(daysFor("nov 3 3")).toEqual([{ year: 3, month: 10, day: 3 }]);
  });

  it("reads two digits both ways, the century first", () => {
    expect(daysFor("nov 3 26")).toEqual([
      { year: 2026, month: 10, day: 3 },
      { year: 26, month: 10, day: 3 },
    ]);
  });

  it("answers to any prefix of a month, and to every month a prefix names", () => {
    expect(daysFor("n 3")).toEqual(daysFor("nov 3"));
    expect(daysFor("3 n")).toEqual(daysFor("nov 3"));
    expect(daysFor("j")).toEqual([
      { year: 2027, month: 0, day: 1 },
      { year: 2026, month: 0, day: 1 },
      { year: 2027, month: 5, day: 1 },
      { year: 2026, month: 5, day: 1 },
      { year: 2027, month: 6, day: 1 },
      { year: 2026, month: 6, day: 1 },
    ]);
  });

  it("ignores case, doubled spaces, a leading zero and a trailing space", () => {
    expect(daysFor("NOV 3")).toEqual(daysFor("nov 3"));
    expect(daysFor("nov  3")).toEqual(daysFor("nov 3"));
    expect(daysFor("nov 03")).toEqual(daysFor("nov 3"));
    expect(daysFor("nov 3 ")).toEqual(daysFor("nov 3"));
  });

  it("takes a comma after the day, where a format writes one", () => {
    expect(daysFor("nov 3, 2027")).toEqual([{ year: 2027, month: 10, day: 3 }]);
    expect(daysFor("3, nov")).toEqual([]);
    expect(daysFor("3 nov, 2027")).toEqual([]);
  });

  it("drops a day the month does not have", () => {
    expect(daysFor("feb 30")).toEqual([]);
    expect(daysFor("feb 30 2026")).toEqual([]);
    expect(daysFor("feb 29 2026")).toEqual([]);
  });

  it("reads the reader's own month names, in every form they are handed in", () => {
    const russian: AbsoluteContext = {
      ...context,
      months: [
        ["январь", "янв.", "января"],
        ["февраль", "февр.", "февраля"],
        ["март", "март", "марта"],
        ["апрель", "апр.", "апреля"],
        ["май", "май", "мая"],
        ["июнь", "июнь", "июня"],
        ["июль", "июль", "июля"],
        ["август", "авг.", "августа"],
        ["сентябрь", "сент.", "сентября"],
        ["октябрь", "окт.", "октября"],
        ["ноябрь", "нояб.", "ноября"],
        ["декабрь", "дек.", "декабря"],
      ],
    };

    expect(daysFor("ноя 3", russian)).toEqual(daysFor("nov 3"));
    expect(daysFor("ноября 3", russian)).toEqual(daysFor("nov 3"));
    expect(daysFor("нояб 3", russian)).toEqual(daysFor("nov 3"));
    // English is the module's own, and answers whatever the reader's language is.
    expect(daysFor("nov 3", russian)).toEqual(daysFor("nov 3"));
  });

  it("refuses a prefix of digits alone, so a count stays a count", () => {
    const japanese: AbsoluteContext = {
      ...context,
      months: Array.from({ length: 12 }, (_unused, month) => [`${month + 1}月`]),
    };

    expect(daysFor("3", japanese)).toEqual([]);
    expect(daysFor("3 4", japanese)).toEqual([]);
    expect(daysFor("11月 3", japanese)).toEqual(daysFor("nov 3"));
    // A whole name answers even where a longer name starts with it.
    expect(daysFor("1月 3", japanese)).toEqual([
      { year: 2027, month: 0, day: 3 },
      { year: 2026, month: 0, day: 3 },
    ]);
  });

  it("cannot type a month name with a space in it", () => {
    const vietnamese: AbsoluteContext = {
      ...context,
      months: Array.from({ length: 12 }, (_unused, month) => [`tháng ${month + 1}`]),
    };

    expect(daysFor("tháng 11 3", vietnamese)).toEqual([]);
    expect(daysFor("tháng", vietnamese)).toEqual([]);
  });

  it("is not read at all where the query is something else", () => {
    expect(daysFor("")).toEqual([]);
    expect(daysFor("3")).toEqual([]);
    expect(daysFor("nov 0")).toEqual([]);
    expect(daysFor("nov 32")).toEqual([]);
    expect(daysFor("nov 00")).toEqual([]);
    expect(daysFor("2026 nov 3")).toEqual([]);
    expect(daysFor("nov 3rd")).toEqual([]);
    expect(daysFor("nov 3 eow")).toEqual([]);
    expect(daysFor("11/3")).toEqual([]);
    expect(daysFor("nov nov")).toEqual([]);
    expect(daysFor("lunch")).toEqual([]);
    expect(daysFor("next friday")).toEqual([]);
  });

  it("says which reading is the specific one", () => {
    const strength = (query: string) => absoluteDates(query, context).map((row) => row.strong);

    // A day, and a month named in more than one character.
    expect(strength("nov 3")).toEqual([true, true]);
    expect(strength("3 nov")).toEqual([true, true]);
    expect(strength("nov 3 2027")).toEqual([true]);
    // A month on its own, or named in one character: the weak readings.
    expect(strength("nov")).toEqual([false, false]);
    expect(strength("n 3")).toEqual([false, false]);
    expect(strength("3 d")).toEqual([false, false]);
  });

  it("completes the query with the day and the year, keeping what was typed", () => {
    const completions = (query: string) => absoluteDates(query, context).map((row) => row.complete);

    expect(completions("nov 3")).toEqual(["nov 3 2026", "nov 3 2025"]);
    expect(completions("3 nov")).toEqual(["3 nov 2026", "3 nov 2025"]);
    expect(completions("nov")).toEqual(["nov 1 2026", "nov 1 2025"]);
    expect(completions("NOV 3")).toEqual(["NOV 3 2026", "NOV 3 2025"]);
    expect(completions("nov  3")).toEqual(["nov 3 2026", "nov 3 2025"]);
    expect(completions("nov 3,")).toEqual(["nov 3, 2026", "nov 3, 2025"]);
    // Two digits are the ambiguous length, so both rows spell the year in full.
    expect(completions("nov 3 26")).toEqual(["nov 3 2026", "nov 3 0026"]);
    // Nothing missing, nothing to complete.
    expect(completions("nov 3 2026")).toEqual([null]);
    expect(completions("nov 3 198")).toEqual([null]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/typing/absolute.test.ts`
Expected: FAIL — cannot find module `../../src/typing/absolute`.

- [ ] **Step 3: Write the module**

Create `src/typing/absolute.ts`:

```ts
import { moment } from "obsidian";
import { DayKey } from "../picker/month";

/**
 * A day named outright, rather than counted from today.
 *
 * Everything else in `typing/` reads an offset — `1d`, `EoM`, `next friday` —
 * and resolves it through the quick-date language. This reads `nov 3`, which
 * that language cannot say at all: there is no anchor for an arbitrary day, so
 * a row from here carries a day and no rule.
 *
 * Pure, like `scan.ts` and `words.ts`. moment is here for calendar arithmetic
 * only — whether a month has a 29th, and which year the nearest one falls in —
 * never for the reader's language. The English names are a table below, as the
 * word grammar's vocabulary is; the reader's own arrive as data, so the one
 * file that asks moment what language it is in stays `date-suggest.ts`.
 */

export interface AbsoluteContext {
  today: DayKey;
  /**
   * Every spelling each month answers to in the reader's language, January
   * first. Empty is legal and means English alone.
   */
  months: readonly (readonly string[])[];
}

export interface AbsoluteRow {
  day: DayKey;
  /**
   * The query with the day and the year filled in, which is what Tab writes, or
   * null where nothing is missing — the row Tab writes rather than completes.
   */
  complete: string | null;
  /**
   * Whether this is the specific reading: a day was typed, and the month named
   * in more than one character.
   *
   * The list uses it to place the row. `3 d` is three days on in the language
   * as it stands, so 3 December cannot have the first row; `nov 3` is nothing
   * else, so it can.
   */
  strong: boolean;
}

/** The months in English, which every reader can type whatever their language. */
const ENGLISH: readonly (readonly string[])[] = [
  ["january", "jan"],
  ["february", "feb"],
  ["march", "mar"],
  ["april", "apr"],
  ["may"],
  ["june", "jun"],
  ["july", "jul"],
  ["august", "aug"],
  ["september", "sep", "sept"],
  ["october", "oct"],
  ["november", "nov"],
  ["december", "dec"],
];

/** One or two digits naming a day of the month, with the comma a format writes. */
const DAY = /^(0?[1-9]|[12][0-9]|3[01]),?$/;
const DIGITS = /^[0-9]+$/;

/** How far the search for an occurrence runs. Eight years covers 29 February. */
const YEARS = 8;

/**
 * Every day this query could name, or nothing where it names none.
 *
 * Two rows come back from a query with no year — the nearest forward and the
 * nearest back — and from a two-digit year, which is read as typed and with the
 * century in front. More than two come back where a prefix names more than one
 * month: `j` is January, June and July.
 */
export function absoluteDates(query: string, context: AbsoluteContext): AbsoluteRow[] {
  const tokens = query.trim().split(/\s+/).filter((token) => token !== "");
  const read = readTokens(tokens);
  if (read === null) return [];

  return monthsNamed(read.month, context.months).flatMap((month) =>
    daysIn(read, month, context.today).map((day) => ({
      day,
      complete: completion(read, day.year),
      // A single character is a weak reading whatever else is typed, and a
      // month with no day is weaker still. `[...]` rather than `.length`, so a
      // name written in one character outside the basic plane still counts as
      // one.
      strong: read.dayGiven && [...read.month].length > 1,
    })),
  );
}

/** What the tokens said, before any of it becomes a day. */
interface Read {
  /** The month prefix as typed, case and all, for the completion to keep. */
  month: string;
  day: number;
  /** Whether the day was typed, or supplied as the 1st. */
  dayGiven: boolean;
  /** The year as typed, or undefined where none was. */
  year: string | undefined;
  /** The first two tokens as typed, which the completion is rebuilt from. */
  head: string;
}

/**
 * The three shapes a named day comes in, and nothing else.
 *
 * A month alone, a month and a day in either order, and either of those with a
 * year on the end. The comma is allowed only where a format writes one, after
 * the day in month-day order, which is why `dayIn` is asked twice with
 * different answers about it.
 */
function readTokens(tokens: string[]): Read | null {
  const [first, second, third] = tokens;

  if (tokens.length === 0 || tokens.length > 3) return null;

  if (tokens.length === 1) {
    return { month: first, day: 1, dayGiven: false, year: undefined, head: `${first} 1` };
  }

  const year = tokens.length === 3 ? third : undefined;
  if (tokens.length === 3 && !DIGITS.test(third)) return null;

  const head = `${first} ${second}`;
  const afterMonth = dayIn(second, true);
  if (afterMonth !== null) {
    return { month: first, day: afterMonth, dayGiven: true, year, head };
  }

  const beforeMonth = dayIn(first, false);

  return beforeMonth === null
    ? null
    : { month: second, day: beforeMonth, dayGiven: true, year, head };
}

/** The day a token names, or null when it names none. */
function dayIn(token: string, comma: boolean): number | null {
  if (!DAY.test(token)) return null;
  if (!comma && token.endsWith(",")) return null;

  return Number(token.replace(",", ""));
}

/**
 * Which months a prefix names.
 *
 * Any prefix, one character up, so `n` is November and `j` is three months. A
 * prefix of digits alone is not a month: Japanese, Korean and Chinese name
 * theirs `1月`…`12月`, and without this rule `@3` would stop meaning three days
 * on for every reader of those languages.
 *
 * A name with a space in it cannot be typed at all, since the grammar splits on
 * spaces — Vietnamese `tháng 11` is the case, and it is not one of the thirteen
 * locales. Dropping it here is what keeps it from matching a bare `tháng`.
 */
function monthsNamed(prefix: string, reader: readonly (readonly string[])[]): number[] {
  const wanted = prefix.toLowerCase();
  if (wanted === "" || DIGITS.test(wanted)) return [];

  return ENGLISH.flatMap((english, month) =>
    [...english, ...(reader[month] ?? [])].some(
      (name) => !/\s/.test(name) && name.toLowerCase().startsWith(wanted),
    )
      ? [month]
      : [],
  );
}

/**
 * The days one month gives this reading, forward first.
 *
 * With a year typed there is one row per year the digits could mean. With none
 * there are two, the nearest each way, and they are occurrences rather than
 * years: `feb 29` is 2028 and 2024, where taking this year and next and
 * clamping would have offered 28 February twice.
 */
function daysIn(read: Read, month: number, today: DayKey): DayKey[] {
  if (read.year === undefined) {
    return [occurrence(month, read.day, today, 1), occurrence(month, read.day, today, -1)].flatMap(
      (day) => (day === null ? [] : [day]),
    );
  }

  return yearsTyped(read.year, today).flatMap((year) => {
    const day = { year, month, day: read.day };

    return moment.utc(day).isValid() ? [day] : [];
  });
}

/**
 * The years a run of digits could mean.
 *
 * As typed, always. Two digits are the one length with something to complete,
 * so they also mean the century the reader is in — first, since that is what a
 * two-digit year nearly always means. The century comes from today rather than
 * from the clock, which is what keeps this testable.
 */
function yearsTyped(text: string, today: DayKey): number[] {
  const literal = Number(text);

  return text.length === 2 ? [Math.floor(today.year / 100) * 100 + literal, literal] : [literal];
}

/**
 * The nearest year in which this day exists and falls the right side of today.
 *
 * Forward counts today, which is the reading the bare `fri` already has: on
 * 3 November, `nov 3` is today and last year.
 */
function occurrence(month: number, day: number, today: DayKey, step: 1 | -1): DayKey | null {
  for (let offset = 0; offset <= YEARS; offset += 1) {
    const candidate = { year: today.year + step * offset, month, day };
    if (!moment.utc(candidate).isValid()) continue;

    const order = compare(candidate, today);
    if (step === 1 ? order >= 0 : order < 0) return candidate;
  }

  return null;
}

function compare(one: DayKey, other: DayKey): number {
  return one.year - other.year || one.month - other.month || one.day - other.day;
}

/**
 * The query with what is missing added, or null where nothing is.
 *
 * What the reader typed is kept exactly — the month's case, the comma, the
 * order they put the day in — and only the gaps are filled, which is what Tab
 * does everywhere else in this list. A two-digit year is the one thing rewritten
 * rather than kept: both rows spell it in four digits, so the text left behind
 * names one day instead of the two it named before.
 */
function completion(read: Read, year: number): string | null {
  if (read.year !== undefined && read.year.length !== 2) return null;

  const text = read.year === undefined ? String(year) : String(year).padStart(4, "0");

  return `${read.head} ${text}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest tests/typing/absolute.test.ts`
Expected: PASS, every case.

Run: `npm test`
Expected: PASS. Nothing in the app has changed — this module has no caller yet.

Run: `npm run build`
Expected: clean, no TypeScript or eslint errors.

- [ ] **Step 5: Propose the commit**

```
feat: read a day named outright

- Understand nov 3, 3 nov and feb 29 as the days they name, in any language's month names
```

---

### Task 2: The fourth source, and where its rows sit

The list gains a row kind that carries a day and no rule, in one of two positions. The count
message is corrected in the same task, because a bad day is what exposes it.

**Files:**
- Modify: `src/typing/entries.ts`
- Modify: `src/typing/words.ts` (`countRefused` only)
- Test: `tests/typing/entries.test.ts`

**Interfaces:**
- Consumes: `absoluteDates`, `AbsoluteContext`, `AbsoluteRow` (Task 1).
- Produces:
  - `EntryContext` gains `months: readonly (readonly string[])[]`, passed straight through to
    `absoluteDates`.
  - `Entry` gains `{ kind: "date"; day: DayKey; complete: string | null }`.
  - No other export changes. `countRefused` keeps its signature.

- [ ] **Step 1: Write the failing test**

In `tests/typing/entries.test.ts`, add `months` to the shared context — English comes from the
module itself, so an empty list is the whole of it:

```ts
const context: EntryContext = {
  today: { year: 2026, month: 8, day: 13 },
  firstDay: 0,
  months: [],
  names: [
    { label: "Today", rule: null },
    { label: "Tomorrow", rule: "today +1d" },
    { label: "Next Friday", rule: "today +1Fri" },
    { label: "End of this month", rule: "today EoM" },
  ],
};
```

and append a `describe`:

```ts
describe("a day named outright", () => {
  it("leads the list, and carries no keyword", () => {
    const entries = entriesFor("nov 3", context);

    expect(entries).toEqual([
      { kind: "date", day: { year: 2026, month: 10, day: 3 }, complete: "nov 3 2026" },
      { kind: "date", day: { year: 2025, month: 10, day: 3 }, complete: "nov 3 2025" },
    ]);
    expect(entries.map(keywordOf)).toEqual(["", ""]);
  });

  it("takes the year as typed, and offers nothing to chain", () => {
    expect(entriesFor("nov 3 2027", context)).toEqual([
      { kind: "date", day: { year: 2027, month: 10, day: 3 }, complete: null },
    ]);
    expect(entriesFor("nov 3 ", context)).toEqual(entriesFor("nov 3", context));
  });

  it("goes last where a single letter named the month", () => {
    // `3 d` is three days on in the language as it stands, and that row keeps
    // the top of the list.
    const entries = entriesFor("3 d", context);

    expect(entries[0]).toEqual(expect.objectContaining({ kind: "step", keyword: "+3d" }));
    expect(entries.filter((entry) => entry.kind === "date")).toEqual([
      { kind: "date", day: { year: 2026, month: 11, day: 3 }, complete: "3 d 2026" },
      { kind: "date", day: { year: 2025, month: 11, day: 3 }, complete: "3 d 2025" },
    ]);
    expect(entries[entries.length - 1]).toEqual(
      expect.objectContaining({ kind: "date", day: { year: 2025, month: 11, day: 3 } }),
    );
  });

  it("goes last where only the month was typed", () => {
    const entries = entriesFor("f", context);

    expect(entries[0].kind).not.toBe("date");
    expect(entries.filter((entry) => entry.kind === "date")).toEqual([
      { kind: "date", day: { year: 2027, month: 1, day: 1 }, complete: "f 1 2027" },
      { kind: "date", day: { year: 2026, month: 1, day: 1 }, complete: "f 1 2026" },
    ]);
  });

  it("leaves every offset query answering exactly as it did", () => {
    expect(entriesFor("3", context).every((entry) => entry.kind === "step")).toBe(true);
    expect(entriesFor("next friday", context)[0]).toEqual(
      expect.objectContaining({ kind: "named", label: "Next Friday" }),
    );
    expect(entriesFor("2w eow", context)[0]).toEqual(
      expect.objectContaining({ kind: "step", keyword: "EoW" }),
    );
  });

  it("calls a bad day an invalid date, not a refused count", () => {
    expect(entriesFor("nov 0", context)).toEqual([{ kind: "invalid" }]);
    expect(entriesFor("0 nov", context)).toEqual([{ kind: "invalid" }]);
    expect(entriesFor("nov 32", context)).toEqual([{ kind: "invalid" }]);
    expect(entriesFor("feb 30", context)).toEqual([{ kind: "invalid" }]);
    // A count out of range still says so, which is the row this one borrowed.
    expect(entriesFor("in 1000 days", context)).toEqual([{ kind: "invalid", reason: "count" }]);
    expect(entriesFor("1000", context)).toEqual([{ kind: "invalid", reason: "count" }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/typing/entries.test.ts`
Expected: FAIL. The file will not compile until `months` is on `EntryContext` — that is the first
failure to fix — and then every case in the new block returns the invalid row.

- [ ] **Step 3: Widen the context and the row union**

In `src/typing/entries.ts`, import the module and add the field and the kind:

```ts
import { AbsoluteRow, absoluteDates } from "./absolute";
```

```ts
export interface EntryContext {
  today: DayKey;
  /** The week's first day as moment counts them, from `firstDayOf(settings.weekStart)`. */
  firstDay: number;
  names: NamedDate[];
  /**
   * Every spelling each month answers to in the reader's language, January
   * first. Handed through to `absoluteDates`, which adds English itself.
   */
  months: readonly (readonly string[])[];
}
```

and in the `Entry` union, after the `accept` row:

```ts
  // A day named outright: no rule behind it, so no gloss and no keyword. Its
  // `complete` is null once nothing is missing, which is how Tab knows to write
  // rather than to fill the rest in.
  | { kind: "date"; day: DayKey; complete: string | null }
```

- [ ] **Step 4: Place the rows**

Replace `entriesFor`, and add `dateEntries` beside the other sources:

```ts
export function entriesFor(query: string, context: EntryContext): Entry[] {
  // One set for the whole list rather than one per source. A date can be
  // reached as a name and as tokens — "End of this month" is `EoM` — and
  // whichever reaches it first is the row worth keeping, so the order never has
  // to be redone afterwards.
  const seen = new Set<string>();
  const opening = namesAllowed(query);
  const named = opening ? namedEntries(query, context, seen) : [];
  const words = opening ? wordEntries(query, context, seen) : [];
  const dates = dateEntries(query, context);
  const entries = [
    ...dates.strong,
    ...named,
    ...words,
    ...stepEntries(query, context, seen),
    ...dates.weak,
  ];
  if (entries.length > 0) return withoutRepeatedWeekdays(entries);

  return [countRefused(query) ? { kind: "invalid", reason: "count" } : { kind: "invalid" }];
}

/**
 * The rows a named day reaches, in the two places they can sit.
 *
 * A day with a month spelled in more than one character is not anything else in
 * this language, so it leads. A single letter is: `3 d` is three days on, `3 m`
 * three months, `@f` a reader one key into Friday — and handing Enter to
 * 3 December there would take away a date they already had. Those rows go to the
 * end, where they are still reachable and cannot be accepted by accident.
 *
 * No deduplication against the other three sources. A row from here carries no
 * rule, so it has nothing to key on, and nothing else in the list reaches a day
 * this way: two rows of one query are different years by construction.
 */
function dateEntries(query: string, context: EntryContext): { strong: Entry[]; weak: Entry[] } {
  const rows = absoluteDates(query, { today: context.today, months: context.months });
  const entry = (row: AbsoluteRow): Entry => ({
    kind: "date",
    day: row.day,
    complete: row.complete,
  });

  return {
    strong: rows.filter((row) => row.strong).map(entry),
    weak: rows.filter((row) => !row.strong).map(entry),
  };
}
```

Then let the weekday collapse pass the new kind through — it reads `entry.rule`, which a date row
has none of, so leaving it out is a compile error rather than a silent one:

```ts
function withoutRepeatedWeekdays(entries: Entry[]): Entry[] {
  const taken = new Set<string>();

  return entries.filter((entry) => {
    if (entry.kind === "invalid" || entry.kind === "accept" || entry.kind === "date") return true;
```

- [ ] **Step 5: Correct the count message**

In `src/typing/words.ts`, `countRefused` fires on a leading number out of range whatever follows it,
so `@0 nov` would announce "Only counts up to 999" about a number the reader typed as a day. Give it
the second half of the question:

```ts
export function countRefused(query: string): boolean {
  const words = split(query);
  const rest = LEADS[words[0]] === undefined ? words : words.slice(1);
  const head = rest[0] ?? "";

  if (!/^[0-9]+$/.test(head)) return false;

  const value = Number(head);
  if (value >= 1 && value <= 999) return false;

  // A number out of range is a refused count only where what follows it is a
  // subject a count could take. `0 nov` is a day no month has, not a count of
  // Novembers, and the count message would send the reader hunting for a
  // spelling mistake in a number they meant as a day.
  return subjects(rest.slice(1).join(" "), false, false).length > 0;
}
```

The comment above the function names 999 as the whole of the rule; extend it to say the phrase has to
be a count as well.

- [ ] **Step 6: Run the tests**

Run: `npx jest tests/typing/entries.test.ts tests/typing/words.test.ts`
Expected: PASS, the existing cases included — `in 1000 days` still carries `reason: "count"`, since
`days` is a subject a count can take.

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: clean.

- [ ] **Step 7: Propose the commit**

```
feat: offer a named day in the typed date list

- Put nov 3 at the top of the list, and a month with no day at the bottom
- Say "Invalid date" for a day no month has, rather than refusing it as a count
```

---

### Task 3: The row, and the year Tab fills in

The first task with something to look at. `date-suggest.ts` gathers the month names from moment,
draws the row, and lets Tab complete a date.

**Files:**
- Modify: `src/editor/date-suggest.ts`
- Test: none — `EditorSuggest` is Obsidian's and cannot be unit-tested. What it applies is Tasks 1
  and 2, which are tested.

**Interfaces:**
- Consumes: `Entry` with the `date` kind and `EntryContext.months` (Task 2); `moment` from
  `obsidian`, already imported.
- Produces: nothing exported. `complete()` changes shape — it takes the completion text rather than
  an entry — and gains `completionOf(entry)` beside it.

- [ ] **Step 1: Gather the month names**

Add to `src/editor/date-suggest.ts`, beside `catalogue()`:

```ts
/**
 * Every spelling each month answers to in the reader's own language, January
 * first.
 *
 * Three forms, and the third is the one that is easy to miss. Russian lists
 * `ноябрь` and writes `3 ноября`; Lithuanian lists `lapkritis` and writes
 * `lapkričio`. The row shows the written form, so without it a reader typing
 * back what they are looking at fails on the last letter. moment gives it up
 * only by formatting a date that has a day in it, which is what the third line
 * does — the year and the day are immaterial, only the month's spelling is read.
 *
 * English is not here. `absolute.ts` carries it, because it is a table in code
 * rather than anything the reader's language decides.
 */
function monthNames(): string[][] {
  const short = moment.monthsShort();

  return moment.months().map((name, month) => [
    name,
    short[month],
    moment.utc({ year: 2000, month, day: 1 }).format("D MMMM").replace(/^[0-9]+\s*/, ""),
  ]);
}
```

and pass them in `getSuggestions`:

```ts
    return entriesFor(context.query, {
      today,
      firstDay,
      months: monthNames(),
      names: catalogue(today, firstDay),
    });
```

- [ ] **Step 2: Draw the row**

In `renderSuggestion`, the right-hand column stops being one expression for every row, so give it a
function. Replace the two `createSpan` calls that follow the label:

```ts
    el.createSpan({
      cls: "kalendae-suggest-keyword",
      text: entry.kind === "accept" || entry.kind === "date" ? "" : entry.keyword,
    });
    el.createSpan({ cls: `kalendae-suggest-day${accepting}`, text: trailingText(entry) });
```

and in `labelFor`, before the gloss:

```ts
  if (entry.kind === "date") return moment.utc(entry.day).format("LL");
```

Then replace `dayText` with the column it has become:

```ts
/**
 * The right-hand column: the day a row lands on, or its weekday where the row
 * is the day.
 *
 * A named day has already said its date in the label, where every other row
 * says a name or a step. The weekday is the one thing about it the reader
 * cannot read off what they typed, which is what earns it the space.
 */
function trailingText(entry: Exclude<Entry, { kind: "invalid" }>): string {
  const on = moment.utc(entry.day);

  return entry.kind === "date" ? on.format("ddd") : on.format("D MMM");
}
```

- [ ] **Step 3: Let Tab complete a date**

`complete()` takes an entry today and reads `entry.complete` off it, which a date row may hold as
null. Hand it the text instead, and decide before the call. In `selectSuggestion`, replace the Tab
branch:

```ts
    // Tab completes, except on a row with nothing left to add: there is nothing
    // to put after `@Sun ` or `@nov 3 2026`, so the key writes the date rather
    // than the same text over again.
    const completion = completionOf(entry);
    if (evt instanceof KeyboardEvent && evt.key === "Tab" && completion !== null) {
      this.complete(completion, range);
      return;
    }
```

change the method to take the text:

```ts
  private complete(completion: string, range: WriteRange): void {
    const editor = this.context?.editor;
    if (editor === undefined) return;

    const text = `${TRIGGER}${completion}`;
    const from = editor.posToOffset(range.start);

    editor.replaceRange(text, range.start, range.end);
    editor.setCursor(editor.offsetToPos(from + text.length));
  }
```

and add the one decision it lost, beside `labelFor`:

```ts
/**
 * What Tab would write, or null on a row that is already whole.
 *
 * The Accept row is whole by definition, and a named day is whole once its year
 * is in the text: `@nov 3` fills in the year, `@nov` fills in the day as well,
 * and `@nov 3 2026` has nothing left to fill in.
 */
function completionOf(entry: Exclude<Entry, { kind: "invalid" }>): string | null {
  return entry.kind === "accept" ? null : entry.complete;
}
```

The method's own doc comment says "The row's own text, not its name" and explains the trailing
space. Add that a named day is the exception that leaves none, since a space invites a step and a
named day takes none.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: clean.

Run: `npm test`
Expected: PASS.

Then confirm the CodeMirror packages stayed external:

```bash
grep -o 'require("@codemirror/[a-z]*")' main.js | sort -u   # state, language, view
grep -c "class EditorView" main.js                          # 0
```

- [ ] **Step 5: Look at it**

With `npm run dev` running and Hot Reload installed, in a scratch note:

| Type | Expect |
|---|---|
| `@nov 3` | two rows, `November 3, 2026` above `November 3, 2025`, weekday on the right, no keyword |
| `@3 nov` | the same two rows |
| `@nov` | `November 1, 2026` and `November 1, 2025` |
| `@feb 29` | 2028 and 2024 |
| `@nov 3 26` | `November 3, 2026` then `November 3, 0026` |
| `@nov 3 2027` | one row |
| `@NOV 3`, `@nov  3`, `@nov 03`, `@nov 3, 2027` | all read |
| `@3 d` | three days on first, 3 December at the bottom |
| `@f` | the Friday rows first, 1 February at the bottom |
| `@3` | exactly what it shows today — counts, no months |
| `@nov 0`, `@nov 32`, `@11/3`, `@nov 3 eow` | one row, "Invalid date" |
| Enter on a date row | the date written in the first format |
| Tab on `@nov` | `@nov 1 2026` in the note, menu open, one row |
| Tab on `@nov 3` | `@nov 3 2026`, menu open, one row |
| Tab on `@nov 3 2026` | the date written — nothing left to complete |
| Ctrl+Z after accepting | the typed text back, in one undo |
| `@nov 3` inside a fenced code block | no menu |

Then switch Obsidian's language (Settings → About → Language) to Russian and confirm `@ноя 3`,
`@ноября 3` and `@nov 3` all reach 3 November, and that the row reads `3 ноября 2026 г.`

- [ ] **Step 6: Propose the commit**

```
feat: type a date by naming the day

- Find a date by typing nov 3, 3 nov or feb 29, in your own language's month names
- Read the row back as the full date and the weekday it falls on
- Fill in the year with Tab
```

---

### Task 4: Stop the older plan building the retired format switch

`docs/superpowers/plans/2026-09-14-typed-dates.md` Task 6 builds `_` as a character read out of the
query text, with a "one row, not the first row" test. The spec replaced that on 2026-09-17: `_` acts
on the highlighted row. A plan that contradicts the spec is worse than no plan, and this one reads
as ready to build.

**Files:**
- Modify: `docs/superpowers/plans/2026-09-14-typed-dates.md`

- [ ] **Step 1: Mark Task 6 as superseded**

Under the `### Task 6: The format switch` heading, before its **Files** block, add:

```markdown
> **Superseded 2026-09-17, do not build as written.** The spec's *Naming the day itself* section
> changed what `_` does: it acts on the row the reader has highlighted, completing that row into the
> note first, rather than resolving the text in front of it. Every step below resolves the text and
> tests `entriesFor("tom_", …)`, and `dayFor`'s "exactly one day" rule is gone with it. Rewrite this
> task against the spec before touching it; the pieces that still hold are the `format` row kind,
> `renderPattern` for the row's text, and the footer instructions.
```

- [ ] **Step 2: Add the comma to Task 7's refusals**

In `### Task 7: The three settings`, the `TriggerProblem` list and `checkTriggerChar` refuse `#`,
`[`, `+`, `-` and the other field's character. The format character now also cannot be `,`, which
an explicit date spends on `@Nov 3, 2027`. In Step 1's test block, add to the reserved case:

```ts
  it("refuses the character an explicit date spends", () => {
    expect(checkTriggerChar(",", "_")).toBe("reserved");
  });
```

and in Step 3's implementation, extend the one line:

```ts
  if (value === "#" || value === "[" || value === ",") return "reserved";
```

with the doc comment gaining a sentence: `,` is out because a named day tolerates a comma after its
day, so the two cannot both have it.

- [ ] **Step 3: Propose the commit**

```
docs: record what the typed date plan no longer builds

- Mark the format switch task superseded, and reserve the comma in the trigger validation
```

---

## Self-review notes

**Spec coverage.** The grammar and all of its rules → Task 1. Which month names are typable → Task 1
(the matching, including the digit and space rules) and Task 3 (the three forms moment is asked for).
Two rows forward and back, occurrences rather than years, the month alone, the year as typed, two
digits both ways → Task 1. A bad day being an invalid date rather than a bad count → Task 2, Step 5.
The three tiers of placement → Task 2. The row's two columns and the empty keyword → Task 3. Tab
filling in the day and the year, and writing on a whole row → Tasks 1 (the text) and 3 (the key).
The `_` amendment → Task 4, as a stop sign rather than an implementation: it is Task 6's work in the
other plan, and rewriting it belongs to whoever builds it.

**Deliberately not here.** The `_` key handler itself, the settings that make the trigger characters
configurable, and named dates of the reader's own. All three are tasks in the older plan, and none of
them is needed to name a day.

**Three things a reviewer should check rather than trust:**

1. `readTokens` reads a one-token query as a month without testing whether it looks like one —
   `monthsNamed` is what refuses `3` and `lunch`. That is the only place two functions share a
   rule, and the digit test lives in the second.
2. `completion` returns null whenever a year of any length but two was typed, on the grounds that
   the day must also have been typed for the query to have parsed at all. That holds because a
   two-token query whose second token is four digits fails `dayIn` and then fails as a month — so
   `nov 2026` is not read as a month and a year. Worth a moment's thought, since the null is what
   makes Tab write instead of complete.
3. `absoluteDates` is called on every keystroke, and `occurrence` can loop nine times per month
   matched — 108 `moment.utc` constructions for `@j`, which is the worst case and still nothing.
   No memoisation, deliberately.
