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
    expect(rulesFromWords("twelve days")).toEqual(["+12d", "-12d"]);
  });

  it("takes the direction from the end as well as the front", () => {
    expect(rulesFromWords("3 months ago")).toEqual(["-3M"]);
    expect(rulesFromWords("2 weeks back")).toEqual(["-2w"]);
    expect(rulesFromWords("3 fridays ago")).toEqual(["-3Fri"]);
  });

  it("offers both ways when nothing says which way", () => {
    expect(rulesFromWords("3 weeks")).toEqual(["+3w", "-3w"]);
    expect(rulesFromWords("3 months")).toEqual(["+3M", "-3M"]);

    // A lead or a trail settles it, and the pair collapses to the one asked for.
    expect(rulesFromWords("in 3 weeks")).toEqual(["+3w"]);
    expect(rulesFromWords("3 weeks ago")).toEqual(["-3w"]);

    // A subject with no count keeps its one row: `friday` has next and last
    // beside it in the list already.
    expect(rulesFromWords("friday")).toEqual(["Fri"]);
  });

  it("pairs each subject in turn, rather than all the ons then all the backs", () => {
    expect(rulesFromWords("3 m")).toEqual(["+3M", "-3M", "+3Mon", "-3Mon"]);
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
  });

  it("completes a trail while it is being typed", () => {
    expect(rulesFromWords("3 weeks a")).toEqual(["-3w"]);
    expect(rulesFromWords("3 weeks ag")).toEqual(["-3w"]);
    expect(rulesFromWords("2 weeks b")).toEqual(["-2w"]);
  });

  it("has no word for forward, because none is needed", () => {
    // `from now` was dropped: a count with no direction already offers both
    // ways, so it only ever said what the list was showing anyway.
    expect(rulesFromWords("3 weeks from now")).toEqual([]);
    expect(rulesFromWords("3 weeks f")).toEqual([]);
  });

  it("reads a lone s as a letter into a day, not as a plural", () => {
    expect(rulesFromWords("next s")).toEqual(["+1Sun", "+1Sat"]);
    expect(rulesFromWords("in 3 s")).toEqual(["+3Sun", "+3Sat"]);
    expect(rulesFromWords("s")).toEqual(["Sun", "Sat"]);
  });

  it("lets a trail qualify a subject that has neither count nor lead", () => {
    expect(rulesFromWords("week ago")).toEqual(["-1w"]);
    expect(rulesFromWords("friday ago")).toEqual(["-1Fri"]);
  });

  it("refuses a trail that fights the lead in front of it", () => {
    expect(rulesFromWords("in 3 weeks a")).toEqual([]);
    expect(rulesFromWords("next friday ago")).toEqual([]);
  });

  it("answers a number word from two letters on", () => {
    expect(rulesFromWords("in th weeks")).toEqual(["+3w"]);
    expect(rulesFromWords("in thr weeks")).toEqual(["+3w"]);
    expect(rulesFromWords("in three weeks")).toEqual(["+3w"]);

    // One letter is two, ten and twelve at once, so it names no count.
    expect(rulesFromWords("in t weeks")).toEqual([]);
  });

  it("reads a trail only after a phrase that is already whole", () => {
    // `f` could begin `from now`, but `3` names no subject to put it after —
    // so the only reading left is three Fridays.
    expect(rulesFromWords("in 3 f")).toEqual(["+3Fri"]);
    expect(rulesFromWords("3 a")).toEqual([]);
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
    expect(rulesFromWords("this ")).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });

  it("is not a sentence parser", () => {
    expect(rulesFromWords("")).toEqual([]);
    expect(rulesFromWords("the friday after the sprint review")).toEqual([]);
    expect(rulesFromWords("lunch")).toEqual([]);
    expect(rulesFromWords("in three lunches")).toEqual([]);
  });
});
