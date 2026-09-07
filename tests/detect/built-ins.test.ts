import { moment } from "obsidian";
import { BUILT_IN_FORMATS, checkFormat } from "../../src/detect/formats";
import { scanText } from "../../src/detect/scan";

describe("BUILT_IN_FORMATS", () => {
  it("gives every entry a unique id", () => {
    const ids = BUILT_IN_FORMATS.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lists ISO first, so the catalogue leads with the unambiguous format", () => {
    expect(BUILT_IN_FORMATS[0].id).toBe("iso");
  });

  it.each(BUILT_IN_FORMATS.map((entry) => [entry.id, entry.pattern]))(
    "compiles %s (%s) without complaint",
    (_id, pattern) => {
      expect(checkFormat(pattern)).toBeNull();
    },
  );

  it.each(BUILT_IN_FORMATS.map((entry) => [entry.id, entry.pattern]))(
    "round-trips a real date through %s (%s)",
    (id, pattern) => {
      const written = moment.utc("2026-09-06", "YYYY-MM-DD").format(pattern);
      const entries = [{ id, pattern }];

      const hits = scanText(written, entries).filter((c) => c.accepted);

      expect(hits.map((c) => c.text)).toEqual([written]);
    },
  );
});
