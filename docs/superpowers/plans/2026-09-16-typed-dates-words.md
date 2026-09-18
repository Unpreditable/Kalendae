# Typed Dates: Words Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find the same dates by typing what you'd say — `next friday`, `in three weeks`, `3 months ago` — without turning the plugin into a sentence parser.

**Architecture:** Two layers that do not depend on each other. The first generates named rows (this/next/last × seven weekdays, forward/back × five units) from strings the plugin already ships and `moment.weekdays()`, so it works in every language and adds no strings. The second is a closed English word table with a `lead? count? subject trail?` grammar, in a new pure module. Both feed the existing row machinery: a phrase resolves to a rule, the rule is deduplicated against everything already listed, and the row is labelled by the plugin's own gloss rather than by the words that found it.

**Tech Stack:** TypeScript, Obsidian 1.13 API, moment (via `obsidian`), i18next, Jest + ts-jest.

**Spec:** [docs/superpowers/specs/2026-09-13-typed-dates-design.md](../specs/2026-09-13-typed-dates-design.md), section *Saying it in words*

## Global Constraints

- **This plan adds no user-visible strings.** The generated rows reuse `settings.quickDates.steps.*`, and the word table is data in code, not UI text. If a task seems to need a new string, stop and ask — it means a decision was missed.
- **Commits are proposed, never made.** Show the message and wait for an explicit yes. Feature-level bullets of what changed, never why.
- **`src/typing/` stays pure** — no Obsidian, no DOM, no editor, no `t()`. Names and labels arrive as data; `date-suggest.ts` is the only file that calls `t()` or touches moment.
- **`moment.utc(...)`, never a bare `moment(...)`** in anything a test imports.
- **The dedup key is the canonical rule string** (`today +1Fri`), which is what `canonicalTyped()` returns. Never the resolved day: two rules landing on one day are two different dates.
- **999 is the ceiling**, because that is the rule grammar's own limit. No second limit.
- Tests live beside the existing ones in `tests/typing/`.

---

### Task 1: Rows for every weekday and unit, in every language

The catalogue has next Monday and next Friday and nothing for the other five days. These rows fill that in without a single new preset or string: the labels are the glosses the settings builder already reads rules back with, and the day names come from moment.

**Files:**
- Modify: `src/typing/entries.ts` (deduplicate named rows against each other)
- Modify: `src/editor/date-suggest.ts` (`catalogue()`)
- Test: `tests/typing/entries.test.ts`

**Interfaces:**
- Consumes: `NamedDate` and `entriesFor` as they stand.
- Produces: no new exports. `catalogue()` returns the curated presets first and the generated rows after, and array order is what puts them there — see the note at the end of this task.

- [ ] **Step 1: Confirm the assumption the whole task rests on**

Open a vault, switch Obsidian's language (Settings → About → Language) to one with different day names — Russian, French or Japanese — and open the calendar. If the grid's day headings are in that language, `moment.weekdays()` follows Obsidian's setting and this task works as written.

If they come back in English, **stop and report**: the generated labels would be English in every language, which is not the feature. The fallback would be `moment.locale(getLanguage())` before reading, which is a change to make deliberately rather than quietly.

- [ ] **Step 2: Write the failing test for duplicate names**

Two named rows can now hold the same rule — Tomorrow is `+1d` and the generated "1 day on" is `+1d` — and nothing deduplicates named rows against each other today. Append to `tests/typing/entries.test.ts`:

```ts
it("lists one row when two names hold the same rule, the first one", () => {
  const names = [
    { label: "Tomorrow", rule: "today +1d" },
    { label: "1 day on", rule: "today +1d" },
    { label: "Next Friday", rule: "today +1Fri" },
  ];
  const entries = entriesFor("", { ...context, names });

  expect(entries.map((entry) => entry.kind === "named" && entry.label)).toEqual([
    "Tomorrow",
    "Next Friday",
  ]);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx jest tests/typing/entries.test.ts -t "two names hold the same rule"`
Expected: FAIL — three rows come back, "1 day on" among them.

- [ ] **Step 4: Deduplicate named rows, and share one set across the whole list**

In `src/typing/entries.ts`, replace the `claimed` handoff with a single set threaded through all three sources. `namedEntries` and `stepEntries` each take it and add to it:

