# Allowed Days Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pickDate` takes an optional `allowed` list, and the calendar makes every other day impossible to pick.

**Architecture:** The pure parts (reading `allowed`, testing a day, where a key lands, where the calendar opens) go in `src/picker/month.ts` with unit tests. `panel.ts` takes the resulting `AllowedDays` object and applies it to cells, keys, chevrons, Today and the quick dates. `popup.ts` and `api.ts` pass it through. The editor's calendar never passes it, so nothing changes there.

**Tech Stack:** TypeScript, moment (from `obsidian`), Jest, Obsidian's `setIcon` (Lucide).

**Spec:** `docs/superpowers/specs/2026-11-14-allowed-days-design.md`

## Global Constraints

- `allowed` entries are always `YYYY-MM-DD`, read strictly (`moment.utc(text, "YYYY-MM-DD", true)`), whatever `pattern` is. Both ends inclusive.
- Missing, empty, or nothing readable in it → no limit.
- A day outside looks like style D: `--text-faint`, faded (start at `opacity: 0.35`), `text-decoration: line-through` (shorthand only, no sub-properties).
- No `!important`, no inline styles, Obsidian CSS variables only, every panel rule scoped under `.kalendae-panel`.
- No new user-visible strings, so no locale files change.
- Never use the `disabled` attribute on a blocked control: Chromium sends no mouse events to a disabled button, and the preview line needs `mouseenter`. Use the class `kalendae-day-blocked` plus `aria-disabled="true"` and guard the handler.
- No commits during the work. One commit at the end, message shown to Vitaly first and committed only on an explicit yes.

## Review Focus

1. **Entries that can't be read only partly.** `[{from:"2026-11-16", to:"2026-11-22"}, "nonsense"]` must limit to the week, not lift the limit. Pinned in Task 1.
2. **A range written backwards** (`from` after `to`) is skipped, not treated as empty or swapped. Pinned in Task 1.
3. **Opening when `value` is empty or unreadable** goes to today and then to the nearest allowed day. Today is outside the range in GTD Tasks' common case. Pinned in Task 1 (`openingDay` with today's key) and checked in Task 3.
4. **A day that's both from another month and blocked** shows the blocked look, not the softer other-month fade. `.kalendae-day-blocked` comes after `.kalendae-day-outside` in `styles.css` at equal specificity. Checked by eye in Task 2.
5. **Mouse leaving a blocked day** puts the preview line back to the ring's day, without the lock. Checked by eye in Task 2 and asserted in Task 3.

---

### Task 1: Allowed-days arithmetic

**Files:**
- Modify: `src/picker/month.ts` (new exports after `shiftMonths`)
- Test: `tests/picker/month.test.ts` (new `describe` blocks at the end)

**Interfaces:**
- Produces:
  ```ts
  export type AllowedEntry = { from: string; to: string } | string;
  export interface AllowedDays {
    test(day: DayKey): boolean;
    first: DayKey;  // earliest allowed day
    last: DayKey;   // latest allowed day
  }
  export function allowedDays(entries: readonly AllowedEntry[] | undefined): AllowedDays | null;
  export function stepTo(from: DayKey, target: DayKey, allowed: AllowedDays): DayKey;
  export function openingDay(value: DayKey, allowed: AllowedDays): DayKey;
  ```

- [ ] **Step 1: Write the failing tests**

Test fixtures (months 0-based, so November is 10):

```ts
const d = (month: number, day: number) => ({ year: 2026, month, day });
const week = allowedDays([{ from: "2026-11-16", to: "2026-11-22" }])!;
const weekAndDec1 = allowedDays([{ from: "2026-11-16", to: "2026-11-22" }, "2026-12-01"])!;
```

`describe("allowedDays")`:
- `allowedDays(undefined)`, `allowedDays([])` and `allowedDays(["nonsense", { from: "x", to: "y" }])` are each `null`.
- `week.test` is true for `d(10,16)` and `d(10,22)`, false for `d(10,15)` and `d(10,23)`.
- `allowedDays([{ from: "2026-11-16", to: "2026-11-22" }, "nonsense"])!.test(d(10,15))` is false (Review Focus 1).
- `allowedDays([{ from: "2026-11-22", to: "2026-11-16" }])` is `null` (Review Focus 2).
- `allowedDays(["2026-11-31"])` is `null` (strict read).
- `weekAndDec1.test(d(11,1))` true, `weekAndDec1.test(d(11,2))` false; `weekAndDec1.first` equals `d(10,16)`, `.last` equals `d(11,1)`.

