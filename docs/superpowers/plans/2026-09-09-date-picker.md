# Date picker implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change a date already written in a note by picking a day from a calendar anchored to it.

**Architecture:** A CM6 `ViewPlugin` scans the visible ranges, marks each detected date and adds a
zero-width icon widget paired to it by a shared id. Hovering either one, double-clicking the date,
or running the `pick-date` command dispatches one state effect that opens a CM6 tooltip holding the
calendar panel. Picking a day renders the new date through the format that matched the old one and
replaces exactly that range in a single transaction.

**Tech Stack:** TypeScript, CodeMirror 6 (`@codemirror/state`, `@codemirror/view`,
`@codemirror/language` — all externalised, never bundled), Obsidian 1.13 API, moment (via
`obsidian`), i18next, Jest with ts-jest.

**Spec:** `docs/superpowers/specs/2026-09-07-date-picker-design.md`

## Global Constraints

- `minAppVersion` 1.13.0. The settings tab implements `getSettingDefinitions()` only, never
  `display()`.
- CodeMirror packages stay in `esbuild.config.mjs`'s `external` list. Verify with
  `grep -c "class EditorView" main.js` → must be 0.
- No `!important`, no `style=""` attributes, no partially-supported CSS. Colours, spacing and radii
  come from Obsidian CSS variables.
- Every user-visible string goes through `t()`, is added to `en.json` with a `_comment` sibling, and
  is translated in all 12 other locales plus a blank entry in `sample_lang.json`.
  `npm run validate-translations` gates this.
- Formats are an ordered list; the first match claims a range. Write-back reuses the format that
  matched and never restyles a date.
- Detection gates stay as they are: compiled regex, boundary rule, then `moment.utc(text, pattern,
  true).isValid()` as the authority. Use `moment.utc(...)`, never a bare `moment(...)`.
- Months are 0-based everywhere in this plan, matching moment.
- `npm run release-check` (validate-translations, tsc, eslint, esbuild, jest) must pass before any
  commit. Note: four failures in `tests/detect/corpus.test.ts` were fixed on 2026-09-07; the suite
  is green on Windows.

---

### Task 1: Range-limited detection

**Files:**
- Modify: `src/detect/detect.ts`
- Test: `tests/detect/detect-in.test.ts` (create)

**Interfaces:**
- Consumes: `scanText`, `classifyContext`, `frontmatterEnd`, `KalendaeSettings` (all existing).
- Produces: `detectIn(state: EditorState, settings: KalendaeSettings, from: number, to: number):
  Detection[]` — accepted and rejected detections whose offsets are absolute document offsets. The
  range is expanded to whole lines before scanning, so a date straddling either edge is found whole.
  No `contextComplete`: the caller is asking about text CodeMirror has already parsed.

- [ ] **Step 1: Write the failing test**

```ts
import { EditorState } from "@codemirror/state";
import { detectIn } from "../../src/detect/detect";
import { DEFAULT_SETTINGS } from "../../src/settings";

const doc = ["First 2026-01-01 line", "Second 2026-02-02 line", "Third 2026-03-03 line"].join("\n");

function accepted(from: number, to: number): string[] {
  const state = EditorState.create({ doc });
  return detectIn(state, DEFAULT_SETTINGS, from, to)
    .filter((detection) => detection.accepted)
    .map((detection) => detection.text);
}

describe("detectIn", () => {
  it("finds only the dates in the given range", () => {
    const secondLine = doc.indexOf("Second");
    expect(accepted(secondLine, secondLine + 6)).toEqual(["2026-02-02"]);
  });

  it("reports absolute document offsets, not offsets into the slice", () => {
    const state = EditorState.create({ doc });
    const thirdLine = doc.indexOf("Third");
    const [detection] = detectIn(state, DEFAULT_SETTINGS, thirdLine, doc.length).filter(
      (candidate) => candidate.accepted,
    );
    expect(doc.slice(detection.from, detection.to)).toBe("2026-03-03");
  });

  it("finds a date the range cuts through, by widening to whole lines", () => {
    // The range ends in the middle of the second line's date.
    const cut = doc.indexOf("2026-02-02") + 4;
    expect(accepted(doc.indexOf("Second"), cut)).toEqual(["2026-02-02"]);
  });

  it("leaves the whole-note entry point alone", () => {
    const state = EditorState.create({ doc });
    const result = detectIn(state, DEFAULT_SETTINGS, 0, doc.length);
    expect(result.filter((detection) => detection.accepted).map((d) => d.text)).toEqual([
      "2026-01-01",
      "2026-02-02",
      "2026-03-03",
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/detect/detect-in.test.ts`
Expected: FAIL — `detectIn is not a function`.

