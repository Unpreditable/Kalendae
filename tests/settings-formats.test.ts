import { BUILT_IN_FORMATS } from "../src/detect/formats";
import { DEFAULT_SETTINGS, normaliseStoredFormats } from "../src/settings";

describe("normaliseStoredFormats", () => {
  it("gives a fresh install the default list", () => {
    expect(normaliseStoredFormats(undefined)).toEqual(DEFAULT_SETTINGS.formats);
  });

  it("starts a fresh install with ISO and nothing else", () => {
    expect(DEFAULT_SETTINGS.formats).toEqual([{ id: "iso", pattern: "YYYY-MM-DD" }]);
  });

  it("keeps the user's order and patterns", () => {
    const stored = [
      { id: "slash-mdy", pattern: "MM/DD/YYYY" },
      { id: "iso", pattern: "YYYY-MM-DD" },
    ];

    expect(normaliseStoredFormats(stored)).toEqual(stored);
  });

  it("never appends a built-in the user has not added", () => {
    const stored = [{ id: "iso", pattern: "YYYY-MM-DD" }];

    // Presence is now what makes a format active, so appending on upgrade
    // would silently switch a format on behind the user's back.
    expect(normaliseStoredFormats(stored)).toEqual(stored);
  });

  it("keeps a custom format the user added", () => {
    const custom = { id: "custom-1", pattern: "DD MMM YYYY" };

    expect(normaliseStoredFormats([custom])).toEqual([custom]);
  });

  describe("upgrading from the enabled-flag shape", () => {
    it("drops a format that was switched off", () => {
      const stored = [
        { id: "iso", pattern: "YYYY-MM-DD", enabled: true },
        { id: "dot-dmy", pattern: "DD.MM.YYYY", enabled: false },
      ];

      expect(normaliseStoredFormats(stored)).toEqual([{ id: "iso", pattern: "YYYY-MM-DD" }]);
    });

    it("keeps a format that was switched on, without the flag", () => {
      const stored = [{ id: "iso", pattern: "YYYY-MM-DD", enabled: true }];

      expect(normaliseStoredFormats(stored)).toEqual([{ id: "iso", pattern: "YYYY-MM-DD" }]);
    });
  });

  describe("guaranteeing a usable list", () => {
    it("falls back to the default when every stored entry is dropped", () => {
      const stored = [{ id: "dot-dmy", pattern: "DD.MM.YYYY", enabled: false }];

      expect(normaliseStoredFormats(stored)).toEqual(DEFAULT_SETTINGS.formats);
    });

    it("falls back to the default for an empty list", () => {
      expect(normaliseStoredFormats([])).toEqual(DEFAULT_SETTINGS.formats);
    });

    it("drops entries that are not shaped like a format", () => {
      const stored = [{ id: "iso", pattern: "YYYY-MM-DD" }, null, { id: 7 }, "nope"];

      expect(normaliseStoredFormats(stored)).toEqual([{ id: "iso", pattern: "YYYY-MM-DD" }]);
    });
  });

  it("offers every built-in as something that can be added", () => {
    expect(BUILT_IN_FORMATS.length).toBeGreaterThan(1);
    expect(BUILT_IN_FORMATS.every((entry) => !("enabled" in entry))).toBe(true);
  });
});
