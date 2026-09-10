import { moment } from "obsidian";
import { BUILT_IN_FORMATS } from "../../src/detect/formats";
import { scanText } from "../../src/detect/scan";
import { replacementFor, stillThere } from "../../src/picker/write";

/**
 * What gets written into the note. The promise being tested is the plugin's
 * whole differentiator: a date is rewritten in the format it was already
 * written in, so editing one never restyles the note.
 */

const wednesday = { year: 2026, month: 8, day: 9 };

describe("replacementFor", () => {
  it("writes an ISO date back as an ISO date", () => {
    expect(replacementFor("YYYY-MM-DD", wednesday)).toBe("2026-09-09");
  });

  it("keeps a note's own style, whatever that style is", () => {
    expect(replacementFor("DD.MM.YYYY", wednesday)).toBe("09.09.2026");
    expect(replacementFor("MM/DD/YY", wednesday)).toBe("09/09/26");
    expect(replacementFor("D MMMM YYYY", wednesday)).toBe("9 September 2026");
    expect(replacementFor("dddd, MMMM D, YYYY", wednesday)).toBe("Wednesday, September 9, 2026");
  });

  it("recomputes a weekday rather than carrying the old one over", () => {
    // The date in the note was a Sunday; the day picked is a Wednesday. A
    // format that spells the weekday out has to say so.
    expect(replacementFor("YYYY-MM-DD (ddd)", wednesday)).toBe("2026-09-09 (Wed)");
  });

  it("round-trips every built-in format through detection", () => {
    for (const entry of BUILT_IN_FORMATS) {
      const written = replacementFor(entry.pattern, wednesday);
      const candidates = scanText(written, [entry]);

      expect(candidates[0]?.accepted).toBe(true);
      expect(candidates[0].text).toBe(written);
      expect(moment.utc(written, entry.pattern, true).format("YYYY-MM-DD")).toBe("2026-09-09");
    }
  });
});

describe("stillThere", () => {
  const doc = "Due 2026-09-06 today";

  it("confirms the text at the range is the date that was detected", () => {
    expect(stillThere(doc, 4, 14, "2026-09-06")).toBe(true);
  });

  it("refuses when the range slid", () => {
    expect(stillThere(doc, 5, 15, "2026-09-06")).toBe(false);
  });

  it("refuses when the text changed under it", () => {
    expect(stillThere(doc, 4, 14, "2026-09-07")).toBe(false);
  });

  it("refuses a range past the end of the note", () => {
    expect(stillThere(doc, 40, 50, "2026-09-06")).toBe(false);
  });
});
