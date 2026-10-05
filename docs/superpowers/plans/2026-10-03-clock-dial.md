# Clock dial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Material-style clock-dial time selector in the calendar's panel shell, opened for now by a temporary command that feeds it the current time in a random pattern and language.

**Architecture:** Pure arithmetic in `src/picker/clock-math.ts` (unit-tested), the panel's DOM/SVG/keyboard in `src/picker/clock.ts` (no CodeMirror), and a temporary CodeMirror tooltip plus command in `src/editor/clock-tooltip.ts`. One new setting, `snapMinutes`.

**Tech Stack:** TypeScript, Obsidian API (`createDiv`/`createSvg`, `moment`), CodeMirror 6 tooltips, Jest with ts-jest.

**Spec:** `docs/superpowers/specs/2026-10-03-clock-dial-design.md`

## Global Constraints

- **No commits.** Vitaly approves every commit message first; leave all work in the working tree. Work on a branch `clock-dial` cut from `main`.
- **CSS:** no `!important`, no inline styles (no `style=""`, no `el.style.*`), no `column-gap`, no `text-decoration-*` sub-properties, Obsidian CSS variables for colours, fonts and spacing. Every panel rule scoped under `.kalendae-panel`.
- **SVG geometry goes in attributes** (`x`, `y`, `cx`, `x2`, `font-size`…), never in styles — that is why the dial is SVG.
- **i18n:** every user-visible string through `t()`. Only `src/i18n/locales/en.json` is edited until Vitaly says the English is final; each key gets a `<key>_comment` sibling. Run the `stop-slop` skill over new strings.
- **moment:** pure code uses `moment.utc(...)`, imported from `"obsidian"` (the Jest mock re-exports the real moment).
- **Verification during work:** `npm run build` and `npm test`. Not `npm run release-check` — it fails until the translation pass.
- **Do not touch** `@codemirror/*` versions or the `external` list in `esbuild.config.mjs`.

## Review Focus

1. **A drag that starts on the dial and ends outside the panel** — the hand keeps following and the release still settles the unit; the panel does not close (the outside-click handler listens for `mousedown`, which only happened inside). Task 3 manual check.
2. **Enter on a Tab-focused button** (Now, Cancel, AM/PM) presses that button only; it must not also fire OK. Task 3 keyboard handler ignores keys whose target is not the panel itself, except Escape.
3. **Snap ticked while the minute is 37** — the value stays 37 and the next Up goes to 40, Down to 35. Pinned by the `stepped` tests in Task 1.
4. **12 o'clock in a 12-hour pattern** — 12 AM is hour 0 and 12 PM is hour 12, on the dial, in the big numbers, and after an AM/PM flip. Pinned by `withDialValue`, `unitText` and `withMeridiem` tests in Task 1.
5. **Snap ticked while the seconds unit is active** — seconds disappear and the active unit falls back to minutes rather than pointing at a unit that no longer exists. Task 3 `render()` clamps the unit; manual check in Task 5.

---

### Task 1: Clock arithmetic

**Files:**
- Create: `src/picker/clock-math.ts`
- Test: `tests/picker/clock-math.test.ts`

**Interfaces:**
- Consumes: `moment` from `"obsidian"`.
- Produces (all exported from `src/picker/clock-math.ts`):
  - `interface TimeValue { hour: number; minute: number; second: number }` — hour 0–23 always.
  - `type ClockUnit = "hour" | "minute" | "second"`
  - `interface ClockShape { twelveHour: boolean; meridiemToken: "a" | "A" | null; seconds: boolean; padHour: boolean; padMinute: boolean; padSecond: boolean }`
  - `interface DialMark { value: number; label: string; degrees: number; inner: boolean }`
  - `const RING_SPLIT: number`
  - `shapeOf(pattern: string): ClockShape`
  - `unitsOf(shape: ClockShape, snap: boolean): ClockUnit[]`
  - `unitText(unit: ClockUnit, time: TimeValue, shape: ClockShape): string`
  - `marksFor(unit: ClockUnit, shape: ClockShape): DialMark[]`
  - `dialValue(unit: ClockUnit, time: TimeValue, shape: ClockShape): number`
  - `handOf(unit: ClockUnit, time: TimeValue, shape: ClockShape): { degrees: number; inner: boolean }`
  - `pointToValue(unit: ClockUnit, shape: ClockShape, snap: boolean, x: number, y: number): number`
  - `withDialValue(unit: ClockUnit, value: number, time: TimeValue, shape: ClockShape): TimeValue`
  - `stepped(unit: ClockUnit, time: TimeValue, delta: 1 | -1, snap: boolean): TimeValue`
  - `withMeridiem(time: TimeValue, pm: boolean): TimeValue`
  - `meridiemWords(time: TimeValue, token: "a" | "A", locale?: string): { am: string; pm: string }`
  - `meridiemVocabulary(token: "a" | "A", locale?: string): string[]`
  - `formatTime(pattern: string, time: TimeValue, locale?: string): string`
  - `committed(initial: TimeValue, current: TimeValue, shape: ClockShape, snap: boolean): TimeValue | null`
  - `timeOf(date: Date): TimeValue`

Dial coordinates: `x`, `y` are relative to the dial's centre in units of its radius — the face's edge is distance 1, `y` grows downwards as on screen. Degrees run clockwise from 12 o'clock.

- [ ] **Step 1: Create the branch**

Run: `git switch -c clock-dial`
Expected: `Switched to a new branch 'clock-dial'`

- [ ] **Step 2: Write the failing tests**

Create `tests/picker/clock-math.test.ts`:

