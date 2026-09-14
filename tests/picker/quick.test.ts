import {
  QUICK_PRESETS,
  Rule,
  RuleContext,
  checkRule,
  formatRule,
  parseRule,
  presetById,
  presetsAnchoredOn,
  resolveRule,
  suggestionsFor,
  tokenAt,
} from "../../src/picker/quick";
import { DayKey } from "../../src/picker/month";

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
    firstDay: 1,
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
        firstDay: 1,
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
    expect(on(wednesday, "today EoW", { firstDay: 0 })).toEqual({
      year: 2026,
      month: 8,
      day: 19,
    });
    expect(on(wednesday, "today SoW")).toEqual(monday);
    expect(on(wednesday, "today SoW", { firstDay: 0 })).toEqual({
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

describe("the catalogue", () => {
  it("offers eighteen presets", () => {
    expect(QUICK_PRESETS).toHaveLength(18);
  });

  it("gives every preset a rule the parser accepts", () => {
    for (const preset of QUICK_PRESETS) {
      expect([preset.id, parseRule(preset.rule)]).not.toEqual([preset.id, null]);
    }
  });

  it("gives every preset a distinct id", () => {
    expect(new Set(QUICK_PRESETS.map((preset) => preset.id)).size).toBe(QUICK_PRESETS.length);
  });

  it("splits the catalogue between the two anchors, losing none of it", () => {
    const today = presetsAnchoredOn("today");
    const date = presetsAnchoredOn("date");
    expect(today.length + date.length).toBe(QUICK_PRESETS.length);

    for (const preset of today) expect(parseRule(preset.rule)?.anchor).toBe("today");
    for (const preset of date) expect(parseRule(preset.rule)?.anchor).toBe("date");
  });

  it("finds a preset by id, and nothing by a made-up one", () => {
    expect(presetById("endOfThisMonth")?.rule).toBe("today EoM");
    expect(presetById("endOfNothing")).toBeUndefined();
  });
});

describe("checkRule", () => {
  it("says nothing about a rule that reads", () => {
    expect(checkRule("today +2Mon EoM")).toBeNull();
  });

  it("calls an empty field empty rather than wrong", () => {
    expect(checkRule("")).toEqual({ kind: "empty" });
    expect(checkRule("   ")).toEqual({ kind: "empty" });
  });

  it("names a missing anchor", () => {
    expect(checkRule("+1d")).toEqual({ kind: "anchor", token: "+1d" });
  });

  it("names an anchor with nothing to do", () => {
    expect(checkRule("today")).toEqual({ kind: "steps" });
  });

  it("answers minutes with the rule about M", () => {
    expect(checkRule("today +15m")).toEqual({ kind: "minutes", token: "+15m" });
  });

  it("names a time as a time", () => {
    expect(checkRule("today EoD")).toEqual({ kind: "reserved", token: "EoD" });
    expect(checkRule("today +2h")).toEqual({ kind: "reserved", token: "+2h" });
  });

  it("names a unit wearing the wrong sign or count", () => {
    expect(checkRule("today +Mon")).toEqual({ kind: "count", token: "+Mon" });
    expect(checkRule("today 2Mon")).toEqual({ kind: "count", token: "2Mon" });
    expect(checkRule("today +0d")).toEqual({ kind: "count", token: "+0d" });
    expect(checkRule("today +1000d")).toEqual({ kind: "count", token: "+1000d" });
  });

  it("falls back to naming the token", () => {
    expect(checkRule("today +1x")).toEqual({ kind: "token", token: "+1x" });
    expect(checkRule("today eom")).toEqual({ kind: "token", token: "eom" });
  });

  it("reports the first problem and stops", () => {
    expect(checkRule("today +1x +2y")).toEqual({ kind: "token", token: "+1x" });
  });
});

describe("tokenAt", () => {
  it("takes the token the caret is inside", () => {
    expect(tokenAt("today +1w SoW", 8)).toEqual({ text: "+1w", from: 6, to: 9, index: 1 });
  });

  it("takes the anchor when the caret is in it, wherever in it", () => {
    expect(tokenAt("today +1w", 0)).toMatchObject({ text: "today", index: 0 });
    expect(tokenAt("today +1w", 5)).toMatchObject({ text: "today", index: 0 });
  });

  it("takes the token a caret against a space is touching", () => {
    expect(tokenAt("today +1w", 6)).toMatchObject({ text: "+1w", index: 1 });
  });

  it("reads an empty token at the end of a finished rule", () => {
    expect(tokenAt("today +1w ", 10)).toEqual({ text: "", from: 10, to: 10, index: 2 });
  });
});

describe("suggestionsFor", () => {
  it("offers the two anchors, and nothing else, at the start", () => {
    expect(suggestionsFor("", 0)).toEqual(["today", "date"]);
    expect(suggestionsFor("t", 1)).toEqual(["today"]);
  });

  it("offers both anchors when the caret rests in a finished one", () => {
    expect(suggestionsFor("today +1w", 3)).toEqual(["today", "date"]);
    expect(suggestionsFor("date +1w", 2)).toEqual(["today", "date"]);
  });

  it("offers the alternatives to a finished step, not just the step itself", () => {
    const instead = suggestionsFor("today EoM", 8);
    expect(instead).toContain("EoM");
    expect(instead).toContain("EoW");
    expect(instead).toContain("+1d");
  });

  it("offers steps once there is an anchor", () => {
    const steps = suggestionsFor("today ", 6);
    expect(steps).toContain("+1d");
    expect(steps).toContain("EoM");
    expect(steps).toContain("Mon");
    expect(steps).not.toContain("today");
  });

  it("carries the sign and count already typed", () => {
    expect(suggestionsFor("today +3", 8)).toContain("+3w");
    expect(suggestionsFor("today +3", 8)).toContain("+3Mon");
    expect(suggestionsFor("today -2", 8)).toContain("-2M");
    expect(suggestionsFor("today +3", 8)).not.toContain("+1w");
  });

  it("defaults the count to one", () => {
    expect(suggestionsFor("today +", 7)).toContain("+1d");
  });

  it("matches without caring about case, and offers the right one", () => {
    expect(suggestionsFor("today eo", 8)).toEqual(["EoW", "EoM", "EoQ", "EoY"]);
  });

  it("completes the token under the caret, not the last one", () => {
    expect(suggestionsFor("today So +1w", 8)).toEqual(["SoW", "SoM", "SoQ", "SoY"]);
  });
});
