import { readFileSync } from "fs";
import { join } from "path";
import { scanText } from "../../src/detect/scan";
import { DEFAULT_SETTINGS } from "../../src/settings";

/**
 * Guards the counts printed at the top of the manual test note. The note tells
 * the reader to expect exact numbers; if a detection rule changes and nobody
 * updates the note, it stops being a test and starts being a lie.
 *
 * Only the pure layer runs here, so the scope rejections are not counted — the
 * note's 9 of those need a real vault. 26 pure hits minus those 9 is the 17 the
 * note promises, and 5 + 8 + 9 is its 22.
 */
const note = readFileSync(join(__dirname, "../fixtures/manual-test-note.md"), "utf8");

describe("the manual test note", () => {
  const results = scanText(note, DEFAULT_SETTINGS.formats);

  it("holds the 26 candidates the pure scanner should accept before scope is applied", () => {
    expect(results.filter((c) => c.accepted)).toHaveLength(26);
  });

  it("rejects 5 as impossible calendar dates", () => {
    expect(results.filter((c) => c.reason === "not-a-date")).toHaveLength(5);
  });

  it("rejects 8 for being glued to neighbouring text", () => {
    expect(results.filter((c) => c.reason === "boundary")).toHaveLength(8);
  });

  it("offers a date in every kind of emphasis the note writes it in", () => {
    // Five spellings on the two emphasis lines, and the underscore pair is the
    // reason the section exists: they were the ones being missed.
    const emphasised = results.filter(
      (c) => c.accepted && /^[*_~]/.test(note.slice(Math.max(0, c.from - 2), c.from).trim()),
    );

    expect(emphasised.length).toBeGreaterThanOrEqual(5);
  });
});