```ts
import {
  committed,
  dialValue,
  formatTime,
  handOf,
  marksFor,
  meridiemVocabulary,
  meridiemWords,
  pointToValue,
  shapeOf,
  stepped,
  timeOf,
  unitText,
  unitsOf,
  withDialValue,
  withMeridiem,
} from "../../src/picker/clock-math";

/**
 * The clock's arithmetic, with no DOM in sight. Hours are 0–23 throughout,
 * whatever the pattern shows; the dial's coordinates put its centre at 0,0 and
 * its edge at distance 1, with y growing downwards as it does on screen.
 */

const at = (hour: number, minute = 0, second = 0) => ({ hour, minute, second });

/** The point on the dial at a clock angle and a distance from the centre. */
const point = (degrees: number, distance: number): [number, number] => {
  const radians = (degrees * Math.PI) / 180;
  return [distance * Math.sin(radians), -distance * Math.cos(radians)];
};

const h24 = shapeOf("HH:mm");
const h12 = shapeOf("h:mm a");
const withSeconds = shapeOf("HH:mm:ss");

describe("shapeOf", () => {
  it("reads a 24-hour pattern", () => {
    expect(shapeOf("HH:mm")).toEqual({
      twelveHour: false,
      meridiemToken: null,
      seconds: false,
      padHour: true,
      padMinute: true,
      padSecond: false,
    });
  });

  it("reads leading zeros off the hour token", () => {
    expect(shapeOf("H:mm").padHour).toBe(false);
    expect(shapeOf("hh:mm A").padHour).toBe(true);
  });

  it("reads a 12-hour pattern and the case of its AM/PM", () => {
    expect(shapeOf("h:mm a")).toMatchObject({ twelveHour: true, meridiemToken: "a" });
    expect(shapeOf("hh:mm A")).toMatchObject({ twelveHour: true, meridiemToken: "A" });
  });

  it("reads seconds", () => {
    expect(shapeOf("HH:mm:ss")).toMatchObject({ seconds: true, padSecond: true });
    expect(shapeOf("h:mm:ss a")).toMatchObject({ seconds: true, twelveHour: true });
  });

  it("ignores letters inside moment's [literal] brackets", () => {
    expect(shapeOf("[at] HH:mm")).toMatchObject({ twelveHour: false, meridiemToken: null });
  });
});

describe("unitsOf", () => {
  it("is hour and minute without seconds in the pattern", () => {
    expect(unitsOf(h24, false)).toEqual(["hour", "minute"]);
  });

  it("adds seconds only with Snap off", () => {
    expect(unitsOf(withSeconds, false)).toEqual(["hour", "minute", "second"]);
    expect(unitsOf(withSeconds, true)).toEqual(["hour", "minute"]);
  });
});

describe("unitText", () => {
  it("follows the pattern's leading zeros", () => {
    expect(unitText("hour", at(9, 5), shapeOf("H:mm"))).toBe("9");
    expect(unitText("hour", at(9, 5), h24)).toBe("09");
    expect(unitText("minute", at(9, 5), h24)).toBe("05");
    expect(unitText("second", at(9, 5, 7), withSeconds)).toBe("07");
  });

  it("shows 12-hour hours as 12, 1 … 11", () => {
    expect(unitText("hour", at(0), h12)).toBe("12");
    expect(unitText("hour", at(12), h12)).toBe("12");
    expect(unitText("hour", at(13), h12)).toBe("1");
    expect(unitText("hour", at(13), shapeOf("hh:mm a"))).toBe("01");
  });
});

describe("marksFor", () => {
  it("puts 12 at the top of a 12-hour dial", () => {
    const marks = marksFor("hour", h12);
    expect(marks).toHaveLength(12);
    expect(marks[0]).toEqual({ value: 0, label: "12", degrees: 0, inner: false });
    expect(marks[3]).toEqual({ value: 3, label: "3", degrees: 90, inner: false });
  });

  it("gives a 24-hour dial two rings, 12 outside and 00 inside at the top", () => {
    const marks = marksFor("hour", h24);
    expect(marks).toHaveLength(24);
    expect(marks).toContainEqual({ value: 12, label: "12", degrees: 0, inner: false });
    expect(marks).toContainEqual({ value: 0, label: "00", degrees: 0, inner: true });
    expect(marks).toContainEqual({ value: 15, label: "15", degrees: 90, inner: true });
  });

  it("labels minutes and seconds every five", () => {
    const labels = marksFor("minute", h24).map((mark) => mark.label);
    expect(labels).toEqual(["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]);
    expect(marksFor("second", withSeconds)[1]).toEqual({
      value: 5,
      label: "05",
      degrees: 30,
      inner: false,
    });
  });
});

describe("dialValue and handOf", () => {
  it("places a 24-hour hour on its ring", () => {
    expect(handOf("hour", at(0), h24)).toEqual({ degrees: 0, inner: true });
    expect(handOf("hour", at(12), h24)).toEqual({ degrees: 0, inner: false });
    expect(handOf("hour", at(15), h24)).toEqual({ degrees: 90, inner: true });
    expect(handOf("hour", at(3), h24)).toEqual({ degrees: 90, inner: false });
  });

  it("keeps a 12-hour hand on the one ring", () => {
    expect(handOf("hour", at(15), h12)).toEqual({ degrees: 90, inner: false });
    expect(dialValue("hour", at(15), h12)).toBe(3);
  });

  it("turns minutes and seconds six degrees each", () => {
    expect(handOf("minute", at(9, 37), h24)).toEqual({ degrees: 222, inner: false });
    expect(handOf("second", at(9, 0, 15), withSeconds)).toEqual({ degrees: 90, inner: false });
  });
});

describe("pointToValue", () => {
  it("reads the hour off a 12-hour dial", () => {
    expect(pointToValue("hour", h12, true, ...point(0, 0.8))).toBe(0);
    expect(pointToValue("hour", h12, true, ...point(90, 0.8))).toBe(3);
    expect(pointToValue("hour", h12, true, ...point(95, 0.3))).toBe(3);
  });

  it("picks the ring of a 24-hour dial by distance from the centre", () => {
    expect(pointToValue("hour", h24, true, ...point(90, 0.8))).toBe(3);
    expect(pointToValue("hour", h24, true, ...point(90, 0.4))).toBe(15);
    expect(pointToValue("hour", h24, true, ...point(0, 0.8))).toBe(12);
    expect(pointToValue("hour", h24, true, ...point(0, 0.4))).toBe(0);
  });

  it("snaps minutes to five with Snap on, and not with it off", () => {
    expect(pointToValue("minute", h24, true, ...point(222, 0.8))).toBe(35);
    expect(pointToValue("minute", h24, false, ...point(222, 0.8))).toBe(37);
  });

  it("never snaps seconds", () => {
    expect(pointToValue("second", withSeconds, true, ...point(222, 0.8))).toBe(37);
  });

  it("wraps just before the top round to zero", () => {
    expect(pointToValue("minute", h24, false, ...point(359, 0.8))).toBe(0);
  });
});

describe("withDialValue", () => {
  it("keeps the half of the day a 12-hour pick lands in", () => {
    expect(withDialValue("hour", 3, at(14, 30), h12)).toEqual(at(15, 30));
    expect(withDialValue("hour", 3, at(2, 30), h12)).toEqual(at(3, 30));
    expect(withDialValue("hour", 0, at(14), h12)).toEqual(at(12));
    expect(withDialValue("hour", 0, at(2), h12)).toEqual(at(0));
  });

  it("takes a 24-hour pick as it is", () => {
    expect(withDialValue("hour", 15, at(2, 30), h24)).toEqual(at(15, 30));
  });

  it("sets minutes and seconds and nothing else", () => {
    expect(withDialValue("minute", 40, at(9, 5, 7), withSeconds)).toEqual(at(9, 40, 7));
    expect(withDialValue("second", 40, at(9, 5, 7), withSeconds)).toEqual(at(9, 5, 40));
  });
});

describe("stepped", () => {
  it("wraps hours through the whole day", () => {
    expect(stepped("hour", at(23), 1, true)).toEqual(at(0));
    expect(stepped("hour", at(0), -1, true)).toEqual(at(23));
    expect(stepped("hour", at(11, 30), 1, true)).toEqual(at(12, 30));
  });

  it("steps minutes by five with Snap on, landing on the five either side of an odd minute", () => {
    expect(stepped("minute", at(9, 37), 1, true)).toEqual(at(9, 40));
    expect(stepped("minute", at(9, 37), -1, true)).toEqual(at(9, 35));
    expect(stepped("minute", at(9, 40), 1, true)).toEqual(at(9, 45));
    expect(stepped("minute", at(9, 55), 1, true)).toEqual(at(9, 0));
  });

  it("steps minutes by one with Snap off, without carrying into the hour", () => {
    expect(stepped("minute", at(9, 37), 1, false)).toEqual(at(9, 38));
    expect(stepped("minute", at(9, 59), 1, false)).toEqual(at(9, 0));
    expect(stepped("minute", at(9, 0), -1, false)).toEqual(at(9, 59));
  });

  it("steps seconds by one, without carrying", () => {
    expect(stepped("second", at(9, 5, 0), -1, false)).toEqual(at(9, 5, 59));
  });
});

describe("withMeridiem", () => {
  it("moves the hour to the other half and leaves it where it is on the dial", () => {
    expect(withMeridiem(at(2, 5), true)).toEqual(at(14, 5));
    expect(withMeridiem(at(14, 5), false)).toEqual(at(2, 5));
    expect(withMeridiem(at(12), false)).toEqual(at(0));
    expect(withMeridiem(at(0), true)).toEqual(at(12));
  });
});

describe("meridiemWords", () => {
  it("is AM and PM in English, in the pattern's case", () => {
    expect(meridiemWords(at(2), "A", "en")).toEqual({ am: "AM", pm: "PM" });
    expect(meridiemWords(at(2), "a", "en")).toEqual({ am: "am", pm: "pm" });
  });

  it("follows the hour in a language with more than two words", () => {
    expect(meridiemWords(at(2), "a", "uk")).toEqual({ am: "ночі", pm: "дня" });
    expect(meridiemWords(at(9), "a", "uk")).toEqual({ am: "ранку", pm: "вечора" });
    expect(meridiemWords(at(21), "a", "uk")).toEqual({ am: "ранку", pm: "вечора" });
  });
});

describe("meridiemVocabulary", () => {
  it("lists every word a language uses across the day, once each", () => {
    expect(meridiemVocabulary("a", "en")).toEqual(["am", "pm"]);
    expect(meridiemVocabulary("a", "uk")).toEqual(["ночі", "ранку", "дня", "вечора"]);
    expect(meridiemVocabulary("A", "ja")).toEqual(["午前", "午後"]);
  });
});

describe("formatTime", () => {
  it("writes the time through the pattern", () => {
    expect(formatTime("HH:mm", at(9, 5))).toBe("09:05");
    expect(formatTime("H:mm", at(9, 5))).toBe("9:05");
    expect(formatTime("h:mm:ss a", at(14, 5, 7), "en")).toBe("2:05:07 pm");
    expect(formatTime("hh:mm A", at(0, 30), "en")).toBe("12:30 AM");
  });

  it("writes AM/PM in the language the time was written in", () => {
    expect(formatTime("h:mm a", at(21), "uk")).toBe("9:00 вечора");
    expect(formatTime("A h:mm", at(14), "ja")).toBe("午後 2:00");
    expect(formatTime("h:mm a", at(14), "tr")).toBe("2:00 ös");
  });
});

describe("committed", () => {
  it("is nothing when the time did not change, so its seconds survive", () => {
    expect(committed(at(14, 32, 47), at(14, 32, 47), withSeconds, true)).toBeNull();
  });

  it("is nothing when an edit was taken back", () => {
    expect(committed(at(14, 32, 47), { ...at(14, 32), second: 47 }, withSeconds, false)).toBeNull();
  });

  it("writes seconds as zero with Snap on, once something changed", () => {
    expect(committed(at(14, 32, 47), at(14, 35, 47), withSeconds, true)).toEqual(at(14, 35, 0));
  });

  it("keeps the seconds with Snap off", () => {
    expect(committed(at(14, 32, 47), at(14, 35, 47), withSeconds, false)).toEqual(at(14, 35, 47));
  });
});

describe("timeOf", () => {
  it("reads the local time off a Date", () => {
    expect(timeOf(new Date(2026, 9, 3, 14, 37, 12))).toEqual(at(14, 37, 12));
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest tests/picker/clock-math.test.ts`
Expected: FAIL — `Cannot find module '../../src/picker/clock-math'`.