- [ ] **Step 3: Implement**

In `src/detect/detect.ts`, add below `detectDates`:

```ts
export function detectIn(
  state: EditorState,
  settings: KalendaeSettings,
  from: number,
  to: number,
): Detection[] {
  const start = state.doc.lineAt(Math.max(0, from)).from;
  const end = state.doc.lineAt(Math.min(state.doc.length, to)).to;
  const text = state.doc.sliceString(start, end);
  const tree = syntaxTree(state);
  const upto = frontmatterEnd(state.doc.sliceString(0, Math.min(state.doc.length, end)));

  return scanText(text, settings.formats).map((candidate) =>
    withContext(tree, upto, { ...candidate, from: candidate.from + start, to: candidate.to + start }, settings),
  );
}
```

`withContext` is already private in this file and takes absolute offsets, so shifting the candidate
before passing it through is all that is needed.

- [ ] **Step 4: Run the suite**

Run: `npx jest`
Expected: PASS, including the existing `detectDates` tests.

- [ ] **Step 5: Commit**

```bash
git add src/detect/detect.ts tests/detect/detect-in.test.ts
git commit -F - <<'MSG'
feat: detect dates in a range of a note

- Add range-limited detection for the editor to scan what it renders

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 2: The month grid

**Files:**
- Create: `src/picker/month.ts`
- Test: `tests/picker/month.test.ts` (create)

**Interfaces:**
- Produces:

```ts
export interface DayKey { year: number; month: number; day: number }   // month 0-based
export interface DayCell extends DayKey { outside: boolean; selected: boolean; today: boolean }
export interface Week { weekNumber: number; days: DayCell[] }          // days.length === 7
export interface MonthOptions { firstDay: number; selected: DayKey | null; today: DayKey }
export function buildMonth(year: number, month: number, options: MonthOptions): Week[]
export function clampDay(year: number, month: number, day: number): number
export function shiftMonths(from: DayKey, months: number): DayKey
```

`buildMonth` always returns whole weeks covering the month, starting on `firstDay` (0 = Sunday).
`clampDay` answers "the 31st of a 30-day month is the 30th", which is what paging needs.
`shiftMonths` pages the focused day, clamping through `clampDay`.

- [ ] **Step 1: Write the failing test**

```ts
import { buildMonth, clampDay, shiftMonths } from "../../src/picker/month";

const today = { year: 2026, month: 8, day: 9 };

describe("buildMonth", () => {
  it("starts the grid on the first day of the week, in the previous month if it must", () => {
    const weeks = buildMonth(2024, 2, { firstDay: 1, selected: null, today });
    expect(weeks[0].days[0]).toMatchObject({ year: 2024, month: 1, day: 26, outside: true });
  });

  it("respects a Sunday start", () => {
    const weeks = buildMonth(2024, 2, { firstDay: 0, selected: null, today });
    expect(weeks[0].days[0]).toMatchObject({ year: 2024, month: 1, day: 25, outside: true });
  });

  it("gives every week seven days", () => {
    const weeks = buildMonth(2024, 2, { firstDay: 1, selected: null, today });
    expect(weeks.every((week) => week.days.length === 7)).toBe(true);
  });

  it("holds all 29 days of a leap February", () => {
    const weeks = buildMonth(2024, 1, { firstDay: 1, selected: null, today });
    const inMonth = weeks.flatMap((week) => week.days).filter((day) => !day.outside);
    expect(inMonth).toHaveLength(29);
    expect(inMonth[28].day).toBe(29);
  });

  it("marks the selected day and only that day", () => {
    const weeks = buildMonth(2024, 2, {
      firstDay: 1,
      selected: { year: 2024, month: 2, day: 22 },
      today,
    });
    const selected = weeks.flatMap((week) => week.days).filter((day) => day.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ month: 2, day: 22 });
  });

  it("marks nothing as selected in a month the date does not fall in", () => {
    const weeks = buildMonth(2024, 3, {
      firstDay: 1,
      selected: { year: 2024, month: 2, day: 22 },
      today,
    });
    expect(weeks.flatMap((week) => week.days).some((day) => day.selected)).toBe(false);
  });

  it("numbers the weeks", () => {
    const weeks = buildMonth(2024, 2, { firstDay: 1, selected: null, today });
    expect(weeks[0].weekNumber).toBe(9);
    expect(weeks[3].weekNumber).toBe(12);
  });
});

