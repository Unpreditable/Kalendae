# Quick dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Up to four configurable shortcut buttons under the calendar, built from a small date-expression language rather than typed.

**Architecture:** One pure module (`src/picker/quick.ts`) holds the language — parse, format, resolve — and the fourteen-preset catalogue, with no DOM and nothing from Obsidian but `moment`, exactly as `month.ts` is arranged. Settings gain two fields read back defensively. Three UI surfaces consume the module: the calendar's footer, a settings sub-page of four slots, and a builder modal that is the only way a rule is made.

**Tech Stack:** TypeScript, esbuild, Jest (ts-jest, node env, `obsidian` mocked), Obsidian 1.13 settings API (`getSettingDefinitions`, `SettingPage`, `Menu`), moment (Obsidian's bundled copy), i18next.

**Spec:** `docs/superpowers/specs/2026-09-12-quick-dates-design.md`

## Global Constraints

- **Obsidian floor 1.13.0.** `getSettingDefinitions()` only — never add a `display()` fallback to the settings tab.
- **English only until the end.** Touch `src/i18n/locales/en.json` and no other locale until Task 9. `npm run validate-translations` fails before then; that is expected, so do not run `npm run release-check` until Task 9.
- **Every user-visible string goes through `t()`**, with a `<key>_comment` sibling in `en.json` explaining its context to translators.
- **CSS:** no `!important`, no inline styles, no `text-decoration-*` sub-properties. Use Obsidian CSS variables for every colour, font and spacing value. Scope every panel rule under `.kalendae-panel` and every modal rule under `.kalendae-settings-page`.
- **Geometry is CSS, never JavaScript.** Nothing measures an element to decide a layout.
- **Never bundle `@codemirror/state`, `@codemirror/view` or `@codemirror/language`.** Nothing in this plan touches `esbuild.config.mjs`.
- **Commits are approved, not assumed.** At every commit step, show the message and wait for the user to say yes. Commit messages are feature-level bullets of what changed, never why, and carry the `Co-Authored-By` and `Claude-Session` trailers from the session reminder.
- **Run `npm run build` and `npm test` as you go.** `build` is a TypeScript check plus eslint plus the bundle, so it is the lint gate too.
- Months are 0-based everywhere, matching moment. Weekday numbers are moment's: Sunday 0.

---

### Task 1: The language — types, parsing and formatting

**Files:**
- Create: `src/picker/quick.ts`
- Test: `tests/picker/quick.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Anchor`, `Unit`, `Edge`, `AmountStep`, `WeekdayStep`, `EdgeStep`, `Step`, `Rule`, `WEEKDAYS`, `UNITS`, `EDGES`, `parseRule(text: string): Rule | null`, `formatRule(rule: Rule): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/picker/quick.test.ts
import { Rule, formatRule, parseRule } from "../../src/picker/quick";

/**
 * The quick-date language, with no DOM and no editor in sight. Weekday numbers
 * are moment's — Sunday 0, Monday 1 — and months are 0-based.
 */

describe("parseRule", () => {
  it("reads an anchor and an amount", () => {
    expect(parseRule("today +1d")).toEqual({
      anchor: "today",
      steps: [{ kind: "amount", count: 1, unit: "d", back: false }],
    });
  });

  it("reads a negative amount against the note's date", () => {
    expect(parseRule("date -3w")).toEqual({
      anchor: "date",
      steps: [{ kind: "amount", count: 3, unit: "w", back: true }],
    });
  });

  it("reads a signed weekday as strictly directional", () => {
    expect(parseRule("today +2Mon")).toEqual({
      anchor: "today",
      steps: [{ kind: "weekday", day: 1, count: 2, back: false, inclusive: false }],
    });
  });

  it("reads a bare weekday as the inclusive one", () => {
    expect(parseRule("today Fri")).toEqual({
      anchor: "today",
      steps: [{ kind: "weekday", day: 5, count: 1, back: false, inclusive: true }],
    });
  });

  it("reads an edge", () => {
    expect(parseRule("today EoQ")).toEqual({
      anchor: "today",
      steps: [{ kind: "edge", edge: "EoQ" }],
    });
  });

  it("keeps several steps in the order they were written", () => {
    expect(parseRule("today +1M EoM")?.steps).toEqual([
      { kind: "amount", count: 1, unit: "M", back: false },
      { kind: "edge", edge: "EoM" },
    ]);
  });

  it.each([
    ["", "empty"],
    ["today", "no steps"],
    ["+1d", "no anchor"],
    ["today +0d", "a count of zero"],
    ["today +007d", "a padded count"],
    ["today +1000d", "a count past 999"],
    ["today +Mon", "a sign with no count"],
    ["today 2Mon", "a count with no sign"],
    ["today +1m", "minutes, which are reserved"],
    ["today +1D", "the wrong case"],
    ["today eom", "an edge in the wrong case"],
    ["today  +1d", "a double space"],
    ["today +1d ", "a trailing space"],
    ["date today", "a second anchor"],
    ["today +1x", "an unknown unit"],
  ])("refuses %s (%s)", (text) => {
    expect(parseRule(text)).toBeNull();
  });
});

describe("formatRule", () => {
  it.each([
    "today +1d",
    "date -3w",
    "today +2Mon",
    "today Fri",
    "today +1M EoM",
    "today +1Q EoQ",
    "date EoM",
  ])("round-trips %s", (text) => {
    expect(formatRule(parseRule(text) as Rule)).toBe(text);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/picker/quick.test.ts`
Expected: FAIL — `Cannot find module '../../src/picker/quick'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/picker/quick.ts
/**
 * The quick-date language: what a shortcut's rule is, how it is read, and how
 * it is written back.
 *
 * Pure, like `month.ts` beside it — no DOM, no editor, nothing from Obsidian
 * but `moment` — so every rule about what a shortcut means is unit-testable.
 *
 * Nobody types one of these. The builder in settings is the only way a rule is
 * made, and this is what it produces, what `data.json` holds and what the
 * catalogue is written in. The grammar is strict to the point of pedantry —
 * one spelling per meaning, no optional parts — because the only thing that
 * writes it is a program, and the only thing that reads it is this file.
 */

export type Anchor = "today" | "date";

/** moment's own duration letters, and `m` is deliberately absent: it is minutes. */
export const UNITS = ["d", "w", "M", "Q", "y"] as const;
export type Unit = (typeof UNITS)[number];

/** Indexed as moment counts days, so `WEEKDAYS.indexOf("Mon")` is moment's 1. */
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const EDGES = ["SoW", "EoW", "SoM", "EoM", "SoQ", "EoQ", "SoY", "EoY"] as const;
export type Edge = (typeof EDGES)[number];

export interface AmountStep {
  kind: "amount";
  /** 1 to 999. A step that moves nowhere is not a step. */
  count: number;
  unit: Unit;
  back: boolean;
}

export interface WeekdayStep {
  kind: "weekday";
  /** moment's day number: Sunday 0. */
  day: number;
  count: number;
  back: boolean;
  /**
   * The bare form — the nearest such day at or after the anchor, today
   * counting. Never carries a count or a direction; `Mon` takes neither.
   */
  inclusive: boolean;
}

export interface EdgeStep {
  kind: "edge";
  edge: Edge;
}

export type Step = AmountStep | WeekdayStep | EdgeStep;

export interface Rule {
  anchor: Anchor;
  /** Never empty: `today` alone is the Today button, which is already there. */
  steps: Step[];
}

const AMOUNT = /^([+-])([1-9][0-9]{0,2})([dwMQy])$/;
const SIGNED_DAY = /^([+-])([1-9][0-9]{0,2})(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/;
const BARE_DAY = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/;

/**
 * A rule, or null for anything that is not exactly one.
 *
 * Split on a single space and nothing else: a double space leaves an empty
 * token and is refused, which keeps one rule to one spelling. Everything this
 * rejects, the builder cannot produce — this is the guard on what a hand-edited
 * `data.json` can put in front of a reader, not a parser anyone talks to.
 */
export function parseRule(text: string): Rule | null {
  const tokens = text.split(" ");
  const anchor = tokens.shift();
  if (anchor !== "today" && anchor !== "date") return null;
  if (tokens.length === 0) return null;

  const steps: Step[] = [];
  for (const token of tokens) {
    const step = parseStep(token);
    if (step === null) return null;
    steps.push(step);
  }

  return { anchor, steps };
}

/** The text a rule is stored as; the exact inverse of `parseRule`. */
export function formatRule(rule: Rule): string {
  return [rule.anchor, ...rule.steps.map(formatStep)].join(" ");
}

function parseStep(token: string): Step | null {
  const amount = AMOUNT.exec(token);
  if (amount) {
    return {
      kind: "amount",
      count: Number(amount[2]),
      unit: amount[3] as Unit,
      back: amount[1] === "-",
    };
  }

  const signed = SIGNED_DAY.exec(token);
  if (signed) {
    return {
      kind: "weekday",
      day: WEEKDAYS.indexOf(signed[3] as Weekday),
      count: Number(signed[2]),
      back: signed[1] === "-",
      inclusive: false,
    };
  }

  const bare = BARE_DAY.exec(token);
  if (bare) {
    return {
      kind: "weekday",
      day: WEEKDAYS.indexOf(bare[1] as Weekday),
      count: 1,
      back: false,
      inclusive: true,
    };
  }

  return EDGES.includes(token as Edge) ? { kind: "edge", edge: token as Edge } : null;
}

function formatStep(step: Step): string {
  if (step.kind === "edge") return step.edge;

  const sign = step.back ? "-" : "+";
  if (step.kind === "amount") return `${sign}${step.count}${step.unit}`;

  return step.inclusive ? WEEKDAYS[step.day] : `${sign}${step.count}${WEEKDAYS[step.day]}`;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx jest tests/picker/quick.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run build`
Expected: no TypeScript or eslint errors. (`main.js` is gitignored; it changing is normal.)

- [ ] **Step 6: Commit**

Propose this message, wait for approval, then commit:

```
feat: quick-date rule language

- grammar for anchors, amounts, weekdays and period edges
- parse and format, with round-trip tests
```

---

### Task 2: Resolving a rule to a day

**Files:**
- Modify: `src/picker/quick.ts`
- Test: `tests/picker/quick.test.ts`

**Interfaces:**
- Consumes: `Rule`, `Step` from Task 1; `DayKey` and `firstDayOf` from `src/picker/month.ts`; `WeekStart` from `src/settings.ts`.
- Produces: `RuleContext { value: DayKey; today: DayKey; weekStart: WeekStart }`, `resolveRule(rule: Rule, context: RuleContext): DayKey`.

- [ ] **Step 1: Write the failing test**

Append to `tests/picker/quick.test.ts`:

```ts
import { RuleContext, resolveRule } from "../../src/picker/quick";
import { DayKey } from "../../src/picker/month";

/**
 * 2026-09-14 is a Monday and 2026-09-16 a Wednesday, which is what the weekday
 * cases need: the two forms differ only when the anchor is already that day.
 */
const monday: DayKey = { year: 2026, month: 8, day: 14 };
const wednesday: DayKey = { year: 2026, month: 8, day: 16 };

function on(today: DayKey, rule: string, over: Partial<RuleContext> = {}): DayKey {
  return resolveRule(parseRule(rule) as Rule, {
    value: today,
    today,
    weekStart: "monday",
    ...over,
  });
}

describe("resolveRule", () => {
  it("counts from today when the anchor says so", () => {
    expect(on(wednesday, "today +1d")).toEqual({ year: 2026, month: 8, day: 17 });
  });

  it("counts from the note's date when the anchor says so", () => {
    expect(
      resolveRule(parseRule("date +1w") as Rule, {
        value: { year: 2024, month: 2, day: 22 },
        today: wednesday,
        weekStart: "monday",
      }),
    ).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it("moves backwards", () => {
    expect(on(wednesday, "today -3d")).toEqual({ year: 2026, month: 8, day: 13 });
  });

  it("clamps a month step to the shorter month", () => {
    expect(on({ year: 2024, month: 0, day: 31 }, "today +1M")).toEqual({
      year: 2024,
      month: 1,
      day: 29,
    });
  });

  it("moves by a quarter", () => {
    expect(on(wednesday, "today +1Q")).toEqual({ year: 2026, month: 11, day: 16 });
  });

  it("moves strictly past a weekday it is already on", () => {
    expect(on(monday, "today +1Mon")).toEqual({ year: 2026, month: 8, day: 21 });
  });

  it("stays put on a bare weekday it is already on", () => {
    expect(on(monday, "today Mon")).toEqual(monday);
  });

  it("agrees with the signed form on any other day", () => {
    expect(on(wednesday, "today Mon")).toEqual(on(wednesday, "today +1Mon"));
  });

  it("counts several weekdays forward", () => {
    expect(on(wednesday, "today +2Mon")).toEqual({ year: 2026, month: 8, day: 28 });
  });

  it("counts a weekday backwards", () => {
    expect(on(wednesday, "today -1Mon")).toEqual(monday);
  });

  it("takes the week's edges from the week-start setting", () => {
    expect(on(wednesday, "today EoW")).toEqual({ year: 2026, month: 8, day: 20 });
    expect(on(wednesday, "today EoW", { weekStart: "sunday" })).toEqual({
      year: 2026,
      month: 8,
      day: 19,
    });
    expect(on(wednesday, "today SoW")).toEqual(monday);
    expect(on(wednesday, "today SoW", { weekStart: "sunday" })).toEqual({
      year: 2026,
      month: 8,
      day: 13,
    });
  });

  it("takes the month's edges", () => {
    expect(on(wednesday, "today SoM")).toEqual({ year: 2026, month: 8, day: 1 });
    expect(on(wednesday, "today EoM")).toEqual({ year: 2026, month: 8, day: 30 });
  });

  it("takes the quarter's edges", () => {
    expect(on(wednesday, "today SoQ")).toEqual({ year: 2026, month: 6, day: 1 });
    expect(on(wednesday, "today EoQ")).toEqual({ year: 2026, month: 8, day: 30 });
  });

  it("takes the year's edges", () => {
    expect(on(wednesday, "today SoY")).toEqual({ year: 2026, month: 0, day: 1 });
    expect(on(wednesday, "today EoY")).toEqual({ year: 2026, month: 11, day: 31 });
  });

  it("applies steps left to right", () => {
    expect(on(wednesday, "today +1M EoM")).toEqual({ year: 2026, month: 9, day: 31 });
    expect(on(wednesday, "today EoM +1M")).toEqual({ year: 2026, month: 9, day: 30 });
  });

  it("starts next week on the week-start day", () => {
    expect(on(wednesday, "today +1w SoW")).toEqual({ year: 2026, month: 8, day: 21 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/picker/quick.test.ts -t resolveRule`
Expected: FAIL — `resolveRule is not a function`.

- [ ] **Step 3: Write the implementation**

Add to `src/picker/quick.ts` (imports at the top, the rest appended):

```ts
import { moment } from "obsidian";
import { DayKey, firstDayOf } from "./month";
import { WeekStart } from "../settings";

export interface RuleContext {
  /** The date the calendar opened on — what `date` anchors to. */
  value: DayKey;
  /** Today by the reader's own clock — what `today` anchors to. */
  today: DayKey;
  /** Which day a week starts on, which is the only thing SoW and EoW obey. */
  weekStart: WeekStart;
}

/**
 * The day a rule lands on.
 *
 * In UTC throughout, as the calendar grid is: a shortcut is a question about
 * the calendar, not about the reader's offset from Greenwich. The one place
 * their clock matters is `context.today`, which the caller reads locally.
 */
export function resolveRule(rule: Rule, context: RuleContext): DayKey {
  const at = moment.utc(rule.anchor === "today" ? context.today : context.value);
  for (const step of rule.steps) apply(at, step, context.weekStart);

  return { year: at.year(), month: at.month(), day: at.date() };
}

type Moment = ReturnType<typeof moment.utc>;

/** Mutates `at`, which is ours alone: `resolveRule` made it and nobody else holds it. */
function apply(at: Moment, step: Step, weekStart: WeekStart): void {
  if (step.kind === "amount") {
    // moment clamps a month step into a shorter month by itself, which is the
    // behaviour `shiftMonths()` hand-rolls for the grid: 31 January plus a
    // month is 29 February, never 2 March.
    at.add(step.back ? -step.count : step.count, step.unit);
    return;
  }

  if (step.kind === "weekday") {
    at.add(weekdayOffset(at.day(), step), "days");
    return;
  }

  applyEdge(at, step.edge, weekStart);
}

/**
 * How far to the weekday a step names.
 *
 * The inclusive form stays where it is when it is already that day; the signed
 * form always moves, which is why its remainder is taken over 6 and then
 * stepped past. Those are the only two readings, and they differ on exactly one
 * day of the week.
 */
function weekdayOffset(from: number, step: WeekdayStep): number {
  if (step.inclusive) return (step.day - from + 7) % 7;

  const first = step.back ? -(((from - step.day + 6) % 7) + 1) : ((step.day - from + 6) % 7) + 1;

  return first + (step.count - 1) * (step.back ? -7 : 7);
}

function applyEdge(at: Moment, edge: Edge, weekStart: WeekStart): void {
  // Never moment's own startOf("week"): that follows moment's locale, which is
  // not the setting the reader chose and not what the grid is drawn from.
  if (edge === "SoW" || edge === "EoW") {
    const lead = (at.day() - firstDayOf(weekStart) + 7) % 7;
    at.add(edge === "SoW" ? -lead : 6 - lead, "days");
    return;
  }

  // The day is set to the 1st before the month moves, so a month step off the
  // 31st cannot clamp on the way past and land a day early.
  at.date(1);
  if (edge === "SoM") return;
  if (edge === "SoQ") {
    at.month(at.month() - (at.month() % 3));
    return;
  }
  if (edge === "SoY") {
    at.month(0);
    return;
  }

  if (edge === "EoQ") at.month(at.month() - (at.month() % 3) + 2);
  if (edge === "EoY") at.month(11);
  at.date(at.daysInMonth());
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx jest tests/picker/quick.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run build`

- [ ] **Step 6: Commit**

```
feat: resolve a quick-date rule to a day

- anchors, amounts, weekdays and period edges
- week edges follow the week-start setting, not moment's locale
```

---

### Task 3: The catalogue

**Files:**
- Modify: `src/picker/quick.ts`
- Test: `tests/picker/quick.test.ts`

**Interfaces:**
- Consumes: `parseRule` from Task 1.
- Produces: `QuickPreset { id: string; rule: string }`, `QUICK_PRESETS: QuickPreset[]`, `QUICK_PRESET_GROUPS: { anchor: Anchor; ids: string[] }[]`, `presetById(id: string): QuickPreset | undefined`.

- [ ] **Step 1: Write the failing test**

Append to `tests/picker/quick.test.ts`:

```ts
import { QUICK_PRESETS, QUICK_PRESET_GROUPS, presetById } from "../../src/picker/quick";

describe("the catalogue", () => {
  it("offers fourteen presets", () => {
    expect(QUICK_PRESETS).toHaveLength(14);
  });

  it("gives every preset a rule the parser accepts", () => {
    for (const preset of QUICK_PRESETS) {
      expect([preset.id, parseRule(preset.rule)]).not.toEqual([preset.id, null]);
    }
  });

  it("gives every preset a distinct id", () => {
    expect(new Set(QUICK_PRESETS.map((preset) => preset.id)).size).toBe(QUICK_PRESETS.length);
  });

  it("groups every preset exactly once, by what it counts from", () => {
    const grouped = QUICK_PRESET_GROUPS.flatMap((group) => group.ids);
    expect(grouped.sort()).toEqual(QUICK_PRESETS.map((preset) => preset.id).sort());

    for (const group of QUICK_PRESET_GROUPS) {
      for (const id of group.ids) {
        expect(parseRule(presetById(id)?.rule ?? "")?.anchor).toBe(group.anchor);
      }
    }
  });

  it("finds a preset by id, and nothing by a made-up one", () => {
    expect(presetById("endOfMonth")?.rule).toBe("today EoM");
    expect(presetById("endOfNothing")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/picker/quick.test.ts -t catalogue`
Expected: FAIL — `QUICK_PRESETS` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/picker/quick.ts`:

```ts
export interface QuickPreset {
  /** Also the i18n key under `settings.quickDates.presets`, and what a slot stores. */
  id: string;
  rule: string;
}

/**
 * The shortcuts on offer, written in the same language a reader's own rule is.
 *
 * Ten counting from today and four from the date in the note. Only two weekdays
 * are here: all seven would be half the catalogue for the sake of the two
 * nobody has to think about, and `today +1Wed` is one custom slot away.
 */
export const QUICK_PRESETS: QuickPreset[] = [
  { id: "tomorrow", rule: "today +1d" },
  { id: "yesterday", rule: "today -1d" },
  { id: "inAWeek", rule: "today +1w" },
  { id: "nextMonday", rule: "today +1Mon" },
  { id: "nextFriday", rule: "today +1Fri" },
  { id: "endOfWeek", rule: "today EoW" },
  { id: "startOfNextWeek", rule: "today +1w SoW" },
  { id: "endOfMonth", rule: "today EoM" },
  { id: "startOfNextMonth", rule: "today +1M SoM" },
  { id: "endOfQuarter", rule: "today EoQ" },
  { id: "dayLater", rule: "date +1d" },
  { id: "weekLater", rule: "date +1w" },
  { id: "twoWeeksLater", rule: "date +2w" },
  { id: "monthLater", rule: "date +1M" },
];

/**
 * The two groups the chooser menu shows, separated because the difference
 * between them is the only thing about a shortcut a reader has to understand.
 */
export const QUICK_PRESET_GROUPS: { anchor: Anchor; ids: string[] }[] = [
  {
    anchor: "today",
    ids: [
      "tomorrow",
      "yesterday",
      "inAWeek",
      "nextMonday",
      "nextFriday",
      "endOfWeek",
      "startOfNextWeek",
      "endOfMonth",
      "startOfNextMonth",
      "endOfQuarter",
    ],
  },
  { anchor: "date", ids: ["dayLater", "weekLater", "twoWeeksLater", "monthLater"] },
];

export function presetById(id: string): QuickPreset | undefined {
  return QUICK_PRESETS.find((preset) => preset.id === id);
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx jest tests/picker/quick.test.ts`

- [ ] **Step 5: Typecheck and lint**

Run: `npm run build`

- [ ] **Step 6: Commit**

```
feat: catalogue of fourteen quick-date presets
```

---

### Task 4: Settings shape and defensive read-back

**Files:**
- Modify: `src/settings.ts`
- Modify: `src/main.ts:82-95` (the `loadSettings` object literal)
- Test: `tests/settings-quick-dates.test.ts`

**Interfaces:**
- Consumes: `parseRule`, `presetById` from Tasks 1 and 3.
- Produces: `QuickSlot`, `QUICK_SLOTS = 4`, `normaliseStoredQuickDates(stored: unknown): QuickSlot[]`, and the settings fields `showQuickDates: boolean` and `quickDates: QuickSlot[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/settings-quick-dates.test.ts
import { DEFAULT_SETTINGS, QUICK_SLOTS, normaliseStoredQuickDates } from "../src/settings";

/**
 * data.json is whatever some version of this plugin wrote, and a hand-edited
 * file is whatever a reader typed. Neither is a shape to be trusted, so the
 * rule is one line: anything that cannot be read leaves that slot empty.
 */

describe("normaliseStoredQuickDates", () => {
  it("always returns four slots", () => {
    expect(normaliseStoredQuickDates([])).toHaveLength(QUICK_SLOTS);
    expect(normaliseStoredQuickDates([null, null, null, null, null])).toHaveLength(QUICK_SLOTS);
  });

  it("falls back to the defaults when there is no list at all", () => {
    expect(normaliseStoredQuickDates(undefined)).toEqual(DEFAULT_SETTINGS.quickDates);
    expect(normaliseStoredQuickDates("nonsense")).toEqual(DEFAULT_SETTINGS.quickDates);
  });

  it("keeps an empty list empty rather than refilling it", () => {
    expect(normaliseStoredQuickDates([null, null, null, null])).toEqual([null, null, null, null]);
  });

  it("keeps a known preset, with and without an alias", () => {
    expect(normaliseStoredQuickDates([{ preset: "endOfMonth" }])[0]).toEqual({
      preset: "endOfMonth",
    });
    expect(normaliseStoredQuickDates([{ preset: "endOfMonth", alias: "EOM" }])[0]).toEqual({
      preset: "endOfMonth",
      alias: "EOM",
    });
  });

  it("drops a preset nobody has heard of", () => {
    expect(normaliseStoredQuickDates([{ preset: "endOfNothing" }])[0]).toBeNull();
  });

  it("keeps a rule of the reader's own", () => {
    expect(normaliseStoredQuickDates([{ rule: "today +2Mon", alias: "Sprint" }])[0]).toEqual({
      rule: "today +2Mon",
      alias: "Sprint",
    });
  });

  it("drops a rule that does not parse, and one with no name", () => {
    expect(normaliseStoredQuickDates([{ rule: "today +1m", alias: "Soon" }])[0]).toBeNull();
    expect(normaliseStoredQuickDates([{ rule: "today +1d", alias: "  " }])[0]).toBeNull();
  });

  it("reads a slot carrying both as the preset", () => {
    expect(normaliseStoredQuickDates([{ preset: "tomorrow", rule: "today +9d" }])[0]).toEqual({
      preset: "tomorrow",
    });
  });

  it("ships Tomorrow, end of week and end of month by default", () => {
    expect(DEFAULT_SETTINGS.quickDates).toEqual([
      { preset: "tomorrow" },
      { preset: "endOfWeek" },
      { preset: "endOfMonth" },
      null,
    ]);
    expect(DEFAULT_SETTINGS.showQuickDates).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/settings-quick-dates.test.ts`
Expected: FAIL — `normaliseStoredQuickDates` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/settings.ts`, import `parseRule` and `presetById` from `./picker/quick`, add the type and the fields to `KalendaeSettings` (beside `showWritesPreview`), add the defaults, and append the reader:

```ts
/** Four, and the reason the page needs no add button, no trash and no dragging. */
export const QUICK_SLOTS = 4;

/**
 * One shortcut under the calendar: a preset, a rule of the reader's own, or
 * nothing.
 *
 * A preset stores its id rather than its rule, so the catalogue can be
 * corrected without migrating anybody's settings, and its name follows the
 * app's language. A rule of your own stores its text, and must carry a name —
 * there is nothing underneath it to fall back on.
 */
export type QuickSlot =
  | null
  | { preset: string; alias?: string }
  | { rule: string; alias: string };
```

```ts
  /** Whether the quick-date row is drawn at all; the slots are kept either way. */
  showQuickDates: boolean;
  /** Exactly QUICK_SLOTS entries, in the order they appear under the calendar. */
  quickDates: QuickSlot[];
```

```ts
  showQuickDates: true,
  quickDates: [{ preset: "tomorrow" }, { preset: "endOfWeek" }, { preset: "endOfMonth" }, null],
```

```ts
/**
 * The quick dates read out of `data.json`, which is not a shape to be trusted.
 *
 * Always four slots. Anything that cannot be read — an unknown preset, a rule
 * that does not parse, a rule with no name — leaves its slot empty rather than
 * guessing: a file written by a future version, or edited by hand, must never
 * be able to put a wrong date or a nameless button in front of a reader.
 *
 * A slot carrying both a preset and a rule is read as the preset. That is the
 * reading that cannot be wrong — the rule behind a preset is ours and is known
 * good — while a stray rule string is the shape a half-finished write leaves.
 *
 * A list that is present but empty stays empty. Only a missing or malformed
 * list falls back to the defaults, because four deliberately cleared slots are
 * an answer and refilling them would overrule it.
 */
export function normaliseStoredQuickDates(stored: unknown): QuickSlot[] {
  if (!Array.isArray(stored)) return [...DEFAULT_SETTINGS.quickDates];

  return Array.from({ length: QUICK_SLOTS }, (_unused, at) => readSlot(stored[at]));
}

function readSlot(value: unknown): QuickSlot {
  if (typeof value !== "object" || value === null) return null;
  const slot = value as Record<string, unknown>;
  const alias = typeof slot.alias === "string" ? slot.alias.trim() : "";

  if (typeof slot.preset === "string" && presetById(slot.preset)) {
    return alias === "" ? { preset: slot.preset } : { preset: slot.preset, alias };
  }

  if (typeof slot.rule === "string" && alias !== "" && parseRule(slot.rule)) {
    return { rule: slot.rule, alias };
  }

  return null;
}
```

In `src/main.ts`, add one line to the `loadSettings` literal, under `formats`:

```ts
      quickDates: normaliseStoredQuickDates(stored?.quickDates),
```

and add `normaliseStoredQuickDates` to the existing import from `./settings`.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx jest`
Expected: PASS, the whole suite — `tests/settings.test.ts` reads `DEFAULT_SETTINGS` and must still pass.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run build`

- [ ] **Step 6: Commit**

```
feat: store four quick-date slots

- a slot holds a preset id, a rule of your own, or nothing
- unreadable slots are emptied rather than guessed at
```

---

### Task 5: Reading a rule back in words

**Files:**
- Create: `src/picker/quick-text.ts`
- Modify: `src/i18n/locales/en.json`
- Test: none — every branch is a `t()` call, and the repo does not unit-test i18n rendering.

**Interfaces:**
- Consumes: `Rule`, `Step`, `WEEKDAYS`, `parseRule`, `presetById` from `src/picker/quick.ts`.
- Produces: `glossFor(rule: Rule): string`, `stepGloss(step: Step): string`, `ruleTextFor(slot: QuickSlot): string | null`, `labelFor(slot: QuickSlot): string`, `slotGloss(slot: QuickSlot): string | null`.

- [ ] **Step 1: Add the strings to `en.json`**

Under `settings`, add a `quickDates` object. Every key gets a `_comment` sibling. The step vocabulary is the same set the builder's dropdowns use, and the chips are separate, counted keys — a dropdown wants *weeks*, a chip wants *2 weeks*, and one string cannot be both without producing "1 weeks".

```json
    "quickDates": {
      "heading_comment": "Title of the settings page holding the configurable shortcut buttons shown under the calendar, and the label of the row on the Calendar section that opens it.",
      "heading": "Quick dates",
      "description_comment": "One line of explanation at the top of that page. 'Today' is the name of the permanent button that is always there.",
      "description": "Shown under the calendar, after Today.",
      "show_comment": "Settings row label for the switch that hides the quick-date row without clearing what is in it.",
      "show": "Show quick dates",
      "none_comment": "Value shown on the Calendar section's Quick dates row when no slot is filled.",
      "none": "None",
      "off_comment": "Value shown on the Calendar section's Quick dates row when the switch above is off, whatever the slots hold.",
      "off": "Off",
      "empty_comment": "Shown in the chooser and on an unfilled slot. The dashes are decorative; drop them if they read oddly in your language.",
      "empty": "— None —",
      "custom_comment": "Last entry in the chooser, below the presets. Opens the builder for a rule of your own.",
      "custom": "Custom…",
      "alias_comment": "Placeholder in the text field where a shortcut's button text is set. For a preset it may be left empty, and the preset's own name is used.",
      "alias": "Name",
      "edit_comment": "Hover label on the pencil button that reopens the builder for a rule of your own.",
      "edit": "Edit",
      "groups": {
        "today_comment": "Heading over the presets that count from today, in the chooser menu.",
        "today": "From today",
        "date_comment": "Heading over the presets that count from the date being edited, in the chooser menu.",
        "date": "From this date"
      },
      "presets": {
        "tomorrow_comment": "Preset shortcut: the day after today.",
        "tomorrow": "Tomorrow",
        "yesterday_comment": "Preset shortcut: the day before today.",
        "yesterday": "Yesterday",
        "inAWeek_comment": "Preset shortcut: seven days from today.",
        "inAWeek": "In a week",
        "nextMonday_comment": "Preset shortcut: the coming Monday. On a Monday it means the following one.",
        "nextMonday": "Next Monday",
        "nextFriday_comment": "Preset shortcut: the coming Friday. On a Friday it means the following one.",
        "nextFriday": "Next Friday",
        "endOfWeek_comment": "Preset shortcut: the last day of this week, which depends on the first-day-of-the-week setting.",
        "endOfWeek": "End of week",
        "startOfNextWeek_comment": "Preset shortcut: the first day of next week.",
        "startOfNextWeek": "Start of next week",
        "endOfMonth_comment": "Preset shortcut: the last day of this month.",
        "endOfMonth": "End of month",
        "startOfNextMonth_comment": "Preset shortcut: the first day of next month.",
        "startOfNextMonth": "Start of next month",
        "endOfQuarter_comment": "Preset shortcut: the last day of this three-month quarter.",
        "endOfQuarter": "End of quarter",
        "dayLater_comment": "Preset shortcut: one day after the date being edited, not after today.",
        "dayLater": "A day later",
        "weekLater_comment": "Preset shortcut: one week after the date being edited.",
        "weekLater": "A week later",
        "twoWeeksLater_comment": "Preset shortcut: two weeks after the date being edited.",
        "twoWeeksLater": "Two weeks later",
        "monthLater_comment": "Preset shortcut: one month after the date being edited.",
        "monthLater": "A month later"
      },
      "anchors": {
        "today_comment": "First piece of the plain-language reading of a rule, when it counts from today. Shown as the first item of a list joined by arrows, e.g. \"Today → 2 weeks\".",
        "today": "Today",
        "date_comment": "First piece of the plain-language reading of a rule, when it counts from the date being edited.",
        "date": "The date in the note"
      },
      "units": {
        "d_comment": "Name of the day unit, as one entry in a dropdown. A bare plural noun.",
        "d": "days",
        "w_comment": "Name of the week unit, as one entry in a dropdown.",
        "w": "weeks",
        "M_comment": "Name of the month unit, as one entry in a dropdown.",
        "M": "months",
        "Q_comment": "Name of the quarter unit — three months — as one entry in a dropdown.",
        "Q": "quarters",
        "y_comment": "Name of the year unit, as one entry in a dropdown.",
        "y": "years"
      },
      "steps": {
        "forward_comment": "One piece of a rule's plain-language reading: moving forward by an amount. {{amount}} is replaced by a counted phrase such as \"2 weeks\". Keep the marker.",
        "forward": "{{amount}} on",
        "back_comment": "One piece of a rule's plain-language reading: moving backwards by an amount. {{amount}} is replaced by a counted phrase such as \"2 weeks\".",
        "back": "{{amount}} back",
        "amount_d_one_comment": "A counted amount of days, placed inside the phrases above. Add or remove plural forms as your language needs; every form your language uses must be present.",
        "amount_d_one": "{{count}} day",
        "amount_d_other": "{{count}} days",
        "amount_w_one": "{{count}} week",
        "amount_w_other": "{{count}} weeks",
        "amount_M_one": "{{count}} month",
        "amount_M_other": "{{count}} months",
        "amount_Q_one": "{{count}} quarter",
        "amount_Q_other": "{{count}} quarters",
        "amount_y_one": "{{count}} year",
        "amount_y_other": "{{count}} years",
        "weekdayNext_comment": "One piece of a rule's reading: the coming Monday, Tuesday and so on. {{day}} is replaced by the day's name in your language, supplied by the date library.",
        "weekdayNext": "next {{day}}",
        "weekdayPrevious_comment": "One piece of a rule's reading: the most recent Monday, Tuesday and so on.",
        "weekdayPrevious": "last {{day}}",
        "weekdayNth_one_comment": "One piece of a rule's reading: counting forward over several of the same weekday. {{count}} is the number and {{day}} the day's name. Add the plural forms your language needs.",
        "weekdayNth_one": "{{count}} {{day}} on",
        "weekdayNth_other": "{{count}} {{day}}s on",
        "weekdayNthBack_one": "{{count}} {{day}} back",
        "weekdayNthBack_other": "{{count}} {{day}}s back",
        "weekdayThis_comment": "One piece of a rule's reading: that weekday, counting today if today is already it.",
        "weekdayThis": "{{day}}, today counting"
      },
      "edges": {
        "SoW_comment": "One of the eight period edges, offered in a dropdown and shown in a rule's reading. The week's first day, which depends on the first-day-of-the-week setting.",
        "SoW": "Start of week",
        "EoW_comment": "The week's last day.",
        "EoW": "End of week",
        "SoM_comment": "The month's first day.",
        "SoM": "Start of month",
        "EoM_comment": "The month's last day.",
        "EoM": "End of month",
        "SoQ_comment": "The first day of the three-month quarter.",
        "SoQ": "Start of quarter",
        "EoQ_comment": "The last day of the three-month quarter.",
        "EoQ": "End of quarter",
        "SoY_comment": "The year's first day.",
        "SoY": "Start of year",
        "EoY_comment": "The year's last day.",
        "EoY": "End of year"
      }
    },
```

- [ ] **Step 2: Write the implementation**

```ts
// src/picker/quick-text.ts
import { moment } from "obsidian";
import { Rule, Step, parseRule, presetById } from "../picker/quick";
import { QuickSlot } from "../settings";
import { t } from "../i18n/i18n";

/**
 * A rule, read back in the reader's own language.
 *
 * A separated list, never a sentence — the argument `scopeSummary()` already
 * makes for its middle dots. An arrow between independently rendered pieces
 * reads as a sequence in every script, where a joined phrase would need grammar
 * we cannot supply for thirteen languages.
 *
 * Day names come from moment, which is where the calendar grid gets them and
 * the only place they are already translated. Nothing is assembled out of two
 * translated fragments: each piece is one key with placeholders, so the
 * translator controls its word order.
 */
const GLOSS_SEPARATOR = " → ";

export function glossFor(rule: Rule): string {
  return [t(`settings.quickDates.anchors.${rule.anchor}`), ...rule.steps.map(stepGloss)].join(
    GLOSS_SEPARATOR,
  );
}

/** One step in words, which is also what a chip in the builder says. */
export function stepGloss(step: Step): string {
  if (step.kind === "edge") return t(`settings.quickDates.edges.${step.edge}`);

  if (step.kind === "amount") {
    const amount = t(`settings.quickDates.steps.amount_${step.unit}`, { count: step.count });
    return t(`settings.quickDates.steps.${step.back ? "back" : "forward"}`, { amount });
  }

  const day = moment.weekdays()[step.day];
  if (step.inclusive) return t("settings.quickDates.steps.weekdayThis", { day });
  if (step.count === 1) {
    return t(`settings.quickDates.steps.${step.back ? "weekdayPrevious" : "weekdayNext"}`, { day });
  }

  return t(`settings.quickDates.steps.${step.back ? "weekdayNthBack" : "weekdayNth"}`, {
    count: step.count,
    day,
  });
}

/** The rule text a slot holds, whichever kind it is, or null for an empty one. */
export function ruleTextFor(slot: QuickSlot): string | null {
  if (slot === null) return null;
  return "preset" in slot ? (presetById(slot.preset)?.rule ?? null) : slot.rule;
}

/**
 * What the button says: the alias if there is one, and a preset's own
 * translated name otherwise. A rule of the reader's own always has an alias —
 * the page will not let it be emptied, and the read-back drops one that is.
 */
export function labelFor(slot: QuickSlot): string {
  if (slot === null) return t("settings.quickDates.empty");
  if ("preset" in slot) {
    return slot.alias ?? t(`settings.quickDates.presets.${slot.preset}`);
  }

  return slot.alias;
}

/** The gloss for a slot, or null when it holds nothing readable. */
export function slotGloss(slot: QuickSlot): string | null {
  const text = ruleTextFor(slot);
  const rule = text === null ? null : parseRule(text);

  return rule === null ? null : glossFor(rule);
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run build`
Expected: clean. Nothing renders this yet.

- [ ] **Step 4: Commit**

```
feat: read a quick-date rule back in words

- English strings for presets, units, weekdays and period edges
```

---

### Task 6: The row under the calendar

**Files:**
- Modify: `src/picker/panel.ts:60-95` (the footer) and its `PanelOptions`
- Modify: `styles.css:600-627` (the footer rules)
- Test: none — the panel needs a DOM and the Obsidian API, which is the line this repo draws.

**Interfaces:**
- Consumes: `resolveRule`, `parseRule` from `src/picker/quick.ts`; `labelFor`, `ruleTextFor` from `src/picker/quick-text.ts`; `replacementFor` from `src/picker/write.ts`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Render the row**

In `src/picker/panel.ts`, after the `writes` element is created, add the shortcuts. They are children of the footer — that is what lets them share Today's line — and the preview is created before them, so with the preview on the shortcuts take a full-width break and it stays on the first line.

```ts
  // Children of the footer, and after the preview in the DOM, which is the
  // whole of the merge rule: with the preview off they sit on Today's line,
  // and with it on they take a full-width break and form their own row while
  // the preview keeps the first line. The condition is the setting, never a
  // measurement — the preview's width changes on every hover, so a layout that
  // wrapped on available width would jump while it was being read.
  const quick = options.settings.showQuickDates ? renderQuick() : null;
  footer.toggleClass("kalendae-panel-footer-preview", writes !== null);

  function renderQuick(): HTMLElement | null {
    const slots = options.settings.quickDates.filter((slot) => slot !== null);
    if (slots.length === 0) return null;

    const row = footer.createDiv({ cls: "kalendae-panel-quick" });
    for (const slot of slots) {
      const text = ruleTextFor(slot);
      const rule = text === null ? null : parseRule(text);
      if (rule === null) continue;

      const day = resolveRule(rule, {
        value: options.value,
        today,
        weekStart: options.settings.weekStart,
      });

      const button = row.createEl("button", {
        cls: "kalendae-panel-quick-date",
        text: labelFor(slot),
      });
      // The date it lands on, for a screen reader, which would otherwise hear
      // only a name somebody made up.
      button.setAttribute("aria-label", `${labelFor(slot)} — ${replacementFor(options.pattern, day)}`);
      button.addEventListener("click", () => options.onPick(day));
      button.addEventListener("mouseenter", () => preview(day));
    }

    return row;
  }
```

Add the `mouseleave` twin so leaving a shortcut restores the preview, beside the two that exist on the footer and the grid:

```ts
  quick?.addEventListener("mouseleave", () => preview(focused));
```

`filter((slot) => slot !== null)` does not narrow `QuickSlot[]` to the non-null members on every TypeScript version. Use an explicit predicate so `npm run build` cannot depend on that:

```ts
    const slots = options.settings.quickDates.filter(
      (slot): slot is Exclude<QuickSlot, null> => slot !== null,
    );
```

- [ ] **Step 2: Add the CSS**

In `styles.css`, beside the footer rules:

```css
/* The footer wraps so the shortcuts can share Today's line. With the preview
   on, the shortcut row takes a full-width break instead — the preview's text
   changes width on every hover, and wrapping on available width would move the
   row while it was being read. */
.kalendae-panel .kalendae-panel-footer {
  flex-wrap: wrap;
}

.kalendae-panel .kalendae-panel-quick {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-4-2);
}

.kalendae-panel .kalendae-panel-footer-preview .kalendae-panel-quick {
  flex-basis: 100%;
}

.kalendae-panel .kalendae-panel-quick-date {
  background-color: transparent;
  border: none;
  box-shadow: none;
  color: var(--text-accent);
  cursor: pointer;
  font-size: var(--font-ui-small);
  padding: 0;
}

.kalendae-panel .kalendae-panel-quick-date:hover {
  color: var(--text-accent-hover);
}
```

(Keep only the second, more specific selector if the first is redundant once written — the class is on the footer itself.)

- [ ] **Step 3: Check it in a vault**

With `npm run dev` running and the Hot Reload plugin installed, open a note with a date, open the calendar, and confirm: three buttons under Today; hovering one shows its date on the preview line; leaving it restores the focused day's date; clicking one writes that date and closes; Tab reaches the buttons; Escape still closes.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run build && npm test`

- [ ] **Step 5: Commit**

```
feat: show quick dates under the calendar

- shortcuts share Today's line unless the date preview is shown
- hovering one previews the date it would write
```

---

### Task 7: The settings page

> **Superseded 2026-09-13.** Tasks 7 and 8 were built as written, reviewed on screen and reworked:
> the settings page is a hand-drawn table rather than `Setting` rows, and the chip builder was
> replaced by a typed field with a chained suggestion list and a test date. The spec is the record
> of what was built; these two tasks are kept only for the history of what was tried.

**Files:**
- Create: `src/settings/quick-dates-page.ts`
- Modify: `src/settings/settings-tab.ts:140-170` (the Calendar group)
- Modify: `styles.css`
- Test: none.

**Interfaces:**
- Consumes: `QuickSlot`, `QUICK_SLOTS` from `src/settings.ts`; `QUICK_PRESET_GROUPS` from `src/picker/quick.ts`; `labelFor`, `slotGloss` from `src/picker/quick-text.ts`; `KalendaeHost`; `editQuickDate` from Task 8.
- Produces: `QuickDatesPage`, `quickDatesSummary(settings: KalendaeSettings): string`.

**Order: build Task 8 before this one.** The page imports `editQuickDate` from the modal and will
not compile without it — the numbering follows the reader's path through the feature, not the
compiler's.

- [ ] **Step 1: Write the page**

```ts
// src/settings/quick-dates-page.ts
import { Menu, Setting, SettingPage } from "obsidian";
import { KalendaeSettings, QUICK_SLOTS, QuickSlot } from "../settings";
import { QUICK_PRESET_GROUPS } from "../picker/quick";
import { KalendaeHost } from "./host";
import { labelFor, slotGloss } from "../picker/quick-text";
import { editQuickDate } from "./quick-date-modal";
import { t } from "../i18n/i18n";

/**
 * The four shortcut slots, and the switch that hides them without clearing
 * them.
 *
 * Four slots, always four: no add button, no trash and no dragging, because a
 * list that cannot exceed four rows does not earn any of the three. Clearing a
 * slot is choosing nothing in its own chooser, and reordering is editing two
 * slots.
 */
export class QuickDatesPage extends SettingPage {
  private changed = false;

  constructor(
    private readonly host: KalendaeHost,
    private readonly onChanged: () => void,
  ) {
    super();
    this.title = t("settings.quickDates.heading");
  }

  /**
   * The summary row on the tab behind this page reads the same settings, and
   * `displayValue` only re-reads them when the tab is told to update. Leaving
   * is the moment to say so — doing it per change would redraw the tab under
   * a page the reader is still working on.
   */
  hide(): void {
    super.hide();
    if (!this.changed) return;
    this.changed = false;
    this.onChanged();
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.addClass("kalendae-settings-page", "kalendae-quick-dates");

    new Setting(this.containerEl).setName(t("settings.quickDates.show")).addToggle((toggle) =>
      toggle.setValue(this.host.settings.showQuickDates).onChange((value) => {
        this.host.settings.showQuickDates = value;
        this.save();
      }),
    );

    this.containerEl.createDiv({
      cls: "kalendae-quick-intro",
      text: t("settings.quickDates.description"),
    });

    for (let at = 0; at < QUICK_SLOTS; at += 1) this.renderSlot(at);
  }

  private renderSlot(at: number): void {
    const slot = this.host.settings.quickDates[at];
    const row = new Setting(this.containerEl)
      .setName(String(at + 1))
      .setClass("kalendae-quick-slot");

    const gloss = slotGloss(slot);
    if (gloss !== null) row.setDesc(gloss);

    row.addText((text) =>
      text
        .setPlaceholder(t("settings.quickDates.alias"))
        .setValue(slot !== null && slot.alias !== undefined ? slot.alias : "")
        .setDisabled(slot === null)
        .onChange(() => undefined)
        // Committed on leaving rather than per keystroke: a custom slot's name
        // cannot be emptied, and reverting mid-word would fight the typist.
        .inputEl.addEventListener("blur", (event) =>
          this.renameSlot(at, (event.target as HTMLInputElement).value),
        ),
    );

    row.addButton((button) =>
      button
        .setButtonText(chooserLabel(slot))
        .setClass("kalendae-quick-chooser")
        .onClick((event) => this.openChooser(at, event)),
    );

    if (slot !== null && "rule" in slot) {
      row.addExtraButton((button) =>
        button
          .setIcon("pencil")
          .setTooltip(t("settings.quickDates.edit"))
          .onClick(() => this.editSlot(at)),
      );
    }
  }

  /** The chooser: nothing, the two groups of presets, and a rule of your own. */
  private openChooser(at: number, event: MouseEvent): void {
    // The DOM menu, not the OS one: Obsidian's "Native menus" setting would
    // otherwise draw this outside the theme and nothing like the menus beside it.
    const menu = new Menu().setUseNativeMenu(false);

    menu.addItem((item) =>
      item.setTitle(t("settings.quickDates.empty")).onClick(() => this.fill(at, null)),
    );

    for (const group of QUICK_PRESET_GROUPS) {
      menu.addSeparator();
      menu.addItem((item) =>
        item.setIsLabel(true).setTitle(t(`settings.quickDates.groups.${group.anchor}`)),
      );
      for (const id of group.ids) {
        menu.addItem((item) =>
          item
            .setTitle(t(`settings.quickDates.presets.${id}`))
            .onClick(() => this.fill(at, { preset: id })),
        );
      }
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle(t("settings.quickDates.custom")).onClick(() => this.editSlot(at)),
    );

    menu.showAtMouseEvent(event);
  }

  /** Opens the builder on whatever the slot holds, which is how a preset is renamed. */
  private editSlot(at: number): void {
    editQuickDate(this.host.app, this.host.settings.quickDates[at], (slot) => this.fill(at, slot));
  }

  private renameSlot(at: number, typed: string): void {
    const slot = this.host.settings.quickDates[at];
    if (slot === null) return;

    const alias = typed.trim();
    // A rule of the reader's own has no name underneath it, so an emptied field
    // reverts rather than destroying the rule on the next load. A preset's name
    // empties freely: its own translated name is what shows through.
    if ("rule" in slot) {
      if (alias === "") {
        this.display();
        return;
      }
      this.fill(at, { rule: slot.rule, alias });
      return;
    }

    this.fill(at, alias === "" ? { preset: slot.preset } : { preset: slot.preset, alias });
  }

  private fill(at: number, slot: QuickSlot): void {
    this.host.settings.quickDates[at] = slot;
    this.save();
    this.display();
  }

  private save(): void {
    this.changed = true;
    void this.host.saveSettings();
  }
}

function chooserLabel(slot: QuickSlot): string {
  if (slot === null) return t("settings.quickDates.empty");
  return "preset" in slot
    ? t(`settings.quickDates.presets.${slot.preset}`)
    : t("settings.quickDates.custom");
}

/**
 * The shortcuts currently set, for the summary row on the settings tab.
 *
 * Three states, because the row has to distinguish them: switched off, on but
 * empty, and a list. The separator is the middle dot `scopeSummary()` already
 * argues for — a comma and a space is English typography.
 */
const SUMMARY_SEPARATOR = " · ";

export function quickDatesSummary(settings: KalendaeSettings): string {
  if (!settings.showQuickDates) return t("settings.quickDates.off");

  const names = settings.quickDates.filter((slot) => slot !== null).map((slot) => labelFor(slot));

  return names.length === 0 ? t("settings.quickDates.none") : names.join(SUMMARY_SEPARATOR);
}
```

- [ ] **Step 2: Add the row to the Calendar group**

In `src/settings/settings-tab.ts`, import `QuickDatesPage` and `quickDatesSummary`, then add a fourth item to the calendar group's `items`, after the writes-preview row:

```ts
          {
            name: t("settings.quickDates.heading"),
            type: "page",
            displayValue: () => quickDatesSummary(this.kalendae.settings),
            page: () => new QuickDatesPage(this.kalendae, () => this.update()),
          },
```

- [ ] **Step 3: Add the CSS**

```css
/* The slot rows are dense — four of them plus a switch on one short page —
   and Obsidian's defaults are sized for pages with far fewer rows. */
.kalendae-quick-dates .kalendae-quick-intro {
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
  margin-bottom: var(--size-4-2);
}

.kalendae-quick-dates .kalendae-quick-slot .setting-item-name {
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}

.kalendae-quick-dates .kalendae-quick-slot .setting-item-description {
  font-size: var(--font-ui-smaller);
}
```

- [ ] **Step 4: Check it in a vault**

Open Settings → Kalendae → Calendar → Quick dates. Confirm: the switch hides the row in the calendar but keeps the slots; choosing a preset fills a slot in one click; the gloss under each slot reads correctly; renaming a preset and leaving the field keeps the new name; emptying a preset's name restores the preset's own; the summary row behind the page updates on leaving, and reads `Off` and `None` in those two states.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run build && npm test`

- [ ] **Step 6: Commit**

```
feat: settings page for the four quick-date slots

- a chooser per slot, a name, and the rule read back in words
- one switch hides the row without clearing it
```

---

### Task 8: The builder

> **Superseded 2026-09-13.** Tasks 7 and 8 were built as written, reviewed on screen and reworked:
> the settings page is a hand-drawn table rather than `Setting` rows, and the chip builder was
> replaced by a typed field with a chained suggestion list and a test date. The spec is the record
> of what was built; these two tasks are kept only for the history of what was tried.

**Files:**
- Create: `src/settings/quick-date-modal.ts`
- Modify: `src/i18n/locales/en.json` (a `modal` object under `settings.quickDates`)
- Modify: `styles.css`
- Test: none.

**Interfaces:**
- Consumes: `Rule`, `Step`, `Unit`, `UNITS`, `EDGES`, `WEEKDAYS`, `formatRule`, `parseRule`, `resolveRule`, `presetById` from `src/picker/quick.ts`; `stepGloss` from `../picker/quick-text`; `QuickSlot` from `../settings`; `todayKey` from `../picker/month`.
- Produces: `editQuickDate(app: App, slot: QuickSlot, onSave: (slot: QuickSlot) => void): void`.

- [ ] **Step 1: Add the modal's strings to `en.json`**

Inside the `quickDates` object added in Task 5:

```json
      "modal": {
        "title_comment": "Title of the dialog for building a shortcut of your own.",
        "title": "Quick date",
        "name_comment": "Label of the field holding the text that will appear on the button.",
        "name": "Name",
        "start_comment": "Label of the control choosing what the rule counts from.",
        "start": "Start",
        "steps_comment": "Label of the list of steps making up the rule.",
        "steps": "Steps",
        "addStep_comment": "Button that opens the editor for one more step.",
        "addStep": "Add a step",
        "removeStep_comment": "Hover label on the button removing one step from the rule.",
        "removeStep": "Remove",
        "kind_comment": "Label of the dropdown choosing which sort of step is being added.",
        "kind": "Kind",
        "kinds": {
          "amount_comment": "One sort of step: moving by a number of days, weeks, months, quarters or years.",
          "amount": "Move by",
          "weekday_comment": "One sort of step: moving to a day of the week.",
          "weekday": "Weekday",
          "edge_comment": "One sort of step: jumping to the first or last day of a week, month, quarter or year.",
          "edge": "Jump to"
        },
        "forward_comment": "Direction for a step, in a dropdown: later in time.",
        "forward": "forward",
        "back_comment": "Direction for a step, in a dropdown: earlier in time.",
        "back": "back",
        "next_comment": "Direction for a weekday step, in a dropdown: the coming one.",
        "next": "next",
        "previous_comment": "Direction for a weekday step, in a dropdown: the most recent one.",
        "previous": "previous",
        "inclusive_comment": "Label of the checkbox making a weekday step stay where it is when today is already that day.",
        "inclusive": "Count today if it matches",
        "add_comment": "Button that adds the step being edited to the rule.",
        "add": "Add",
        "landsOn_comment": "Label of the line showing the date the rule produces.",
        "landsOn": "Lands on",
        "fromToday_comment": "Shown beside the date when the rule counts from the date being edited: there is no note open in settings, so today stands in for it.",
        "fromToday": "from today",
        "cancel_comment": "Button that closes the dialog without keeping the shortcut.",
        "cancel": "Cancel",
        "save_comment": "Button that keeps the shortcut. Unavailable until the shortcut has a name and at least one step.",
        "save": "Save"
      }
```

- [ ] **Step 2: Write the modal**

```ts
// src/settings/quick-date-modal.ts
import { App, ButtonComponent, Modal, Setting, moment } from "obsidian";
import {
  Anchor,
  EDGES,
  Edge,
  Rule,
  Step,
  UNITS,
  Unit,
  WEEKDAYS,
  formatRule,
  parseRule,
  presetById,
  resolveRule,
} from "../picker/quick";
import { QuickSlot } from "../settings";
import { todayKey } from "../picker/month";
import { stepGloss } from "../picker/quick-text";
import { t } from "../i18n/i18n";

/**
 * The builder: the only place a rule is made.
 *
 * Chips rather than a text field, which is what removes the language from in
 * front of the reader entirely — there is no reference table to read, no error
 * message to write and nothing to translate, because no invalid rule can be
 * constructed. A modal rather than a sub-page, for the reason the format editor
 * is one: Save and Cancel do what their labels say, and Save is simply
 * unavailable until the shortcut is usable.
 *
 * It opens on whatever the slot held, preset included, which is how a preset is
 * renamed: choose Custom…, change the name, save.
 */
class QuickDateModal extends Modal {
  private alias: string;
  private anchor: Anchor;
  private steps: Step[];
  private save: ButtonComponent | null = null;
  private landsOn: HTMLElement | null = null;
  private stepsEl: HTMLElement | null = null;

  constructor(
    app: App,
    slot: QuickSlot,
    private readonly onSave: (slot: QuickSlot) => void,
  ) {
    super(app);
    const rule = startingRule(slot);
    this.alias = startingAlias(slot);
    this.anchor = rule?.anchor ?? "today";
    this.steps = rule?.steps ?? [];
  }

  onOpen(): void {
    this.setTitle(t("settings.quickDates.modal.title"));
    this.contentEl.addClass("kalendae-settings-page", "kalendae-quick-modal");

    new Setting(this.contentEl).setName(t("settings.quickDates.modal.name")).addText((text) =>
      text.setValue(this.alias).onChange((value) => {
        this.alias = value;
        this.refresh();
      }),
    );

    new Setting(this.contentEl).setName(t("settings.quickDates.modal.start")).addDropdown((drop) =>
      drop
        .addOptions({
          today: t("settings.quickDates.anchors.today"),
          date: t("settings.quickDates.anchors.date"),
        })
        .setValue(this.anchor)
        .onChange((value) => {
          this.anchor = value as Anchor;
          this.refresh();
        }),
    );

    const steps = new Setting(this.contentEl)
      .setName(t("settings.quickDates.modal.steps"))
      .setClass("kalendae-quick-steps");
    this.stepsEl = steps.controlEl.createDiv({ cls: "kalendae-quick-chips" });

    steps.addButton((button) =>
      button.setButtonText(t("settings.quickDates.modal.addStep")).onClick(() => this.addStep()),
    );

    const result = new Setting(this.contentEl).setName(t("settings.quickDates.modal.landsOn"));
    this.landsOn = result.controlEl.createSpan({ cls: "kalendae-quick-lands" });

    const actions = new Setting(this.contentEl).setClass("kalendae-format-actions");
    actions
      .addButton((button) =>
        button.setButtonText(t("settings.quickDates.modal.cancel")).onClick(() => this.close()),
      )
      .addButton((button) => {
        this.save = button
          .setButtonText(t("settings.quickDates.modal.save"))
          .setCta()
          .onClick(() => {
            this.onSave({ rule: formatRule(this.rule()), alias: this.alias.trim() });
            this.close();
          });
      });

    this.refresh();
  }

  private rule(): Rule {
    return { anchor: this.anchor, steps: this.steps };
  }

  /**
   * The step editor, inline in this modal rather than a second one over it.
   *
   * Kind and direction are dropdowns because Obsidian's settings components
   * offer no radio group, and a hand-rolled one would be the only control in
   * the plugin that themes do not already style.
   */
  private addStep(): void {
    const editor = this.contentEl.createDiv({ cls: "kalendae-quick-step-editor" });
    let draft: Step = { kind: "amount", count: 1, unit: "d", back: false };

    const body = editor.createDiv();
    const render = (): void => {
      body.empty();
      if (draft.kind === "amount") this.renderAmount(body, draft, (next) => (draft = next));
      else if (draft.kind === "weekday") this.renderWeekday(body, draft, (next) => (draft = next));
      else this.renderEdge(body, draft, (next) => (draft = next));
    };

    new Setting(editor).setName(t("settings.quickDates.modal.kind")).addDropdown((drop) =>
      drop
        .addOptions({
          amount: t("settings.quickDates.modal.kinds.amount"),
          weekday: t("settings.quickDates.modal.kinds.weekday"),
          edge: t("settings.quickDates.modal.kinds.edge"),
        })
        .setValue(draft.kind)
        .onChange((value) => {
          draft =
            value === "amount"
              ? { kind: "amount", count: 1, unit: "d", back: false }
              : value === "weekday"
                ? { kind: "weekday", day: 1, count: 1, back: false, inclusive: false }
                : { kind: "edge", edge: "EoM" };
          render();
        }),
    );

    render();

    new Setting(editor).addButton((button) =>
      button
        .setButtonText(t("settings.quickDates.modal.add"))
        .setCta()
        .onClick(() => {
          this.steps.push(draft);
          editor.remove();
          this.refresh();
        }),
    );
  }

  private renderAmount(parent: HTMLElement, draft: Step, set: (step: Step) => void): void {
    const step = draft as Extract<Step, { kind: "amount" }>;
    const row = new Setting(parent).setName(t("settings.quickDates.modal.kinds.amount"));

    row.addText((text) =>
      text.setValue(String(step.count)).onChange((value) => {
        const count = Number(value);
        // 1 to 999: a step that moves nowhere is not a step, and +99999999y is
        // a slip rather than an intention. Out of range simply does not take.
        if (Number.isInteger(count) && count >= 1 && count <= 999) set({ ...step, count });
      }),
    );

    row.addDropdown((drop) =>
      drop
        .addOptions(Object.fromEntries(UNITS.map((unit) => [unit, t(`settings.quickDates.units.${unit}`)])))
        .setValue(step.unit)
        .onChange((value) => set({ ...step, unit: value as Unit })),
    );

    row.addDropdown((drop) =>
      drop
        .addOptions({
          forward: t("settings.quickDates.modal.forward"),
          back: t("settings.quickDates.modal.back"),
        })
        .setValue(step.back ? "back" : "forward")
        .onChange((value) => set({ ...step, back: value === "back" })),
    );
  }

  private renderWeekday(parent: HTMLElement, draft: Step, set: (step: Step) => void): void {
    const step = draft as Extract<Step, { kind: "weekday" }>;
    const row = new Setting(parent).setName(t("settings.quickDates.modal.kinds.weekday"));
    const names = moment.weekdays();

    row.addText((text) =>
      text
        .setValue(String(step.count))
        .setDisabled(step.inclusive)
        .onChange((value) => {
          const count = Number(value);
          if (Number.isInteger(count) && count >= 1 && count <= 999) set({ ...step, count });
        }),
    );

    row.addDropdown((drop) =>
      drop
        .addOptions(Object.fromEntries(WEEKDAYS.map((_day, at) => [String(at), names[at]])))
        .setValue(String(step.day))
        .onChange((value) => set({ ...step, day: Number(value) })),
    );

    row.addDropdown((drop) =>
      drop
        .addOptions({
          next: t("settings.quickDates.modal.next"),
          previous: t("settings.quickDates.modal.previous"),
        })
        .setValue(step.back ? "previous" : "next")
        .setDisabled(step.inclusive)
        .onChange((value) => set({ ...step, back: value === "previous" })),
    );

    // The bare form takes neither a count nor a direction, so both are disabled
    // rather than ignored: a control that cannot be honoured is worse than one
    // that is not there. That makes "the previous Monday, counting today"
    // unreachable, which is deliberate — nobody says it, and the language
    // cannot express it either.
    new Setting(parent).setName(t("settings.quickDates.modal.inclusive")).addToggle((toggle) =>
      toggle.setValue(step.inclusive).onChange((value) => {
        set({ ...step, inclusive: value, count: 1, back: false });
        this.redrawStepEditor(parent, set);
      }),
    );
  }

  private renderEdge(parent: HTMLElement, draft: Step, set: (step: Step) => void): void {
    const step = draft as Extract<Step, { kind: "edge" }>;
    // One whole phrase from one list, never "[End] of [month]" assembled from
    // two controls: word order differs by language, and a phrase built from
    // fragments reads as nonsense in the ones where it differs most.
    new Setting(parent).setName(t("settings.quickDates.modal.kinds.edge")).addDropdown((drop) =>
      drop
        .addOptions(Object.fromEntries(EDGES.map((edge) => [edge, t(`settings.quickDates.edges.${edge}`)])))
        .setValue(step.edge)
        .onChange((value) => set({ ...step, edge: value as Edge })),
    );
  }

  /** Redraws the open step editor after a toggle changes which controls apply. */
  private redrawStepEditor(parent: HTMLElement, set: (step: Step) => void): void {
    void set;
    const editor = parent.closest(".kalendae-quick-step-editor");
    if (!(editor instanceof HTMLElement)) return;
    editor.remove();
    this.addStep();
  }

  private refresh(): void {
    this.renderChips();

    const rule = this.rule();
    const usable = this.alias.trim() !== "" && rule.steps.length > 0;
    this.save?.setDisabled(!usable);

    if (!usable) {
      this.landsOn?.setText("");
      return;
    }

    const today = todayKey();
    // A rule anchored to the note's date has nothing to anchor to here: there
    // is no note and no date being edited, so it resolves from today and says
    // so rather than showing a date whose origin is a mystery.
    const day = resolveRule(rule, { value: today, today, weekStart: "monday" });
    const on = moment.utc(day).format("LL");
    this.landsOn?.setText(
      rule.anchor === "date" ? `${on} (${t("settings.quickDates.modal.fromToday")})` : on,
    );
  }

  private renderChips(): void {
    if (!this.stepsEl) return;
    this.stepsEl.empty();

    this.steps.forEach((step, at) => {
      const chip = this.stepsEl?.createDiv({ cls: "kalendae-quick-chip" });
      chip?.createSpan({ text: stepGloss(step) });
      const remove = chip?.createEl("button", { cls: "kalendae-quick-chip-remove", text: "×" });
      remove?.setAttribute("aria-label", t("settings.quickDates.modal.removeStep"));
      remove?.addEventListener("click", () => {
        this.steps.splice(at, 1);
        this.refresh();
      });
    });
  }
}

function startingRule(slot: QuickSlot): Rule | null {
  if (slot === null) return null;
  const text = "preset" in slot ? presetById(slot.preset)?.rule : slot.rule;

  return text === undefined ? null : parseRule(text);
}

function startingAlias(slot: QuickSlot): string {
  if (slot === null) return "";
  if ("rule" in slot) return slot.alias;

  return slot.alias ?? t(`settings.quickDates.presets.${slot.preset}`);
}

export function editQuickDate(
  app: App,
  slot: QuickSlot,
  onSave: (slot: QuickSlot) => void,
): void {
  new QuickDateModal(app, slot, onSave).open();
}
```

- [ ] **Step 3: Add the CSS**

```css
.kalendae-quick-modal .kalendae-quick-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-4-1);
}

.kalendae-quick-modal .kalendae-quick-chip {
  align-items: center;
  background-color: var(--background-modifier-hover);
  border-radius: var(--radius-s);
  display: flex;
  font-size: var(--font-ui-smaller);
  gap: var(--size-4-1);
  padding: var(--size-2-1) var(--size-4-1);
}

.kalendae-quick-modal .kalendae-quick-chip-remove {
  background-color: transparent;
  border: none;
  box-shadow: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
}

.kalendae-quick-modal .kalendae-quick-step-editor {
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  margin-bottom: var(--size-4-2);
  padding: var(--size-4-2);
}

.kalendae-quick-modal .kalendae-quick-lands {
  color: var(--text-muted);
}
```

- [ ] **Step 4: Check it in a vault**

Build a rule of each kind. Confirm: Save is unavailable until there is a name and a step; a chip reads correctly and removes; ticking *count today if it matches* disables the count and the direction; `Lands on` updates as steps are added and says *from today* for a rule anchored to the note's date; choosing `Custom…` on a preset opens it pre-filled with that preset's name and steps; the result appears as a button in the calendar.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run build && npm test`

- [ ] **Step 6: Commit**

```
feat: build a quick date of your own

- a step at a time, with chips and no expression to type
- renaming a preset opens it pre-filled
```

---

### Task 9: Translations and the release gate

**Files:**
- Modify: the twelve locale files in `src/i18n/locales/` other than `en.json` and `sample_lang.json`

**Interfaces:** none.

- [ ] **Step 1: Confirm the English has stopped moving**

Read every string added in Tasks 5 and 8 once more, in context in the running plugin. This is the last moment a reworded string costs one file rather than thirteen.

- [ ] **Step 2: Run the stop-slop pass over every new string**

Use the `stop-slop` skill on the new `en.json` values. Fix what it finds in `en.json` only.

- [ ] **Step 3: Translate**

For each of the twelve locales, add the same key set with the same structure. Notes that matter:

- `amount_d_one` and its siblings are i18next plural keys. Each locale carries the forms **its own** language needs — Russian adds `_few` and `_many`, Japanese, Chinese and Korean fill `_one` and `_other` with the same text. `scripts/validate-translations.mjs` allows forms English lacks but still requires every key English declares.
- Do not translate the `_comment` siblings; they exist for translators and stay in English.
- `settings.quickDates.empty` — the dashes are decorative and may be dropped.

- [ ] **Step 4: Validate**

Run: `npm run validate-translations`
Expected: a ✅ per locale, no missing, extra or blank keys.

- [ ] **Step 5: Run the full gate**

Run: `npm run release-check`
Expected: build, tests and translation validation all pass.

- [ ] **Step 6: Update TODO.md**

Flip item 11 to `Status: Resolved` in place — do not move, copy or delete it — update its TOC row and re-sort, and add a short note recording what the item did not anticipate: the shortcuts are built rather than chosen from a fixed list, the anchor question is answered per rule by `today` or `date` rather than globally, and Today stayed a permanent button outside the catalogue.

- [ ] **Step 7: Commit**

```
feat: configurable quick dates in the calendar

- up to four shortcut buttons, from presets or built step by step
- a switch to hide the row without clearing it
- translations for all thirteen languages
```
