import { stepClashes } from "../../src/settings/step-clash";

/**
 * Which commands hold the same keys as the date steps, and so take them first.
 * The hotkey lists are written the way Obsidian stores them: `Mod` is Ctrl off
 * a Mac and Cmd on one.
 */

const moveLine = {
  name: "Move line up",
  hotkeys: [{ modifiers: ["Alt" as const], key: "ArrowUp" }],
};
const toggle = {
  name: "Toggle checkbox status",
  hotkeys: [{ modifiers: ["Mod" as const], key: "ArrowDown" }],
};

describe("stepClashes", () => {
  it("names the command holding the chosen key, with its arrow", () => {
    expect(stepClashes("alt", false, [moveLine, toggle])).toEqual([
      { arrow: "up", command: "Move line up" },
    ]);
  });

  it("reads Mod as Ctrl off a Mac", () => {
    expect(stepClashes("ctrl", false, [moveLine, toggle])).toEqual([
      { arrow: "down", command: "Toggle checkbox status" },
    ]);
  });

  it("reads Mod as Cmd on a Mac, which no step key uses", () => {
    expect(stepClashes("alt", true, [toggle])).toEqual([]);
  });

  it("needs the modifiers to match exactly, not merely include the chosen one", () => {
    const shifted = {
      name: "Copy line up",
      hotkeys: [{ modifiers: ["Alt" as const, "Shift" as const], key: "ArrowUp" }],
    };

    expect(stepClashes("alt", false, [shifted])).toEqual([]);
    expect(stepClashes("ctrl-alt", false, [moveLine])).toEqual([]);
  });

  it("matches Ctrl and Alt together in either order", () => {
    const both = {
      name: "Rotate",
      hotkeys: [{ modifiers: ["Alt" as const, "Ctrl" as const], key: "ArrowDown" }],
    };

    expect(stepClashes("ctrl-alt", false, [both])).toEqual([{ arrow: "down", command: "Rotate" }]);
  });

  it("finds nothing when the steps are switched off", () => {
    expect(stepClashes("off", false, [moveLine, toggle])).toEqual([]);
  });
});