```ts
export function entriesFor(query: string, context: EntryContext): Entry[] {
  // One set for the whole list, not one per source. A date can be reached as a
  // name, as words and as tokens, and whichever reaches it first is the row
  // worth keeping: the curated name over the generated one, and either over the
  // raw token that produces the same rule.
  const seen = new Set<string>();
  const named = namesAllowed(query) ? namedEntries(query, context, seen) : [];
  const entries = [...named, ...stepEntries(query, context, seen)];

  return entries.length === 0 ? [{ kind: "invalid" }] : entries;
}
```

`namedEntries` gains the set and skips what is already in it:

```ts
function namedEntries(query: string, context: EntryContext, seen: Set<string>): Entry[] {
  const wanted = query.trim().toLowerCase();

  return context.names.flatMap((name): Entry[] => {
    if (!matchesName(name.label, wanted)) return [];

    const canonical = name.rule === null ? "today" : name.rule;
    if (seen.has(canonical)) return [];
    seen.add(canonical);

    // … the body as it stands, unchanged
  });
}
```

and `stepEntries` takes `seen` directly instead of copying `claimed` into a fresh set:

```ts
function stepEntries(query: string, context: EntryContext, seen: Set<string>): Entry[] {
```

Delete the `const seen = new Set(claimed);` line inside it and the `claimed` construction in `entriesFor`.

- [ ] **Step 5: Run the whole entries suite**

Run: `npx jest tests/typing/entries.test.ts`
Expected: PASS, every existing case included — the collapse of "End of this month" and `EoM` now happens through the shared set rather than the handoff, and its test should not have changed.

- [ ] **Step 6: Generate the rows**

In `src/editor/date-suggest.ts`, replace `catalogue()`:

```ts
/**
 * Every named date the list offers, curated first.
 *
 * Order is the only ranking here. The eleven presets are what `@` opens with,
 * and everything generated below them is a letter or a scroll away — a flag
 * saying which half a row is in would say exactly what its position already
 * says.
 *
 * Nothing below adds a string. The labels are the glosses the settings builder
 * reads rules back with, and the day names are moment's, which Obsidian
 * localises — so a Russian reader types Russian words at a list that was never
 * translated for this.
 */
function catalogue(): NamedDate[] {
  return [
    { label: t("picker.today"), rule: null },
    ...presetsAnchoredOn("today").map((preset) => ({
      label: t(`settings.quickDates.presets.${preset.id}`),
      rule: preset.rule,
    })),
    ...weekdayRows(),
    ...unitRows(),
  ];
}

/** This, next and last, for each of the seven days. */
function weekdayRows(): NamedDate[] {
  return WEEKDAYS.flatMap((short, index) => {
    const day = moment.weekdays()[index];

    return [
      { label: t("settings.quickDates.steps.weekdayThis", { day }), rule: `today ${short}` },
      { label: t("settings.quickDates.steps.weekdayNext", { day }), rule: `today +1${short}` },
      { label: t("settings.quickDates.steps.weekdayPrevious", { day }), rule: `today -1${short}` },
    ];
  });
}

/**
 * One step forward and back for each unit.
 *
 * `+1d` and `-1d` are Tomorrow and Yesterday, which the catalogue already
 * carries — they are generated anyway and dropped by the deduplication, rather
 * than special-cased here into a loop that would then have to explain itself.
 */
function unitRows(): NamedDate[] {
  return UNITS.flatMap((unit) => {
    const amount = t(`settings.quickDates.steps.amount_${unit}`, { count: 1 });

    return [
      { label: t("settings.quickDates.steps.forward", { amount }), rule: `today +1${unit}` },
      { label: t("settings.quickDates.steps.back", { amount }), rule: `today -1${unit}` },
    ];
  });
}
```

Add `UNITS` and `WEEKDAYS` to the existing `../picker/quick` import.

- [ ] **Step 7: Build and look**

Run: `npm run build` — clean.
Run: `npm test` — PASS.

In the app: `@` opens with the eleven curated names and scrolls to the generated ones. `@f` shows this Friday, next Friday, last Friday. `@wed`, `@tue`, `@sat` all reach their days. `@1 ` reaches the unit rows. Tomorrow and Yesterday each appear once, not twice.

Then switch Obsidian's language and confirm the rows read in it.

- [ ] **Step 8: Propose the commit**

```
feat: offer every weekday and unit in the typed date list

- Add this, next and last for all seven days, and a step forward and back for each unit
- Keep the curated shortcuts at the top of the list
```