- [ ] **Step 4: Write the implementation**

Create `src/picker/clock-math.ts`:

```ts
import { moment } from "obsidian";

/**
 * The clock's arithmetic: no DOM, no editor, no settings.
 *
 * A time is hours 0–23 whatever the pattern shows, and the pattern only decides
 * how it is drawn and written. The dial's coordinates put its centre at 0,0 and
 * its edge at distance 1, y growing downwards as it does on screen; angles run
 * clockwise from 12 o'clock, in degrees.
 */

export interface TimeValue {
  hour: number;
  minute: number;
  second: number;
}

export type ClockUnit = "hour" | "minute" | "second";

/** What the pattern a time was written in asks of the panel. */
export interface ClockShape {
  /** `h`: one ring of 12 and an AM/PM toggle. `H`: two rings, 0–23. */
  twelveHour: boolean;
  /** The pattern's AM/PM token, which is also the case its words are written in. */
  meridiemToken: "a" | "A" | null;
  seconds: boolean;
  padHour: boolean;
  padMinute: boolean;
  padSecond: boolean;
}

/** One number on the dial. */
export interface DialMark {
  /** What picking it sets, in `dialValue`'s terms. */
  value: number;
  label: string;
  degrees: number;
  /** On the inner ring of a 24-hour dial. */
  inner: boolean;
}

/**
 * Where the inner ring of a 24-hour dial ends and the outer begins, as a share
 * of the radius: halfway between the two rings' labels.
 */
export const RING_SPLIT = 0.66;

export function shapeOf(pattern: string): ClockShape {
  // Bracketed text is literal in moment and may hold any letter.
  const tokens = pattern.replace(/\[[^\]]*\]/g, "");

  return {
    twelveHour: tokens.includes("h"),
    meridiemToken: tokens.includes("a") ? "a" : tokens.includes("A") ? "A" : null,
    seconds: tokens.includes("s"),
    padHour: /HH|hh/.test(tokens),
    padMinute: tokens.includes("mm"),
    padSecond: tokens.includes("ss"),
  };
}

/**
 * The units a pick walks through. Snap drops seconds: a dial that lands on five
 * minutes is not one anybody is setting seconds on.
 */
export function unitsOf(shape: ClockShape, snap: boolean): ClockUnit[] {
  return shape.seconds && !snap ? ["hour", "minute", "second"] : ["hour", "minute"];
}

/** A unit as the big numbers at the top show it. */
export function unitText(unit: ClockUnit, time: TimeValue, shape: ClockShape): string {
  if (unit === "hour") {
    return pad(shape.twelveHour ? time.hour % 12 || 12 : time.hour, shape.padHour);
  }

  return unit === "minute"
    ? pad(time.minute, shape.padMinute)
    : pad(time.second, shape.padSecond);
}

/**
 * The numbers around the dial. A 24-hour dial is Material's: 1–12 outside with
 * 12 at the top, 13–23 inside with 00 at the top.
 */
export function marksFor(unit: ClockUnit, shape: ClockShape): DialMark[] {
  const twelve = Array.from({ length: 12 }, (_, index) => index);

  if (unit !== "hour") {
    return twelve.map((index) => ({
      value: index * 5,
      label: pad(index * 5, true),
      degrees: index * 30,
      inner: false,
    }));
  }

  if (shape.twelveHour) {
    return twelve.map((index) => ({
      value: index,
      label: String(index || 12),
      degrees: index * 30,
      inner: false,
    }));
  }

  return [
    ...twelve.map((index) => ({
      value: index || 12,
      label: String(index || 12),
      degrees: index * 30,
      inner: false,
    })),
    ...twelve.map((index) => ({
      value: index ? index + 12 : 0,
      label: index ? String(index + 12) : "00",
      degrees: index * 30,
      inner: true,
    })),
  ];
}

/** A time in the dial's terms: a 12-hour dial does not know which half it is in. */
export function dialValue(unit: ClockUnit, time: TimeValue, shape: ClockShape): number {
  if (unit === "hour") return shape.twelveHour ? time.hour % 12 : time.hour;

  return unit === "minute" ? time.minute : time.second;
}

/** Where the hand points, and whether it reaches only the inner ring. */
export function handOf(
  unit: ClockUnit,
  time: TimeValue,
  shape: ClockShape,
): { degrees: number; inner: boolean } {
  if (unit === "hour") {
    return {
      degrees: (time.hour % 12) * 30,
      inner: !shape.twelveHour && (time.hour === 0 || time.hour > 12),
    };
  }

  return { degrees: (unit === "minute" ? time.minute : time.second) * 6, inner: false };
}

/** The value under a point on the dial, in `dialValue`'s terms. */
export function pointToValue(
  unit: ClockUnit,
  shape: ClockShape,
  snap: boolean,
  x: number,
  y: number,
): number {
  // A share of a full turn, 0 at the top and growing clockwise.
  const turn = (Math.atan2(x, -y) / (2 * Math.PI) + 1) % 1;

  if (unit === "hour") {
    const hour = Math.round(turn * 12) % 12;
    if (shape.twelveHour) return hour;

    const inner = Math.hypot(x, y) < RING_SPLIT;
    if (inner) return hour ? hour + 12 : 0;

    return hour || 12;
  }

  const step = unit === "minute" && snap ? 5 : 1;

  return (Math.round((turn * 60) / step) * step) % 60;
}

/** A time with one unit set from the dial. */
export function withDialValue(
  unit: ClockUnit,
  value: number,
  time: TimeValue,
  shape: ClockShape,
): TimeValue {
  if (unit === "hour") {
    // A 12-hour dial picks within the half the time is already in; the
    // toggle is what crosses noon.
    const hour = shape.twelveHour ? value + (time.hour >= 12 ? 12 : 0) : value;
    return { ...time, hour };
  }

  return unit === "minute" ? { ...time, minute: value } : { ...time, second: value };
}

/**
 * An arrow key's step. Hours wrap through the whole day, which is what flips
 * AM and PM past 11; minutes and seconds wrap within themselves and never carry,
 * so one key never changes two numbers. With Snap on, an odd minute steps to
 * the five on either side of it rather than by five from where it is.
 */
export function stepped(
  unit: ClockUnit,
  time: TimeValue,
  delta: 1 | -1,
  snap: boolean,
): TimeValue {
  if (unit === "hour") return { ...time, hour: (time.hour + delta + 24) % 24 };

  const step = unit === "minute" && snap ? 5 : 1;
  const current = unit === "minute" ? time.minute : time.second;
  const next =
    delta > 0
      ? Math.floor(current / step) * step + step
      : Math.ceil(current / step) * step - step;
  const value = (next + 60) % 60;

  return unit === "minute" ? { ...time, minute: value } : { ...time, second: value };
}

/** The same hour on the dial, in the other half of the day. */
export function withMeridiem(time: TimeValue, pm: boolean): TimeValue {
  return { ...time, hour: (time.hour % 12) + (pm ? 12 : 0) };
}

/**
 * The words on the toggle's two halves: what the pattern would write at this
 * hour on each side of noon. Not a fixed pair — Ukrainian and Russian have four
 * words and Chinese six, chosen by the hour.
 */
export function meridiemWords(
  time: TimeValue,
  token: "a" | "A",
  locale?: string,
): { am: string; pm: string } {
  return {
    am: formatTime(token, withMeridiem(time, false), locale),
    pm: formatTime(token, withMeridiem(time, true), locale),
  };
}

/**
 * Every word a language writes for AM/PM across the day, in the order they
 * come. The toggle sizes itself to the longest so it does not jump as the hour
 * changes.
 */
export function meridiemVocabulary(token: "a" | "A", locale?: string): string[] {
  const words = Array.from({ length: 24 }, (_, hour) =>
    formatTime(token, { hour, minute: 0, second: 0 }, locale),
  );

  return [...new Set(words)];
}

/** The text a time is written as. */
export function formatTime(pattern: string, time: TimeValue, locale?: string): string {
  const at = moment.utc({ year: 2000, month: 0, date: 1, ...time });

  return (locale ? at.locale(locale) : at).format(pattern);
}

/**
 * What OK writes, or null for nothing at all.
 *
 * Unchanged is Cancel, so opening `14:32:47` and pressing OK keeps its seconds.
 * Once something did change, Snap writes the seconds as zero: they were never
 * on offer.
 */
export function committed(
  initial: TimeValue,
  current: TimeValue,
  shape: ClockShape,
  snap: boolean,
): TimeValue | null {
  const same =
    initial.hour === current.hour &&
    initial.minute === current.minute &&
    initial.second === current.second;
  if (same) return null;

  return shape.seconds && snap ? { ...current, second: 0 } : current;
}

/** The local time of day in a Date. */
export function timeOf(date: Date): TimeValue {
  return { hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds() };
}

function pad(value: number, padded: boolean): string {
  return padded ? String(value).padStart(2, "0") : String(value);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/picker/clock-math.test.ts`
