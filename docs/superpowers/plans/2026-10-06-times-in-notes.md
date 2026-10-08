# Times in notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A time written in a note opens the clock and is rewritten in place, in its own format and am/pm spelling; a second command inserts a new time.

**Architecture:** Times get a parallel, smaller format module (`src/detect/time-formats.ts`) rather than being threaded through the date compiler; `scanText` takes a second list and tags every candidate with a `kind`. The editor layer keeps one target type carrying that kind, and `picker-tooltip.ts` mounts the calendar or the clock from it. The settings list code takes a kind so two lists share one implementation.

**Tech Stack:** TypeScript, Obsidian API, CodeMirror 6, moment (via `"obsidian"`), Jest with ts-jest.

**Spec:** `docs/superpowers/specs/2026-10-06-times-in-notes-design.md` (and `2026-10-03-clock-dial-design.md` for the clock itself)

## Global Constraints

- **Branch `clock-dial`.** No commits: Vitaly approves every commit message first.
- **A format is a date or a time, never both.** Nothing in this plan treats `2026-10-04 14:30` as one unit.
- **CSS:** no `!important`, no inline styles, no `column-gap`, no `text-decoration-*` sub-properties, Obsidian CSS variables only.
- **i18n:** every user-visible string through `t()`; only `en.json` until Vitaly calls the English final; each key has a `<key>_comment` sibling; run `stop-slop` over new strings.
- **moment:** `moment.utc(...)` in pure code, imported from `"obsidian"`. Never `moment.locale(x)` to switch language — `.locale(x)` on the instance.
- **Verification during work:** `npm run build` and `npm test`; not `npm run release-check` until the translation pass.
- **Do not touch** `@codemirror/*` versions or the `external` list.
- **Editing never restyles the note:** a time is written back through the pattern that matched and the am/pm spelling that was found.

## Review Focus

1. **A time directly after a date with only a space between** (`2026-10-04 14:30`) — both are found, each with its own icon, and neither outline swallows the other. Task 3 test; Task 8 manual case.
2. **A sentence-ending dot after `pm`** (`at 2:05 pm.`) — the dot is not part of the time and is not rewritten as `p.m.`. Task 2 test (`finds`), Task 3 test.
3. **A prose `a` after a time** (`at 2:05 a friend called`, `by 5:30 a lot`) — not a time. Task 2 and Task 3 tests.
4. **A vault that updates with no `timeFormats` stored** — seeded once from the region; an emptied list stays empty on the next load. Task 4 tests.
5. **`HH:mm` and `h:mm a` both enabled** — `12:05 am` is one 12-hour time, not a 24-hour `12:05` with a stray `am`, whichever format is higher. Task 3 test.
6. **The step keys and the hover hint on a time** — Ctrl/Option + ↑/↓ with the caret in `14:30` must fall through to the editor, not throw or rewrite; hovering a time shows no distance hint. Task 6 code; Task 8 manual cases.

---

### Task 1: The am/pm spelling

**Files:**
- Create: `src/detect/meridiem.ts`
- Test: `tests/detect/meridiem.test.ts`

**Interfaces:**
- Produces:
  - `interface MeridiemStyle { upper: boolean; dots: boolean; short: boolean }`
  - `meridiemStyleOf(text: string): MeridiemStyle | null`
  - `styleMeridiem(half: "am" | "pm", style: MeridiemStyle): string`

- [ ] **Step 1: Write the failing test**

Create `tests/detect/meridiem.test.ts`:

```ts
import { meridiemStyleOf, styleMeridiem } from "../../src/detect/meridiem";

/**
 * How a note spells am/pm, read off a time and put back on another. The
 * promise is the plugin's own: editing a time never restyles it.
 */

describe("meridiemStyleOf", () => {
  it("reads the plain pair in either case", () => {
    expect(meridiemStyleOf("2:05 pm")).toEqual({ upper: false, dots: false, short: false });
    expect(meridiemStyleOf("2:05 PM")).toEqual({ upper: true, dots: false, short: false });
    expect(meridiemStyleOf("2:05am")).toEqual({ upper: false, dots: false, short: false });
  });

  it("reads the dotted form", () => {
    expect(meridiemStyleOf("2:05 p.m.")).toEqual({ upper: false, dots: true, short: false });
    expect(meridiemStyleOf("2:05 A.M.")).toEqual({ upper: true, dots: true, short: false });
  });

  it("reads the single letter", () => {
    expect(meridiemStyleOf("2:05p")).toEqual({ upper: false, dots: false, short: true });
    expect(meridiemStyleOf("2:05A")).toEqual({ upper: true, dots: false, short: true });
  });

  it("reads one in front of the time", () => {
    expect(meridiemStyleOf("PM 2:05")).toEqual({ upper: true, dots: false, short: false });
  });

  it("is nothing for a time without the English pair", () => {
    expect(meridiemStyleOf("14:05")).toBeNull();
    expect(meridiemStyleOf("9:00 вечора")).toBeNull();
    expect(meridiemStyleOf("午後 2:00")).toBeNull();
    expect(meridiemStyleOf("2:00 ös")).toBeNull();
  });
});

describe("styleMeridiem", () => {
  it("writes either half in the style it is given", () => {
    expect(styleMeridiem("pm", { upper: false, dots: false, short: false })).toBe("pm");
    expect(styleMeridiem("am", { upper: true, dots: false, short: false })).toBe("AM");
    expect(styleMeridiem("am", { upper: true, dots: true, short: false })).toBe("A.M.");
    expect(styleMeridiem("pm", { upper: false, dots: true, short: false })).toBe("p.m.");
    expect(styleMeridiem("pm", { upper: false, dots: false, short: true })).toBe("p");
    expect(styleMeridiem("am", { upper: true, dots: false, short: true })).toBe("A");
  });

  it("round-trips every spelling", () => {
    for (const text of ["pm", "PM", "p.m.", "P.M.", "p", "P"]) {
      const style = meridiemStyleOf(`2:05${text}`);
      expect(style).not.toBeNull();
      expect(styleMeridiem("pm", style!)).toBe(text);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/detect/meridiem.test.ts`
Expected: FAIL — `Cannot find module '../../src/detect/meridiem'`.

- [ ] **Step 3: Write the implementation**

Create `src/detect/meridiem.ts`:

```ts
/**
 * How a note spells am/pm.
 *
 * moment reads `pm`, `PM`, `p.m.` and a bare `p` alike and writes only the
 * first. A time edited through it would come back restyled, which is the one
 * thing an edit must never do — so the spelling is read off the time that was
 * found and put back on the one that replaces it.
 *
 * The English-style pair only. A language with words of its own — `вечора`,
 * `午後`, `ös` — has one spelling for each, and moment writes it.
 */

export interface MeridiemStyle {
  /** `PM` rather than `pm`. */
  upper: boolean;
  /** `p.m.` rather than `pm`. */
  dots: boolean;
  /** `p` rather than `pm`. */
  short: boolean;
}

// An a or a p that is not part of a longer Latin word, with its m if it has
// one: dotted both times or not at all. A time holds nothing else in Latin
// letters, so the first one found is the one.
const SPELLING = /(?<![A-Za-z])([AaPp])(?:\.([Mm])\.|([Mm]))?(?![A-Za-z])/;

/** The spelling a time's am/pm is in, or null where it has no English-style one. */
export function meridiemStyleOf(text: string): MeridiemStyle | null {
  const match = SPELLING.exec(text);
  if (match === null) return null;

  const letters = match[1] + (match[2] ?? match[3] ?? "");

  return {
    upper: letters === letters.toUpperCase(),
    dots: match[2] !== undefined,
    short: match[2] === undefined && match[3] === undefined,
  };
}

/** One half of the day, written in a style. */
export function styleMeridiem(half: "am" | "pm", style: MeridiemStyle): string {
  const word = style.short ? half[0] : style.dots ? `${half[0]}.m.` : half;

  return style.upper ? word.toUpperCase() : word;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest tests/detect/meridiem.test.ts`
Expected: PASS.

---

### Task 2: Time formats

**Files:**
- Create: `src/detect/time-formats.ts`
- Modify: `src/detect/formats.ts` (export the detection locales; the `mixed` problem; `FormatKind`)
- Modify: `src/settings/format-modal.ts` (one new `case` so the build stays exhaustive)
- Modify: `src/i18n/locales/en.json` (`settings.formats.modal.problem.mixed`)
- Test: `tests/detect/time-formats.test.ts`

**Interfaces:**
- Consumes: `MeridiemStyle`, `styleMeridiem` (Task 1); `DateFormatEntry` from `formats.ts`.
- Produces, from `src/detect/formats.ts`:
  - `type FormatKind = "date" | "time"`
  - `detectionLocales(): readonly string[]`
  - `FormatProblem` gains `{ code: "mixed" }`
