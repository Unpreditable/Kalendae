import { meridiemStyleOf, styleMeridiem } from "../../src/detect/meridiem";

/**
 * How a note spells am/pm, read off a time and put back on another. The
 * promise is the plugin's own: editing a time never restyles it.
 */

describe("meridiemStyleOf", () => {
  it("reads the plain pair in either case", () => {
    expect(meridiemStyleOf("2:05 pm")).toEqual({ upper: false, dots: false, short: false });
    expect(meridiemStyleOf("2:05 PM")).toEqual({ upper: true, dots: false, short: false });
    expect(meridiemStyleOf("2:05am")).toEqual({ upper: false, dots: false, short: false });
  });

  it("reads the dotted form", () => {
    expect(meridiemStyleOf("2:05 p.m.")).toEqual({ upper: false, dots: true, short: false });
    expect(meridiemStyleOf("2:05 A.M.")).toEqual({ upper: true, dots: true, short: false });
  });

  it("reads the single letter", () => {
    expect(meridiemStyleOf("2:05p")).toEqual({ upper: false, dots: false, short: true });
    expect(meridiemStyleOf("2:05A")).toEqual({ upper: true, dots: false, short: true });
  });

  it("reads one in front of the time", () => {
    expect(meridiemStyleOf("PM 2:05")).toEqual({ upper: true, dots: false, short: false });
  });

  it("is nothing for a time without the English pair", () => {
    expect(meridiemStyleOf("14:05")).toBeNull();
    expect(meridiemStyleOf("9:00 вечора")).toBeNull();
    expect(meridiemStyleOf("午後 2:00")).toBeNull();
    expect(meridiemStyleOf("2:00 ös")).toBeNull();
  });
});

describe("styleMeridiem", () => {
  it("writes either half in the style it is given", () => {
    expect(styleMeridiem("pm", { upper: false, dots: false, short: false })).toBe("pm");
    expect(styleMeridiem("am", { upper: true, dots: false, short: false })).toBe("AM");
    expect(styleMeridiem("am", { upper: true, dots: true, short: false })).toBe("A.M.");
    expect(styleMeridiem("pm", { upper: false, dots: true, short: false })).toBe("p.m.");
    expect(styleMeridiem("pm", { upper: false, dots: false, short: true })).toBe("p");
    expect(styleMeridiem("am", { upper: true, dots: false, short: true })).toBe("A");
  });

  it("round-trips every spelling", () => {
    for (const text of ["pm", "PM", "p.m.", "P.M.", "p", "P"]) {
      const style = meridiemStyleOf(`2:05${text}`);
      expect(style).not.toBeNull();
      expect(styleMeridiem("pm", style!)).toBe(text);
    }
  });
});
