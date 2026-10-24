import { caretHintApplies, touches } from "../../src/editor/caret-hint-rule";

describe("caretHintApplies", () => {
  it("shows only on a device with no hover when set to touch screens", () => {
    expect(caretHintApplies("touch", false)).toBe(true);
    expect(caretHintApplies("touch", true)).toBe(false);
  });

  it("shows everywhere when set to everywhere", () => {
    expect(caretHintApplies("always", true)).toBe(true);
    expect(caretHintApplies("always", false)).toBe(true);
  });
});

describe("touches", () => {
  it("counts both ends of the range", () => {
    expect(touches(10, 10, 20)).toBe(true);
    expect(touches(20, 10, 20)).toBe(true);
    expect(touches(15, 10, 20)).toBe(true);
  });

  it("does not count a position one past either end", () => {
    expect(touches(9, 10, 20)).toBe(false);
    expect(touches(21, 10, 20)).toBe(false);
  });
});