- Produces, from `src/detect/time-formats.ts`:
  - `interface TimeOfDay { hour: number; minute: number; second: number }` (structurally the clock's `TimeValue`)
  - `const TIME_TOKEN_GROUPS` — `{ key: "hour" | "minute" | "second" | "meridiem"; tokens: readonly string[]; required: boolean }[]`
  - `type TimeTokenGroupKey`
  - `type TimeFormatProblem = { code: "mixed" } | { code: "missing-component"; component: "hour" | "minute" } | { code: "bracket-pair" } | { code: "unknown-tokens"; chars: string } | { code: "meridiem-missing" } | { code: "meridiem-stray" } | { code: "adjacent-numbers"; first: string; second: string }`
  - `checkTimeFormat(pattern: string): TimeFormatProblem | null`
  - `withSeconds(pattern: string): string | null`
  - `compileTimeFormat(pattern: string): RegExp` (global)
  - `readTimeIn(text: string, pattern: string): string | null` — the locale that reads it
  - `readTime(text: string, pattern: string, locale?: string): TimeOfDay | null`
  - `renderTime(pattern: string, time: TimeOfDay, locale?: string, style?: MeridiemStyle): string`
  - `renderTimeExample(pattern: string, on?: Date): string`
  - `timeTokenGroupsPresent(pattern: string): Set<TimeTokenGroupKey>`
  - `const BUILT_IN_TIME_FORMATS: readonly DateFormatEntry[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/detect/time-formats.test.ts`:

```ts
import { checkFormat, setDetectionLocales } from "../../src/detect/formats";
import {
  BUILT_IN_TIME_FORMATS,
  checkTimeFormat,
  compileTimeFormat,
  readTime,
  readTimeIn,
  renderTime,
  renderTimeExample,
  timeTokenGroupsPresent,
  withSeconds,
} from "../../src/detect/time-formats";

/**
 * What a time format is and what it reads. The regex is a pre-filter, as the
 * date one is: moment's strict parser has the last word, so the cases here are
 * about what the filter must let through and what it must not.
 */

const at = (hour: number, minute = 0, second = 0) => ({ hour, minute, second });
const finds = (pattern: string, text: string) =>
  Array.from(text.matchAll(compileTimeFormat(pattern)), (match) => match[0]);

afterEach(() => setDetectionLocales(["en"]));

describe("checkTimeFormat", () => {
  it("accepts the built-in formats and their kin", () => {
    for (const entry of BUILT_IN_TIME_FORMATS) expect(checkTimeFormat(entry.pattern)).toBeNull();
    expect(checkTimeFormat("HH:mm:ss")).toBeNull();
    expect(checkTimeFormat("HHmm")).toBeNull();
    expect(checkTimeFormat("A h:mm")).toBeNull();
  });

  it("refuses a date mixed in, before anything else", () => {
    expect(checkTimeFormat("YYYY-MM-DD HH:mm")).toEqual({ code: "mixed" });
    expect(checkTimeFormat("YYYY-MM-DD")).toEqual({ code: "mixed" });
  });

  it("needs an hour and a minute", () => {
    expect(checkTimeFormat("mm:ss")).toEqual({ code: "missing-component", component: "hour" });
    expect(checkTimeFormat("HH")).toEqual({ code: "missing-component", component: "minute" });
  });

  it("refuses brackets and letters it does not know", () => {
    expect(checkTimeFormat("HH:mm [x]")).toEqual({ code: "bracket-pair" });
    expect(checkTimeFormat("HH:mm Q")).toEqual({ code: "unknown-tokens", chars: "Q" });
  });

  it("pairs a 12-hour hour with am/pm, and only that", () => {
    expect(checkTimeFormat("h:mm")).toEqual({ code: "meridiem-missing" });
    expect(checkTimeFormat("HH:mm a")).toEqual({ code: "meridiem-stray" });
  });

  it("refuses numbers of unsettled width run together", () => {
    expect(checkTimeFormat("Hmm")).toEqual({ code: "adjacent-numbers", first: "H", second: "mm" });
  });
});

describe("checkFormat", () => {
  it("tells a date format with a time in it that it is both", () => {
    expect(checkFormat("YYYY-MM-DD HH:mm")).toEqual({ code: "mixed" });
    expect(checkFormat("HH:mm")).toEqual({ code: "mixed" });
  });
});

describe("withSeconds", () => {
  it("adds seconds after the minutes, on the separator before them", () => {
    expect(withSeconds("HH:mm")).toBe("HH:mm:ss");
    expect(withSeconds("h:mm a")).toBe("h:mm:ss a");
    expect(withSeconds("h:mma")).toBe("h:mm:ssa");
    expect(withSeconds("HH.mm")).toBe("HH.mm.ss");
    expect(withSeconds("A h:mm")).toBe("A h:mm:ss");
  });

  it("is nothing where the format has seconds, or no separator to borrow", () => {
    expect(withSeconds("HH:mm:ss")).toBeNull();
    expect(withSeconds("HHmm")).toBeNull();
  });
});

describe("compileTimeFormat", () => {
  it("finds a 24-hour time", () => {
    expect(finds("HH:mm", "at 14:05 today")).toEqual(["14:05"]);
    expect(finds("H:mm", "at 9:05 today")).toEqual(["9:05"]);
  });

  it("finds am/pm however it is spelled", () => {
    expect(finds("h:mm a", "2:05 pm, 2:05 PM, 2:05 p.m., 2:05 P.M.")).toEqual([
      "2:05 pm",
      "2:05 PM",
      "2:05 p.m.",
      "2:05 P.M.",
    ]);
  });

  it("leaves a sentence's own full stop out of the time", () => {
    expect(finds("h:mm a", "We left at 2:05 pm.")).toEqual(["2:05 pm"]);
  });

  it("takes a bare a or p only when it is attached", () => {
    expect(finds("h:mma", "2:05p 2:05a 2:05pm 2:05P")).toEqual(["2:05p", "2:05a", "2:05pm", "2:05P"]);
    expect(finds("h:mm a", "at 2:05 a friend called")).toEqual([]);
    expect(finds("h:mm a", "by 5:30 p")).toEqual([]);
  });

  it("finds another language's words once that language is in force", () => {
    expect(finds("h:mm a", "о 9:00 вечора")).toEqual([]);
    setDetectionLocales(["en", "uk"]);
    expect(finds("h:mm a", "о 9:00 вечора")).toEqual(["9:00 вечора"]);
  });
});

describe("readTimeIn and readTime", () => {
  it("has the final say on whether it is a time", () => {
    expect(readTimeIn("14:05", "HH:mm")).toBe("en");
    expect(readTimeIn("25:70", "HH:mm")).toBeNull();
    expect(readTimeIn("14:05 pm", "h:mm a")).toBeNull();
  });

  it("names the language that read it", () => {
    setDetectionLocales(["en", "uk"]);
    expect(readTimeIn("9:00 вечора", "h:mm a")).toBe("uk");
    expect(readTimeIn("9:00 pm", "h:mm a")).toBe("en");
  });

  it("reads the time of day", () => {
    expect(readTime("2:05 P.M.", "h:mm a", "en")).toEqual(at(14, 5));
    expect(readTime("12:00 am", "h:mm a", "en")).toEqual(at(0));
    expect(readTime("14:05:09", "HH:mm:ss")).toEqual(at(14, 5, 9));
    expect(readTime("nope", "HH:mm")).toBeNull();
  });
});

describe("renderTime", () => {
  it("writes a time through the pattern", () => {
    expect(renderTime("HH:mm:ss", at(9, 5, 7))).toBe("09:05:07");
    expect(renderTime("H:mm", at(9, 5))).toBe("9:05");
    expect(renderTime("h:mm a", at(14, 5), "en")).toBe("2:05 pm");
    expect(renderTime("h:mm A", at(0, 30), "en")).toBe("12:30 AM");
  });

  it("writes am/pm in the spelling it is handed", () => {
    expect(renderTime("h:mm a", at(14, 5), "en", { upper: true, dots: true, short: false })).toBe(
      "2:05 P.M.",
    );
    expect(renderTime("h:mma", at(4, 30), "en", { upper: false, dots: false, short: true })).toBe(
      "4:30a",
    );
  });

  it("writes another language's own word", () => {
    expect(renderTime("h:mm a", at(21), "uk")).toBe("9:00 вечора");
  });

  it("renders an example at a given moment", () => {
    expect(renderTimeExample("HH:mm", new Date(2026, 0, 1, 14, 5, 9))).toBe("14:05");
    expect(renderTimeExample("h:mm:ss a", new Date(2026, 0, 1, 14, 5, 9))).toBe("2:05:09 pm");
  });
});

describe("the built-in formats", () => {
  it("round-trip, with seconds and without", () => {
    for (const entry of BUILT_IN_TIME_FORMATS) {
      const seconds = withSeconds(entry.pattern);
      expect(seconds).not.toBeNull();

      for (const pattern of [entry.pattern, seconds!]) {
        const written = renderTime(pattern, at(14, 5, 9), "en");
        expect(finds(pattern, written)).toEqual([written]);
        expect(readTime(written, pattern, "en")).toMatchObject({ hour: 14, minute: 5 });
      }
    }
  });
});

describe("timeTokenGroupsPresent", () => {
  it("names the parts a pattern draws on", () => {
    expect(timeTokenGroupsPresent("h:mm a")).toEqual(new Set(["hour", "minute", "meridiem"]));
    expect(timeTokenGroupsPresent("HH:mm:ss")).toEqual(new Set(["hour", "minute", "second"]));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/detect/time-formats.test.ts`
Expected: FAIL — `Cannot find module '../../src/detect/time-formats'`.

- [ ] **Step 3: Export what the time module needs from `formats.ts`**

In `src/detect/formats.ts`:

Directly above `export interface CompiledFormat`, add:

```ts
/** A format is one or the other, never both: there is a list for each. */
export type FormatKind = "date" | "time";
```

Add to the `FormatProblem` union, as its first member:

```ts
  | { code: "mixed" }
```

Directly after the `setDetectionLocales` function, add:

```ts
/** The languages detection reads, for the time formats, which keep their own tokens. */
export function detectionLocales(): readonly string[] {
  return locales;
}
```

In `checkFormat`, directly after `const pieces = split(pattern, tokenCache());`, add:

```ts
  // A time part is named before a missing year. `HH:mm` typed into the date
  // editor is someone looking for the other list, and "a format needs a year"
  // sends them the wrong way. Only the runs that can be nothing but a time:
  // a lone `m`, `s` or `a` is as likely a stray letter.
  const timeParts = pieces
    .filter((piece) => !piece.isToken)
    .flatMap((piece) => piece.text.match(/[A-Za-z]+/g) ?? [])
    .some((run) => /^(HH?|hh?|mm|ss)$/.test(run));
  if (timeParts) return { code: "mixed" };
```

In `src/settings/format-modal.ts`, in `describe()`, add as the first `case`:

```ts
    case "mixed":
      return t("settings.formats.modal.problem.mixed");
```

In `src/i18n/locales/en.json`, inside `settings.formats.modal.problem`, add (run `stop-slop` first):

```json
          "mixed_comment": "Shown under the format field when a pattern holds both date parts and time parts. Date formats and time formats are two separate lists.",
          "mixed": "A format is a date or a time, not both.",
```

- [ ] **Step 4: Write the time module**

Create `src/detect/time-formats.ts`:

```ts
import { moment } from "obsidian";
import { DateFormatEntry, detectionLocales } from "./formats";
import { MeridiemStyle, styleMeridiem } from "./meridiem";

/**
 * Time formats: what one is, what it reads, and how a time is written in one.
 *
 * Beside the date formats rather than inside them. A format is a date or a
 * time and never both, the two lists are scanned separately, and a time's
 * vocabulary is ten tokens with no month names in it — sharing the date
 * compiler would have bought a locale cache this does not need and a token
 * table in which `m` and `M` sit one typo apart.
 *
 * The regex here is a pre-filter, as the date one is: `readTimeIn` asks
 * moment's strict parser, and that has the final say.
 */

/** A time of day; hours 0–23 whatever the pattern shows. */
export interface TimeOfDay {
  hour: number;
  minute: number;
  second: number;
}

/** Every token a time format may hold, by the part of a time it supplies. */
export const TIME_TOKEN_GROUPS = [
  { key: "hour", tokens: ["H", "HH", "h", "hh"], required: true },
  { key: "minute", tokens: ["m", "mm"], required: true },
  { key: "second", tokens: ["s", "ss"], required: false },
  { key: "meridiem", tokens: ["a", "A"], required: false },
] as const;

export type TimeTokenGroupKey = (typeof TIME_TOKEN_GROUPS)[number]["key"];

export type TimeFormatProblem =
  | { code: "mixed" }
  | { code: "missing-component"; component: "hour" | "minute" }
  | { code: "bracket-pair" }
  | { code: "unknown-tokens"; chars: string }
  /** A 12-hour hour with nothing to say which half of the day. */
  | { code: "meridiem-missing" }
  /** am/pm beside a 24-hour hour, where it can only contradict it. */
  | { code: "meridiem-stray" }
  | { code: "adjacent-numbers"; first: string; second: string };

/** The formats offered in the add menu. Each also reads its time with seconds. */
export const BUILT_IN_TIME_FORMATS: readonly DateFormatEntry[] = [
  { id: "time-24", pattern: "HH:mm" },
  { id: "time-24-short", pattern: "H:mm" },
  { id: "time-12", pattern: "h:mm a" },
  { id: "time-12-tight", pattern: "h:mma" },
  { id: "time-12-padded", pattern: "hh:mm a" },
];

// Longest first, so HH is never read as H followed by a stray H.
const TOKEN = /HH|H|hh|h|mm|m|ss|s|a|A/g;

const NUMBERS: Record<string, string> = {
  HH: "\\d{2}",
  H: "\\d{1,2}",
  hh: "\\d{2}",
  h: "\\d{1,2}",
  mm: "\\d{2}",
  m: "\\d{1,2}",
  ss: "\\d{2}",
  s: "\\d{1,2}",
};

/** The number tokens that always write two digits, and so can run together. */
const FIXED_WIDTH = new Set(["HH", "hh", "mm", "ss"]);

interface Piece {
  text: string;
  isToken: boolean;
}

function split(pattern: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;

  for (const match of pattern.matchAll(TOKEN)) {
    if (match.index > last) pieces.push({ text: pattern.slice(last, match.index), isToken: false });
    pieces.push({ text: match[0], isToken: true });
    last = match.index + match[0].length;
  }
  if (last < pattern.length) pieces.push({ text: pattern.slice(last), isToken: false });

  return pieces;
}

const isHour = (piece: Piece) => piece.isToken && /^[Hh]/.test(piece.text);
const isMinute = (piece: Piece) => piece.isToken && piece.text.startsWith("m");
const isSecond = (piece: Piece) => piece.isToken && piece.text.startsWith("s");
const isMeridiem = (piece: Piece) => piece.isToken && /^[aA]$/.test(piece.text);

/** `null` when the pattern is usable, otherwise the first problem found. */
export function checkTimeFormat(pattern: string): TimeFormatProblem | null {
  const pieces = split(pattern);
  const strays = pieces
    .filter((piece) => !piece.isToken)
    .flatMap((piece) => piece.text.match(/[A-Za-z]+/g) ?? []);

  // A date part is named before a missing hour, for the reason the date check
  // names a time part first: `YYYY-MM-DD` typed here is someone looking for
  // the other list.
  if (strays.some((run) => /^(Y+|M+|D+|Do|d+)$/.test(run))) return { code: "mixed" };

  const hour = pieces.find(isHour);
  if (hour === undefined) return { code: "missing-component", component: "hour" };
  if (!pieces.some(isMinute)) return { code: "missing-component", component: "minute" };

  // Brackets are moment's escape, and `renderTime` wraps every literal in
  // them; a pattern that brings its own cannot be written back.
  if (/[[\]]/.test(pattern)) return { code: "bracket-pair" };
  if (strays.length > 0) return { code: "unknown-tokens", chars: strays.join(", ") };

  const twelveHour = hour.text.startsWith("h");
  const meridiem = pieces.some(isMeridiem);
  if (twelveHour && !meridiem) return { code: "meridiem-missing" };
  if (!twelveHour && meridiem) return { code: "meridiem-stray" };

  // `Hmm` runs to three or four digits with no way to tell where the hour
  // ends. `HHmm` always writes four, and reads back.
  for (let at = 1; at < pieces.length; at += 1) {
    const before = pieces[at - 1];
    const after = pieces[at];
    const numbers = before.text in NUMBERS && after.text in NUMBERS;
    if (before.isToken && after.isToken && numbers) {
      if (!FIXED_WIDTH.has(before.text) || !FIXED_WIDTH.has(after.text)) {
        return { code: "adjacent-numbers", first: before.text, second: after.text };
      }
    }
  }

  return null;
}

/**
 * The same format with seconds, or null where it has none to add.
 *
 * Every time format reads its time with seconds too — `HH:mm` reads `14:05:09`
 * — joined by whatever stands between its hour and its minute. The format names
 * the family and the note decides the exact shape. Nothing to add where the
 * format spells seconds out itself, or where hour and minute touch: `HHmmss`
 * would read any six-digit number.
 */
export function withSeconds(pattern: string): string | null {
  const pieces = split(pattern);
  if (pieces.some(isSecond)) return null;

  const at = pieces.findIndex(isMinute);
  const separator = pieces[at - 1];
  const hour = pieces[at - 2];
  if (at < 2 || separator.isToken || !isHour(hour)) return null;

  return [
    ...pieces.slice(0, at + 1).map((piece) => piece.text),
    `${separator.text}ss`,
    ...pieces.slice(at + 1).map((piece) => piece.text),
  ].join("");
}

/** A fresh global regex for the pattern; see `compileFormat` for why fresh. */
export function compileTimeFormat(pattern: string): RegExp {
  const pieces = split(pattern);
  const source = pieces
    .map((piece, index) => {
      if (!piece.isToken) return escapeLiteral(piece.text);
      if (piece.text in NUMBERS) return NUMBERS[piece.text];

      // A bare `a` or `p` is a time's only when it is attached to one. After a
      // space it is as likely the next word: "at 2:05 a friend called".
      const attached = index > 0 && pieces[index - 1].isToken;
      return meridiemSource(attached);
    })
    .join("");

  return new RegExp(source, "g");
}

/**
 * Everything am/pm can be written as: the English-style pair in each of its
 * spellings, and the words of every other language in force.
 *
 * Dotted both times or not at all, so a sentence's own full stop after `pm`
 * is never taken for half of `p.m.`.
 */
function meridiemSource(attached: boolean): string {
  const forms = [
    ...foreignMeridiems().map(escapeLiteral),
    "[AaPp]\\.[Mm]\\.",
    "[AaPp][Mm]",
    ...(attached ? ["[AaPp]"] : []),
  ];

  return `(?:${forms.join("|")})`;
}

/** The am/pm words of the languages in force that are not the English pair. */
function foreignMeridiems(): string[] {
  const words = new Set<string>();

  for (const code of detectionLocales()) {
    const data = moment.localeData(code);
    for (let hour = 0; hour < 24; hour += 1) {
      // Half hours too: Chinese turns to its word for noon at 11:30.
      for (const minute of [0, 30]) {
        for (const lower of [true, false]) {
          const word = data.meridiem(hour, minute, lower);
          if (!/^[ap]m$/i.test(word)) words.add(word);
        }
      }
    }
  }

  return [...words].sort((a, b) => b.length - a.length);
}

/**
 * The language that reads this text as a time in this pattern, or null where
 * none does. The app's own language first, as `readIn` does for dates.
 */
export function readTimeIn(text: string, pattern: string): string | null {
  const codes = detectionLocales();
  const preferred = moment.locale();
  const order = codes.includes(preferred)
    ? [preferred, ...codes.filter((code) => code !== preferred)]
    : codes;

  for (const code of order) {
    if (moment.utc(text, pattern, code, true).isValid()) return code;
  }

  return null;
}

/** The time of day a text holds, or null where it does not read. */
export function readTime(text: string, pattern: string, locale?: string): TimeOfDay | null {
  const at =
    locale === undefined ? moment.utc(text, pattern, true) : moment.utc(text, pattern, locale, true);

  return at.isValid() ? { hour: at.hour(), minute: at.minute(), second: at.second() } : null;
}

/**
 * One time, written in one pattern.
 *
 * Handed to moment whole with each literal in moment's own `[...]` escape, as
 * `renderPattern` does and for its reason: what Kalendae does not compile
 * stands in the output untouched. Given a style, am/pm is written in it rather
 * than as moment would — the style is the note's own spelling, and the token's
 * case is only what a new time is written in.
 */
export function renderTime(
  pattern: string,
  time: TimeOfDay,
  locale?: string,
  style?: MeridiemStyle,
): string {
  const at = moment.utc({ year: 2000, month: 0, date: 1, ...time });
  const when = locale === undefined ? at : at.locale(locale);
  const pieces = split(pattern);

  // A draft in the format editor may hold a `[`, which moment cannot escape;
  // it is rendered a piece at a time, as `renderPattern` renders its drafts.
  if (pieces.length === 0 || pattern.includes("[")) {
    return pieces.map((piece) => (piece.isToken ? when.format(piece.text) : piece.text)).join("");
  }

  return when.format(
    pieces
      .map((piece) => {
        if (!piece.isToken) return `[${piece.text}]`;
        if (style !== undefined && isMeridiem(piece)) {
          return `[${styleMeridiem(time.hour < 12 ? "am" : "pm", style)}]`;
        }
        return piece.text;
      })
      .join(""),
  );
}

/** The current time in this pattern, for a row in settings. */
export function renderTimeExample(pattern: string, on: Date = new Date()): string {
  return renderTime(pattern, {
    hour: on.getHours(),
    minute: on.getMinutes(),
    second: on.getSeconds(),
  });
}

/** Which of TIME_TOKEN_GROUPS a pattern draws on, for the checklist in settings. */
export function timeTokenGroupsPresent(pattern: string): Set<TimeTokenGroupKey> {
  const used = new Set(
    split(pattern)
      .filter((piece) => piece.isToken)
      .map((piece) => piece.text),
  );

  return new Set(
    TIME_TOKEN_GROUPS.filter((group) => group.tokens.some((token) => used.has(token))).map(
      (group) => group.key,
    ),
  );
}

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/detect/time-formats.test.ts tests/detect/meridiem.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole suite and the build**

Run: `npm test` then `npm run build`
Expected: both succeed. If an existing date-format test expected `unknown-tokens` or `missing-component` for a pattern holding `HH`, `hh`, `mm` or `ss`, the expectation is now `{ code: "mixed" }` — update that expectation and record it.

---

### Task 3: Finding times in text

**Files:**
- Modify: `src/detect/scan.ts`
- Test: `tests/detect/scan-time.test.ts`

**Interfaces:**
- Consumes: `checkTimeFormat`, `compileTimeFormat`, `readTimeIn`, `withSeconds` (Task 2); `meridiemStyleOf`, `MeridiemStyle` (Task 1); `FormatKind` (Task 2).
- Produces:
  - `Candidate` gains `kind: FormatKind` and `meridiem?: MeridiemStyle`.
  - `scanText(text: string, entries: DateFormatEntry[], timeEntries?: DateFormatEntry[]): Candidate[]` — the third parameter defaults to `[]`, so every existing caller is unchanged.

`detect.ts` is not touched here: times reach the editor in Task 6, once everything that reads a detection knows about `kind`.

- [ ] **Step 1: Write the failing tests**

Create `tests/detect/scan-time.test.ts`:

```ts
import { scanText } from "../../src/detect/scan";

/**
 * Times beside dates. Dates are scanned first and win a tie; a time is never
 * cut out of a longer one; and the am/pm spelling rides along on the candidate
 * so the write-back can keep it.
 */

const DATES = [{ id: "iso", pattern: "YYYY-MM-DD" }];
const T24 = [{ id: "time-24", pattern: "HH:mm" }];
const T12 = [
  { id: "time-12", pattern: "h:mm a" },
  { id: "time-12-tight", pattern: "h:mma" },
];

const accepted = (text: string, dates = DATES, times = T24) =>
  scanText(text, dates, times)
    .filter((candidate) => candidate.accepted)
    .map((candidate) => [candidate.kind, candidate.text, candidate.pattern]);

describe("scanText with time formats", () => {
  it("still marks a date as a date, with or without a time list", () => {
    expect(scanText("2026-10-04", DATES)[0].kind).toBe("date");
    expect(scanText("2026-10-04", DATES, T24)[0].kind).toBe("date");
  });

  it("finds a date and a time side by side as two things", () => {
    expect(accepted("Meet 2026-10-04 14:30.")).toEqual([
      ["date", "2026-10-04", "YYYY-MM-DD"],
      ["time", "14:30", "HH:mm"],
    ]);
  });

  it("reads seconds through a format that does not name them", () => {
    expect(accepted("at 14:05:09 sharp")).toEqual([["time", "14:05:09", "HH:mm:ss"]]);
  });

  it("never cuts a time out of a longer one", () => {
    expect(accepted("took 1:14:05 in all")).toEqual([]);
    expect(accepted("ratio 14:05:9")).toEqual([]);
  });

  it("refuses what is not a time", () => {
    expect(accepted("at 25:70")).toEqual([]);
    expect(accepted("v14:05")).toEqual([]);
  });

  it("lets a sentence end on a time", () => {
    expect(accepted("We left at 14:05.")).toEqual([["time", "14:05", "HH:mm"]]);
    expect(accepted("We left at 2:05 pm.", DATES, T12)).toEqual([["time", "2:05 pm", "h:mm a"]]);
  });

  it("gives a contested string to the date", () => {
    const dates = [{ id: "dmy", pattern: "DD.MM.YY" }];
    const times = [{ id: "dotted", pattern: "HH.mm" }];
    expect(accepted("12.10.25", dates, times)).toEqual([["date", "12.10.25", "DD.MM.YY"]]);
  });

  it("gives a contested time to the format listed first", () => {
    const times = [
      { id: "short", pattern: "H:mm" },
      { id: "padded", pattern: "HH:mm" },
    ];
    const found = scanText("09:30", [], times).filter((candidate) => candidate.accepted);
    expect(found.map((candidate) => candidate.formatId)).toEqual(["short"]);
  });

  it("reads a time at its fullest, whatever the order of the list", () => {
    const times = [
      { id: "time-24", pattern: "HH:mm" },
      { id: "time-12", pattern: "h:mm a" },
    ];
    expect(accepted("at 12:05 am and 10:30 PM", DATES, times)).toEqual([
      ["time", "12:05 am", "h:mm a"],
      ["time", "10:30 PM", "h:mm a"],
    ]);
    expect(accepted("at 12:05 sharp", DATES, times)).toEqual([["time", "12:05", "HH:mm"]]);
  });

  it("carries the am/pm spelling it found", () => {
    const [short] = scanText("2:05p", [], T12).filter((candidate) => candidate.accepted);
    expect(short).toMatchObject({
      text: "2:05p",
      pattern: "h:mma",
      meridiem: { upper: false, dots: false, short: true },
    });

    const [dotted] = scanText("2:05 P.M. sharp", [], T12).filter((candidate) => candidate.accepted);
    expect(dotted).toMatchObject({
      text: "2:05 P.M.",
      meridiem: { upper: true, dots: true, short: false },
    });
  });

  it("carries no spelling for a 24-hour time", () => {
    const [found] = scanText("14:05", [], T24).filter((candidate) => candidate.accepted);
    expect(found.meridiem).toBeUndefined();
  });

  it("does not take a word after a time for am", () => {
    expect(accepted("at 2:05 a friend called", DATES, T12)).toEqual([]);
  });

  it("gives a time no Tasks marker", () => {
    const [found] = scanText("📅 14:05", [], T24).filter((candidate) => candidate.accepted);
    expect(found.markerFrom).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/detect/scan-time.test.ts`
Expected: FAIL — type errors on `kind` and on the third argument to `scanText`.

- [ ] **Step 3: Implement**

In `src/detect/scan.ts`:

Replace the import line for `./formats` and add two imports:

```ts
import { DateFormatEntry, FormatKind, checkFormat, compileFormat, readIn } from "./formats";
import { markerBefore } from "./markers";
import { MeridiemStyle, meridiemStyleOf } from "./meridiem";
import { checkTimeFormat, compileTimeFormat, readTimeIn, withSeconds } from "./time-formats";
```

In `interface Candidate`, directly after `pattern: string;`, add:

```ts
  /** Which list the format came from, and so which panel edits it. */
  kind: FormatKind;
```

and directly after the `locale?: string;` field, add:

```ts
  /** How a time spelled its am/pm, where it has the English-style pair. */
  meridiem?: MeridiemStyle;
```

Replace the `scanText` function with:

```ts
export function scanText(
  text: string,
  entries: DateFormatEntry[],
  timeEntries: DateFormatEntry[] = [],
): Candidate[] {
  const candidates: Candidate[] = [];

  // List order is priority order: when two formats can read the same string,
  // the one the user put first wins. Reordering the list is how they say which.
  for (const entry of entries) {
    // Stored settings can predate a change to the token vocabulary, so an
    // unusable pattern is skipped rather than allowed to throw mid-scan.
    if (checkFormat(entry.pattern)) continue;

    for (const match of text.matchAll(compileFormat(entry.pattern).matcher)) {
      const from = match.index;
      const to = from + match[0].length;
      candidates.push({
        from,
        to,
        text: match[0],
        formatId: entry.id,
        pattern: entry.pattern,
        kind: "date",
        markerFrom: markerBefore(text, from) ?? undefined,
        ...reasonFor(text, from, to, match[0], entry.pattern),
      });
    }
  }

  // Times after dates, so a date wins a string both could read: `12.10.25`
  // is a date wherever a date format says so.
  const times: Candidate[] = [];
  for (const entry of timeEntries) {
    if (checkTimeFormat(entry.pattern)) continue;

    // The pattern a candidate carries is the one that read it, so a time
    // found with seconds is written back with them.
    for (const pattern of [withSeconds(entry.pattern), entry.pattern]) {
      if (pattern === null) continue;

      for (const match of text.matchAll(compileTimeFormat(pattern))) {
        const from = match.index;
        const to = from + match[0].length;
        times.push({
          from,
          to,
          text: match[0],
          formatId: entry.id,
          pattern,
          kind: "time",
          ...reasonForTime(text, from, to, match[0], pattern),
        });
      }
    }
  }

  // The fullest reading of a time wins, and list order only settles readings
  // of the same length. Without this `HH:mm` above `h:mm a` takes the `12:05`
  // out of `12:05 am` and strands the rest. The sort is stable, so equal
  // lengths stay in the order the list gave them.
  times.sort((a, b) => b.to - b.from - (a.to - a.from));
  candidates.push(...times);

  return resolveOverlaps(candidates).sort((a, b) => a.from - b.from);
}
```

Directly after the `reasonFor` function, add:

```ts
function reasonForTime(
  text: string,
  from: number,
  to: number,
  matched: string,
  pattern: string,
): Pick<Candidate, "accepted" | "reason" | "locale" | "meridiem"> {
  if (!hasCleanBoundaries(text, from, to) || insideLongerTime(text, from, to)) {
    return { accepted: false, reason: "boundary" };
  }

  // "not-a-date" for a time as well: the reason is that the strict parser
  // refused it, and one name for that serves both lists.
  const locale = readTimeIn(matched, pattern);
  if (locale === null) return { accepted: false, reason: "not-a-date" };

  return { accepted: true, locale, meridiem: meridiemStyleOf(matched) ?? undefined };
}

/**
 * A colon with a digit beyond it, on either side: this is the middle of
 * `14:05:09` or the tail of `1:14:05`, not a time of its own. The dot rule
 * already says the same of `14.05.09`.
 */
function insideLongerTime(text: string, from: number, to: number): boolean {
  const before = text[from - 1] === ":" && /\d/.test(text[from - 2] ?? "");
  const after = text[to] === ":" && /\d/.test(text[to + 1] ?? "");

  return before || after;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/detect/scan-time.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite and the build**

Run: `npm test` then `npm run build`
Expected: both succeed. Existing tests that compare a whole `Candidate` with `toEqual` now see `kind: "date"` — add it to those expectations and record each one. The build may fail in `picker-tooltip.ts` / `decorations.ts` only if they spread a `Candidate` into a narrower type; they build a `DateTarget` field by field, so no change is expected there until Task 6.

---

### Task 4: Settings and shadow warnings

**Files:**
- Modify: `src/settings.ts`
- Modify: `src/detect/shadow.ts`
- Modify: `src/main.ts` (`loadSettings` only)
- Test: `tests/settings.test.ts`, `tests/detect/shadow.test.ts`

**Interfaces:**
- Consumes: `BUILT_IN_TIME_FORMATS`, `checkTimeFormat`, `renderTimeExample` (Task 2); `scanText` with its third parameter (Task 3); `FormatKind`.
- Produces:
  - `KalendaeSettings.timeFormats: DateFormatEntry[]`; `DEFAULT_SETTINGS.timeFormats` is `[{ id: "time-24", pattern: "HH:mm" }]`.
  - `defaultTimeFormats(shortTime: string): DateFormatEntry[]`
  - `normaliseStoredTimeFormats(stored: unknown, fallback: DateFormatEntry[]): DateFormatEntry[]`
  - `shadowedFormats(formats: DateFormatEntry[], kind?: FormatKind): Map<string, Shadow>` — `kind` defaults to `"date"`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/settings.test.ts` (and add `defaultTimeFormats`, `normaliseStoredTimeFormats` to its import from `../src/settings`):

```ts
describe("time formats in settings", () => {
  const fallback = [{ id: "time-12", pattern: "h:mm a" }];

  it("starts on 24 hours where nothing says otherwise", () => {
    expect(DEFAULT_SETTINGS.timeFormats).toEqual([{ id: "time-24", pattern: "HH:mm" }]);
  });

  it("seeds 12 hours where the region writes time that way", () => {
    expect(defaultTimeFormats("h:mm A")).toEqual([{ id: "time-12", pattern: "h:mm a" }]);
    expect(defaultTimeFormats("A h:mm")).toEqual([{ id: "time-12", pattern: "h:mm a" }]);
  });

  it("seeds 24 hours everywhere else", () => {
    expect(defaultTimeFormats("HH:mm")).toEqual([{ id: "time-24", pattern: "HH:mm" }]);
    expect(defaultTimeFormats("H:mm")).toEqual([{ id: "time-24", pattern: "HH:mm" }]);
  });

  it("seeds a vault that has never stored a time list", () => {
    expect(normaliseStoredTimeFormats(undefined, fallback)).toEqual(fallback);
    expect(normaliseStoredTimeFormats("nonsense", fallback)).toEqual(fallback);
  });

  it("keeps an emptied list empty: that is how times are switched off", () => {
    expect(normaliseStoredTimeFormats([], fallback)).toEqual([]);
  });

  it("keeps what is stored, minus what is not a format or repeats an id", () => {
    const stored = [
      { id: "time-24-short", pattern: "H:mm" },
      { id: "time-24-short", pattern: "HH:mm" },
      "junk",
      { pattern: "no id" },
    ];
    expect(normaliseStoredTimeFormats(stored, fallback)).toEqual([
      { id: "time-24-short", pattern: "H:mm" },
    ]);
  });
});
```

Append to `tests/detect/shadow.test.ts` (it already imports `shadowedFormats`):

```ts
describe("shadowedFormats for times", () => {
  it("reports a time format an earlier one always beats", () => {
    const shadows = shadowedFormats(
      [
        { id: "short", pattern: "H:mm" },
        { id: "padded", pattern: "HH:mm" },
      ],
      "time",
    );

    expect(shadows.get("padded")?.by).toBe("H:mm");
    expect(shadows.has("short")).toBe(false);
  });

  it("is quiet where the formats read different times", () => {
    const shadows = shadowedFormats(
      [
        { id: "time-24", pattern: "HH:mm" },
        { id: "time-12", pattern: "h:mm a" },
      ],
      "time",
    );

    expect(shadows.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/settings.test.ts tests/detect/shadow.test.ts`
Expected: FAIL — `defaultTimeFormats` and `normaliseStoredTimeFormats` are not exported; `shadowedFormats` takes one argument.

- [ ] **Step 3: Implement the settings**

In `src/settings.ts`:

In `interface KalendaeSettings`, directly after `formats: DateFormatEntry[];`, add:

```ts
  /**
   * The time formats, in priority order, as `formats` is for dates. May be
   * empty, which switches times off; the first one is what a new time is
   * written in.
   */
  timeFormats: DateFormatEntry[];
```

In `DEFAULT_SETTINGS`, directly after the `formats:` line, add:

```ts
  timeFormats: [{ id: "time-24", pattern: "HH:mm" }],
```

Directly after the `normaliseStoredFormats` function, add:

```ts
/**
 * The one time format a vault starts with, from how its region writes time.
 *
 * Handed moment's own short time for the app's language rather than reading it
 * here, so this stays pure. A 12-hour region gets the format that needs am/pm
 * to match — it leaves `3:16` and `01:30` alone — and everywhere else gets the
 * padded 24-hour time that daily notes, Tasks and Dataview all write.
 */
export function defaultTimeFormats(shortTime: string): DateFormatEntry[] {
  const twelveHour = shortTime.replace(/\[[^\]]*\]/g, "").includes("h");

  return twelveHour
    ? [{ id: "time-12", pattern: "h:mm a" }]
    : [{ id: "time-24", pattern: "HH:mm" }];
}

/**
 * The stored time list, or the seed for a vault that has never had one.
 *
 * Unlike the date list an empty one is kept: emptying it is how times are
 * switched off, and seeding it again on the next load would switch them back
 * on behind the reader's back. Only a list that was never stored is seeded.
 */
export function normaliseStoredTimeFormats(
  stored: unknown,
  fallback: DateFormatEntry[],
): DateFormatEntry[] {
  if (!Array.isArray(stored)) return [...fallback];

  const seen = new Set<string>();

  return stored
    .filter(isStoredFormat)
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .map(({ id, pattern }) => ({ id, pattern }));
}
```

In `src/main.ts`, add `defaultTimeFormats` and `normaliseStoredTimeFormats` to the import from `./settings`, and in `loadSettings`, directly after the `formats: normaliseStoredFormats(stored?.formats),` line, add:

```ts
      // Seeded once from the region, like weekStart, and an ordinary setting
      // afterwards — an emptied list included.
      timeFormats: normaliseStoredTimeFormats(
        stored?.timeFormats,
        defaultTimeFormats(moment.localeData().longDateFormat("LT")),
      ),
```

- [ ] **Step 4: Implement the shadow warnings for either list**

In `src/detect/shadow.ts`:

Replace the two import lines with:

```ts
import { DateFormatEntry, FormatKind, checkFormat, renderExample } from "./formats";
import { Candidate, scanText } from "./scan";
import { checkTimeFormat, renderTimeExample } from "./time-formats";
```

Directly after `SHADOW_DATES`, add:

```ts
/**
 * The same idea for times: an hour of one digit and of two, both halves of the
 * day, and the two twelves, which are where 12- and 24-hour formats disagree.
 */
export const SHADOW_TIMES: readonly Date[] = [
  new Date(2026, 0, 1, 0, 5),
  new Date(2026, 0, 1, 9, 30),
  new Date(2026, 0, 1, 12, 0),
  new Date(2026, 0, 1, 14, 5),
  new Date(2026, 0, 1, 23, 59),
];

/** What telling one list's formats apart needs to know about that list. */
interface Family {
  unusable: (pattern: string) => boolean;
  render: (pattern: string, on: Date) => string;
  scan: (text: string, formats: DateFormatEntry[]) => Candidate[];
  samples: readonly Date[];
}

const FAMILIES: Record<FormatKind, Family> = {
  date: {
    unusable: (pattern) => checkFormat(pattern) !== null,
    render: renderExample,
    scan: (text, formats) => scanText(text, formats),
    samples: SHADOW_DATES,
  },
  time: {
    unusable: (pattern) => checkTimeFormat(pattern) !== null,
    render: renderTimeExample,
    scan: (text, formats) => scanText(text, [], formats),
    samples: SHADOW_TIMES,
  },
};
```

Change `shadowedFormats`, `shadowOf` and `beatenBy` to carry the family:

```ts
/** Keyed by `DateFormatEntry.id`; a format with no entry is doing its job. */
export function shadowedFormats(
  formats: DateFormatEntry[],
  kind: FormatKind = "date",
): Map<string, Shadow> {
  const family = FAMILIES[kind];
  const shadows = new Map<string, Shadow>();

  for (const entry of formats) {
    const shadow = shadowOf(entry, formats, family);
    if (shadow) shadows.set(entry.id, shadow);
  }

  return shadows;
}
```

- `shadowOf(entry, formats, family)`: add the `family: Family` parameter and pass it to both `beatenBy` calls.
- `beatenBy(entry, formats, family)`: add the parameter; replace `if (checkFormat(entry.pattern)) return null;` with `if (family.unusable(entry.pattern)) return null;`, `SHADOW_DATES` with `family.samples`, `renderExample(entry.pattern, on)` with `family.render(entry.pattern, on)`, and `scanText(text, formats)` with `family.scan(text, formats)`.

Keep every existing comment in the file; they describe both lists equally.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/settings.test.ts tests/detect/shadow.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole suite and the build**

Run: `npm test` then `npm run build`
Expected: both succeed.

---

### Task 5: The clock and the write-back learn the note's spelling

**Files:**
- Modify: `src/picker/clock-math.ts`
- Modify: `src/picker/clock.ts`
- Modify: `src/picker/write.ts`
- Test: `tests/picker/clock-math.test.ts`, `tests/picker/write.test.ts`

**Interfaces:**
- Consumes: `MeridiemStyle`, `styleMeridiem` (Task 1); `renderTime`, `TimeOfDay` (Task 2); `cleanBoundaryBefore`, `cleanBoundaryAfter` from `scan.ts`.
- Produces:
  - `meridiemWords(time, token, locale?, style?: MeridiemStyle)` and `meridiemVocabulary(token, locale?, style?: MeridiemStyle)` — with a style, the styled English pair.
  - `ClockOptions` gains `meridiem?: MeridiemStyle` and `insert?: boolean`.
  - `timeReplacementFor(pattern: string, time: TimeOfDay, locale?: string, style?: MeridiemStyle): string`
  - `timeInsertionFor(doc: string, from: number, to: number, pattern: string, time: TimeOfDay, locale?: string, style?: MeridiemStyle): string`

- [ ] **Step 1: Write the failing tests**

Append to `tests/picker/clock-math.test.ts`:

```ts
describe("the toggle in the note's own spelling", () => {
  const dotted = { upper: true, dots: true, short: false };
  const short = { upper: false, dots: false, short: true };

  it("reads as the note spells am/pm", () => {
    expect(meridiemWords(at(2), "a", "en", dotted)).toEqual({ am: "A.M.", pm: "P.M." });
    expect(meridiemWords(at(14), "A", "en", short)).toEqual({ am: "a", pm: "p" });
  });

  it("sizes itself to those two words", () => {
    expect(meridiemVocabulary("a", "en", dotted)).toEqual(["A.M.", "P.M."]);
  });
});
```

Append to `tests/picker/write.test.ts` (add `timeInsertionFor`, `timeReplacementFor` to its import from `../../src/picker/write`):

```ts
describe("writing a time", () => {
  const half = { hour: 16, minute: 30, second: 0 };

  it("keeps the note's format", () => {
    expect(timeReplacementFor("HH:mm", half)).toBe("16:30");
    expect(timeReplacementFor("h:mm a", half, "en")).toBe("4:30 pm");
    expect(timeReplacementFor("HH:mm:ss", { ...half, second: 9 })).toBe("16:30:09");
  });

  it("keeps the note's am/pm spelling", () => {
    expect(timeReplacementFor("h:mma", half, "en", { upper: false, dots: false, short: true })).toBe(
      "4:30p",
    );
    expect(timeReplacementFor("h:mm a", half, "en", { upper: true, dots: true, short: false })).toBe(
      "4:30 P.M.",
    );
  });

  it("pads a side that would glue a new time to a word", () => {
    expect(timeInsertionFor("call at", 7, 7, "HH:mm", half)).toBe(" 16:30");
    expect(timeInsertionFor("at  ok", 3, 3, "HH:mm", half)).toBe("16:30");
    expect(timeInsertionFor("atok", 2, 2, "HH:mm", half)).toBe(" 16:30 ");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/picker/clock-math.test.ts tests/picker/write.test.ts`
Expected: FAIL — `meridiemWords` takes three arguments; `timeReplacementFor` is not exported.

- [ ] **Step 3: Implement in `clock-math.ts`**

Add the import at the top of `src/picker/clock-math.ts`:

```ts
import { MeridiemStyle, styleMeridiem } from "../detect/meridiem";
```

Replace `meridiemWords` and `meridiemVocabulary` with:

```ts
/**
 * The words on the toggle's two halves: what will be written at this hour on
 * each side of noon. Not a fixed pair — Ukrainian and Russian have four words
 * and Chinese six, chosen by the hour. Where the note spelled the English pair
 * its own way, that spelling: the toggle goes on saying what will be written.
 */
export function meridiemWords(
  time: TimeValue,
  token: "a" | "A",
  locale?: string,
  style?: MeridiemStyle,
): { am: string; pm: string } {
  if (style !== undefined) return { am: styleMeridiem("am", style), pm: styleMeridiem("pm", style) };

  return {
    am: formatTime(token, withMeridiem(time, false), locale),
    pm: formatTime(token, withMeridiem(time, true), locale),
  };
}

/**
 * Every word the toggle can show across the day, in the order they come. The
 * toggle sizes itself to the longest so it does not jump as the hour changes.
 */
export function meridiemVocabulary(
  token: "a" | "A",
  locale?: string,
  style?: MeridiemStyle,
): string[] {
  if (style !== undefined) return [styleMeridiem("am", style), styleMeridiem("pm", style)];

  const words = Array.from({ length: 24 }, (_, hour) =>
    formatTime(token, { hour, minute: 0, second: 0 }, locale),
  );

  return [...new Set(words)];
}
```

- [ ] **Step 4: Implement in `clock.ts`**

In `src/picker/clock.ts`:

Add the import:

```ts
import { MeridiemStyle } from "../detect/meridiem";
```

In `interface ClockOptions`, directly after the `locale?: string;` field, add:

```ts
  /** How the note spelled am/pm, which is how the toggle reads and what is written. */
  meridiem?: MeridiemStyle;
  /**
   * A new time rather than a change to one. There is no original to keep, so
   * ✓ writes even when nothing was touched.
   */
  insert?: boolean;
```

Replace the line

```ts
  const vocabulary = shape.twelveHour ? meridiemVocabulary(token, options.locale) : [];
```

with

```ts
  const vocabulary = shape.twelveHour
    ? meridiemVocabulary(token, options.locale, options.meridiem)
    : [];
```

Replace the `confirm` function with:

```ts
  function confirm(): void {
    const result = committed(options.value, time, shape, snap);

    if (result !== null) options.onPick(result);
    else if (options.insert) options.onPick(time);
    else options.onClose();
  }
```

In `render()`, replace

```ts
      const words = meridiemWords(shown, token, options.locale);
```

with

```ts
      const words = meridiemWords(shown, token, options.locale, options.meridiem);
```

- [ ] **Step 5: Implement in `write.ts`**

In `src/picker/write.ts`, add the imports:

```ts
import { MeridiemStyle } from "../detect/meridiem";
import { TimeOfDay, renderTime } from "../detect/time-formats";
```

and append:

```ts
/**
 * A time, in the format and the am/pm spelling the note already uses: the same
 * promise `replacementFor` makes for a date, with one more thing to keep.
 */
export function timeReplacementFor(
  pattern: string,
  time: TimeOfDay,
  locale?: string,
  style?: MeridiemStyle,
): string {
  return renderTime(pattern, time, locale, style);
}

/** A new time, padded on any side that would otherwise glue it to a word. */
export function timeInsertionFor(
  doc: string,
  from: number,
  to: number,
  pattern: string,
  time: TimeOfDay,
  locale?: string,
  style?: MeridiemStyle,
): string {
  const before = cleanBoundaryBefore(doc, from) ? "" : " ";
  const after = cleanBoundaryAfter(doc, to) ? "" : " ";

  return before + timeReplacementFor(pattern, time, locale, style) + after;
}
```

- [ ] **Step 6: Run the tests, the suite and the build**

Run: `npx jest tests/picker/clock-math.test.ts tests/picker/write.test.ts`, then `npm test`, then `npm run build`
Expected: all succeed.

---

### Task 6: Times in the editor

**Files:**
- Modify: `src/detect/detect.ts`
- Modify: `src/editor/decorations.ts`
- Modify: `src/editor/picker-tooltip.ts`
- Modify: `src/editor/hover-hint.ts`
- Modify: `src/editor/nudge-keys.ts`
- Modify: `src/editor/DatePickerExtension.ts`
- Delete: `src/editor/clock-tooltip.ts`
- Modify: `src/main.ts`
- Modify: `src/i18n/locales/en.json` (`commands.pickTime`, `notices.noTimeFormat`; remove `commands.tryTimePicker`)

**Interfaces:**
- Consumes: everything above.
- Produces: `DateTarget` gains `kind: FormatKind` and `meridiem?: MeridiemStyle`; commands `pick-date` and `pick-time`.

No unit tests: this is CodeMirror and Obsidian. Checked by build, lint and the manual checklist in Task 8.

- [ ] **Step 1: Strings**

In `src/i18n/locales/en.json` (run `stop-slop` first):

In `commands`, remove `tryTimePicker_comment` and `tryTimePicker`, and add after `pickDate`:

```json
    "pickTime_comment": "Command palette entry, shown after the plugin name, so keep it short. Opens the clock on the time at the cursor, or writes a new time in at the cursor when there is none. Also the screen-reader label of the clock icon beside a time.",
    "pickTime": "Pick a time"
```

In `notices`, add after `noEditor`:

```json
    "noTimeFormat_comment": "Notice shown when the Pick a time command runs on an empty spot and the Time formats list in settings is empty, so there is no format to write a new time in.",
    "noTimeFormat": "Add a time format in settings first."
```

Remove `commands.tryTimePicker` from every other locale file too — a key en.json no longer has fails `validate-translations`. This is the one edit to the other locales this task makes.

- [ ] **Step 2: Detection passes the time list through**

In `src/detect/detect.ts`, in `detectDates`, change

```ts
  const candidates = scanText(text, settings.formats);
```

to

```ts
  const candidates = scanText(text, settings.formats, settings.timeFormats);
```

and in `detectIn`, change `scanText(state.doc.sliceString(start, end), settings.formats)` to `scanText(state.doc.sliceString(start, end), settings.formats, settings.timeFormats)`.

- [ ] **Step 3: The target carries its kind; the icon follows it**

In `src/editor/decorations.ts`:

Add the imports:

```ts
import { FormatKind } from "../detect/formats";
import { MeridiemStyle } from "../detect/meridiem";
```

In `interface DateTarget`, directly after `pattern: string;`, add:

```ts
  /** A date or a time, and so the calendar or the clock. The name is older than times. */
  kind: FormatKind;
  /** How a time spelled its am/pm, carried from detection. */
  meridiem?: MeridiemStyle;
```

In `IconWidget.eq`, add `other.target.kind === this.target.kind &&` as a line beside the other comparisons.

In `IconWidget.toDOM`, replace

```ts
    setIcon(icon, "calendar");
    icon.setAttribute("aria-label", t("commands.pickDate"));
```

with

```ts
    const time = this.target.kind === "time";
    setIcon(icon, time ? "clock" : "calendar");
    icon.setAttribute("aria-label", t(time ? "commands.pickTime" : "commands.pickDate"));
```

In `build`, replace

```ts
      const marker = settings.taskEmoji ? detection.markerFrom : undefined;
```

with

```ts
      // A Tasks emoji marks a date. Scanning records one only for a date, and
      // this says so again where the icon is decided.
      const marker =
        settings.taskEmoji && detection.kind === "date" ? detection.markerFrom : undefined;
```

and in the object literal passed to `new IconWidget(`, add after `pattern: detection.pattern,`:

```ts
              kind: detection.kind,
              meridiem: detection.meridiem,
```

- [ ] **Step 4: The tooltip mounts the clock for a time**

In `src/editor/picker-tooltip.ts`:

Add the imports:

```ts
import { readTime } from "../detect/time-formats";
import { createClock } from "../picker/clock";
import { TimeValue, timeOf } from "../picker/clock-math";
import { insertionFor, stillThere, timeInsertionFor } from "../picker/write";
```

(replacing the existing `insertionFor, stillThere` import line).

In `targetOf`, add `kind: detection.kind,` and `meridiem: detection.meridiem,` to the returned object.

In `tooltipFor`, replace the `const panel = createPanel({ … });` statement with:

```ts
      const panel =
        target.kind === "time"
          ? createClock({
              // An empty target is a new time, which opens on the current one.
              value: readTime(target.text, target.pattern, target.locale) ?? timeOf(new Date()),
              pattern: target.pattern,
              locale: target.locale,
              meridiem: target.meridiem,
              insert: target.text === "",
              settings,
              onPick: (time) => writeTime(view, target, time),
              onClose: () => close(view),
            })
          : createPanel({
              value: dayFor(target.text, target.pattern, target.locale),
              pattern: target.pattern,
              settings,
              onPick: (day) => write(view, target, day),
              onClose: () => close(view),
            });
```

Directly after the `write` function, add:

```ts
/** The same write for a time: one transaction, guarded, in the note's own spelling. */
function writeTime(view: EditorView, target: DateTarget, time: TimeValue): void {
  const doc = view.state.doc.toString();
  if (!stillThere(doc, target.from, target.to, target.text)) {
    close(view);
    return;
  }

  const insert = timeInsertionFor(
    doc,
    target.from,
    target.to,
    target.pattern,
    time,
    target.locale,
    target.meridiem,
  );

  view.dispatch({
    changes: { from: target.from, to: target.to, insert },
    selection: { anchor: target.from + insert.length },
    effects: closePicker.of(null),
  });
  view.focus();
}
```

Update the file's header comment: the first line "The calendar, mounted on the date it was opened from." becomes "The calendar or the clock, mounted on the date or the time it was opened from."

- [ ] **Step 5: The hint and the step keys leave times alone**

In `src/editor/hover-hint.ts`, inside the `for (const detection of detectIn(…))` loop, as its first statement:

```ts
        // Dates only. A time does not say which day it belongs to, so a
        // distance from now would be right in today's note and wrong in
        // last week's.
        if (detection.kind !== "date") continue;
```

In `src/editor/nudge-keys.ts`, in `step`, replace

```ts
  if (target === null) return false;
```

with

```ts
  // Times are not stepped yet; the keys fall through to the editor.
  if (target === null || target.kind !== "date") return false;
```

- [ ] **Step 6: Remove the temporary command, add Pick a time**

Delete `src/editor/clock-tooltip.ts`.

In `src/editor/DatePickerExtension.ts`, remove the `clockTooltip` import and the two lines `// Temporary, with its command; see clock-tooltip.ts.` / `clockTooltip(getSettings),`.

In `src/main.ts`:

Remove the `tryClock` import and the whole `try-time-picker` `addCommand` block with its comment.

Add `FormatKind` to the imports: `import { FormatKind, setDetectionLocales } from "./detect/formats";`

Replace the `pick-date` `addCommand` call with:

```ts
    this.addCommand({
      id: "pick-date",
      name: t("commands.pickDate"),
      editorCallback: (_editor, ctx) => {
        this.pick(ctx instanceof MarkdownView ? ctx : null, "date");
      },
    });

    this.addCommand({
      id: "pick-time",
      name: t("commands.pickTime"),
      editorCallback: (_editor, ctx) => {
        this.pick(ctx instanceof MarkdownView ? ctx : null, "time");
      },
    });
```

Rename the method `pickDate` to `pick`, give it the second parameter, and replace its body's last two statements. The existing doc comment stays, with this paragraph added at its end:

```ts
   * Both commands come through here. With the cursor on a date or a time,
   * either one opens the panel that fits what is there, so a hotkey never does
   * the wrong thing; `inserts` matters only on an empty spot, where one writes
   * a date and the other a time.
```

```ts
  private pick(view: MarkdownView | null, inserts: FormatKind): void {
    const editorView = view && editorViewIn(view.contentEl);
    if (!editorView) {
      new Notice(t("notices.noEditor"));
      return;
    }

    const at = editorView.state.selection.main.head;
    const found = targetAt(editorView.state, commandScopes(this.settings), at);
    if (found !== null) {
      showPicker(editorView, found);
      return;
    }

    const formats = inserts === "time" ? this.settings.timeFormats : this.settings.formats;
    if (formats.length === 0) {
      // Only the time list can be empty; the date list always keeps one.
      new Notice(t("notices.noTimeFormat"));
      return;
    }

    showPicker(editorView, {
      from: at,
      to: at,
      text: "",
      pattern: formats[0].pattern,
      kind: inserts,
    });
  }
```

- [ ] **Step 7: Verify**

Run: `npm run build` then `npm test`
Expected: both succeed.

Run: `grep -o 'require("@codemirror/[a-z]*")' main.js | sort -u` and `grep -c "class EditorView" main.js`
Expected: `language`, `state`, `view`; `0`.

---

### Task 7: The Time formats list in settings

**Files:**
- Modify: `src/settings/format-list.ts`
- Modify: `src/settings/format-modal.ts`
- Modify: `src/settings/settings-tab.ts`
- Modify: `src/settings/hover-page.ts` (`hoverIconDesc`)
- Modify: `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: Tasks 2 and 4.
- Produces: `renderFormatRow(setting, group, list, index, actions, shadow)` where `list: FormatList = { kind: FormatKind; entries: DateFormatEntry[]; minimum: number }`; `editFormat(app, pattern, onSave, kind)`; `new FormatModal(app, pattern, onSave, kind)`.

No unit tests: Obsidian settings UI. Build, lint, and the manual checklist.

- [ ] **Step 1: Strings**

In `src/i18n/locales/en.json` (run `stop-slop` over the new ones):

Change:
- `settings.notes.heading` → `"Dates and times in a note"`
- `settings.doubleClick.desc` → `"Double-click a date to open the calendar, or a time to open the clock."`
- `settings.hoverIcon.desc` → `"Click the {{icon}} or {{clock}} that appears when the pointer is over a date or a time."` and extend its `desc_comment`: `{{clock}} is replaced by the clock icon in the same way; keep both markers.`

Add, after the `settings.formats` object:

```json
    "timeFormats": {
      "heading_comment": "Heading of the settings list of time formats, directly below the Date formats list and built the same way.",
      "heading": "Time formats",
      "description_comment": "First line under the heading. 'Applied top to bottom' is the same phrase the Date formats list uses. The second sentence says a format reads a time with or without seconds, and am/pm however it was written (pm, PM, p.m., p), and writes each time back as it found it.",
      "description": "The time formats Kalendae recognises in your notes, applied top to bottom. Each time keeps its own seconds and am/pm spelling.",
      "example_comment": "The right-hand side of a time format's row: the current time in that format, without seconds and with them, because the format reads both. {{plain}} and {{seconds}} are the two times.",
      "example": "{{plain}} or {{seconds}}"
    },
```

Add inside `settings.formats.modal.groups`:

```json
          "hour_comment": "Row name in the token table of the time format editor.",
          "hour": "Hour",
          "minute_comment": "Row name in the token table of the time format editor.",
          "minute": "Minute",
          "second_comment": "Row name in the token table of the time format editor. Optional: a format without it still reads times that have seconds.",
          "second": "Second",
          "meridiem_comment": "Row name in the token table of the time format editor, for the a and A tokens. Written lowercase as the two words are.",
          "meridiem": "am/pm",
```

Add inside `settings.formats.modal.problem.missing`:

```json
            "hour_comment": "Shown under the format field when a time format has no hour.",
            "hour": "A format needs an hour: add H, HH, h or hh.",
            "minute_comment": "Shown under the format field when a time format has no minute.",
            "minute": "A format needs a minute: add m or mm.",
```

Add inside `settings.formats.modal.problem`:

```json
          "meridiemMissing_comment": "Shown when a time format uses a 12-hour hour (h or hh) with nothing to say morning or afternoon.",
          "meridiemMissing": "A 12-hour format needs am/pm: add a or A.",
          "meridiemStray_comment": "Shown when a time format has am/pm (a or A) beside a 24-hour hour (H or HH).",
          "meridiemStray": "am/pm goes with a 12-hour hour: write h or hh.",
```

If `obsidianmd/ui/sentence-case` flags `am/pm` at the start of a string, report the exact message; do not capitalise it without asking.

- [ ] **Step 2: `format-list.ts` takes a list rather than the host**

In `src/settings/format-list.ts`:

Replace the `../detect/formats` import and add one:

```ts
import { DateFormatEntry, FormatKind, checkFormat, renderExample } from "../detect/formats";
import { checkTimeFormat, renderTimeExample, withSeconds } from "../detect/time-formats";
```

Remove the `KalendaeHost` import.

Directly above `export interface FormatListActions`, add:

```ts
/** One of the two lists a row can belong to. */
export interface FormatList {
  kind: FormatKind;
  entries: DateFormatEntry[];
  /**
   * How few rows the list may hold. One for dates, which always need a format
   * to write a new date in; none for times, where an empty list is how they
   * are switched off.
   */
  minimum: number;
}
```

Change `renderFormatRow`'s signature and body:

```ts
export function renderFormatRow(
  setting: Setting,
  group: SettingGroup,
  list: FormatList,
  index: number,
  actions: FormatListActions,
  shadow: Shadow | undefined,
): void {
  const entry = list.entries[index];
  if (!entry) return;
```

and within it:
- `renderHandle(setting.settingEl, host);` → `renderHandle(setting.settingEl, list);`
- `ensureSortable(group.listEl, actions);` → `ensureSortable(group.listEl, list.kind, actions);`
- `text: example(entry)` → `text: example(entry, list.kind)`
- `if (host.settings.formats.length > 1) {` → `if (list.entries.length > list.minimum) {`

`renderHandle(row: HTMLElement, list: FormatList)`: replace `host.settings.formats.length < 2` with `list.entries.length < 2`.

Replace the single `sortable` variable, `ensureSortable` and `releaseSortable` with one instance per list (keep the existing comments above them, which explain the rebind):

```ts
const sortables = new Map<FormatKind, Sortable>();

function ensureSortable(listEl: HTMLElement, kind: FormatKind, actions: FormatListActions): void {
  if (Sortable.get(listEl)) return;

  // Obsidian builds a fresh list element when the tab is reopened, so the
  // instance for this list is bound to an element that is gone.
  sortables.get(kind)?.destroy();
  sortables.set(
    kind,
    Sortable.create(listEl, {
      draggable: ".kalendae-format-row",
      handle: ".kalendae-format-handle",
      animation: 150,
      swapThreshold: 0.5,
      direction: "vertical",
      ghostClass: "kalendae-format-row-placeholder",
      dragClass: "kalendae-format-row-moving",
      onEnd: () => {
        const rows = listEl.querySelectorAll<HTMLElement>(".kalendae-format-row");
        actions.onReorder(Array.from(rows, (row) => row.dataset.formatId ?? ""));
      },
    }),
  );
}

export function releaseSortable(): void {
  for (const sortable of sortables.values()) sortable.destroy();
  sortables.clear();
}
```

Replace `editFormat` and `example`:

```ts
/** Opens the editor for a format, new or existing. */
export function editFormat(
  app: App,
  pattern: string,
  onSave: (pattern: string) => void,
  kind: FormatKind,
): void {
  new FormatModal(app, pattern, onSave, kind).open();
}

/**
 * Today in a date format; now in a time format, twice — without seconds and
 * with them, because a time format reads both and the row is where that is
 * said.
 */
function example(entry: DateFormatEntry, kind: FormatKind): string {
  if (kind === "date") {
    return checkFormat(entry.pattern) === null
      ? renderExample(entry.pattern)
      : t("settings.formats.unfinished");
  }

  if (checkTimeFormat(entry.pattern) !== null) return t("settings.formats.unfinished");

  return timeExample(entry.pattern);
}

/** The current time in a format, and with seconds where the format reads them unasked. */
export function timeExample(pattern: string): string {
  const seconds = withSeconds(pattern);
  const plain = renderTimeExample(pattern);

  return seconds === null
    ? plain
    : t("settings.timeFormats.example", { plain, seconds: renderTimeExample(seconds) });
}
```

- [ ] **Step 3: `format-modal.ts` takes a kind**

In `src/settings/format-modal.ts`:

Extend the imports:

```ts
import {
  FormatKind,
  FormatProblem,
  FormatWarning,
  LITERAL_SAMPLE,
  TOKEN_GROUPS,
  checkFormat,
  renderExample,
  warnFormat,
  tokenGroupsPresent,
} from "../detect/formats";
import {
  TIME_TOKEN_GROUPS,
  TimeFormatProblem,
  checkTimeFormat,
  renderTimeExample,
  timeTokenGroupsPresent,
} from "../detect/time-formats";
```

Add the constructor parameter:

```ts
  constructor(
    app: App,
    pattern: string,
    private readonly onSave: (pattern: string) => void,
    private readonly kind: FormatKind,
  ) {
```

Add a private getter and use it in both places `TOKEN_GROUPS` is iterated (`renderTokens` and `refresh`):

```ts
  /** The building blocks of the list this format belongs to. */
  private get groups(): readonly { key: string; tokens: readonly string[]; required: boolean }[] {
    return this.kind === "time" ? TIME_TOKEN_GROUPS : TOKEN_GROUPS;
  }
```

In `refresh()`, replace the first two statements and the problem/warning lines:

```ts
    const time = this.kind === "time";
    this.result?.setText(time ? renderTimeExample(this.draft) : renderExample(this.draft));

    const present: Set<string> = time
      ? timeTokenGroupsPresent(this.draft)
      : tokenGroupsPresent(this.draft);
    for (const group of this.groups) {
```

```ts
    const problem = time ? checkTimeFormat(this.draft) : checkFormat(this.draft);
    // Only a date format can be a bare run of digits wide enough to warn about.
    const warning = problem || time ? null : warnFormat(this.draft);
```

Change `line`'s and `describe`'s parameter type to `FormatProblem | TimeFormatProblem | null` / `FormatProblem | TimeFormatProblem`, and replace `describe`'s `missing-component` and `adjacent-numbers` cases and add the new ones:

```ts
    case "mixed":
      return t("settings.formats.modal.problem.mixed");
    case "missing-component":
      return t(`settings.formats.modal.problem.missing.${problem.component}`);
    case "meridiem-missing":
      return t("settings.formats.modal.problem.meridiemMissing");
    case "meridiem-stray":
      return t("settings.formats.modal.problem.meridiemStray");
```

In the `adjacent-numbers` case, a time problem has no `widen`; guard it:

```ts
    case "adjacent-numbers": {
      const names = { first: problem.first, second: problem.second };
      const widen = "widen" in problem ? problem.widen : [];
      if (widen.length === 0) {
        return t("settings.formats.modal.problem.adjacent", names);
      }
      if (widen.length === 1) {
        return t("settings.formats.modal.problem.adjacentWiden", {
          ...names,
          from: widen[0].from,
          to: widen[0].to,
        });
      }
      return t("settings.formats.modal.problem.adjacentWidenBoth", {
        ...names,
        firstFixed: widen[0].to,
        secondFixed: widen[1].to,
      });
    }
```

(Remove the `case "mixed"` added in Task 2 if it would now be duplicated.)

- [ ] **Step 4: `settings-tab.ts` draws two lists**

In `src/settings/settings-tab.ts`:

Imports: add `FormatKind` to the `../detect/formats` import; add `import { BUILT_IN_TIME_FORMATS } from "../detect/time-formats";`; add `FormatList, timeExample` to the `./format-list` import.

At the top of `getSettingDefinitions()`, beside `const shadows = …`, add:

```ts
    const timeShadows = shadowedFormats(this.kalendae.settings.timeFormats, "time");
```

Add a private helper to the class:

```ts
  /** The list a kind names, as the row code wants it. */
  private list(kind: FormatKind): FormatList {
    return kind === "time"
      ? { kind, entries: this.kalendae.settings.timeFormats, minimum: 0 }
      : { kind, entries: this.kalendae.settings.formats, minimum: 1 };
  }

  /** One of the two format lists, as a definition. */
  private formatGroup(
    kind: FormatKind,
    heading: string,
    description: string,
    shadows: Map<string, Shadow>,
  ): SettingDefinitionItem<keyof KalendaeSettings> {
    const list = this.list(kind);

    return {
      type: "list",
      cls: "kalendae-group",
      heading,
      addItem: {
        name: t("settings.formats.add"),
        action: (el) => this.openAddMenu(el, kind),
      },
      items: [
        {
          name: description,
          render: (setting) => setting.settingEl.addClass("kalendae-format-intro"),
        },
        ...list.entries.map((entry, index) => ({
          name: entry.pattern,
          render: (setting: Setting, group: SettingGroup) =>
            renderFormatRow(
              setting,
              group,
              list,
              index,
              {
                onEdit: (id, pattern) => this.editFormat(id, pattern, kind),
                onDelete: (at) => void this.deleteFormat(at, kind),
                onReorder: (ids) => void this.reorderFormat(ids, kind),
              },
              shadows.get(entry.id),
            ),
        })),
      ],
    };
  }
```

Import `Shadow` from `../detect/shadow` alongside `shadowedFormats`.

Replace the existing Date formats list definition (the object whose `heading` is `t("settings.formats.heading")`) with the two calls — copy any properties the existing object has that `formatGroup` does not set (read it first; keep its comments above the first call):

```ts
      this.formatGroup(
        "date",
        t("settings.formats.heading"),
        t("settings.formats.description"),
        shadows,
      ),
      // Directly below the date list rather than under Time picker: the two
      // lists are the same kind of setting, and that section is about what
      // the clock does once it is open.
      this.formatGroup(
        "time",
        t("settings.timeFormats.heading"),
        t("settings.timeFormats.description"),
        timeShadows,
      ),
```

Give every format method a `kind` and route it through `this.list(kind).entries`:

```ts
  private openAddMenu(anchor: HTMLElement, kind: FormatKind): void {
    const present = new Set(this.list(kind).entries.map((entry) => entry.pattern));
    const builtIn = kind === "time" ? BUILT_IN_TIME_FORMATS : BUILT_IN_FORMATS;
    // (existing comment about native menus stays here)
    const menu = new Menu().setUseNativeMenu(false);

    for (const entry of builtIn) {
      if (present.has(entry.pattern)) continue;

      menu.addItem((item) => {
        const title = formatOption(entry.pattern, kind);
        const row = title.firstElementChild;

        item.setTitle(title).onClick(() => void this.addFormat({ ...entry }, kind));
        row?.parentElement?.addClass("kalendae-format-title");
      });
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle(t("settings.formats.addCustom")).onClick(() => this.addCustom(kind)),
    );

    const rect = anchor.getBoundingClientRect();
    menu.showAtPosition({ x: rect.right, y: rect.bottom, left: true });
  }

  /** A custom format only joins the list once it is worth having. */
  private addCustom(kind: FormatKind): void {
    editFormat(
      this.app,
      "",
      (pattern) => {
        void this.addFormat({ id: `${CUSTOM_PREFIX}${Date.now().toString(36)}`, pattern }, kind);
      },
      kind,
    );
  }

  private editFormat(id: string, pattern: string, kind: FormatKind): void {
    editFormat(
      this.app,
      pattern,
      (updated) => {
        const entry = this.list(kind).entries.find((item) => item.id === id);
        if (!entry) return;
        entry.pattern = updated;
        void this.persist();
      },
      kind,
    );
  }

  private async addFormat(entry: DateFormatEntry, kind: FormatKind): Promise<void> {
    this.list(kind).entries.push(entry);
    await this.persist();
  }

  private async deleteFormat(index: number, kind: FormatKind): Promise<void> {
    this.list(kind).entries.splice(index, 1);
    await this.persist();
  }

  private async reorderFormat(ids: string[], kind: FormatKind): Promise<void> {
    const entries = this.list(kind).entries;
    const reordered = reorderById(entries, ids);
    if (reordered === null) {
      this.update();
      return;
    }
    if (reordered === entries) return;

    if (kind === "time") this.kalendae.settings.timeFormats = reordered;
    else this.kalendae.settings.formats = reordered;
    await this.persist();
  }
```

Keep each method's existing comments. Replace `formatOption`:

```ts
function formatOption(pattern: string, kind: FormatKind): DocumentFragment {
  return createFragment((fragment) => {
    const row = fragment.createSpan({ cls: "kalendae-format-option" });

    row.createSpan({ cls: "kalendae-format-pattern", text: pattern });
    row.createSpan({
      cls: "kalendae-format-example",
      text: kind === "time" ? timeExample(pattern) : renderExample(pattern),
    });
  });
}
```

- [ ] **Step 5: The hover icon's description shows both icons**

In `src/settings/hover-page.ts`, replace `hoverIconDesc` with:

```ts
function hoverIconDesc(): DocumentFragment {
  const description = createFragment();
  const icons: Record<string, string> = { "{{icon}}": "calendar", "{{clock}}": "clock" };

  // Split on the markers and keep them, so each lands where the translator
  // put it and in the order their language wants.
  for (const part of t("settings.hoverIcon.desc").split(/({{icon}}|{{clock}})/)) {
    if (part in icons) {
      setIcon(description.createSpan({ cls: "kalendae-inline-icon" }), icons[part]);
    } else {
      description.appendText(part);
    }
  }

  return description;
}
```

Keep the doc comment above it, adding one sentence: "A time shows a clock where a date shows a calendar, so the sentence carries both."

If i18next strips an unfilled `{{clock}}` (it leaves `{{icon}}` standing today, so it should not), pass both through untouched: `t("settings.hoverIcon.desc", { icon: "{{icon}}", clock: "{{clock}}" })`.

- [ ] **Step 6: Verify**

Run: `npm run build` then `npm test`
Expected: both succeed, including `tests/i18n/keys.test.ts`.

---

### Task 8: Checklist, CLAUDE.md and the hand-over

**Files:**
- Modify (rewrite): `docs/manual-tests/2026-10-03-clock-dial.md`
- Modify: `CLAUDE.md`
- Modify: `TODO.md` (gitignored; local)

- [ ] **Step 1: Rewrite the checklist**

Replace `docs/manual-tests/2026-10-03-clock-dial.md` with a checklist whose every case starts from a line Vitaly pastes into a note and can edit. Its opening section is a block to paste:

```markdown
14:05
9:05
14:05:09
2:05 pm
2:05 PM
2:05 p.m.
2:05pm
2:05p
02:05 pm
2:05:09 pm
Meet 2026-10-04 14:30.
We left at 2:05 pm.
at 2:05 a friend called
took 1:14:05 in all
```

followed by "Settings → Time formats: add `HH:mm`, `H:mm`, `h:mm a`, `h:mma`, `hh:mm a` for the full run", and then numbered cases straight through, grouped as: **Finding** (which lines get an icon and which do not, incl. the last two lines getting none and line 11 getting two icons); **Shapes** (each line opens the clock with the right rings, seconds step, and toggle spelling); **Writing** (each line rewritten keeps its format, seconds and spelling; one undo; the three Write to note modes); **Inserting** (Pick a time on an empty spot, beside a word, with an empty list); **Commands** (either command on a date and on a time); **Leaves alone** (no distance hint on a time; step keys on a time do nothing; Tasks emoji before a time does nothing); **Settings** (rows show "14:05 or 14:05:09"; add menu; custom format and each refusal message; empty list; shadow warning with `H:mm` above `HH:mm`); **Looks** (carried over from the old checklist: themes, font size, flip near the bottom, corners, magnet). Carry over every clock case from the old file that still applies, re-pointed at a line in the block.

- [ ] **Step 2: CLAUDE.md**

Update the Architecture section so it is true again: the Purpose line (times are edited now), the Key files table (add `src/picker/clock-math.ts`, `src/picker/clock.ts`, `src/detect/time-formats.ts`, `src/detect/meridiem.ts`; update the roles of `scan.ts`, `picker-tooltip.ts`, `decorations.ts`, `format-list.ts`, `format-modal.ts`), the sentence "Times do not exist yet, and neither does anything that writes more than one date at a time." (now only the second half), "The picker" (five ways in incl. `pick-time`; the clock for a time), and "Detection" (the two lists, dates first; the colon boundary for times; seconds through any format; the am/pm spelling). Keep the document's voice and density; show Vitaly the diff rather than describing it.

- [ ] **Step 3: TODO.md**

Resolve item 3 with a short note pointing at this spec; add three Open items in Category "Time support" with the next free numbers: stepping a time with the step keys (S), typing a time in words (M), a date and a time as one unit — including the distance hint for times (L). Update the TOC rows and their sort position.

- [ ] **Step 4: Full verification and hand-over**

Run: `npm run build` then `npm test`
Expected: both succeed.

Tell Vitaly it is ready to try, point him at the checklist's paste block, list every file changed, every ruling made, and anything deferred. Do not commit; do not translate.

---

### Task 9 (only after Vitaly calls the English final): Translations

**Files:**
- Modify: every locale in `src/i18n/locales/` except `en.json` and `sample_lang.json`.

- [ ] **Step 1:** Translate exactly the keys added or changed in Tasks 2, 6 and 7 (`settings.notes.heading`, `settings.doubleClick.desc`, `settings.hoverIcon.desc`, `settings.timeFormats.*`, the new `settings.formats.modal.groups.*` and `problem.*` keys, `commands.pickTime`, `notices.noTimeFormat`), matching each file's register and its existing words for "note", "format" and "calendar". Keep `{{icon}}`, `{{clock}}`, `{{plain}}`, `{{seconds}}` and the token letters (`H`, `HH`, `a`, `A` …) untouched.
- [ ] **Step 2:** Run `npm run release-check`. Expected: translations, build and tests all pass.
- [ ] **Step 3:** Show Vitaly the commit message — `type: Subject`, two or three product-level bullets, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` — and wait for an explicit yes.
