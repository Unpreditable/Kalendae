# Typed Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Type `@` at the start of a word and pick a date from a list, instead of reaching for the command palette.

**Architecture:** Obsidian's `EditorSuggest` supplies the popup, so the keyboard, positioning, mobile behaviour and theming come from the app. Everything that decides what a query means lives in two new pure modules under `src/typing/`, which are unit-tested; `src/editor/date-suggest.ts` is the thin Obsidian-facing shell that cannot be tested and therefore holds no rules. The typed language is a looser spelling of the existing quick-date language and normalises into it, so nothing about resolving, formatting or spacing is written twice.

**Tech Stack:** TypeScript, Obsidian 1.13 API (`EditorSuggest`, `getSettingDefinitions`), CodeMirror 6 (external), moment (via `obsidian`), i18next, Jest + ts-jest.

**Spec:** [docs/superpowers/specs/2026-09-13-typed-dates-design.md](../specs/2026-09-13-typed-dates-design.md)

## Global Constraints

- **Scope of this plan:** build-order steps 1-4 of the spec plus the settings. **Your own named dates are out** — that topic is still open in the spec. Nothing here may add a settings collection of named rules.
- **Commits are proposed, never made.** Show the message and wait for an explicit yes before running `git commit`. Feature-level bullets of what changed, never why. No `Claude-Session` trailer.
- **English only until the end.** `src/i18n/locales/en.json` is the only locale to touch until Task 8. `npm run validate-translations` and `npm run release-check` fail before then, by design; use `npm run build` and `npm test` during the work.
- **Every user-visible string goes through `t()`** and gets a `<key>_comment` sibling in `en.json` explaining its context to translators.
- **`moment.utc(...)`, never a bare `moment(...)`** — the namespace stays callable under the Jest tsconfig's `esModuleInterop`, which the build tsconfig does not set.
- **Never bundle `@codemirror/state`, `@codemirror/view` or `@codemirror/language`** — they stay in the `external` list in `esbuild.config.mjs`.
- **CSS:** no `!important`, no inline styles, no `column-gap` (use the `gap` shorthand), Obsidian CSS variables for every colour, font and space.
- **Settings tab implements `getSettingDefinitions()` only.** No `display()` fallback. Prefer a declarative `control` over `render`. The field is `desc`, not `description`.
- **There is no "enabled" flag on a format.** Being in `settings.formats` is what makes a format active; the spec's "enabled formats" means "the entries in that list".
- **Tests are pure logic only** — no Obsidian API, no DOM, no editor. `tests/__mocks__/obsidian.ts` stands in for the `obsidian` module and re-exports the real moment.

---

## Status, 2026-09-19

**Tasks 1-5 are built and committed** in `cfbf27a`, along with the whole of the second plan
([2026-09-16-typed-dates-words.md](2026-09-16-typed-dates-words.md)). Their boxes are ticked below.
The named-day layer shipped in `e7e2d68`.

**Task 6, the format switch, was rewritten and built on 2026-09-18** and shipped in `45e88af`.

**Tasks 7 and 8 are outstanding.** Task 7 was rewritten on 2026-09-19 after the settings were
designed in conversation: the trigger is now a phrase of up to three characters, the rows are a
section of their own, and `commandOnly()` is left alone. Read it rather than remembering the first
draft.

Task 8 is smaller than it reads: every string that existed on 2026-09-17 is already translated into
all twelve locales, so it covers only what tasks 6 and 7 add.

The question that stood open in Task 7 is settled: the openers `(`, `{`, `"` and `'` are **allowed**
as triggers. They fire more often than anyone wants, but they are unwise rather than broken, and a
reader who minds can now type two characters instead.

---

### Task 1: The typed form normalises into a rule

The typed language differs from the stored one in three ways: no anchor, an unsigned count means forward, and case is ignored. One function turns typed text into a `Rule` by canonicalising each token and handing the result to the existing `parseRule()`, so there is exactly one parser and one definition of what a rule is.

**Files:**
- Modify: `src/picker/quick.ts` (append after `stepFor`, around line 130)
- Test: `tests/picker/quick.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: `parseRule()`, `UNITS`, `WEEKDAYS`, `EDGES`, `Rule` — all already exported from `src/picker/quick.ts`.
- Produces: `parseTyped(text: string): Rule | null` and `canonicalTyped(text: string): string | null`, both exported from `src/picker/quick.ts`. `canonicalTyped` returns the stored spelling of a typed query (`"2w eow"` → `"today +2w EoW"`); `parseTyped` returns the parsed rule or null.

- [x] **Step 1: Write the failing test**

Append to `tests/picker/quick.test.ts`:

```ts
describe("parseTyped", () => {
  it("supplies the anchor nobody types", () => {
    expect(parseTyped("+1d")).toEqual({
      anchor: "today",
      steps: [{ kind: "amount", count: 1, unit: "d", back: false }],
    });
  });

  it("reads an unsigned count as forward", () => {
    expect(parseTyped("3d")).toEqual(parseTyped("+3d"));
    expect(canonicalTyped("3d")).toBe("today +3d");
  });

  it("keeps a sign that means something", () => {
    expect(canonicalTyped("-3d")).toBe("today -3d");
  });

  it("ignores case on units, edges and weekdays", () => {
    expect(canonicalTyped("eom")).toBe("today EoM");
    expect(canonicalTyped("EOM")).toBe("today EoM");
    expect(canonicalTyped("2w")).toBe("today +2w");
    expect(canonicalTyped("2W")).toBe("today +2w");
    expect(canonicalTyped("fri")).toBe("today Fri");
    expect(canonicalTyped("2fri")).toBe("today +2Fri");
  });

  it("reads a bare weekday as the inclusive form and a counted one as strict", () => {
    expect(parseTyped("fri")).toEqual({
      anchor: "today",
      steps: [{ kind: "weekday", day: 5, count: 1, back: false, inclusive: true }],
    });
    expect(parseTyped("1fri")).toEqual({
      anchor: "today",
      steps: [{ kind: "weekday", day: 5, count: 1, back: false, inclusive: false }],
    });
  });

  it("chains steps across single spaces, and tolerates a trailing one", () => {
    expect(canonicalTyped("2w eow")).toBe("today +2w EoW");
    expect(canonicalTyped("2w ")).toBe("today +2w");
  });

  it("accepts an anchor typed by hand, and refuses the one with nothing to count from", () => {
    expect(canonicalTyped("today 1d")).toBe("today +1d");
    expect(parseTyped("date 1d")).toBeNull();
  });

  it("refuses anything that is not a rule", () => {
    expect(parseTyped("")).toBeNull();
    expect(parseTyped("next friday")).toBeNull();
    expect(parseTyped("xyz")).toBeNull();
    expect(parseTyped("today")).toBeNull();
  });
});
```

Add `canonicalTyped` and `parseTyped` to the import list at the top of the file.

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/picker/quick.test.ts -t parseTyped`
Expected: FAIL, `parseTyped is not a function`.

- [x] **Step 3: Write minimal implementation**

Append to `src/picker/quick.ts`, after `stepFor` and its `formatStep` helper:

```ts
/**
 * A rule from what someone typed, rather than from what the builder wrote.
 *
 * Three liberties the stored grammar does not take, each one because a reader
 * is holding the keyboard: the anchor is left out, since typing into empty text
 * has nothing but today to count from; an unsigned count means forward, since
 * that is the common case and the sign is noise; and case is ignored, since the
 * case rule is real and nobody should have to know it to find a token.
 *
 * `m` reads as months here, unlike the stored grammar where it is reserved for
 * minutes. There are no times yet, and a case rule that made `2m` and `2M` mean
 * different things is one nobody could guess. Revisit when TODO 3 lands.
 */
export function parseTyped(text: string): Rule | null {
  const canonical = canonicalTyped(text);

  return canonical === null ? null : parseRule(canonical);
}

/** The stored spelling of a typed query, or null when it is not one. */
export function canonicalTyped(text: string): string | null {
  const tokens = text.split(" ").filter((token) => token !== "");
  if (tokens.length === 0) return null;

  // An anchor is allowed to be typed, and only one of them can be: `date`
  // counts from a date in the note, and this language is used where there is
  // none.
  if (tokens[0].toLowerCase() === "date") return null;
  if (tokens[0].toLowerCase() === "today") tokens.shift();
  if (tokens.length === 0) return null;

  const steps: string[] = [];
  for (const token of tokens) {
    const step = canonicalStep(token);
    if (step === null) return null;
    steps.push(step);
  }

  return ["today", ...steps].join(" ");
}

const TYPED_AMOUNT = /^([+-]?)([1-9][0-9]{0,2})([a-zA-Z])$/;
const TYPED_DAY = /^([+-]?)([1-9][0-9]{0,2})?([a-zA-Z]{3})$/;

/** One typed token in the spelling `stepFor` expects, or null when it is not a step. */
function canonicalStep(token: string): string | null {
  const lower = token.toLowerCase();

  const edge = EDGES.find((value) => value.toLowerCase() === lower);
  if (edge !== undefined) return edge;

  const amount = TYPED_AMOUNT.exec(token);
  if (amount) {
    const unit = UNITS.find((value) => value.toLowerCase() === amount[3].toLowerCase());

    return unit === undefined ? null : `${amount[1] || "+"}${amount[2]}${unit}`;
  }

  const day = TYPED_DAY.exec(token);
  if (day) {
    const name = WEEKDAYS.find((value) => value.toLowerCase() === day[3].toLowerCase());
    if (name === undefined) return null;

    // No count and no sign is the inclusive form, which takes neither. A sign
    // on its own means once in that direction.
    if (day[2] === undefined) return day[1] === "" ? name : `${day[1]}1${name}`;

    return `${day[1] || "+"}${day[2]}${name}`;
  }

  return null;
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/picker/quick.test.ts`
Expected: PASS, the new block and every existing one.

Run: `npm run build`
Expected: no TypeScript or eslint errors.

- [x] **Step 5: Propose the commit**

```
feat: read the typed spelling of a quick-date rule

- Accept a rule typed without its anchor, with unsigned counts and in any case
```

Wait for an explicit yes, then:

```bash
git add src/picker/quick.ts tests/picker/quick.test.ts
git commit
```

---

### Task 2: Where a typed query starts

The word-start rule: `@` opens the menu at the start of a line, after whitespace, or after an opening bracket, and never inside a word, which is what keeps every email address in the vault from opening a date menu.

**Files:**
- Create: `src/typing/trigger.ts`
- Test: `tests/typing/trigger.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `triggerAt(line: string, caret: number, trigger: string): TypedQuery | null` and `interface TypedQuery { from: number; query: string }`, exported from `src/typing/trigger.ts`. `from` is the offset **within the line** of the trigger character itself; `query` is everything between it and the caret.

- [x] **Step 1: Write the failing test**

Create `tests/typing/trigger.test.ts`:

```ts
import { triggerAt } from "../../src/typing/trigger";

/**
 * The word-start rule, with no editor in sight: offsets are within one line,
 * because Obsidian hands a suggester one line at a time.
 */