---

### Task 2: The English word table

A closed vocabulary and a three-slot grammar, in a pure module with no wiring. Nothing in the app changes in this task.

**Files:**
- Create: `src/typing/words.ts`
- Modify: `src/picker/quick.ts` (export `DAY_WORDS`)
- Test: `tests/typing/words.test.ts`

**Interfaces:**
- Consumes: `UNITS`, `WEEKDAYS` and `DAY_WORDS` from `src/picker/quick.ts`. `DAY_WORDS` is private today — export it rather than writing the seven day names a second time.
- Produces: `rulesFromWords(query: string): string[]` from `src/typing/words.ts`, returning canonical rule **tails** — the stored spelling without the `today ` anchor, e.g. `["+3w"]` — in a stable order, units before weekdays. Empty when the words are not a date.

- [ ] **Step 1: Write the failing test**

Create `tests/typing/words.test.ts`:

```ts
import { rulesFromWords } from "../../src/typing/words";

/**
 * The English word table. Everything here returns rule tails — the stored
 * spelling with the anchor left off — because that is what a row's keyword is.
 */

describe("rulesFromWords", () => {
  it("reads a lead and a weekday", () => {
    expect(rulesFromWords("next friday")).toEqual(["+1Fri"]);
    expect(rulesFromWords("last friday")).toEqual(["-1Fri"]);
    expect(rulesFromWords("this friday")).toEqual(["Fri"]);
    expect(rulesFromWords("previous monday")).toEqual(["-1Mon"]);
    expect(rulesFromWords("prev monday")).toEqual(["-1Mon"]);
  });

  it("reads a lead and a unit", () => {
    expect(rulesFromWords("next week")).toEqual(["+1w"]);
    expect(rulesFromWords("last month")).toEqual(["-1M"]);
    expect(rulesFromWords("next quarter")).toEqual(["+1Q"]);
    expect(rulesFromWords("next year")).toEqual(["+1y"]);
  });

  it("counts, in digits and in words", () => {
    expect(rulesFromWords("in 3 weeks")).toEqual(["+3w"]);
    expect(rulesFromWords("in three weeks")).toEqual(["+3w"]);
    expect(rulesFromWords("in a week")).toEqual(["+1w"]);
    expect(rulesFromWords("in an hour")).toEqual([]);
    expect(rulesFromWords("3 weeks")).toEqual(["+3w"]);
    expect(rulesFromWords("twelve days")).toEqual(["+12d"]);
  });

  it("takes the direction from the end as well as the front", () => {
    expect(rulesFromWords("3 months ago")).toEqual(["-3M"]);
    expect(rulesFromWords("2 weeks back")).toEqual(["-2w"]);
    expect(rulesFromWords("2 weeks from now")).toEqual(["+2w"]);
    expect(rulesFromWords("3 fridays ago")).toEqual(["-3Fri"]);
  });

  it("refuses a direction at both ends", () => {
    expect(rulesFromWords("last friday ago")).toEqual([]);
    expect(rulesFromWords("next 2 weeks ago")).toEqual([]);
  });

  it("refuses a count on next, last and this", () => {
    expect(rulesFromWords("next 3 weeks")).toEqual([]);
    expect(rulesFromWords("last 2 months")).toEqual([]);
    expect(rulesFromWords("this 2 fridays")).toEqual([]);
  });

  it("takes this for a weekday only", () => {
    expect(rulesFromWords("this friday")).toEqual(["Fri"]);
    expect(rulesFromWords("this month")).toEqual([]);
    expect(rulesFromWords("this week")).toEqual([]);
  });

  it("refuses a bare unit, and allows a bare weekday", () => {
    expect(rulesFromWords("week")).toEqual([]);
    expect(rulesFromWords("month")).toEqual([]);
    expect(rulesFromWords("friday")).toEqual(["Fri"]);
  });

  it("holds the count to what the rule grammar holds it to", () => {
    expect(rulesFromWords("in 999 days")).toEqual(["+999d"]);
    expect(rulesFromWords("in 1000 days")).toEqual([]);
    expect(rulesFromWords("in 0 days")).toEqual([]);
  });

  it("completes a prefix in the last word", () => {
    expect(rulesFromWords("in 3 w")).toEqual(["+3w", "+3Wed"]);
    expect(rulesFromWords("next mo")).toEqual(["+1M", "+1Mon"]);
    // `ago` is read whole or not at all — see the note below the module.
    expect(rulesFromWords("3 weeks a")).toEqual([]);
  });

  it("offers every subject once the count is in", () => {
    expect(rulesFromWords("in 3 ")).toEqual([
      "+3d",
      "+3w",
      "+3M",
      "+3Q",
      "+3y",
      "+3Sun",
      "+3Mon",
      "+3Tue",
      "+3Wed",
      "+3Thu",
      "+3Fri",
      "+3Sat",
    ]);
    expect(rulesFromWords("this ")).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });

  it("is not a sentence parser", () => {
    expect(rulesFromWords("")).toEqual([]);
    expect(rulesFromWords("the friday after the sprint review")).toEqual([]);
    expect(rulesFromWords("lunch")).toEqual([]);
    expect(rulesFromWords("in three lunches")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/typing/words.test.ts`