`describe("stepTo")`:
- target allowed: `stepTo(d(10,16), d(10,17), week)` → `d(10,17)`.
- nearest short of the target: `stepTo(d(10,16), d(10,23), week)` → `d(10,22)`.
- nothing that way: `stepTo(d(10,22), d(10,23), week)` → `d(10,22)`; `stepTo(d(10,16), d(10,15), week)` → `d(10,16)`.
- jumps a gap: `stepTo(d(10,22), d(10,23), weekAndDec1)` → `d(11,1)`.
- backwards across a gap: `stepTo(d(11,1), d(10,24), weekAndDec1)` → `d(10,22)`.
- page down: `stepTo(d(10,16), d(11,16), weekAndDec1)` → `d(11,1)`.
- `stepTo(d(10,18), d(10,18), week)` → `d(10,18)`.

`describe("openingDay")`:
- allowed value stays: `openingDay(d(10,18), week)` → `d(10,18)`.
- before the range: `openingDay(d(10,14), week)` → `d(10,16)`.
- nearer side wins: `openingDay(d(10,26), weekAndDec1)` → `d(10,22)`.
- tie goes later: `openingDay(d(10,15), allowedDays(["2026-11-10", "2026-11-20"])!)` → `d(10,20)`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx jest tests/picker/month.test.ts`
Expected: FAIL, `allowedDays` is not exported.

- [ ] **Step 3: Implement the three functions in `src/picker/month.ts`**

Work in whole-day numbers (`moment.utc(key).valueOf() / 86_400_000`), keeping the ranges as `[start, end]` pairs of those numbers. `test` is "inside any pair". `first` and `last` are the smallest start and the largest end.

`stepTo` follows the spec's four rules:

```
if target == from: return from
if test(target): return target
dir = sign(target - from)
walk n from target - dir back towards from (from itself excluded): first allowed → return it
walk n from target + dir onwards while n stays within [first, last]: first allowed → return it
return from
```

`openingDay`: if `test(value)`, return it. Otherwise walk outwards one day at a time, checking `value + k` before `value - k` so a tie goes later. Stop at the first allowed day, and never walk past `first`/`last`.

Each new export gets a doc comment in the file's voice.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx jest tests/picker/month.test.ts`
Expected: PASS, all suites.

---

### Task 2: The calendar honours allowed days

**Files:**
- Modify: `src/picker/panel.ts`
- Modify: `styles.css` (after the `.kalendae-day-focused` rule, about line 898)

**Interfaces:**
- Consumes: `AllowedDays`, `stepTo`, `openingDay` from Task 1.
- Produces: `PanelOptions.allowed?: AllowedDays`. When absent, everything behaves exactly as today.

- [ ] **Step 1: Add `allowed?: AllowedDays` to `PanelOptions`**

Doc comment: days outside can be seen but not picked. Absent means every day can be picked.

- [ ] **Step 2: Opening position**

`let focused = options.allowed ? openingDay(options.value, options.allowed) : options.value;`. `selected` in `buildMonth` stays `options.value`.

- [ ] **Step 3: Preview line with a lock**

Change `preview(day)` to `preview(day: DayKey, locked = false)`. It empties `writes`. When `locked`, it puts a `span.kalendae-lock` holding `setIcon(span, "lock")` in front of the date text. Every existing call keeps `locked` false.

- [ ] **Step 4: Blocked day cells**

In `render()`, for each live cell with `options.allowed && !options.allowed.test(day)`: add class `kalendae-day-blocked`, set `aria-disabled="true"`, bind no click, and bind `mouseenter` → `preview(day, true)`. A pickable cell stays as it is.

- [ ] **Step 5: Keys go through `stepTo`**

In the keydown handler, after `movedBy` returns, replace `moved.day` with `stepTo(focused, moved.day, options.allowed)` when `allowed` is set. For a day arrow, set `meant` to the resulting day's `day`. For a page key, keep `meant` as `movedBy` returned it. Enter does nothing when `allowed` is set and `!allowed.test(focused)` (a guard only, since the ring should always be on a pickable day).

- [ ] **Step 6: Chevrons**

`step(months)` becomes: `target = shiftMonths(focused, months, meant)`, then `focused = allowed ? stepTo(focused, target, allowed) : target`. Keep each `navButton` result with its month count. At the end of `render()`, for each one: if `allowed` is set and `stepTo(focused, shiftMonths(focused, n, meant), allowed)` equals `focused`, add `kalendae-day-blocked` and `aria-disabled="true"`, otherwise remove both. The click handler returns early while the class is on.

- [ ] **Step 7: Today and quick dates**