describe("triggerAt", () => {
  it("fires at the start of a line", () => {
    expect(triggerAt("@tom", 4, "@")).toEqual({ from: 0, query: "tom" });
  });

  it("fires after a space", () => {
    expect(triggerAt("due @eom", 8, "@")).toEqual({ from: 4, query: "eom" });
  });

  it("fires after an opening bracket", () => {
    expect(triggerAt("(@1d", 4, "@")).toEqual({ from: 1, query: "1d" });
    expect(triggerAt("[@1d", 4, "@")).toEqual({ from: 1, query: "1d" });
  });

  it("does not fire inside a word", () => {
    expect(triggerAt("dvitaly@gmail.com", 12, "@")).toBeNull();
    expect(triggerAt("a@b", 3, "@")).toBeNull();
  });

  it("returns an empty query for the trigger alone", () => {
    expect(triggerAt("due @", 5, "@")).toEqual({ from: 4, query: "" });
  });

  it("keeps spaces inside the query, so a chain stays open", () => {
    expect(triggerAt("@2w eow", 7, "@")).toEqual({ from: 0, query: "2w eow" });
  });

  it("takes the nearest trigger before the caret", () => {
    expect(triggerAt("@1d and @2d", 11, "@")).toEqual({ from: 8, query: "2d" });
  });

  it("ignores a trigger after the caret", () => {
    expect(triggerAt("due @eom", 3, "@")).toBeNull();
  });

  it("honours a trigger character other than @", () => {
    expect(triggerAt("due ;eom", 8, ";")).toEqual({ from: 4, query: "eom" });
    expect(triggerAt("due ;eom", 8, "@")).toBeNull();
  });

  it("refuses a trigger that is not one character", () => {
    expect(triggerAt("due @eom", 8, "")).toBeNull();
    expect(triggerAt("due @@eom", 9, "@@")).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/typing/trigger.test.ts`
Expected: FAIL, cannot find module `../../src/typing/trigger`.

- [x] **Step 3: Write minimal implementation**

Create `src/typing/trigger.ts`:

```ts
/**
 * Where a typed date query starts, and what has been typed into it.
 *
 * Pure, like `scan.ts` beside it: Obsidian's suggester hands over a line and a
 * caret, and every rule about whether those two amount to a query is testable
 * without an editor.
 */

/** A query in progress: where its trigger sits in the line, and what follows it. */
export interface TypedQuery {
  /** Offset within the line of the trigger character itself. */
  from: number;
  /** Everything between the trigger and the caret. Empty is a real answer. */
  query: string;
}

/**
 * An opening bracket counts as the start of a word, so `(@1d` and `[@1d` open
 * the menu. A quote does too: it is how a date lands inside quoted text.
 */
const OPENERS = new Set(["(", "[", "{", '"', "'"]);

/**
 * The query the caret is in, or null when it is not in one.
 *
 * The trigger must **start a word**: the line's first character, or one after
 * whitespace or an opener. Without that rule every email address in the vault
 * opens a date menu, and no amount of filtering afterwards makes that pleasant.
 *
 * Spaces inside the query are kept, which is what lets a chain — `@2w EoW` —
 * stay one query. Nothing closes the menu here; an unmatched query is a
 * question for `entriesFor`, which answers it with a row rather than by giving
 * up, so backspace can still repair it.
 */
export function triggerAt(line: string, caret: number, trigger: string): TypedQuery | null {
  if (trigger.length !== 1 || caret <= 0) return null;

  const from = line.lastIndexOf(trigger, caret - 1);
  if (from === -1) return null;

  const before = from === 0 ? "" : line[from - 1];
  if (before !== "" && !/\s/.test(before) && !OPENERS.has(before)) return null;

  return { from, query: line.slice(from + 1, caret) };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/typing/trigger.test.ts`
Expected: PASS, eleven assertions' worth.

Run: `npm run build`
Expected: clean.

- [x] **Step 5: Propose the commit**

```
feat: find a typed date query in a line

- Open the list only where the trigger character starts a word
```

Wait for a yes, then `git add src/typing/trigger.ts tests/typing/trigger.test.ts && git commit`.

---

### Task 3: The rows a query produces

The list is names first, rules second, and one "Invalid date" row when neither matches. Names arrive as data so this module never touches i18n; the suggest passes the translated catalogue in and reads a step row's wording back out through `glossFor()`.

**Files:**
- Create: `src/typing/entries.ts`
- Test: `tests/typing/entries.test.ts`

**Interfaces:**
- Consumes: `parseTyped`, `canonicalTyped`, `resolveRule`, `suggestionsFor`, `Rule` from `src/picker/quick.ts`; `DayKey` from `src/picker/month.ts`.
- Produces, all from `src/typing/entries.ts`:
  - `interface NamedDate { label: string; rule: string | null }` — `rule` in the stored spelling, anchored on `today`, or **null for today itself**, which is not a rule: `parseRule` refuses `today` alone because a step that moves nowhere is not a step.
  - `interface EntryContext { today: DayKey; firstDay: number; names: NamedDate[] }`
  - `type Entry = { kind: "named"; label: string; keyword: string; day: DayKey; rule: Rule | null } | { kind: "step"; keyword: string; day: DayKey; rule: Rule } | { kind: "invalid" }`
  - `entriesFor(query: string, context: EntryContext): Entry[]` — never empty.

- [x] **Step 1: Write the failing test**

Create `tests/typing/entries.test.ts`:

```ts
import { EntryContext, entriesFor } from "../../src/typing/entries";

/**
 * What a query puts in the list. Weekday numbers are moment's — Sunday 0 —
 * and months are 0-based, as everywhere else in this codebase.
 *
 * Today is Sunday 13 September 2026 throughout, and the week starts on Sunday,
 * which is what makes the end of this week Saturday.
 */
const context: EntryContext = {
  today: { year: 2026, month: 8, day: 13 },
  firstDay: 0,
  names: [
    { label: "Today", rule: null },
    { label: "Tomorrow", rule: "today +1d" },
    { label: "Next Friday", rule: "today +1Fri" },
    { label: "End of this month", rule: "today EoM" },
  ],
};

describe("entriesFor", () => {
  it("lists every name for the trigger alone", () => {
    const entries = entriesFor("", context);

    expect(entries.map((entry) => entry.kind === "named" && entry.label)).toEqual([
      "Today",
      "Tomorrow",
      "Next Friday",
      "End of this month",
    ]);
  });

  it("carries the row that is today itself, which is not a rule", () => {
    expect(entriesFor("today", context)).toEqual([
      {
        kind: "named",
        label: "Today",
        keyword: "today",
        day: { year: 2026, month: 8, day: 13 },
        rule: null,
      },
    ]);
    expect(entriesFor("tod", context)[0]).toEqual(entriesFor("today", context)[0]);
  });

  it("reads an anchor typed by hand followed by a step", () => {
    const [entry] = entriesFor("today 1d", context);

    expect(entry.kind).toBe("step");
    expect(entry.kind === "step" && entry.keyword).toBe("+1d");
    expect(entry.kind === "step" && entry.day).toEqual({ year: 2026, month: 8, day: 14 });
  });

  it("narrows to the names that start with what was typed, ignoring case", () => {
    expect(entriesFor("tom", context)).toEqual([
      {
        kind: "named",
        label: "Tomorrow",
        keyword: "+1d",
        day: { year: 2026, month: 8, day: 14 },
        rule: { anchor: "today", steps: [{ kind: "amount", count: 1, unit: "d", back: false }] },
      },
    ]);
  });

  it("resolves a name to a day, not to today", () => {
    const [entry] = entriesFor("end of this m", context);

    expect(entry.kind === "named" && entry.day).toEqual({ year: 2026, month: 8, day: 30 });
  });

  it("offers step rows once the query reads as a rule", () => {
    const entries = entriesFor("2", context);

    expect(entries.every((entry) => entry.kind === "step")).toBe(true);
    expect(entries.map((entry) => entry.kind === "step" && entry.keyword)).toEqual(
      expect.arrayContaining(["+2d", "+2w", "+2M", "+2Q", "+2y"]),
    );
  });

  it("resolves a step row through the whole chain", () => {
    // Two weeks on is Sunday 27 September; the end of the week that Sunday
    // starts, with the week starting on Sunday, is Saturday 3 October.
    const entries = entriesFor("2w Eo", context);
    const week = entries.find((entry) => entry.kind === "step" && entry.keyword === "+2w EoW");

    expect(week && week.kind === "step" && week.day).toEqual({ year: 2026, month: 9, day: 3 });
  });

  it("answers an unmatched query with one invalid row", () => {
    expect(entriesFor("nonsense", context)).toEqual([{ kind: "invalid" }]);
    expect(entriesFor("2w lunch", context)).toEqual([{ kind: "invalid" }]);
  });

  it("puts a name before a rule that reads the same way", () => {
    const entries = entriesFor("e", context);

    expect(entries[0].kind).toBe("named");
  });

  it("lists one row for a name and a step that mean the same thing", () => {
    // "End of this month" is a name and `EoM` is a step, and they are one date.
    const keywords = entriesFor("eo", context).map(
      (entry) => entry.kind !== "invalid" && entry.keyword,
    );

    expect(keywords.filter((keyword) => keyword === "EoM")).toHaveLength(1);
    expect(keywords).toEqual(expect.arrayContaining(["EoW", "EoQ", "EoY"]));
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/typing/entries.test.ts`
Expected: FAIL, cannot find module `../../src/typing/entries`.

- [x] **Step 3: Write minimal implementation**

Create `src/typing/entries.ts`:

```ts
import { DayKey } from "../picker/month";
import { Rule, canonicalTyped, parseTyped, resolveRule, suggestionsFor } from "../picker/quick";

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
}

export interface EntryContext {
  today: DayKey;
  /** The week's first day as moment counts them, from `firstDayOf(settings.weekStart)`. */
  firstDay: number;
  names: NamedDate[];
}

export type Entry =
  | { kind: "named"; label: string; keyword: string; day: DayKey; rule: Rule }
  | { kind: "step"; keyword: string; day: DayKey; rule: Rule }
  | { kind: "invalid" };

/**
 * The rows for a query, never empty.
 *
 * Names are matched first and on the whole query, because a name may contain
 * spaces and so may a chain: `end of` is a name half-typed and `2w Eo` is a
 * rule half-typed, and trying rules first would call the former broken while
 * the reader is spelling it correctly.
 *
 * Nothing here closes the menu. A query that matches nothing is a row saying
 * so, which is what leaves backspace able to repair it.
 */
export function entriesFor(query: string, context: EntryContext): Entry[] {
  const named = namedEntries(query, context);
  // A name and a step can be one date — "End of this month" is `EoM` — and the
  // name is the row worth keeping. What the names have claimed is handed to the
  // steps rather than filtered afterwards, so the order never has to be redone.
  const claimed = new Set(
    named.flatMap((entry) =>
      entry.kind === "named" && entry.rule !== null ? [`today ${entry.keyword}`] : [],
    ),
  );
  const entries = [...named, ...stepEntries(query, context, claimed)];

  return entries.length === 0 ? [{ kind: "invalid" }] : entries;
}

function namedEntries(query: string, context: EntryContext): Entry[] {
  const wanted = query.trim().toLowerCase();

  return context.names.flatMap((name): Entry[] => {
    if (!name.label.toLowerCase().startsWith(wanted)) return [];

    if (name.rule === null) {
      return [{ kind: "named", label: name.label, keyword: "today", day: context.today, rule: null }];
    }

    const rule = parseTyped(name.rule);
    if (rule === null) return [];

    return [
      {
        kind: "named",
        label: name.label,
        keyword: keywordOf(name.rule),
        day: resolveRule(rule, { value: context.today, today: context.today, firstDay: context.firstDay }),
        rule,
      },
    ];
  });
}

/**
 * The rule rows: the query itself when it already reads as one, then every
 * token that could stand where the caret is.
 *
 * `suggestionsFor` speaks the stored language, where token 0 is the anchor, so
 * the query is offered to it with `today ` in front and the caret moved along
 * by the same six characters.
 */
function stepEntries(query: string, context: EntryContext, claimed: Set<string>): Entry[] {
  if (query.trim() === "") return [];

  const entries: Entry[] = [];
  const seen = new Set(claimed);

  for (const candidate of [query, ...completions(query)]) {
    const canonical = canonicalTyped(candidate);
    if (canonical === null || seen.has(canonical)) continue;

    const rule = parseTyped(candidate);
    if (rule === null) continue;

    seen.add(canonical);
    entries.push({
      kind: "step",
      keyword: keywordOf(canonical),
      day: resolveRule(rule, { value: context.today, today: context.today, firstDay: context.firstDay }),
      rule,
    });
  }

  return entries;
}

/**
 * Every query one completion of the last token would make.
 *
 * Two translations happen here, both from the typed spelling into the stored
 * one `suggestionsFor` speaks. The anchor goes on the front, and the caret moves
 * along by the same six characters. And an unsigned count gets its `+` before
 * being offered: `suggestionsFor` builds its candidates from the sign and digits
 * already typed, so a bare `2` would come back offering `+1d` — every step for a
 * count of one, none of them matching what was typed.
 */
function completions(query: string): string[] {
  const head = query.slice(0, lastTokenStart(query));
  const last = query.slice(lastTokenStart(query));
  const text = `today ${head}${/^[0-9]/.test(last) ? `+${last}` : last}`;

  return suggestionsFor(text, text.length).map((token) => `${head}${token}`);
}

function lastTokenStart(query: string): number {
  return query.lastIndexOf(" ") + 1;
}

/** The keyword a row advertises: the stored rule without the anchor nobody types. */
function keywordOf(rule: string): string {
  return rule.startsWith("today ") ? rule.slice("today ".length) : rule;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/typing/entries.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS, every existing suite included.

Run: `npm run build`
Expected: clean.

- [x] **Step 5: Propose the commit**

```
feat: build the list a typed date query offers

- Match a name first and a rule second, and answer an unmatched query with one row
```

---

### Task 4: The suggester, on the built-in names

The first task with something to look at. Fixed `@`, no settings, no format switch: the menu opens, lists the catalogue, narrows as you type, and writes a date.

**Files:**
- Create: `src/editor/date-suggest.ts`
- Modify: `src/main.ts` (register the suggester in `onload`, after `registerEditorExtension`)
- Modify: `src/i18n/locales/en.json` (one new key, `typing.invalid`)
- Test: none — `EditorSuggest` is Obsidian's and cannot be unit-tested. The rules it applies are Tasks 1-3, which are.

**Interfaces:**
- Consumes: `triggerAt` (Task 2), `entriesFor`, `Entry`, `NamedDate` (Task 3), `parseTyped`/`canonicalTyped` (Task 1), plus the existing `presetsAnchoredOn`, `QUICK_PRESETS`, `glossFor`, `insertionFor`, `todayKey`, `firstDayOf`, `editorViewIn`, `classifyContext`, `frontmatterEnd`, `SCOPE_SETTING`.
- Produces: `class KalendaeDateSuggest extends EditorSuggest<Entry>`, constructed as `new KalendaeDateSuggest(app, () => plugin.settings)`.

- [x] **Step 1: Add the one new string**

In `src/i18n/locales/en.json`, add a `typing` section beside the existing top-level sections:

```json
"typing": {
  "invalid_comment": "The only row in the date list when what has been typed is not a date the plugin understands. Not an error: the reader can carry on typing, backspace to fix it, or press Escape and leave the text alone. Keep it short — it sits in a one-line row.",
  "invalid": "Invalid date"
}
```

- [x] **Step 2: Write the suggester**

Create `src/editor/date-suggest.ts`:

```ts
import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  MarkdownView,
  TFile,
} from "obsidian";
import { syntaxTree } from "@codemirror/language";
import { SCOPE_SETTING, classifyContext, frontmatterEnd } from "../detect/context";
import { firstDayOf, todayKey } from "../picker/month";
import { QUICK_PRESETS, presetsAnchoredOn } from "../picker/quick";
import { glossFor } from "../picker/quick-text";
import { insertionFor } from "../picker/write";
import { KalendaeSettings } from "../settings";
import { Entry, NamedDate, entriesFor } from "../typing/entries";
import { triggerAt } from "../typing/trigger";
import { t } from "../i18n/i18n";
import { editorViewIn } from "./DatePickerExtension";

/**
 * The list of dates that opens while you type.
 *
 * Obsidian's own popup, which is why this class is as thin as it is: the
 * keyboard, the positioning, the mobile behaviour and the theming are the
 * app's, and every rule about what a query means lives in `typing/`, where it
 * can be tested. Nothing here decides anything a test could have caught.
 *
 * The query is real text in the note the whole time — there is no input box —
 * so an abandoned query stays as text, exactly like an abandoned `[[`.
 */
export class KalendaeDateSuggest extends EditorSuggest<Entry> {
  constructor(
    app: App,
    private readonly settings: () => KalendaeSettings,
  ) {
    super(app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
    const settings = this.settings();
    const found = triggerAt(editor.getLine(cursor.line), cursor.ch, TRIGGER);
    if (found === null) return null;

    const start = { line: cursor.line, ch: found.from };
    if (!inScope(editor, start, settings)) return null;

    return { start, end: cursor, query: found.query };
  }

  getSuggestions(context: EditorSuggestContext): Entry[] {
    const settings = this.settings();

    return entriesFor(context.query, {
      today: todayKey(),
      firstDay: firstDayOf(settings.weekStart),
      names: catalogue(),
    });
  }

  renderSuggestion(entry: Entry, el: HTMLElement): void {
    if (entry.kind === "invalid") {
      el.createSpan({ cls: "kalendae-suggest-invalid", text: t("typing.invalid") });
      return;
    }

    el.addClass("kalendae-suggest-row");
    el.createSpan({
      cls: "kalendae-suggest-label",
      text: entry.kind === "named" ? entry.label : glossFor(entry.rule),
    });
    el.createSpan({ cls: "kalendae-suggest-keyword", text: entry.keyword });
    el.createSpan({ cls: "kalendae-suggest-day", text: dayText(entry.day) });
  }

  /**
   * Writes the date, or closes on the invalid row without touching the text.
   *
   * `insertionFor` is the insert command's own write, so the spacing rule that
   * keeps an inserted date findable again is not reimplemented here. The range
   * runs from the trigger character to the caret, so the trigger is consumed.
   */
  selectSuggestion(entry: Entry, _evt: MouseEvent | KeyboardEvent): void {
    const context = this.context;
    if (context === null) return;
    if (entry.kind === "invalid") {
      this.close();
      return;
    }

    const { editor } = context;
    const from = editor.posToOffset(context.start);
    const to = editor.posToOffset(context.end);
    const insert = insertionFor(
      editor.getValue(),
      from,
      to,
      this.settings().formats[0].pattern,
      entry.day,
    );

    editor.replaceRange(insert, context.start, context.end);
    editor.setCursor(editor.offsetToPos(from + insert.length));
  }
}

/** Fixed until the settings land; see the plan's Task 7. */
const TRIGGER = "@";

/**
 * The built-in names, in the catalogue's own order, with Today at the head.
 *
 * Today is not in `QUICK_PRESETS` — the calendar's Today button is permanent
 * and unconfigurable, so it was never a preset — and `today` alone is not a
 * rule either. It is the rule-less `NamedDate`, and it reuses the button's own
 * string rather than adding a second "Today" to translate.
 */
function catalogue(): NamedDate[] {
  return [
    { label: t("picker.today"), rule: null },
    ...presetsAnchoredOn("today").map((preset) => ({
      label: t(`settings.quickDates.presets.${preset.id}`),
      rule: preset.rule,
    })),
  ];
}
```

- [x] **Step 3: Add the scope gate and the day text**

Append to `src/editor/date-suggest.ts`:

```ts
/**
 * Whether the plugin works where the caret is.
 *
 * The scope toggles, not `commandScopes`: a command is asked for by name and
 * treats every context as plain text, but a menu that opens itself is not asked
 * for. `@property`, `@media` and `@Override` are the false fires that matter,
 * and all three live in code.
 */
function inScope(editor: Editor, at: EditorPosition, settings: KalendaeSettings): boolean {
  const view = editorViewIn(activeContent(editor));
  if (view === null) return true;

  const offset = editor.posToOffset(at);
  const context = classifyContext(
    syntaxTree(view.state),
    frontmatterEnd(view.state.doc.sliceString(0, Math.min(offset, FRONTMATTER_PREFIX))),
    offset,
    offset,
  );

  return context.scope === "prose" || settings[SCOPE_SETTING[context.scope]];
}

/** Matches `detect.ts`: no note puts frontmatter further in than this. */
const FRONTMATTER_PREFIX = 4000;

function dayText(day: { year: number; month: number; day: number }): string {
  return moment.utc(day).format("D MMM");
}
```

`activeContent(editor)` needs the `MarkdownView`'s `contentEl`, which `editorViewIn` takes. Get it from the workspace rather than the editor:

```ts
private content(): HTMLElement | null {
  return this.app.workspace.getActiveViewOfType(MarkdownView)?.contentEl ?? null;
}
```

Make `inScope` a private method that uses it, rather than a free function, and return `true` when there is no view — a suggester with no scope information should behave as it does in prose rather than refuse to open.

Check `FRONTMATTER_PREFIX` against `src/detect/detect.ts` and reuse its constant if it is exported; if it is not, export it there rather than writing a second number.

Add `moment` to the `obsidian` import list.

- [x] **Step 4: Register it**

In `src/main.ts`, inside `onload()`, after `this.registerEditorExtension(...)`:

```ts
this.registerEditorSuggest(new KalendaeDateSuggest(this.app, () => this.settings));
```

and import it: `import { KalendaeDateSuggest } from "./editor/date-suggest";`

- [x] **Step 5: Build and try it**

Run: `npm run build`
Expected: clean. Then confirm the CodeMirror packages stayed external:

```bash
grep -o 'require("@codemirror/[a-z]*")' main.js | sort -u   # state, language, view
grep -c "class EditorView" main.js                          # 0
```

With `npm run dev` running and Hot Reload installed, in a scratch note:

| Type | Expect |
|---|---|
| `@` | the catalogue, dates on the right |
| `@tom` | Tomorrow alone |
| `@2w` | rows for two weeks out, and completions |
| `@2w eow` | a row resolving to the end of that week |
| Enter on any row | the date written, the `@` and the query gone |
| `@nonsense` | one row, "Invalid date" |
| backspace to `@non` → `@` | the full list back |
| Escape | menu closed, text left as typed |
| `word@tom` | no menu |
| `@tom` inside a fenced code block | no menu |
| Ctrl+Z after accepting | the typed text back, in one undo |

- [x] **Step 6: Stop and look**

This is the spec's review checkpoint. Do not carry on to Task 5 before Vitaly has seen the list and ruled on the row layout, the wording, and whether Today belongs in it.

- [x] **Step 7: Propose the commit**

```
feat: open a list of dates while typing

- Type @ at the start of a word to pick a date without leaving the keyboard
- Narrow the list by name or by rule, and write the date in the first format
```

---

### Task 5: The row layout

Whatever came out of the checkpoint. Everything here is CSS and wording, not behaviour.

**Files:**
- Modify: `styles.css` (append a section at the end, beside the other panel rules)
- Modify: `src/editor/date-suggest.ts` (`renderSuggestion` only)
- Modify: `src/i18n/locales/en.json` (only if the checkpoint asked for new wording)

- [x] **Step 1: Write the rules**

Scope every rule under the classes this plugin adds, never under Obsidian's own `.suggestion-item`: a bare `.suggestion-item` rule restyles every suggester in the app, including the ones other plugins own.

```css
/* The list of dates that opens while typing. Three columns, because a row says
   three things: what it means, the keyword that produces it, and the day. The
   keyword column is what makes the list a cheat sheet rather than only a menu —
   a reader who came for Tomorrow leaves knowing `1d` exists. */
.kalendae-suggest-row {
  align-items: baseline;
  display: flex;
  gap: var(--size-4-2);
}

.kalendae-suggest-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kalendae-suggest-keyword {
  color: var(--text-muted);
  font-family: var(--font-monospace);
  font-size: var(--font-ui-smaller);
}

.kalendae-suggest-day {
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
}

.kalendae-suggest-invalid {
  color: var(--text-muted);
}
```

- [x] **Step 2: Check it against both themes and a narrow pane**

Light and dark, one theme other than the default, and a pane narrow enough to make a long name run out of room. The name should ellipsise; the keyword and the day should not move.

- [x] **Step 3: Propose the commit**

```
style: lay out the rows of the typed date list
```

---

### Task 6: The format switch

The format character after a date turns the list into that day written each way you have configured.

> **Rewritten 2026-09-18** against the spec's *Three consequences elsewhere*. The first draft read
> the day out of the text in front of the character and went inert unless exactly one row answered.
> It acts on the row the reader has **highlighted** instead, which is the only reading that works
> for a query naming two days — `@nov 3` is two Novembers and the reader means the one they arrowed
> to.

**Files:**
- Modify: `src/typing/entries.ts`
- Modify: `src/editor/date-suggest.ts`
- Modify: `src/i18n/locales/en.json`
- Test: `tests/typing/entries.test.ts` (append a `describe`)

**Interfaces:**
- `EntryContext` gains `formats: readonly DateFormatEntry[]` and `formatChar: string`.
- `Entry` gains `{ kind: "format"; pattern: string; text: string; day: DayKey }`, where `text` is
  the day already rendered through `pattern` — the row shows it and the write uses the pattern.

**Two paths to one place.** On a desktop the character is a key: the popup's scope catches it,
completes the highlighted row into the note and puts the character after it, so `@nov 3` with the
2025 row lit becomes `@nov 3 2025_`. That is `date-suggest.ts`, and it cannot be tested. When the
character simply arrives as text — a mobile keyboard may fire no key event at all — it means the day
the **first** row names. That is `entries.ts`, it is pure, and it carries every rule below. The two
agree on a desktop, because the handler has just made the first row the highlighted one.

- [x] **Step 1: Write the failing test**

Append to `tests/typing/entries.test.ts`:

```ts
const withFormats: EntryContext = {
  ...context,
  formats: [
    { id: "iso", pattern: "YYYY-MM-DD" },
    { id: "custom-1", pattern: "DD/MM/YYYY" },
    { id: "custom-2", pattern: "MMM D, YYYY" },
  ],
};

describe("the format switch", () => {
  it("lists the day in every format, in list order", () => {
    expect(entriesFor("tom_", withFormats)).toEqual([
      { kind: "format", pattern: "YYYY-MM-DD", text: "2026-09-14", day: { year: 2026, month: 8, day: 14 } },
      { kind: "format", pattern: "DD/MM/YYYY", text: "14/09/2026", day: { year: 2026, month: 8, day: 14 } },
      { kind: "format", pattern: "MMM D, YYYY", text: "Sep 14, 2026", day: { year: 2026, month: 8, day: 14 } },
    ]);
  });

  it("works on a rule as well as a name", () => {
    expect(entriesFor("2w eow_", withFormats)[0]).toEqual({
      kind: "format",
      pattern: "YYYY-MM-DD",
      text: "2026-10-03",
      day: { year: 2026, month: 9, day: 3 },
    });
  });

  it("takes the first row where a query answers with several", () => {
    const [first] = entriesFor("e", withFormats);

    expect(entriesFor("e_", withFormats)[0]).toMatchObject({
      kind: "format",
      day: first.kind === "invalid" ? null : first.day,
    });
  });

  it("takes the nearest year forward where a named day gives two", () => {
    expect(entriesFor("nov 3_", withFormats)[0]).toEqual({
      kind: "format",
      pattern: "YYYY-MM-DD",
      text: "2026-11-03",
      day: { year: 2026, month: 10, day: 3 },
    });
  });

  it("reads a completed query, which is what the key handler leaves behind", () => {
    expect(entriesFor("nov 3 2025_", withFormats)[0]).toMatchObject({ text: "2025-11-03" });
    expect(entriesFor("1d_", withFormats)[0]).toMatchObject({ text: "2026-09-14" });
  });

  it("narrows the formats by what follows the character", () => {
    expect(entriesFor("tom_14/", withFormats)).toEqual([
      { kind: "format", pattern: "DD/MM/YYYY", text: "14/09/2026", day: { year: 2026, month: 8, day: 14 } },
    ]);
  });

  it("is an ordinary character when the query does not resolve", () => {
    expect(entriesFor("nonsense_", withFormats)).toEqual([{ kind: "invalid" }]);
  });

  it("is an ordinary character when only one format is in the list", () => {
    const single = { ...withFormats, formats: [{ id: "iso", pattern: "YYYY-MM-DD" }] };

    expect(entriesFor("tom_", single)).toEqual([{ kind: "invalid" }]);
  });

  it("follows a configured character other than the default", () => {
    const comma = { ...withFormats, formatChar: "," };

    expect(entriesFor("tom,", comma)).toHaveLength(3);
    expect(entriesFor("tom_", comma)).toEqual([{ kind: "invalid" }]);
  });
});
```

Add `formats: [{ id: "iso", pattern: "YYYY-MM-DD" }]` and `formatChar: "_"` to the shared `context`
object at the top of the file, so the earlier tests keep compiling with the widened type and the
single-format default keeps the switch inert there.

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/typing/entries.test.ts -t "format switch"`
Expected: FAIL on the first case — the switch is not read yet, so `tom_` matches no name and
produces the invalid row.

- [x] **Step 3: Write the implementation**

In `src/typing/entries.ts`, ask the switch first and fall through to the rows as they are today:

```ts
export function entriesFor(query: string, context: EntryContext): Entry[] {
  const chosen = formatEntries(query, context);
  if (chosen !== null) return chosen.length === 0 ? [{ kind: "invalid" }] : chosen;

  return ordinaryEntries(query, context);
}
```

`ordinaryEntries` is today's body, moved down unchanged. The split is what keeps a second format
character in the query from being read as a second switch, and it is plainer than recursing with the
formats emptied — a reader can see that nothing re-enters the switch rather than having to reason
that it terminates.

```ts
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

  const day = dayFor(query.slice(0, at), context);
  if (day === null) return null;

  const wanted = query.slice(at + context.formatChar.length).toLowerCase();

  return context.formats.flatMap((format): Entry[] => {
    const text = renderPattern(format.pattern, day);

    return text.toLowerCase().startsWith(wanted)
      ? [{ kind: "format", pattern: format.pattern, text, day }]
      : [];
  });
}

/**
 * The day the switch acts on: the first row the text answers with.
 *
 * The first row, not the only row. On a desktop the character is a key, and by
 * the time this reads the text the handler has already completed the
 * highlighted row into it — so the first row is that row. Where no key event
 * ever arrives, as on a mobile keyboard, the first row is the one Enter would
 * have taken anyway. Either way it is a single day, which is what the earlier
 * draft's "exactly one row" test was reaching for and refused too much to get:
 * it left `@e_` and `@nov 3_` inert.
 */
function dayFor(query: string, context: EntryContext): DayKey | null {
  const [first] = ordinaryEntries(query, context);

  return first.kind === "invalid" ? null : first.day;
}
```

Import `renderPattern` and `DateFormatEntry` from `../detect/formats`.

- [x] **Step 4: Run the tests**

Run: `npx jest tests/typing/entries.test.ts`
Expected: PASS, every earlier block included.

- [x] **Step 5: The key handler**

In `date-suggest.ts`, beside the Tab registration:

```ts
const FORMAT_CHAR = "_";

this.scope.register(null, FORMAT_CHAR, (event) => {
  const chooser = this.chooser();
  if (chooser === null) return true;

  chooser.useSelectedItem(event);

  return false;
});
```

`null` modifiers rather than `[]`: the character is shifted on most layouts, and the one Task 7
makes settable may be shifted on some and not others. The chooser is reused exactly as Tab reuses
it — `useSelectedItem` hands the event to `selectSuggestion`, which is where the branch goes:

```ts
if (evt instanceof KeyboardEvent && evt.key === FORMAT_CHAR) {
  this.switchFormat(entry, range);
  return;
}
```

ahead of the Tab branch, and reached on the invalid row too, so that branch moves above the
`entry.kind === "invalid"` early return. `switchFormat` writes the row's completion and the
character in one go, through `complete()`:

```ts
/**
 * Completes the highlighted row into the note and opens the formats on it.
 *
 * The completion is trimmed, where Tab leaves it with its trailing space: a
 * space invites another step, and the format character ends the query rather
 * than continuing it. A row with nothing to complete — Accept, a finished named
 * day — keeps the text as it stands, and so does a query with nothing to act
 * on: with one format configured, or on the invalid row, the character is
 * written as the ordinary character it is and the list answers accordingly.
 */
private switchFormat(entry: Entry, range: WriteRange): void {
  const query = this.context?.query ?? "";
  const completion =
    this.settings().formats.length < 2 || entry.kind === "invalid"
      ? query
      : (completionOf(entry) ?? query).trimEnd();

  this.complete(`${completion}${FORMAT_CHAR}`, range);
}
```

- [x] **Step 6: Render and write a format row**

`getSuggestions` passes the two new fields — `formats: settings.formats` and
`formatChar: FORMAT_CHAR`.

In `renderSuggestion`, ahead of the `accepting` line, a format row is one column: the rendered date,
with no keyword and no day. The row *is* the day.

```ts
if (entry.kind === "format") {
  el.addClass("kalendae-suggest-row");
  el.createSpan({ cls: "kalendae-suggest-label", text: entry.text });
  return;
}
```

In `selectSuggestion`, the write takes the row's own pattern:

```ts
const pattern = entry.kind === "format" ? entry.pattern : this.settings().formats[0].pattern;
```

`completionOf` returns null for a format row, so Tab writes rather than completes — there is nothing
left to add. `labelFor` and `trailingText` are never reached on one.

- [x] **Step 7: The footer instructions**

Four rows, from `getSuggestions` where the settings are to hand rather than once in the constructor,
since the last row depends on how many formats are configured:

```ts
this.setInstructions([
  { command: "↑↓", purpose: t("typing.instructions.navigate") },
  { command: "↵", purpose: t("typing.instructions.accept") },
  { command: "Tab", purpose: t("typing.instructions.complete") },
  ...(settings.formats.length < 2
    ? []
    : [{ command: FORMAT_CHAR, purpose: t("typing.instructions.format") }]),
]);
```

**`Tab` is the word, not `⇥`.** The glyph reads as an indent to most people, and Obsidian's own
suggesters already spell `esc` out beside `↑↓` and `↵`.

Four strings under `typing.instructions` in `en.json`, each with its `_comment` sibling. They sit in
a footer a few characters wide: a verb, not a sentence.

- [x] **Step 8: Try it**

With two or more formats configured: `@tom` then `_` lists tomorrow written each way, and Enter
writes the one highlighted. Arrow down to another row before pressing `_` and the formats are for
**that** day — `@nov 3`, down one, `_` gives 3 November last year. `@nov 3` and `_` with nothing
moved gives this year. Undo takes the whole thing back to the text as typed. With one format
configured, `_` is an ordinary character and the row reads Invalid date.

- [x] **Step 9: Propose the commit**

```
feat: choose the format a typed date is written in

- Type _ after a date to pick from the formats you have configured
- Show the keys the list answers to in its footer
```
---

### Task 7: Typing a date, as a section of settings

Three rows in a new section between *Calendar* and *Sections to scan*, and a reworded notice in the
section above them.

> **Rewritten 2026-09-19** against the spec's revised *Settings* section. Three things changed and
> the first draft of this task builds all three the old way: the trigger is **one to three
> characters**, not one; the rows are a **section of their own**, not the bottom of *Dates in a
> note*; and `commandOnly()` is **left alone** — the notice it governs is reworded instead. A fourth
> row, Languages, is designed into the section but belongs to TODO 14 and is not built here.

**Files:**
- Modify: `src/settings.ts` (`KalendaeSettings`, `DEFAULT_SETTINGS`, `checkTrigger`, `checkFormatChar`)
- Modify: `src/typing/trigger.ts` (a trigger of more than one character)
- Modify: `src/settings/settings-tab.ts` (the new group and its three rows)
- Modify: `src/editor/date-suggest.ts` (read the settings instead of the two constants)
- Modify: `src/i18n/locales/en.json` (the new strings, and the reworded notice)
- Test: `tests/settings.test.ts`, `tests/typing/trigger.test.ts`

**Interfaces:**
- `KalendaeSettings` gains `typeToInsert: boolean`, `typeTrigger: string`, `formatTrigger: string`;
  defaults `true`, `"@"`, `"_"`.
- `checkTrigger(value: string, formatChar: string): TriggerProblem | null`
- `checkFormatChar(value: string, trigger: string): TriggerProblem | null`
- `type TriggerProblem = "length" | "letter" | "digit" | "space" | "reserved" | "sign" | "clash"`

Two functions rather than one with a flag: the two fields refuse different things, and a shared
function taking "which field am I" reads worse than the rules do written out twice.

- [x] **Step 1: Write the failing tests**

Append to `tests/settings.test.ts`:

```ts
describe("checkTrigger", () => {
  it("accepts one to three characters that do not begin inside a word", () => {
    expect(checkTrigger("@", "_")).toBeNull();
    expect(checkTrigger("@@", "_")).toBeNull();
    expect(checkTrigger("$%@", "_")).toBeNull();
    expect(checkTrigger(";;", "_")).toBeNull();
  });

  it("refuses an empty field and anything longer than three characters", () => {
    expect(checkTrigger("", "_")).toBe("length");
    expect(checkTrigger("@@@@", "_")).toBe("length");
  });

  it("refuses a letter or a digit in first position, in any alphabet", () => {
    expect(checkTrigger("a@", "_")).toBe("letter");
    expect(checkTrigger("Я", "_")).toBe("letter");
    expect(checkTrigger("7@", "_")).toBe("digit");
  });

  it("allows a letter or a digit after the first character", () => {
    expect(checkTrigger("@d", "_")).toBeNull();
    expect(checkTrigger("@1", "_")).toBeNull();
  });

  it("refuses whitespace anywhere in it", () => {
    expect(checkTrigger(" ", "_")).toBe("space");
    expect(checkTrigger("@ @", "_")).toBe("space");
  });

  it("refuses the two characters Obsidian gives its own menu, in first position only", () => {
    expect(checkTrigger("#", "_")).toBe("reserved");
    expect(checkTrigger("[", "_")).toBe("reserved");
    expect(checkTrigger("@#", "_")).toBeNull();
  });

  it("refuses a trigger that uses the format character", () => {
    expect(checkTrigger("_", "_")).toBe("clash");
    expect(checkTrigger("@_", "_")).toBe("clash");
  });

  it("allows the openers, which are unwise rather than broken", () => {
    expect(checkTrigger('"', "_")).toBeNull();
    expect(checkTrigger("(", "_")).toBeNull();
  });
});

describe("checkFormatChar", () => {
  it("accepts a single character that is none of the reserved ones", () => {
    expect(checkFormatChar("_", "@")).toBeNull();
    expect(checkFormatChar("~", "@")).toBeNull();
  });

  it("refuses anything but exactly one character", () => {
    expect(checkFormatChar("", "@")).toBe("length");
    expect(checkFormatChar("__", "@")).toBe("length");
  });

  it("refuses a letter, a digit and whitespace", () => {
    expect(checkFormatChar("a", "@")).toBe("letter");
    expect(checkFormatChar("7", "@")).toBe("digit");
    expect(checkFormatChar(" ", "@")).toBe("space");
  });

  it("refuses the characters Obsidian and the date grammar have already spent", () => {
    expect(checkFormatChar("#", "@")).toBe("reserved");
    expect(checkFormatChar("[", "@")).toBe("reserved");
    expect(checkFormatChar(",", "@")).toBe("reserved");
    expect(checkFormatChar("+", "@")).toBe("sign");
    expect(checkFormatChar("-", "@")).toBe("sign");
  });

  it("refuses a character the trigger is made of, wherever it sits in it", () => {
    expect(checkFormatChar("@", "@")).toBe("clash");
    expect(checkFormatChar("%", "$%@")).toBe("clash");
  });
});
```

And to `tests/typing/trigger.test.ts`:

```ts
describe("a trigger of more than one character", () => {
  it("opens on the whole phrase and reads the query after it", () => {
    expect(triggerAt("due @@tom", 9, "@@")).toEqual({ from: 4, query: "tom" });
  });

  it("does not open on a part of it", () => {
    expect(triggerAt("due @tom", 8, "@@")).toBeNull();
  });

  it("holds the word-start rule against the first character only", () => {
    expect(triggerAt("@@tom", 5, "@@")).toEqual({ from: 0, query: "tom" });
    expect(triggerAt("mail@@tom", 9, "@@")).toBeNull();
  });

  it("reads a trigger whose later characters are ordinary word characters", () => {
    expect(triggerAt("due @d3d", 8, "@d")).toEqual({ from: 4, query: "3d" });
  });

  it("takes the last trigger on the line, not the first", () => {
    expect(triggerAt("@@one @@two", 11, "@@")).toEqual({ from: 6, query: "two" });
  });
});
```

- [x] **Step 2: Run them**

Run: `npx jest tests/settings.test.ts tests/typing/trigger.test.ts`
Expected: FAIL, `checkTrigger is not a function`, and the multi-character cases returning null
because `triggerAt` refuses a trigger that is not exactly one character.

- [x] **Step 3: The settings and their rules**

In `src/settings.ts`, the three fields and their defaults, then:

```ts
export type TriggerProblem = "length" | "letter" | "digit" | "space" | "reserved" | "sign" | "clash";

/**
 * Whether a phrase can open the list while you type, and why not.
 *
 * One to three characters: a trigger is a keystroke or two, not a word. The
 * rules that matter are all about the **first** character, because that is the
 * only one the word-start rule ever looks at — a letter or a digit there lands
 * the trigger inside ordinary words and numbers, which no filtering afterwards
 * cleans up, and `#` or `[` there collides with a menu Obsidian opens itself.
 * Later positions are free: the `d` in `@d` and the `#` in `@#` can only ever
 * appear where `@` already did.
 *
 * `(`, `{`, `"` and `'` are allowed although `trigger.ts` treats them as
 * word-starts, so a trigger of `"` fires after every opening quote. That is
 * unwise rather than broken, and a field that refuses every unwise value argues
 * with the reader — who can now type `""` instead.
 */
export function checkTrigger(value: string, formatChar: string): TriggerProblem | null {
  const characters = [...value];

  if (characters.length === 0 || characters.length > 3) return "length";
  if (/\s/.test(value)) return "space";
  if (/\p{L}/u.test(characters[0])) return "letter";
  if (/\p{N}/u.test(characters[0])) return "digit";
  if (characters[0] === "#" || characters[0] === "[") return "reserved";
  if (characters.includes(formatChar)) return "clash";

  return null;
}

/**
 * Whether a character can turn the open list into the formats, and why not.
 *
 * One character, and none of the ones already spoken for. `+` and `-` begin a
 * step; `,` is tolerated after the day of a named date, so the two cannot both
 * have it; `#` and `[` are Obsidian's. It also may not be any character the
 * trigger is made of — stricter than position alone requires, and one sentence
 * instead of three.
 */
export function checkFormatChar(value: string, trigger: string): TriggerProblem | null {
  if ([...value].length !== 1) return "length";
  if (/\s/.test(value)) return "space";
  if (/\p{L}/u.test(value)) return "letter";
  if (/\p{N}/u.test(value)) return "digit";
  if (value === "#" || value === "[" || value === ",") return "reserved";
  if (value === "+" || value === "-") return "sign";
  if ([...trigger].includes(value)) return "clash";

  return null;
}
```

**`commandOnly` is not touched.** Its notice is reworded instead — see Step 6. Typing never opens
the calendar, so counting it as a fourth way in would hide a true notice from someone who switched
off every way to edit a date and left typing on.

- [x] **Step 4: A trigger of more than one character**

In `src/typing/trigger.ts`, `triggerAt` drops its one-character guard and measures the phrase:

```ts
if (trigger.length === 0 || caret <= 0) return null;

const from = line.lastIndexOf(trigger, caret - trigger.length);
if (from === -1) return null;
```

with the query sliced from `from + trigger.length`. The word-start check is unchanged and still
reads the character before `from`, which is the rule holding against the phrase's first character
and nothing else.

`lastIndexOf` is given `caret - trigger.length` rather than `caret - 1`, so a trigger only counts
when the whole of it sits before the caret: with `@@` and only `@` typed, there is no trigger yet.

- [x] **Step 5: The section and its rows**

In `src/settings/settings-tab.ts`, a new group between the `calendar` group and the `scopes` group:

```ts
{
  type: "group",
  cls: "kalendae-group",
  heading: t("settings.typing.heading"),
  items: [
    {
      name: t("settings.typeToInsert.name"),
      desc: t("settings.typeToInsert.desc", { trigger: this.kalendae.settings.typeTrigger }),
      control: {
        type: "toggle",
        key: "typeToInsert",
        defaultValue: DEFAULT_SETTINGS.typeToInsert,
      },
    },
    {
      name: t("settings.typeTrigger.name"),
      desc: t("settings.typeTrigger.desc"),
      control: {
        type: "text",
        key: "typeTrigger",
        defaultValue: DEFAULT_SETTINGS.typeTrigger,
        disabled: () => !this.kalendae.settings.typeToInsert,
        validate: (value: string) =>
          problemText(checkTrigger(value, this.kalendae.settings.formatTrigger)),
      },
    },
    {
      name: t("settings.formatTrigger.name"),
      desc: t("settings.formatTrigger.desc"),
      control: {
        type: "text",
        key: "formatTrigger",
        defaultValue: DEFAULT_SETTINGS.formatTrigger,
        disabled: () => !this.kalendae.settings.typeToInsert,
        validate: (value: string) =>
          problemText(checkFormatChar(value, this.kalendae.settings.typeTrigger)),
      },
    },
  ],
},
```

with a module-level helper in the same file:

```ts
/** A rejected value, said in terms the reader can act on. */
function problemText(problem: TriggerProblem | null): string | void {
  return problem === null ? undefined : t(`settings.triggerError.${problem}`);
}
```

`validate` returning a non-empty string rejects the change and shows it under the field; returning
undefined accepts and persists it. Obsidian runs it once on mount as well, so a bad value already in
`data.json` shows its message without being rewritten — which is why the suggester validates again
when it reads the setting, in the next step.

**The Languages row is not built here.** It belongs at the end of this group, as a `page` row like
Quick dates and Sections; TODO 14 is where it is designed.

Toggling `typeToInsert` has to re-evaluate `disabled` on the two fields below it, so the tab's
`setControlValue` override calls `update()` when that key changes, the way it already does when
`commandOnly()` flips.

- [x] **Step 6: Read the settings in the suggester**

Replace the two constants in `src/editor/date-suggest.ts`:

```ts
/** A value a hand-edited data.json put there is not to be trusted. */
function triggerOf(settings: KalendaeSettings): string {
  return checkTrigger(settings.typeTrigger, settings.formatTrigger) === null
    ? settings.typeTrigger
    : DEFAULT_SETTINGS.typeTrigger;
}
```

and the same shape for the format character against `DEFAULT_SETTINGS.formatTrigger`.

Three details:

- **The trigger has two callers**, not one: `onTrigger` reads it, and `complete()` writes it back
  into the note. Both take the validated value, or Tab would write a phrase the list no longer
  opens on.
- **`onTrigger` must null `this.range`** when `typeToInsert` is off, the same as its other early
  returns. A stale range is a write aimed at text that has moved.
- **The format character is registered on the popup's scope in the constructor**, where the
  settings are not yet read on every keystroke, so the registration has to follow the setting.
  **Rebound, not registered against every key.** This step first proposed a handler on a `null`
  key comparing the character inside, as the shorter of the two; that handler matches every
  keypress in the popup, the arrows and Enter that Obsidian's own chooser wants included, and
  putting that in the way of a working list is not worth the lines it saves. `bindFormatKey` keeps
  the `KeymapEventHandler` it registered and swaps it when the character changes, from
  `getSuggestions` — the popup is open there, so no key can have been pressed since the last call.

- [x] **Step 7: The page of instructions**

Added 2026-09-19, after the rest of the task was built: `@` on its own teaches its own keywords, but
nothing in the list says that words and named days are read at all.

`src/settings/typing-help-page.ts`, a `SettingPage` like `SectionsPage`, reached from a `page` row
at the foot of the group. Four numbered steps, the second carrying three example blocks — Shorthand,
In words, Name the day — and three keys at the foot.

Every example resolves as the page opens, through `parseTyped` and `resolveRule`, so it cannot drift
from the suggester. The named-day examples cannot go that route — naming a day is not a rule — so
they compute their own year and take their month names from `moment.monthsShort()`. The trigger and
the format character come from `triggerOf`/`formatCharOf`, which moved to `settings.ts` so this file
and `date-suggest.ts` can share them.

The example block is `display: table` on plain divs, **not** a grid. `subgrid` and `display: contents`
are what a grid would need to line three columns up across rows, and `styles.css` already carries a
comment saying Obsidian's Chromium supports neither — the format token table hit this first.

Three things the first build of this page got wrong, all found in review and all worth keeping
written down:

- **A heading's border needs `border-radius: 0` beside it.** `.setting-item` carries
  `--setting-items-radius`, so a border on a row Obsidian has not squared draws a rounded box
  rather than a rule. The stylesheet documents this above the settings groups and the page did not
  follow it.
- **The examples must hang inside a `Setting`**, not beside one, or they miss the side padding
  every row has and sit outdented from the heading they belong to.
- **A named day's row has to show every answer it has.** `@Nov 3` resolves to two dates, and one
  answer in that column was a lie about a choice the reader still has to make.

- [x] **Step 8: The strings**

New: `settings.typing.heading`, `settings.typeToInsert.name`/`desc`, `settings.typeTrigger.name`/`desc`,
`settings.formatTrigger.name`/`desc`, and `settings.triggerError.length` / `.letter` / `.digit` /
`.space` / `.reserved` / `.sign` / `.clash`. Each with a `_comment` sibling. The error strings say
which rule was broken in plain words — "Letters would open the list inside ordinary words" — not in
the terms of the code.

Reworded: `settings.commandOnly.name`, which gains "on an existing date" so it stays true beside a
section that inserts new ones. Its `_comment` is updated to say why the words are there, since a
translator dropping them makes the sentence wrong rather than clumsy.

- [x] **Step 9: Run everything**

Run: `npm test` — PASS.
Run: `npm run build` — clean.

In the app: the switch hides the list entirely and greys the two fields; a trigger of `;;` makes
`;;tom` work and `@tom` inert; `@@` likewise; typing a letter into either field shows the message
and does not save, and closing settings leaves the last saved value in force; setting one field to
collide with the other is refused from both sides.

- [ ] **Step 10: Propose the commit**

```
feat: settings for typing a date

- Switch typing on or off, and set the phrase that opens the list
- Choose the character that lists a date in your other formats
- Read how to type a date, with worked examples of all three ways
```
---

### Task 8: The other twelve locales

The last step before the work is done, once the English has stopped moving. Thirteen files for a reworded string is why this waits.

**Files:**
- Modify: `src/i18n/locales/{de,es,et,fr,ja,ko,lt,lv,pt,ru,uk,zh}.json`

- [x] **Step 1: List what is new**

```bash
node -e "const en=require('./src/i18n/locales/en.json'),de=require('./src/i18n/locales/de.json');const keys=o=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?keys(v).map(s=>k+'.'+s):[k]);const missing=keys(en).filter(k=>!k.endsWith('_comment')&&!keys(de).includes(k));console.log(missing.join('\n'))"
```

- [x] **Step 2: Translate**

Every locale gets exactly en's key set, no blanks, `_comment` keys excluded. Each string's `_comment` in `en.json` is the brief. `sample_lang.json` is the blank template and is exempt.

- [x] **Step 3: Verify**

Run: `npm run validate-translations` — PASS.
Run: `npm run release-check` — PASS, all three in the order the Release workflow runs them.

- [ ] **Step 4: Propose the commit**

```
chore: translate the typed date strings
```

---

## Self-review notes

**Spec coverage.** Typed form → Task 1. Word-start trigger → Task 2. List contents, matching order, invalid row → Task 3. Obsidian's popup, scope gate, the write, the review checkpoint → Task 4. Row layout → Task 5. Format switch and footer instructions → Task 6. Three settings, validation, `commandOnly` → Task 7. i18n → Tasks 4, 6, 7 for English and Task 8 for the rest. **Not covered, deliberately:** your own named dates, which is the spec's open topic — `NamedDate[]` is the seam it will arrive through, and nothing in these tasks assumes the catalogue is the only source.

**One decision taken here that the spec does not settle**, flagged at the step that hits it:

1. **`m` means months** in the typed spelling, where the stored grammar reserves it for minutes. There are no times yet and a case rule distinguishing `2m` from `2M` is unguessable. Revisit when TODO 3 lands.

**One thing worth watching in review:** Task 6's rule that the format switch acts on the **highlighted** row lives in `date-suggest.ts`, which no test reaches. What the tests cover is the floor beneath it — the character arriving as text takes the first row — so the review checkpoint in that task is where "down one, then `_`" is actually checked.