describe("clampDay", () => {
  it("keeps a day that exists", () => {
    expect(clampDay(2024, 2, 31)).toBe(31);
  });

  it("pulls the 31st back to the end of a short month", () => {
    expect(clampDay(2024, 1, 31)).toBe(29);
    expect(clampDay(2023, 1, 31)).toBe(28);
    expect(clampDay(2024, 3, 31)).toBe(30);
  });
});

describe("shiftMonths", () => {
  it("pages forward and back", () => {
    expect(shiftMonths({ year: 2024, month: 2, day: 22 }, 1)).toEqual({
      year: 2024,
      month: 3,
      day: 22,
    });
    expect(shiftMonths({ year: 2024, month: 0, day: 15 }, -1)).toEqual({
      year: 2023,
      month: 11,
      day: 15,
    });
  });

  it("clamps the day when the new month is shorter", () => {
    expect(shiftMonths({ year: 2024, month: 0, day: 31 }, 1)).toEqual({
      year: 2024,
      month: 1,
      day: 29,
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/picker/month.test.ts`
Expected: FAIL — cannot find module `src/picker/month`.

- [ ] **Step 3: Implement**

`src/picker/month.ts` builds the grid with `moment.utc`, which keeps the calendar independent of the
reader's timezone the same way detection is. Week numbers come from `moment.utc(...).week()` when
`firstDay` matches the locale, and from `.isoWeek()` when the week starts on Monday — take
`.week()`, which follows the active locale's rule, and note it in a comment.

- [ ] **Step 4: Run the suite**

Run: `npx jest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/picker/month.ts tests/picker/month.test.ts
git commit -F - <<'MSG'
feat: build the calendar's month grid

- Add the month grid behind the picker: whole weeks, week numbers, and the
  day a shorter month clamps to

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 3: Rendering a replacement

**Files:**
- Modify: `src/detect/formats.ts` (extract `renderPattern` from `renderExample`)
- Create: `src/picker/write.ts`
- Test: `tests/picker/write.test.ts` (create)

**Interfaces:**
- Consumes: `DayKey` (Task 2), `BUILT_IN_FORMATS`, `compileFormat`, `renderPattern`.
- Produces:

```ts
export function replacementFor(pattern: string, day: DayKey): string
export function stillThere(doc: string, from: number, to: number, expected: string): boolean
```

`replacementFor` renders through Kalendae's own token vocabulary, not `moment().format()`, for the
reason `renderExample`'s comment already gives: moment's vocabulary is larger than ours, and
formatting through it would write tokens the validator rejects.

- [ ] **Step 1: Write the failing test**

```ts
import { moment } from "obsidian";
import { BUILT_IN_FORMATS } from "../../src/detect/formats";
import { scanText } from "../../src/detect/scan";
import { replacementFor, stillThere } from "../../src/picker/write";

describe("replacementFor", () => {
  it("writes an ISO date back as an ISO date", () => {
    expect(replacementFor("YYYY-MM-DD", { year: 2026, month: 8, day: 9 })).toBe("2026-09-09");
  });

  it("keeps a note's own style, whatever it is", () => {
    expect(replacementFor("DD.MM.YYYY", { year: 2026, month: 8, day: 9 })).toBe("09.09.2026");
    expect(replacementFor("MMMM D, YYYY", { year: 2026, month: 8, day: 9 })).toBe(
      "September 9, 2026",
    );
    expect(replacementFor("dddd, MMMM D, YYYY", { year: 2026, month: 8, day: 9 })).toBe(
      "Wednesday, September 9, 2026",
    );
  });

  it("round-trips every built-in format through detection", () => {
    for (const entry of BUILT_IN_FORMATS) {
      const written = replacementFor(entry.pattern, { year: 2026, month: 8, day: 9 });
      const [candidate] = scanText(written, [entry]);
      expect(candidate?.accepted).toBe(true);
      expect(candidate.text).toBe(written);
      expect(moment.utc(written, entry.pattern, true).format("YYYY-MM-DD")).toBe("2026-09-09");
    }
  });
});

describe("stillThere", () => {
  const doc = "Due 2026-09-06 today";

  it("confirms the text at the range is what was detected", () => {
    expect(stillThere(doc, 4, 14, "2026-09-06")).toBe(true);
  });

  it("refuses when the text moved or changed", () => {
    expect(stillThere(doc, 5, 15, "2026-09-06")).toBe(false);
    expect(stillThere(doc, 4, 14, "2026-09-07")).toBe(false);
    expect(stillThere(doc, 40, 50, "2026-09-06")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/picker/write.test.ts`
Expected: FAIL — cannot find module `src/picker/write`.

- [ ] **Step 3: Implement**

In `src/detect/formats.ts`, split the rendering out and leave `renderExample` calling it:

```ts
export function renderPattern(pattern: string, on: { year: number; month: number; day: number }): string {
  const when = moment.utc(on);
  return split(pattern, tokenCache())
    .map((piece) => (piece.isToken ? when.format(piece.text) : piece.text))
    .join("");
}
```

`src/picker/write.ts` is then two small functions over it.

- [ ] **Step 4: Run the suite**

Run: `npx jest`
Expected: PASS, `renderExample`'s existing tests included.

- [ ] **Step 5: Commit**

```bash
git add src/detect/formats.ts src/picker/write.ts tests/picker/write.test.ts
git commit -F - <<'MSG'
feat: render a picked day in the note's own date format

- Add write-back rendering that reuses the format a date was found in
- Add the guard that abandons a write when the note moved underneath it

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 4: Settings

**Files:**
- Modify: `src/settings.ts`, `src/settings/settings-tab.ts`
- Modify: `src/i18n/locales/*.json` (14 files)
- Test: `tests/settings.test.ts`

**Interfaces:**
- Produces: `KalendaeSettings` gains `iconPlacement: IconPlacement`, `showHoverFrame: boolean`,
  `showWeekNumbers: boolean`, `weekStart: WeekStart`, `showWritesPreview: boolean`, with
  `export type IconPlacement = "above" | "left" | "right" | "below"`,
  `export const ICON_PLACEMENTS: IconPlacement[]`,
  `export type WeekStart = "locale" | 0 | 1 | 2 | 3 | 4 | 5 | 6`.
  Defaults: `right`, `true`, `false`, `"locale"`, `true`.

- [ ] **Step 1: Write the failing test**

```ts
it("defaults the icon placement to one the dropdown offers", () => {
  expect(ICON_PLACEMENTS).toContain(DEFAULT_SETTINGS.iconPlacement);
});

it("starts with the frame on, week numbers off and the writes line on", () => {
  expect(DEFAULT_SETTINGS.showHoverFrame).toBe(true);
  expect(DEFAULT_SETTINGS.showWeekNumbers).toBe(false);
  expect(DEFAULT_SETTINGS.showWritesPreview).toBe(true);
});

it("follows the vault's language for the first day of the week", () => {
  expect(DEFAULT_SETTINGS.weekStart).toBe("locale");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/settings.test.ts`
Expected: FAIL — `ICON_PLACEMENTS` is not exported.

- [ ] **Step 3: Implement**

Add the types, the defaults, and five rows to `getSettingDefinitions()` — declarative `control`
entries, names only, no `desc`, so the inherited `getControlValue`/`setControlValue` persist them.
Names go in `en.json` under `settings.picker.*` with `_comment` siblings, and into the other 13
files.

- [ ] **Step 4: Verify**

Run: `npm run validate-translations && npx jest`
Expected: all locales ✅, tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts src/settings/settings-tab.ts src/i18n/locales tests/settings.test.ts
git commit -F - <<'MSG'
feat: add picker settings

- Add settings for where the hover icon sits, whether it draws a frame,
  whether the calendar shows week numbers and which day starts the week,
  and whether the picker previews what it will write
- Translate the new settings into all 13 locales

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 5: Decorations and hover state

**Files:**
- Create: `src/editor/decorations.ts`, `src/editor/hover-state.ts`
- Modify: `src/editor/DatePickerExtension.ts`, `styles.css`
- Delete: `src/editor/hover-spike.ts` and its CSS block
- Modify: `src/main.ts` (drop the spike registration)

**Interfaces:**
- Consumes: `detectIn` (Task 1).
- Produces: `dateDecorations(getSettings: () => KalendaeSettings): Extension` — marks every accepted
  date in the visible ranges with `class="kalendae-date"` and `data-kalendae="<from>"`, and adds a
  zero-width widget after it carrying the same attribute; `setHot`/`hotDate` — a `StateEffect` and
  `StateField<number | null>` naming the date under the pointer.

- [ ] **Step 1: Move the spike's proven CSS across**

The spike settled the geometry: `em` offsets, the icon's box starting where the date's ends, the
frame as a pseudo-element overshooting by `--kalendae-icon-space: 1.45em`. Carry those rules over
verbatim, changing only the colour to `--background-modifier-border-hover` and adding the four
placement classes.

- [ ] **Step 2: Build the decorations from the StateField, not the DOM**

The hot date lives in `hover-state.ts` as a `StateField<number | null>` mapped through changes; the
`mouseover` handler dispatches `setHot`. `decorations.ts` reads it and adds `kalendae-hot` to that
date's mark and widget, so a redraw cannot strand the class the way the spike's DOM toggling could.

- [ ] **Step 3: Verify by hand in the vault**

Reload, then check: nothing shifts on hover; the icon appears while the pointer is on the date; the
frame and icon appear and disappear together; all five formatting contexts the spike broke in
(emphasis, strong, strikethrough, heading, `[…]`) behave; typing inside a date does not strand the
highlight.

- [ ] **Step 4: Confirm the bundle still externalises CodeMirror**

Run: `node esbuild.config.mjs production && grep -c "class EditorView" main.js`
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add -A src/editor src/main.ts styles.css
git commit -F - <<'MSG'
feat: show a date picker affordance on hover

- Mark every recognised date in view and reveal an icon beside it on hover,
  without moving any text in the note
- Add the frame around a hovered date and its icon, following the placement
  and frame settings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 6: The calendar panel

**Files:**
- Create: `src/picker/panel.ts`
- Modify: `styles.css`, `src/i18n/locales/*.json` (14 files)

**Interfaces:**
- Consumes: `buildMonth`, `clampDay`, `shiftMonths` (Task 2), `replacementFor` (Task 3), settings
  (Task 4).
- Produces:

```ts
export interface PanelOptions {
  value: DayKey;            // the date the note holds
  pattern: string;          // the format it was written in
  settings: KalendaeSettings;
  onPick: (day: DayKey) => void;
  onClose: () => void;
}
export function createPanel(options: PanelOptions): { dom: HTMLElement; focus: () => void }
```

- [ ] **Step 1: Build the DOM**

Header `‹‹ ‹ March 2024 › ››` with the month and year from `moment.localeData()`; the weekday row
from `moment.weekdaysMin()` rotated to the week's first day; the `Wk` column when
`showWeekNumbers`; the day grid with the four cell states as classes (`kalendae-day-selected`,
`-focused`, `-today`, `-outside`); a footer with **Today** and, when `showWritesPreview`, the line
from `replacementFor(pattern, focused)`.

- [ ] **Step 2: Wire the keyboard**

Arrows move the focused day, PageUp/PageDown a month, Shift with them a year, Enter calls `onPick`
with the focused day, Escape calls `onClose`. Navigation never calls `onPick`.

- [ ] **Step 3: Strings**

`settings.picker.*` is done; the panel needs `picker.today`, `picker.writes`, `picker.prevMonth`,
`picker.nextMonth`, `picker.prevYear`, `picker.nextYear`, `picker.weekColumn`. Add to `en.json` with
`_comment` siblings and translate into the other 13 files. Month and weekday names come from moment
and are never translated by us.

- [ ] **Step 4: Verify**

Run: `npm run validate-translations && npx tsc -noEmit -skipLibCheck && npx eslint src/`

- [ ] **Step 5: Commit**

```bash
git add src/picker/panel.ts styles.css src/i18n/locales
git commit -F - <<'MSG'
feat: add the calendar panel

- Add the calendar itself: a month at a time, stepping by month or year,
  with today, the note's own date and the keyboard's position each marked
- Add the optional week-number column and the preview of what will be written
- Translate the panel into all 13 locales

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 7: Opening it, and writing back

**Files:**
- Create: `src/editor/picker-tooltip.ts`
- Modify: `src/editor/DatePickerExtension.ts`, `src/main.ts`, `tests/fixtures/manual-test-note.md`
- Modify: `src/i18n/locales/*.json` if the command's notices change

**Interfaces:**
- Consumes: everything above.
- Produces: `openPicker: StateEffect<{ from: number; to: number; text: string; pattern: string }>`,
  `closePicker: StateEffect<null>`, and `pickerTooltip(getSettings): Extension`.

- [ ] **Step 1: The tooltip field**

A `StateField` holding the open picker's range, pattern and text, mapped through changes and cleared
by `closePicker` or by any `docChanged` transaction. The field provides a `showTooltip` value whose
`create` mounts `createPanel`.

- [ ] **Step 2: Three ways to open it**

The icon's `mousedown` (already proven in the spike), a `dblclick` handler that maps coordinates to
a position and finds the decorated range under it, and the `pick-date` command in `main.ts`, which
replaces its `notImplemented` notice with a lookup of the detection containing the caret. All three
dispatch `openPicker`. Honour `settings.trigger`: `hover-icon` hides the icon's role from
double-click and vice versa.

- [ ] **Step 3: The write**

`onPick` renders `replacementFor(pattern, day)`, checks `stillThere(...)` against the current
document, and dispatches one transaction with the replacement plus `closePicker`. If the guard
fails, close without writing.

- [ ] **Step 4: Verify by hand**

Add a picker section to `tests/fixtures/manual-test-note.md`: a date in prose, in a heading, in
bold, inside `[…]`, two on one line, one ending the note, and one in each built-in format. Then
check in the vault: each of the three triggers opens the panel; picking writes the right text in the
right format; one Ctrl+Z restores the old date; Escape writes nothing; typing while the panel is
open closes it; the command works with the caret mid-date.

- [ ] **Step 5: Full check and commit**

Run: `npm run release-check`

```bash
git add -A
git commit -F - <<'MSG'
feat: open the calendar from a note and write the picked date back

- Open the calendar by clicking the hover icon, double-clicking a date, or
  running the Pick date command with the caret on one
- Write the picked day back in the format the date was already written in,
  as a single undo step
- Honour the trigger setting

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

## Self-review

**Spec coverage.** Triggers → Task 7. Decoration and hover → Task 5. Frame and icon geometry →
Task 5. Panel, states, keyboard, locale → Task 6. Write-back and its guards → Tasks 3 and 7.
Settings → Task 4. Range-limited detection → Task 1. Testing split → Tasks 1-3 (Jest) and Tasks
5-7 (by hand, with the fixture note). Spike deletion → Task 5.

**Not covered, deliberately:** times, shortcuts beyond Today, the Tasks emoji, the mobile pass and
reading mode, each of which the spec lists as out of scope with a TODO item owning it.

**Type consistency.** `DayKey` is defined in Task 2 and used by Tasks 3, 6 and 7. `replacementFor`
and `stillThere` are named in Task 3 and called in Task 7. `detectIn` returns `Detection[]`, which
is Task 5's input. `IconPlacement` and `WeekStart` are defined in Task 4 and consumed in Tasks 5
and 6.
