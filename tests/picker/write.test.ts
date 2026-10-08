import { moment } from "obsidian";
import { BUILT_IN_FORMATS } from "../../src/detect/formats";
import { scanText } from "../../src/detect/scan";
import {
  insertionFor,
  replacementFor,
  stillThere,
  timeInsertionFor,
  timeReplacementFor,
} from "../../src/picker/write";

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

/**
 * What the command writes when there was no date to edit. The promise is that
 * whatever it writes, the scanner finds again — a date inserted mid-word would
 * otherwise be a date the plugin could never edit.
 */
describe("insertionFor", () => {
  const iso = "YYYY-MM-DD";

  it("writes the date alone where the caret already has room", () => {
    expect(insertionFor("Due ", 4, 4, iso, wednesday)).toBe("2026-09-09");
  });

  it("writes the date alone after punctuation, which the rule allows", () => {
    expect(insertionFor("Due:", 4, 4, iso, wednesday)).toBe("2026-09-09");
  });

  it("separates the date from a word the caret sits inside", () => {
    expect(insertionFor("backupfinal", 6, 6, iso, wednesday)).toBe(" 2026-09-09 ");
  });

  it("separates the date from an underscore that joins it to a word", () => {
    // backup_2026-09-09 is one filename-shaped token, not a date in prose.
    expect(insertionFor("backup_", 7, 7, iso, wednesday)).toBe(" 2026-09-09");
  });

  it("leaves the underscores of emphasis alone, which are not a word", () => {
    expect(insertionFor("__", 2, 2, iso, wednesday)).toBe("2026-09-09");
  });

  it("separates the date from a dot with a digit beyond it", () => {
    // 2026-09-09.5 is the numbered-list case the boundary rule rejects.
    expect(insertionFor(".5", 0, 0, iso, wednesday)).toBe("2026-09-09 ");
  });

  it("needs nothing in an empty note", () => {
    expect(insertionFor("", 0, 0, iso, wednesday)).toBe("2026-09-09");
  });

  it("pads nothing when replacing a date that was detected where it sits", () => {
    // An existing date passed the boundary rule to be found at all, so the
    // editing case goes on writing exactly the string it always wrote.
    const doc = "Due 2026-09-06 today";

    expect(insertionFor(doc, 4, 14, iso, wednesday)).toBe(replacementFor(iso, wednesday));
  });

  it("writes a date the scanner finds again, however hostile the spot", () => {
    const spots = [
      ["backup", "final"],
      ["backup_", ""],
      ["", ".5"],
      ["Due:", ""],
      ["", ""],
      ["v1", "2"],
    ];

    for (const [before, after] of spots) {
      const at = before.length;
      const written = before + insertionFor(before + after, at, at, iso, wednesday) + after;
      const found = scanText(written, [{ id: "iso", pattern: iso }]).filter((c) => c.accepted);

      expect(found.map((c) => c.text)).toEqual(["2026-09-09"]);
    }
  });
});

describe("writing back in the language a date was read in", () => {
  it("keeps Russian rather than translating the note into the app's language", () => {
    const day = { year: 2026, month: 9, day: 7 };

    // No locale: the app's language, which is what every caller wanted before
    // a date could be read in some other one.
    expect(replacementFor("D MMMM YYYY", day)).toBe("7 October 2026");
    // Read in Russian, written in Russian — and declined, as Russian writes a
    // month inside a date.
    expect(replacementFor("D MMMM YYYY", day, "ru")).toBe("7 октября 2026");
    expect(replacementFor("D MMMM YYYY", day, "lv")).toBe("7 oktobris 2026");
  });

  it("leaves a pattern with no month name alone", () => {
    const day = { year: 2026, month: 9, day: 7 };

    expect(replacementFor("YYYY-MM-DD", day, "ru")).toBe("2026-10-07");
  });
});

describe("writing a time", () => {
  const half = { hour: 16, minute: 30, second: 0 };

  it("keeps the note's format", () => {
    expect(timeReplacementFor("HH:mm", half)).toBe("16:30");
    expect(timeReplacementFor("h:mm a", half, "en")).toBe("4:30 pm");
    expect(timeReplacementFor("HH:mm:ss", { ...half, second: 9 })).toBe("16:30:09");
  });

  it("keeps the note's am/pm spelling", () => {
    expect(timeReplacementFor("h:mma", half, "en", { upper: false, dots: false, short: true })).toBe(
      "4:30p",
    );
    expect(timeReplacementFor("h:mm a", half, "en", { upper: true, dots: true, short: false })).toBe(
      "4:30 P.M.",
    );
  });

  it("pads a side that would glue a new time to a word", () => {
    expect(timeInsertionFor("call at", 7, 7, "HH:mm", half)).toBe(" 16:30");
    expect(timeInsertionFor("at  ok", 3, 3, "HH:mm", half)).toBe("16:30");
    expect(timeInsertionFor("atok", 2, 2, "HH:mm", half)).toBe(" 16:30 ");
  });
});
