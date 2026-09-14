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
    expect(normaliseStoredQuickDates([{ preset: "endOfThisMonth" }])[0]).toEqual({
      preset: "endOfThisMonth",
    });
    expect(normaliseStoredQuickDates([{ preset: "endOfThisMonth", alias: "EOM" }])[0]).toEqual({
      preset: "endOfThisMonth",
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
      { preset: "endOfThisWeek" },
      { preset: "endOfThisMonth" },
      null,
    ]);
    expect(DEFAULT_SETTINGS.showQuickDates).toBe(true);
  });
});