Expected: PASS, every test.

- [ ] **Step 6: Run the whole suite and the build**

Run: `npm test` then `npm run build`
Expected: both succeed. `clock-math.ts` is not imported by anything yet; the build must still type-check and lint it.

---

### Task 2: The Snap setting

**Files:**
- Modify: `src/settings.ts` (the `KalendaeSettings` interface and `DEFAULT_SETTINGS`)
- Modify: `src/settings/settings-tab.ts` (a new group after the Calendar group)
- Modify: `src/i18n/locales/en.json` (`settings.times`, `settings.snapMinutes`)

**Interfaces:**
- Produces: `KalendaeSettings.snapMinutes: boolean`, default `true`. Task 3 reads it.

- [ ] **Step 1: Add the field**

In `src/settings.ts`, inside `interface KalendaeSettings`, directly after `showWritesPreview: boolean;`:

```ts
  /**
   * Where the time picker's Snap starts each time it opens. The panel's own
   * checkbox overrides it for one pick and never writes it back.
   */
  snapMinutes: boolean;
```

In `DEFAULT_SETTINGS`, directly after `showWritesPreview: true,`:

```ts
  snapMinutes: true,
```

- [ ] **Step 2: Add the strings**

In `src/i18n/locales/en.json`, inside `"settings"`, add two objects (anywhere among the siblings; place them after `"writesPreview"`). Run the `stop-slop` skill over the `desc` before saving.