Expected: FAIL — cannot find module `../../src/typing/words`.

- [ ] **Step 3: Export the day names from quick.ts**

In `src/picker/quick.ts`, `DAY_WORDS` is a private const. Change it to `export const DAY_WORDS` — the word table needs the same seven names, and a second copy is a second thing to be wrong.

- [ ] **Step 4: Write the module**

Create `src/typing/words.ts`:

```ts
import { DAY_WORDS, UNITS, WEEKDAYS } from "../picker/quick";

/**
 * Dates said the way a reader would say them, in English.
 *
 * A closed vocabulary and three slots — a lead, a count, a subject — with an
 * optional word on the end for direction. Not a parser: every word is in a
 * table below, and a query with a word that is not is not a date. That is the
 * whole safety of it, and the reason a sentence cannot half-work.
 *
 * Pure, and English-only for now. The tables are the shape another language
 * would fill in; nothing else here would change.
 */

interface Lead {
  back: boolean;
  /** Whether a count may follow. `next 3 weeks` is not a date. */
  counted: boolean;
  /** `this friday` is the nearest one, today counting — the bare weekday form. */
  inclusive?: boolean;
  /** `this` has no meaning over a unit: `this month` is not a day. */
  weekdayOnly?: boolean;
}

const LEADS: Record<string, Lead> = {
  in: { back: false, counted: true },
  next: { back: false, counted: false },
  last: { back: true, counted: false },
  previous: { back: true, counted: false },
  prev: { back: true, counted: false },
  this: { back: false, counted: false, inclusive: true, weekdayOnly: true },
};

/** A word on the end that means the same as a lead, from the other side. */
const TRAILS: Record<string, boolean> = { ago: true, back: true, "from now": false };

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

/** The nouns a unit answers to, in the order rows are offered in. */
const UNIT_WORDS: Record<string, string> = {
  day: "d",
  week: "w",
  month: "M",
  quarter: "Q",
  year: "y",
};

/**
 * Every rule the words could mean, as rule tails, or nothing when they are not
 * a date.
 *
 * More than one comes back only from a prefix in the last word: `in 3 w` is
 * three weeks or three Wednesdays, and the list decides which.
 */
export function rulesFromWords(query: string): string[] {
  const words = split(query);
  if (words.length === 0) return [];

  const lead = LEADS[words[0]];
  const rest = lead === undefined ? words : words.slice(1);

  const trailWord = rest.length > 1 ? rest[rest.length - 1] : undefined;
  const trail = trailWord === undefined ? undefined : TRAILS[trailWord];
  const body = trail === undefined ? rest : rest.slice(0, -1);

  // A direction at both ends is not emphasis, it is two answers.
  if (lead !== undefined && trail !== undefined && (lead.back || trail)) return [];

  const count = countIn(body);
  if (count === null) return [];
  if (count.given && lead !== undefined && !lead.counted) return [];

  // A subject with nothing to qualify it: `week` is not a date, `friday` is.
  const bare = lead === undefined && !count.given;
  const back = lead?.back === true || trail === true;

  // `friday` on its own is the nearest one, today counting — the same reading
  // the bare token has. `this friday` says it in words; a count or a lead takes
  // it away, because `3 fridays ago` and `next friday` both have to move.
  const inclusive = (lead?.inclusive === true || bare) && count.value === 1;

  return subjects(count.subject, bare, lead?.weekdayOnly === true).map((subject) =>
    spell(subject, count.value, back, inclusive),
  );
}

/** Words, lowercased, with the two-word trail joined into one. */
function split(query: string): string[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter((word) => word !== "");
  const last = words.length >= 2 ? words.slice(-2).join(" ") : "";

  return last === "from now" ? [...words.slice(0, -2), last] : words;
}

/** The count and what is left after it, or null when the count is out of range. */
function countIn(body: string[]): { value: number; given: boolean; subject: string } | null {
  const head = body[0] ?? "";
  const digits = /^[0-9]+$/.test(head) ? Number(head) : undefined;
  const word = NUMBERS[head];
  const value = digits ?? word;

  if (value === undefined) return { value: 1, given: false, subject: body.join(" ") };
  if (value < 1 || value > 999) return null;

  return { value, given: true, subject: body.slice(1).join(" ") };
}

/**
 * The subjects a word could name, as `d`…`y` for a unit and `Mon`…`Sun` for a
 * weekday. The last word may be a prefix, so an empty one names them all.
 */
function subjects(word: string, bare: boolean, weekdayOnly: boolean): string[] {
  const units = bare
    ? []
    : Object.entries(UNIT_WORDS)
        .filter(([noun]) => noun.startsWith(singular(word)))
        .map(([, unit]) => unit);

  const days = DAY_WORDS.flatMap((name, index) =>
    name.startsWith(singular(word)) ? [WEEKDAYS[index]] : [],
  );

  return weekdayOnly ? days : [...units, ...days];
}

/** `weeks` and `fridays` are the same subject as `week` and `friday`. */
function singular(word: string): string {
  return word.endsWith("s") ? word.slice(0, -1) : word;
}

/** One subject in the stored spelling. */
function spell(subject: string, count: number, back: boolean, inclusive: boolean): string {
  const weekday = WEEKDAYS.includes(subject as (typeof WEEKDAYS)[number]);
  if (weekday && inclusive) return subject;

  return `${back ? "-" : "+"}${count}${subject}`;
}
```

