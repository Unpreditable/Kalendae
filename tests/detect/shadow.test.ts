import { shadowedFormats, SHADOW_DATES } from "../../src/detect/shadow";
import { TOKEN_GROUPS, renderExample } from "../../src/detect/formats";

const iso = { id: "iso", pattern: "YYYY-MM-DD" };
const isoWeekday = { id: "iso-weekday", pattern: "YYYY-MM-DD (ddd)" };
const wide = { id: "wide", pattern: "DD/MM/YYYY" };
const narrow = { id: "narrow", pattern: "D/M/YYYY" };

describe("shadowedFormats", () => {
  it("says nothing about formats that cannot collide", () => {
    expect(shadowedFormats([iso, wide]).size).toBe(0);
  });

  it("never marks the first format, which nothing can be above", () => {
    expect(shadowedFormats([iso, isoWeekday]).has("iso")).toBe(false);
  });

  it("tells a format to move up when moving it up would settle it", () => {
    // Every date the weekday format writes contains a bare date the plain one
    // claims first. Lift it above and both work, so moving is the answer.
    expect(shadowedFormats([iso, isoWeekday]).get("iso-weekday")).toEqual({
      kind: "move",
      by: "YYYY-MM-DD",
    });
  });

  it("leaves the weekday format alone when it sits above", () => {
    // The plain format still wins on dates with no weekday in them, and those
    // are the only dates it writes.
    expect(shadowedFormats([isoWeekday, iso]).size).toBe(0);
  });

  it("calls a pair that splits the dates shared, and asks for nothing", () => {
    // "13/12/2026" is claimed above; "1/3/2026" is not, because DD needs two.
    // Both formats do real work, so there is nothing to fix.
    expect(shadowedFormats([wide, narrow]).get("narrow")).toEqual({
      kind: "shared",
      by: "DD/MM/YYYY",
    });
  });

  it("never tells an ambiguous pair to act, whichever way round it sits", () => {
    // MM/DD and DD/MM each claim every date the other cannot read. Moving
    // either up only hands the problem to the other, so neither is told to.
    const mdy = { id: "mdy", pattern: "MM/DD/YYYY" };
    const dmy = { id: "dmy", pattern: "DD/MM/YYYY" };
    expect(shadowedFormats([mdy, dmy]).get("dmy")).toEqual({ kind: "shared", by: "MM/DD/YYYY" });
    expect(shadowedFormats([dmy, mdy]).get("mdy")).toEqual({ kind: "shared", by: "DD/MM/YYYY" });
  });

  it("tells the wider format to move up when the narrower swallows it", () => {
    // D reads "01" as happily as "1", so D/M/YYYY takes everything. Lifting
    // DD/MM/YYYY above it leaves D/M/YYYY sharing rather than smothered, so
    // moving is worth doing.
    expect(shadowedFormats([narrow, wide]).get("wide")).toEqual({
      kind: "move",
      by: "D/M/YYYY",
    });
  });

  it("asks for a duplicate to be removed, not moved", () => {
    // Swapping the two would only put the same warning on the other one.
    const copy = { id: "copy", pattern: "YYYY-MM-DD" };
    expect(shadowedFormats([iso, copy]).get("copy")).toEqual({
      kind: "remove",
      by: "YYYY-MM-DD",
    });
  });

  it("says nothing about a format that cannot be compiled at all", () => {
    const broken = { id: "broken", pattern: "YYYY-QQ" };
    expect(shadowedFormats([iso, broken]).has("broken")).toBe(false);
  });
});

describe("the sample dates", () => {
  it("crosses both month widths with both day widths", () => {
    const widths = SHADOW_DATES.map((on) => [
      renderExample("M", on).length,
      renderExample("D", on).length,
    ]);
    for (const pair of [
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ]) {
      expect(widths).toContainEqual(pair);
    }
  });

  it("covers every ordinal ending, the teens included", () => {
    const endings = new Set(SHADOW_DATES.map((on) => renderExample("Do", on).slice(-2)));
    expect(endings).toEqual(new Set(["st", "nd", "rd", "th"]));
    expect(SHADOW_DATES.map((on) => renderExample("Do", on))).toContain("13th");
  });

  it("has a date for every token group, so a new one cannot slip in unexercised", () => {
    // Guards the assumption the set is built on: these are the axes the
    // vocabulary varies on. A group added without thinking about its widths
    // fails here rather than silently going untested.
    expect(TOKEN_GROUPS.map((group) => group.key)).toEqual(["year", "month", "day", "weekday"]);
  });
});