```json
    "times": {
      "heading_comment": "Heading of the settings section for the time picker, the clock that sets a time the way the calendar sets a date.",
      "heading": "Times"
    },
    "snapMinutes": {
      "name_comment": "Settings row label. When on, the time picker's minute hand lands on 0, 5, 10 … rather than on every minute.",
      "name": "Snap minutes to 5",
      "desc_comment": "Under the label. 'Snap' is the checkbox of the same name in the time picker, so use the same word for both.",
      "desc": "Where the picker starts. Untick Snap in the picker to set a single minute."
    },
```

- [ ] **Step 3: Add the settings group**

In `src/settings/settings-tab.ts`, find the group whose `heading` is `t("settings.calendar.heading")`. Directly after that group's closing `},` and before the Typing group (the one with the comment beginning `// Typing is not one of the ways into the calendar`), insert:

```ts
      {
        type: "group",
        cls: "kalendae-group",
        heading: t("settings.times.heading"),
        items: [
          {
            name: t("settings.snapMinutes.name"),
            desc: t("settings.snapMinutes.desc"),
            control: {
              type: "toggle",
              key: "snapMinutes",
              defaultValue: DEFAULT_SETTINGS.snapMinutes,
            },
          },
        ],
      },
```

- [ ] **Step 4: Verify**

Run: `npm test` then `npm run build`
Expected: both succeed. If a settings test compares `DEFAULT_SETTINGS` to a literal, add `snapMinutes: true` to that literal. If eslint's sentence-case rule flags `"Snap minutes to 5"`, report the exact message rather than rewording.

---

### Task 3: The clock panel