Note on `subjects()`: a bare query gets no units, which is what refuses `week` while allowing `friday`. A unit word given with a count or a lead is fine, so `bare` is false in both of those.

Note on trails: `ago`, `back` and `from now` are matched by prefix like every other word, so `3 weeks a` is already three weeks back. The one collision is a single letter where a subject could also stand — `in 3 f` is three Fridays, and `3 from now` names no subject at all — so a trail is read only where what precedes it is already a whole phrase.

Note on `UNITS`: the import is there so the unit order is the language's own rather than this file's. If `UNIT_WORDS` and `UNITS` ever disagree, `UNITS` is right — add an assertion in the test rather than reordering by hand.

- [ ] **Step 5: Run the tests**

Run: `npx jest tests/typing/words.test.ts`
Expected: PASS.

Run: `npm test` and `npm run build`
Expected: PASS and clean. Nothing in the app has changed yet — this module has no caller.

- [ ] **Step 6: Propose the commit**

```
feat: read English date phrases into rules

- Understand next friday, in three weeks and 3 months ago as the dates they name
```

---

### Task 3: Wire the words into the list

**Files:**
- Modify: `src/typing/entries.ts`
- Test: `tests/typing/entries.test.ts`

**Interfaces:**
- Consumes: `rulesFromWords` (Task 2), the shared `seen` set (Task 1).
- Produces: no new exports. Word rows are `kind: "step"` rows — they carry a rule, they are labelled by its gloss, and Tab writes their canonical spelling.

- [ ] **Step 1: Write the failing test**

Append to `tests/typing/entries.test.ts`:

```ts
describe("words", () => {
  it("finds a date nobody named", () => {
    const [entry] = entriesFor("in three weeks", context);

    expect(entry).toEqual(
      expect.objectContaining({ kind: "step", keyword: "+3w", complete: "+3w " }),
    );
    expect(entry.kind === "step" && entry.day).toEqual({ year: 2026, month: 9, day: 4 });
  });

  it("writes the canonical spelling, not the words", () => {
    const [entry] = entriesFor("3 months ago", context);

    expect(entry.kind === "step" && entry.complete).toBe("-3M ");
    expect(entry.kind === "step" && entry.day).toEqual({ year: 2026, month: 5, day: 13 });
  });

  it("gives one row to the several ways of saying one date", () => {
    for (const query of ["in a month", "in 1 month", "in one month", "next month"]) {
      const rows = entriesFor(query, context).filter((entry) => entry.kind !== "invalid");

      expect(rows.filter((entry) => entry.kind !== "invalid" && entry.keyword === "+1M")).toHaveLength(1);
    }
  });

  it("lets a name win the row it shares with a phrase", () => {
    const names = [...context.names, { label: "Next Friday", rule: "today +1Fri" }];
    const entries = entriesFor("next friday", { ...context, names });

    expect(entries[0]).toEqual(
      expect.objectContaining({ kind: "named", label: "Next Friday" }),
    );
    expect(entries.filter((entry) => entry.kind !== "invalid" && entry.keyword === "+1Fri"))
      .toHaveLength(1);
  });

  it("reads words only in first position", () => {
    expect(entriesFor("2w next friday", context)).toEqual([{ kind: "invalid" }]);
    expect(entriesFor("next friday eow", context)).toEqual([{ kind: "invalid" }]);
  });

  it("leaves a sentence invalid", () => {
    expect(entriesFor("the friday after the sprint review", context)).toEqual([
      { kind: "invalid" },
    ]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx jest tests/typing/entries.test.ts -t words`
Expected: FAIL — every query comes back as the invalid row.

- [ ] **Step 3: Add the source**

In `src/typing/entries.ts`, import `rulesFromWords` and put the words between the names and the steps:

```ts
export function entriesFor(query: string, context: EntryContext): Entry[] {
  const seen = new Set<string>();
  const opening = namesAllowed(query);
  const named = opening ? namedEntries(query, context, seen) : [];
  const words = opening ? wordEntries(query, context, seen) : [];
  const entries = [...named, ...words, ...stepEntries(query, context, seen)];

  return entries.length === 0 ? [{ kind: "invalid" }] : entries;
}

/**
 * The rows a phrase reaches.
 *
 * A phrase is the whole query and only ever the first thing in it, the same
 * gate a name passes — `@next friday eow` is four words and no phrase, and the
 * way to that date is Tab after `@next friday`, which leaves the canonical
 * `+1Fri ` in the note for `eow` to follow.
 *
 * The row is a step row: it carries a rule, so it is labelled by that rule's
 * own gloss in the reader's language rather than by the English that found it,
 * and Tab writes the canonical spelling rather than the words.
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
```

- [ ] **Step 4: Run the tests**

Run: `npx jest tests/typing/entries.test.ts`
Expected: PASS, the whole file.

Run: `npm test` and `npm run build`
Expected: PASS and clean.

- [ ] **Step 5: Look at it**

In the app: `@next friday`, `@last friday`, `@in three weeks`, `@3 months ago`, `@in 200 days`, `@2 weeks from now`. Then the ones that must stay invalid: `@next 3 weeks`, `@this month`, `@week`, `@last friday ago`, `@the friday after the sprint review`.

Then the chain: `@next friday` → Tab → the note holds `@+1Fri ` with Accept on top → `eow` → Enter.

And the collapse: `@in a month`, `@in 1 month`, `@next month` each show one `+1M` row, while Start of next month keeps its own row as `+1M SoM`.

- [ ] **Step 6: Propose the commit**

```
feat: type a date in words

- Find dates by typing next friday, in three weeks or 3 months ago
- Show one row however a date was spelled
```

---

## Self-review notes

**Spec coverage.** Generated rows and their ordering → Task 1. The word table and its five refusals → Task 2. First-position gate, one-row-per-date, Tab writing canonical text, labelling by gloss → Task 3. The `moment.weekdays()` assumption → Task 1, Step 1, as a stop-and-report.

**One deliberate deviation.** The spec says a `NamedDate` carries a flag saying which half of the list it is in. It does not need one: `catalogue()` returns the curated rows first and the generated rows after, and `namedEntries` preserves that order, so position already says everything the flag would. The flag is worth adding the day something needs to *hide* rather than sort — which is a different feature.

**Two things a reviewer should check rather than trust:**

1. `trailReadings()` tries the last word and the last two, so `from n` reaches `from now`. It is unioned with the plain reading rather than replacing it, which is what lets two readings both stand where both are whole.
2. `countIn` returns `{ value: 1, given: false }` for a body whose first word is not a number, which is also what it returns for an empty body. Both are intended; `subjects()` is what separates them, through `bare`.