When `allowed` is set and the button's day fails `test`: add `kalendae-day-blocked` and `aria-disabled="true"`. Click does nothing, and `mouseenter` calls `preview(day, true)`. Otherwise they work as today.

- [ ] **Step 8: CSS**

All under `.kalendae-panel`, placed after `.kalendae-day-focused` so they beat `.kalendae-day-outside` at equal specificity:
- `.kalendae-panel-day.kalendae-day-blocked`: `color: var(--text-faint)`, `opacity: 0.35`, `text-decoration: line-through`, `cursor: default`. Its `:hover` has `background-color: transparent`.
- `.kalendae-day-selected.kalendae-day-blocked`: keeps the accent fill and `var(--text-on-accent)`, `opacity: 0.6`, line-through. The fill stays on the task's date (spec, "Opening").
- `.kalendae-panel-step.kalendae-day-blocked`: `opacity: 0.3`, `cursor: default`. Its `:hover` keeps `background-color: transparent` and `color: var(--text-muted)`.
- `.kalendae-panel-today.kalendae-day-blocked`, `.kalendae-panel-quick-date.kalendae-day-blocked`: `color: var(--text-faint)`, `cursor: default`. `:hover` keeps the faint colour.
- `.kalendae-panel-writes .kalendae-lock`: `display: inline-flex`, `vertical-align: -0.1em`, `margin-inline-end: var(--size-2-1)`. Its `svg` is `width: 1em; height: 1em`.

- [ ] **Step 9: Build and unit tests**

Run: `npm run build` and then `npm test`
Expected: both succeed, with no eslint warnings.

---

### Task 3: Expose `allowed` through the API, and test it in Obsidian

**Files:**
- Modify: `src/picker/popup.ts` (`PopupOptions`, the `createPanel` call)
- Modify: `src/api.ts` (`PickDateOptions`, `createApi`)
- Modify: `docs/kalendae-api.d.ts` (`KalendaePickDateOptions`)
- Create: `e2e/specs/pick-date-allowed.e2e.ts`

**Interfaces:**
- Consumes: `AllowedEntry`, `allowedDays` (Task 1), `PanelOptions.allowed` (Task 2).
- Produces: `PickDateOptions.allowed?: AllowedEntry[]`, and the same field on `KalendaePickDateOptions`, written out inline (the `.d.ts` must not import).

- [ ] **Step 1: Pass it through**

`PopupOptions.allowed?: readonly AllowedEntry[]`. `openPopup` passes `allowed: allowedDays(options.allowed) ?? undefined` to `createPanel`. `createApi` forwards `options.allowed`.

- [ ] **Step 2: Doc comment on both declarations**

Use the same text in `api.ts` and `docs/kalendae-api.d.ts`: the days that can be picked, as `YYYY-MM-DD` ranges (both ends inclusive) or single days, whatever `pattern` is; other days show but can't be picked; left out or empty means any day; an older Kalendae ignores it, so check the day you get back.

- [ ] **Step 3: Write the end-to-end spec**

Follow `e2e/specs/tables.e2e.ts`: no imports, ending with `export {};`. Each case starts with `browser.executeObsidian` calling `app.plugins.getPlugin("kalendae").api.pickDate({ value: "2026-11-14", anchor: document.body, allowed: [{ from: "2026-11-16", to: "2026-11-22" }] })` and storing the promise's result on `window` when it settles. Cases:
- the panel `.kalendae-panel-popup` exists; the cell `15` has `kalendae-day-blocked`, the cell `16` doesn't; the focused cell (`.kalendae-day-focused`) reads `16`;
- `press("ArrowDown")` puts the ring on `22`; `press("Enter")` resolves `"2026-11-22"`;
- `press("ArrowLeft")` from `16` leaves the ring on `16`;
- a `mouseenter` dispatched on the cell `25` puts `.kalendae-lock` in `.kalendae-panel-writes`, and `mouseleave` on the grid removes it (Review Focus 5);
- a click on the cell `25` leaves the panel open; Escape resolves `null`.

Find a day cell by its text among `.kalendae-panel-day:not(.kalendae-day-outside)`.

- [ ] **Step 4: Run everything**

Run: `npm run build`, `npm test`, `npm run test:e2e`
Expected: all pass. The e2e run ends `e2e: N/N pass`.

- [ ] **Step 5: Look at it in a vault**

Open it from GTD Tasks' drop menu (Custom… on a "Next week" bucket). Check the style-D look in light and dark, and tune the 0.35 opacity there if needed.

- [ ] **Step 6: Wrap up**

Flip TODO item 29 to `Resolved`, with a one-line note and its TOC row. Show Vitaly a commit message covering the spec, the plan and the code, and commit only on an explicit yes.