**Files:**
- Create: `src/picker/clock.ts`
- Modify: `src/i18n/locales/en.json` (`picker.now`, `picker.clock.*`)
- Modify: `styles.css` (append the clock block after the calendar panel's rules)

**Interfaces:**
- Consumes: everything Task 1 produces; `Panel` from `src/picker/panel.ts` (`{ dom: HTMLElement; focus: () => void }`); `KalendaeSettings.snapMinutes` and `.showWritesPreview`.
- Produces: `createClock(options: ClockOptions): Panel` and

```ts
export interface ClockOptions {
  value: TimeValue;
  pattern: string;
  locale?: string;
  settings: KalendaeSettings;
  onPick: (time: TimeValue) => void;
  onClose: () => void;
}
```

`onPick` fires for OK with a change and for Now; `onClose` for Cancel, Escape and OK without a change.

There is no unit test for this file — it is DOM, and the Jest environment is `node`. Its logic lives in Task 1. It is checked by build, lint and the manual checklist in Task 5.

- [ ] **Step 1: Add the strings**

In `src/i18n/locales/en.json`, inside `"picker"`, after `"today"`:

```json
    "now_comment": "Button under the time picker that writes the current time and closes the picker, as Today does under the calendar.",
    "now": "Now",
    "clock": {
      "hours_comment": "Screen-reader label for the large hour number at the top of the time picker. Clicking it switches the dial to hours.",
      "hours": "Hours",
      "minutes_comment": "Screen-reader label for the large minute number.",
      "minutes": "Minutes",
      "seconds_comment": "Screen-reader label for the large seconds number, shown only for times written with seconds.",
      "seconds": "Seconds",
      "snap_comment": "Checkbox in the time picker. Ticked, the minute hand lands on 0, 5, 10 …; unticked, on every minute. Lasts for this pick only. Same word as the 'Snap minutes to 5' setting.",
      "snap": "Snap",
      "cancel_comment": "Button that closes the time picker without changing the note.",
      "cancel": "Cancel",
      "ok_comment": "Button that writes the chosen time into the note.",
      "ok": "OK"
    },
```

- [ ] **Step 2: Write the panel**

Create `src/picker/clock.ts`:

```ts
import { t } from "../i18n/i18n";
import { KalendaeSettings } from "../settings";
import {
  ClockUnit,
  TimeValue,
  committed,
  dialValue,
  formatTime,
  handOf,
  marksFor,
  meridiemVocabulary,
  meridiemWords,
  pointToValue,
  shapeOf,
  stepped,
  timeOf,
  unitText,
  unitsOf,
  withDialValue,
  withMeridiem,
} from "./clock-math";
import { Panel } from "./panel";

/**
 * The time picker: Material's clock dial in the calendar's shell.
 *
 * Knows nothing about CodeMirror, as the calendar does not. It is handed a time,
 * the pattern it was written in and that pattern's language, and calls back
 * with the time chosen. The pattern decides the shape — 12 or 24 hours, seconds
 * or not — and the locale only the AM/PM words.
 *
 * Two picks make a time, so unlike the calendar it confirms with OK. The big
 * numbers at the top show the time and switch the dial between units; they are
 * not typeable, because the note is already a text field.
 */

export interface ClockOptions {
  /** The time the note holds now. */
  value: TimeValue;
  /** The format it was written in, which is what it will be written back in. */
  pattern: string;
  /** The language it was written in, for the AM/PM words. */
  locale?: string;
  settings: KalendaeSettings;
  onPick: (time: TimeValue) => void;
  onClose: () => void;
}

// The dial's geometry, in the SVG's own units: the face is radius 100 around
// 0,0. Attributes rather than styles, which is why the dial is SVG at all.
const OUTER = 80;
const INNER = 52;
const KNOB = 15;
const OUTER_TEXT = 14;
const INNER_TEXT = 11;

const UNIT_LABELS: Record<ClockUnit, string> = {
  hour: "picker.clock.hours",
  minute: "picker.clock.minutes",
  second: "picker.clock.seconds",
};

export function createClock(options: ClockOptions): Panel {
  const shape = shapeOf(options.pattern);
  const token = shape.meridiemToken ?? "A";
  const vocabulary = shape.twelveHour ? meridiemVocabulary(token, options.locale) : [];

  // The time being built, which reaches the note only through OK.
  let time = options.value;
  // Where Snap starts is the setting's business; ticking the box lasts this pick.
  let snap = options.settings.snapMinutes;
  let unit: ClockUnit = "hour";

  const dom = createDiv({ cls: "kalendae-panel kalendae-clock" });
  const top = dom.createDiv({ cls: "kalendae-clock-top" });
  const digits = top.createDiv({ cls: "kalendae-clock-digits" });
  const meridiem = shape.twelveHour ? top.createDiv({ cls: "kalendae-clock-meridiem" }) : null;
  const am = meridiem?.createEl("button", { cls: "kalendae-clock-meridiem-option" });
  const pm = meridiem?.createEl("button", { cls: "kalendae-clock-meridiem-option" });
  const dial = dom.createSvg("svg", {
    cls: "kalendae-clock-dial",
    attr: { viewBox: "-100 -100 200 200" },
  });
  const footer = dom.createDiv({ cls: "kalendae-panel-footer" });
  const controls = dom.createDiv({ cls: "kalendae-clock-controls" });

  am?.addEventListener("click", () => {
    time = withMeridiem(time, false);
    render();
  });
  pm?.addEventListener("click", () => {
    time = withMeridiem(time, true);
    render();
  });

  const nowButton = footer.createEl("button", {
    cls: "kalendae-panel-today",
    text: t("picker.now"),
  });
  nowButton.addEventListener("click", () => options.onPick(timeOf(new Date())));

  const writes = options.settings.showWritesPreview
    ? footer.createDiv({ cls: "kalendae-panel-writes" })
    : null;

  /** What OK would write now: the original, until something changes. */
  const pending = () => committed(options.value, time, shape, snap) ?? options.value;

  const preview = (at: TimeValue) => {
    writes?.setText(formatTime(options.pattern, at, options.locale));
  };

  nowButton.addEventListener("mouseenter", () => preview(timeOf(new Date())));
  footer.addEventListener("mouseleave", () => preview(pending()));

  const snapLabel = controls.createEl("label", { cls: "kalendae-clock-snap" });
  const snapBox = snapLabel.createEl("input", { type: "checkbox" });
  snapBox.checked = snap;
  snapLabel.appendText(t("picker.clock.snap"));
  snapBox.addEventListener("change", () => {
    // The value stays where it is; the next move follows the new setting.
    snap = snapBox.checked;
    render();
  });

  const cancel = controls.createEl("button", { text: t("picker.clock.cancel") });
  cancel.addEventListener("click", () => options.onClose());

  const ok = controls.createEl("button", { cls: "mod-cta", text: t("picker.clock.ok") });
  ok.addEventListener("click", () => confirm());

  function confirm(): void {
    const result = committed(options.value, time, shape, snap);
    if (result === null) options.onClose();
    else options.onPick(result);
  }

  function render(): void {
    const units = unitsOf(shape, snap);
    // Snap takes seconds away; a panel left on them moves back to minutes.
    if (!units.includes(unit)) unit = units[units.length - 1];

    digits.empty();
    units.forEach((each, index) => {
      if (index > 0) digits.createSpan({ cls: "kalendae-clock-colon", text: ":" });

      const button = digits.createEl("button", {
        cls: "kalendae-clock-digit",
        text: unitText(each, time, shape),
        attr: { tabindex: "-1", "aria-label": t(UNIT_LABELS[each]) },
      });
      button.toggleClass("kalendae-clock-active", each === unit);
      button.addEventListener("click", () => {
        unit = each;
        render();
      });
    });

    if (am && pm) {
      const words = meridiemWords(time, token, options.locale);
      fillMeridiem(am, words.am, vocabulary);
      fillMeridiem(pm, words.pm, vocabulary);
      am.toggleClass("kalendae-clock-active", time.hour < 12);
      pm.toggleClass("kalendae-clock-active", time.hour >= 12);
    }

    drawDial();
    preview(pending());
  }

  function drawDial(): void {
    dial.empty();
    dial.createSvg("circle", { cls: "kalendae-clock-face", attr: { r: 100 } });

    const hand = handOf(unit, time, shape);
    const [x, y] = pointAt(hand.degrees, hand.inner ? INNER : OUTER);
    dial.createSvg("line", { cls: "kalendae-clock-hand", attr: { x1: 0, y1: 0, x2: x, y2: y } });
    dial.createSvg("circle", { cls: "kalendae-clock-pivot", attr: { r: 3 } });
    dial.createSvg("circle", { cls: "kalendae-clock-knob", attr: { cx: x, cy: y, r: KNOB } });

    const current = dialValue(unit, time, shape);
    for (const mark of marksFor(unit, shape)) {
      const [markX, markY] = pointAt(mark.degrees, mark.inner ? INNER : OUTER);
      const text = dial.createSvg("text", {
        cls: "kalendae-clock-mark",
        attr: { x: markX, y: markY, "font-size": mark.inner ? INNER_TEXT : OUTER_TEXT },
      });
      text.textContent = mark.label;
      text.toggleClass("kalendae-clock-mark-inner", mark.inner);
      text.toggleClass("kalendae-clock-mark-on", mark.value === current);
    }
  }

  // Pointer capture keeps the hand following a drag that leaves the dial, and
  // the release still settles the unit wherever it lands.
  let dragging = false;

  const aim = (event: PointerEvent) => {
    const box = dial.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * 2 - 1;
    const y = ((event.clientY - box.top) / box.height) * 2 - 1;
    time = withDialValue(unit, pointToValue(unit, shape, snap, x, y), time, shape);
    render();
  };

  dial.addEventListener("pointerdown", (event) => {
    // Also stops the mousedown that would take focus off the panel.
    event.preventDefault();
    dial.setPointerCapture(event.pointerId);
    dragging = true;
    aim(event);
  });
  dial.addEventListener("pointermove", (event) => {
    if (dragging) aim(event);
  });
  dial.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    dragging = false;
    aim(event);

    // On to the next unit, Material's way; the last one waits for OK.
    const units = unitsOf(shape, snap);
    const next = units[units.indexOf(unit) + 1];
    if (next !== undefined) {
      unit = next;
      render();
    }
  });
  dial.addEventListener("pointercancel", () => {
    dragging = false;
  });

  // A click keeps the keyboard on the panel, so the arrows go on working after
  // the mouse has been used. Tab still reaches every control.
  dom.addEventListener("mousedown", (event) => {
    if (event.target !== dom) event.preventDefault();
  });

  dom.tabIndex = -1;
  dom.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      options.onClose();
      return;
    }

    // A control reached with Tab answers its own keys: Enter on Cancel is
    // Cancel, not OK as well.
    if (event.target !== dom) return;

    const units = unitsOf(shape, snap);
    const index = units.indexOf(unit);

    switch (event.key) {
      case "ArrowUp":
        time = stepped(unit, time, 1, snap);
        break;
      case "ArrowDown":
        time = stepped(unit, time, -1, snap);
        break;
      case "ArrowLeft":
        unit = units[Math.max(0, index - 1)];
        break;
      case "ArrowRight":
        unit = units[Math.min(units.length - 1, index + 1)];
        break;
      case "Enter":
        event.preventDefault();
        confirm();
        return;
      default:
        return;
    }

    event.preventDefault();
    render();
  });

  render();

  return { dom, focus: () => dom.focus() };
}

/**
 * A half of the AM/PM toggle: the word for this hour, over every word the
 * language has, hidden. They share one grid cell, so the button is as wide as
 * the longest word and does not jump when the hour changes `ночі` to `ранку`.
 */
function fillMeridiem(button: HTMLElement, word: string, vocabulary: string[]): void {
  button.empty();
  button.createSpan({ cls: "kalendae-clock-word", text: word });
  for (const each of vocabulary) {
    button.createSpan({ cls: "kalendae-clock-sizer", text: each, attr: { "aria-hidden": "true" } });
  }
}

/** A point on the dial at a clock angle and a radius, in the SVG's units. */
function pointAt(degrees: number, radius: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  const round = (value: number) => Math.round(value * 100) / 100;

  return [round(radius * Math.sin(radians)), round(-radius * Math.cos(radians))];
}
```

- [ ] **Step 3: Add the styles**

Append to `styles.css`, after the last `.kalendae-panel` calendar rule:

```css
/* The time picker. The calendar's shell — `.kalendae-panel` gives it border,
   shadow, padding and the footer — with the big numbers and a dial in place of
   the month. The dial is SVG: every position on it is an attribute, set from
   code, so nothing here places a number. */

.kalendae-panel .kalendae-clock-top {
  align-items: center;
  display: flex;
  gap: var(--size-4-2);
  justify-content: center;
  margin-bottom: var(--size-2-3);
}

.kalendae-panel .kalendae-clock-digits {
  align-items: center;
  display: flex;
  font-size: calc(var(--font-ui-large) * 2);
  font-variant-numeric: tabular-nums;
}

.kalendae-panel .kalendae-clock-digit {
  background-color: var(--background-secondary);
  border: none;
  border-radius: var(--radius-m);
  box-shadow: none;
  color: var(--text-normal);
  cursor: pointer;
  font-size: inherit;
  height: auto;
  padding: var(--size-2-1) var(--size-4-2);
}

.kalendae-panel .kalendae-clock-digit:hover {
  background-color: var(--background-modifier-hover);
}

.kalendae-panel .kalendae-clock-digit.kalendae-clock-active {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}

.kalendae-panel .kalendae-clock-colon {
  color: var(--text-muted);
  padding: 0 var(--size-2-1);
}

.kalendae-panel .kalendae-clock-meridiem {
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.kalendae-panel .kalendae-clock-meridiem-option {
  background-color: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
  color: var(--text-muted);
  cursor: pointer;
  display: grid;
  font-size: var(--font-ui-small);
  height: auto;
  padding: var(--size-2-2) var(--size-4-2);
}

.kalendae-panel .kalendae-clock-meridiem-option + .kalendae-clock-meridiem-option {
  border-top: 1px solid var(--background-modifier-border);
}

.kalendae-panel .kalendae-clock-meridiem-option.kalendae-clock-active {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}

/* The word and every word the language has, stacked in one cell: the cell is
   the longest one's width, and only the word is seen. */
.kalendae-panel .kalendae-clock-meridiem-option > span {
  grid-area: 1 / 1;
  text-align: center;
}

.kalendae-panel .kalendae-clock-sizer {
  visibility: hidden;
}

.kalendae-panel .kalendae-clock-dial {
  cursor: pointer;
  display: block;
  margin: 0 auto;
  /* A drag on a touch screen turns the hand rather than scrolling the note. */
  touch-action: none;
  width: 16em;
}

.kalendae-panel .kalendae-clock-face {
  fill: var(--background-secondary);
}

.kalendae-panel .kalendae-clock-hand {
  stroke: var(--interactive-accent);
  stroke-width: 2;
}

.kalendae-panel .kalendae-clock-pivot,
.kalendae-panel .kalendae-clock-knob {
  fill: var(--interactive-accent);
}

/* Size comes from the element's font-size attribute, in the dial's own units;
   a size here would be in the page's and would not scale with the dial. */
.kalendae-panel .kalendae-clock-mark {
  dominant-baseline: central;
  fill: var(--text-normal);
  pointer-events: none;
  text-anchor: middle;
}

.kalendae-panel .kalendae-clock-mark-inner {
  fill: var(--text-muted);
}

.kalendae-panel .kalendae-clock-mark-on {
  fill: var(--text-on-accent);
}

/* Zero width with a full minimum, as the footer does: the dial sets the
   panel's width, and a long translation of Snap or Cancel wraps rather than
   widening it. */
.kalendae-panel .kalendae-clock-controls {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-4-2);
  margin-top: var(--size-2-3);
  min-width: 100%;
  width: 0;
}

.kalendae-panel .kalendae-clock-snap {
  align-items: center;
  color: var(--text-muted);
  display: flex;
  gap: var(--size-2-2);
  margin-inline-end: auto;
}
```

- [ ] **Step 4: Verify**

Run: `npm run build` then `npm test`
Expected: both succeed. `createSvg` is Obsidian's global DOM helper (already used in `src/settings/hover-page.ts`); if the type checker rejects a numeric `attr` value, convert that value with `String(...)` rather than changing the approach. If lint flags `"OK"` under `obsidianmd/ui/sentence-case`, add `"OK"` to that rule's `acronyms` in `eslint.config.mjs` and say so in the report.

---

### Task 4: The temporary command

**Files:**
- Create: `src/editor/clock-tooltip.ts`
- Modify: `src/editor/DatePickerExtension.ts` (add the extension to the list)
- Modify: `src/main.ts` (register the command)
- Modify: `src/i18n/locales/en.json` (`commands.tryTimePicker`)

**Interfaces:**
- Consumes: `createClock`, `ClockOptions` (Task 3); `TimeValue`, `timeOf` (Task 1); `editorViewIn` from `src/editor/DatePickerExtension.ts`.
- Produces: `clockTooltip(getSettings: () => KalendaeSettings): Extension` and `tryClock(view: EditorView): void`.

- [ ] **Step 1: Add the string**

In `src/i18n/locales/en.json`, inside `"commands"`, after `"pickDate"`:

```json
    "tryTimePicker_comment": "Command palette entry. Temporary: opens the time picker on the current time so its look can be checked, and changes nothing in the note.",
    "tryTimePicker": "Try the time picker"
```

- [ ] **Step 2: Write the tooltip**

Create `src/editor/clock-tooltip.ts`:

```ts
import { Extension, StateEffect, StateField } from "@codemirror/state";
import { EditorView, Tooltip, showTooltip } from "@codemirror/view";
import { createClock } from "../picker/clock";
import { TimeValue, timeOf } from "../picker/clock-math";
import { KalendaeSettings } from "../settings";

/**
 * TEMPORARY. Opens the time picker at the caret, so it can be seen and tuned in
 * a vault before anything detects a time. Deleted, with its command, once
 * detection opens the picker for real.
 *
 * Each run takes the current time in a pattern and a language picked at random,
 * so a few runs show every shape: 24 and 12 hours, leading zeros or not,
 * seconds or not, and AM/PM words from two letters to six.
 *
 * OK and Now write nothing. The preview line already shows what would go in.
 */

const PATTERNS = ["HH:mm", "H:mm", "HH:mm:ss", "h:mm a", "hh:mm A", "h:mm:ss a"];
const LOCALES = ["en", "uk", "zh-cn", "ja", "tr"];

interface ClockTarget {
  pos: number;
  time: TimeValue;
  pattern: string;
  locale: string;
}

const openClock = StateEffect.define<ClockTarget>();
const closeClock = StateEffect.define<null>();

const openAt = StateField.define<ClockTarget | null>({
  create: () => null,

  update(current, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(openClock)) return effect.value;
      if (effect.is(closeClock)) return null;
    }

    return transaction.docChanged ? null : current;
  },
});

export function clockTooltip(getSettings: () => KalendaeSettings): Extension {
  return [
    openAt,
    showTooltip.compute([openAt], (state) => {
      const target = state.field(openAt);
      return target === null ? null : tooltipFor(target, getSettings());
    }),
  ];
}

export function tryClock(view: EditorView): void {
  view.dispatch({
    effects: openClock.of({
      pos: view.state.selection.main.head,
      time: timeOf(new Date()),
      pattern: pick(PATTERNS),
      locale: pick(LOCALES),
    }),
  });
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function tooltipFor(target: ClockTarget, settings: KalendaeSettings): Tooltip {
  return {
    pos: target.pos,
    above: false,
    arrow: false,
    create: (view) => {
      const close = () => {
        view.dispatch({ effects: closeClock.of(null) });
        view.focus();
      };

      const clock = createClock({
        value: target.time,
        pattern: target.pattern,
        locale: target.locale,
        settings,
        onPick: close,
        onClose: close,
      });

      const outside = (event: MouseEvent) => {
        if (!clock.dom.contains(event.target as Node)) close();
      };

      return {
        dom: clock.dom,
        mount: () => {
          clock.focus();
          view.dom.ownerDocument.addEventListener("mousedown", outside, true);
        },
        destroy: () => view.dom.ownerDocument.removeEventListener("mousedown", outside, true),
      };
    },
  };
}
```

- [ ] **Step 3: Compose it into the editor extension**

In `src/editor/DatePickerExtension.ts`, add the import:

```ts
import { clockTooltip } from "./clock-tooltip";
```

and in the array returned by `datePickerExtension`, directly after `pickerTooltip(getSettings),`:

```ts
    // Temporary, with its command; see clock-tooltip.ts.
    clockTooltip(getSettings),
```

- [ ] **Step 4: Register the command**

In `src/main.ts`, add the import:

```ts
import { tryClock } from "./editor/clock-tooltip";
```

and in `onload()`, directly after the `pick-date` `addCommand` call:

```ts
    // Temporary, with clock-tooltip.ts.
    this.addCommand({
      id: "try-time-picker",
      name: t("commands.tryTimePicker"),
      editorCallback: (_editor, ctx) => {
        const view = ctx instanceof MarkdownView ? editorViewIn(ctx.contentEl) : null;
        if (!view) {
          new Notice(t("notices.noEditor"));
          return;
        }

        tryClock(view);
      },
    });
```

- [ ] **Step 5: Verify the build and that CodeMirror stayed external**

Run: `npm run build` then `npm test`
Expected: both succeed.

Run: `grep -o 'require("@codemirror/[a-z]*")' main.js | sort -u` and `grep -c "class EditorView" main.js`
Expected: `language`, `state`, `view` listed; the count is `0`.

---

### Task 5: Manual checklist and a run in the vault

**Files:**
- Create: `docs/manual-tests/2026-10-03-clock-dial.md`

- [ ] **Step 1: Write the checklist**

Create `docs/manual-tests/2026-10-03-clock-dial.md`:

```markdown
# Clock dial — manual tests

Everything here starts from the command palette: **Kalendae: Try the time picker**, with the cursor
anywhere in a note. Each run opens on the current time in a pattern and language picked at random;
run it again until you get the one a case needs. The preview line under the dial shows what would be
written — nothing is written.

**Run with `npm run dev` going and Hot Reload installed**, or restart Obsidian after `npm run build`.

**The cases are numbered straight through.** Say "7 is wrong" and I will know which one you mean.

---

## Shapes

1. `HH:mm` — two rings: 1–12 outside with 12 at the top, 13–23 inside with 00 at the top. No AM/PM.
2. `H:mm` before 10 o'clock — the big hour has no leading zero (`9`), the minutes do (`05`).
3. `h:mm a` — one ring, 12 at the top, an AM/PM toggle in lowercase.
4. `hh:mm A` — the toggle in uppercase, the big hour padded (`02`).
5. `HH:mm:ss` with Snap unticked — three big numbers. Ticked — two.
6. Ukrainian, 12-hour — the toggle shows the word for this hour on each side (`ночі`/`дня` at 2,
   `ранку`/`вечора` at 9). Step the hour across 4, 12 and 17: the toggle never changes width.
7. Chinese, 12-hour — the same, with six words.

## Pointer

8. Press on an hour and drag around the dial — the hand and the big hour follow. Release — the dial
   switches to minutes.
9. On the 24-hour dial, press near the centre at 3 o'clock — 15. Near the edge — 3.
10. Snap ticked, drag through minutes — the hand lands on fives. Unticked — every minute.
11. Start a drag on the dial and release outside the panel — the hand follows to the end, the unit
    settles, and the panel stays open.
12. With seconds, release on minutes — the dial moves to seconds. Release on seconds — it stays.
13. Click the big minutes, then the big hour — the dial switches unit each time.
14. Click PM at 2 AM — the hour shows 2 PM, on the same spot on the dial.

## Keyboard

15. Up and Down — the active unit steps by one hour, or 5 / 1 minutes as Snap says.
16. Snap ticked on an odd minute (untick, set 37, tick) — Up goes to 40, Down to 35.
17. Hours: Up past 11 AM — 12 PM. Up past 23 — 00.
18. Minutes: Up past 55 (or 59) — 00, and the hour does not change.
19. Left and Right — move between the big numbers, stopping at the ends.
20. With the seconds unit active, tick Snap — seconds disappear and minutes are active.
21. Enter — closes (OK). Escape — closes (Cancel).
22. Tab to Cancel, press Enter — closes as Cancel; nothing else fires.
23. After clicking Snap or AM/PM with the mouse, the arrow keys still work.

## Footer

24. Hover Now — the preview shows the current time, exact to the minute (and second, if the pattern
    has them), even with Snap ticked. Leave — it goes back to the dial's time.
25. Preview off in settings ("Preview the new date") — no preview line; Now still there.
26. OK without touching anything — closes; the preview had shown the original time unchanged.
27. Opened on a time with seconds, Snap ticked, change the minute — the preview's seconds read `00`.

## Looks

28. Light theme and dark theme — the face, hand, knob, numbers and toggle all follow the theme.
29. Larger interface font (Settings → Appearance) — the panel grows with it and nothing overlaps.
30. Cursor on the last lines of a long note, near the bottom of the window — the panel flips above.
31. Next to the calendar (open both in turn) — same border, shadow, footer and spacing.

## Setting

32. Settings → Times → **Snap minutes to 5** off — the picker opens with Snap unticked. Ticking it in
    the picker and reopening — unticked again; the setting has not changed.
```

- [ ] **Step 2: Run the full verification**

Run: `npm run build` then `npm test`
Expected: both succeed.

- [ ] **Step 3: Hand over**

Tell Vitaly the panel is ready to try, point him at the checklist, and list every file changed. Do not commit. Do not run `npm run release-check` and do not touch the other locales — that waits for him to call the English final.

---

### Task 6 (only after Vitaly calls the English final): Translations

**Files:**
- Modify: every file in `src/i18n/locales/` except `en.json` and `sample_lang.json` — `de`, `es`, `et`, `fr`, `ja`, `ko`, `lt`, `lv`, `pt`, `ru`, `uk`, `zh`.

- [ ] **Step 1: Translate the new keys**

Add, in each locale, exactly the keys added to `en.json` in Tasks 2–4 (`commands.tryTimePicker`, `settings.times.heading`, `settings.snapMinutes.name`, `settings.snapMinutes.desc`, `picker.now`, `picker.clock.*`), translated, without the `_comment` keys if the locale files omit them (match what the file already does).

- [ ] **Step 2: Verify**

Run: `npm run release-check`
Expected: validate-translations, build and tests all pass.

- [ ] **Step 3: Propose the commit**

Show Vitaly the message, a `type: Subject` line and two or three product-level bullets, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Wait for an explicit yes.
