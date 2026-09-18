import { triggerAt } from "../../src/typing/trigger";

/**
 * The word-start rule, with no editor in sight: offsets are within one line,
 * because Obsidian hands a suggester one line and one caret at a time.
 */

describe("triggerAt", () => {
  it("fires at the start of a line", () => {
    expect(triggerAt("@tom", 4, "@")).toEqual({ from: 0, query: "tom" });
  });

  it("fires after a space", () => {
    expect(triggerAt("due @eom", 8, "@")).toEqual({ from: 4, query: "eom" });
  });

  it("fires after an opening bracket or a quote", () => {
    expect(triggerAt("(@1d", 4, "@")).toEqual({ from: 1, query: "1d" });
    expect(triggerAt("[@1d", 4, "@")).toEqual({ from: 1, query: "1d" });
    expect(triggerAt("{@1d", 4, "@")).toEqual({ from: 1, query: "1d" });
    expect(triggerAt('"@1d', 4, "@")).toEqual({ from: 1, query: "1d" });
    expect(triggerAt("'@1d", 4, "@")).toEqual({ from: 1, query: "1d" });
  });

  it("counts a tab as the whitespace it is", () => {
    expect(triggerAt("due	@eom", 8, "@")).toEqual({ from: 4, query: "eom" });
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
