import { DEFAULT_SETTINGS, TRIGGER_MODES, TriggerMode } from "../src/settings";

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
