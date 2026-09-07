import {
  DEFAULT_SETTINGS,
  TRIGGER_MODES,
  TriggerMode,
  normaliseStoredFormats,
  reorderById,
} from "../src/settings";

describe("settings defaults", () => {
  it("defaults the trigger to a mode the dropdown actually offers", () => {
    expect(TRIGGER_MODES).toContain(DEFAULT_SETTINGS.trigger);
  });

  it("lists every trigger mode exactly once", () => {
    const expected: TriggerMode[] = ["hover-icon", "double-click", "both"];
    expect([...TRIGGER_MODES].sort()).toEqual([...expected].sort());
    expect(new Set(TRIGGER_MODES).size).toBe(TRIGGER_MODES.length);
  });
});

describe("reorderById", () => {
  const formats = [
    { id: "a", pattern: "YYYY-MM-DD" },
    { id: "b", pattern: "DD.MM.YYYY" },
    { id: "c", pattern: "D MMMM YYYY" },
  ];

  it("puts the formats in the order the ids give", () => {
    expect(reorderById(formats, ["c", "a", "b"])?.map((entry) => entry.id)).toEqual(["c", "a", "b"]);
  });

  it("moves a row up without dragging its neighbour down with it", () => {
    // The bug this replaced: the row landed one place from where it was dropped.
    expect(reorderById(formats, ["b", "a", "c"])?.map((entry) => entry.id)).toEqual(["b", "a", "c"]);
  });

  it("hands back the very same list when nothing moved", () => {
    expect(reorderById(formats, ["a", "b", "c"])).toBe(formats);
  });

  it("refuses an order that is not a permutation, rather than dropping a format", () => {
    expect(reorderById(formats, ["a", "b"])).toBeNull();
    expect(reorderById(formats, ["a", "b", "zz"])).toBeNull();
    expect(reorderById(formats, ["a", "b", "b"])).toBeNull();
  });

  it("tells a refusal apart from a drag that changed nothing", () => {
    // Both used to hand back the same list. The caller redraws on one and does
    // nothing on the other, and a refusal left undrawn shows the user an order
    // the settings never took.
    expect(reorderById(formats, ["a", "b", "c"])).not.toBeNull();
    expect(reorderById(formats, ["a", "b", "b"])).toBeNull();
  });
});

describe("normaliseStoredFormats", () => {
  it("keeps the first of two entries sharing an id", () => {
    // A duplicate id makes a drag unresolvable and points a row's delete button
    // at a different format, so the list must never hold one.
    const kept = normaliseStoredFormats([
      { id: "iso", pattern: "YYYY-MM-DD" },
      { id: "iso", pattern: "DD.MM.YYYY" },
    ]);

    expect(kept).toEqual([{ id: "iso", pattern: "YYYY-MM-DD" }]);
  });

  it("drops the retired enabled:false entries and keeps the rest in order", () => {
    const kept = normaliseStoredFormats([
      { id: "a", pattern: "YYYY-MM-DD" },
      { id: "b", pattern: "DD.MM.YYYY", enabled: false },
      { id: "c", pattern: "D MMMM YYYY" },
    ]);

    expect(kept.map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  it("falls back to the default rather than an empty list", () => {
    expect(normaliseStoredFormats([])).toEqual(DEFAULT_SETTINGS.formats);
    expect(normaliseStoredFormats("nonsense")).toEqual(DEFAULT_SETTINGS.formats);
  });
});
