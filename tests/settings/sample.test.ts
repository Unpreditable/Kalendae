import { SAMPLE_TEXT, sampleHighlights } from "../../src/settings/sample";
import { DEFAULT_SETTINGS, KalendaeSettings } from "../../src/settings";

function settings(overrides: Partial<KalendaeSettings> = {}): KalendaeSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

/** The highlighted substrings, paired with what kind of highlight they got. */
function marks(config: KalendaeSettings): Array<[string, string]> {
  return sampleHighlights(config).map((h) => [SAMPLE_TEXT.slice(h.from, h.to), h.kind]);
}

describe("the settings sample", () => {
  it("contains a date in every section the toggles cover", () => {
    // Without one of each, flipping a toggle would change nothing visible and
    // the sample would teach the user nothing.
    const kinds = sampleHighlights(settings({ ...allScopesOn() })).length;

    expect(kinds).toBe(6);
  });

  it("marks the body text and heading dates under the shipped defaults", () => {
    // Headings ship on, unlike every other section: a dated heading in a log
    // is an ordinary thing to want to edit.
    expect(marks(settings())).toEqual([
      ["2026-09-06", "skipped"],
      ["2026-09-07", "detected"],
      ["2026-09-14", "detected"],
      ["2026-09-01", "skipped"],
      ["2026-09-20", "skipped"],
      ["2026-09-28", "skipped"],
    ]);
  });

  it("drops the heading date when headings are switched off", () => {
    expect(marks(settings({ scopeHeadings: false }))[1]).toEqual(["2026-09-07", "skipped"]);
  });

  it("promotes the frontmatter date when frontmatter is switched on", () => {
    const result = marks(settings({ scopeFrontmatter: true }));

    expect(result[0]).toEqual(["2026-09-06", "detected"]);
    expect(result[3]).toEqual(["2026-09-01", "skipped"]);
  });

  it("promotes the wikilink date when wikilinks are switched on", () => {
    expect(marks(settings({ scopeWikilinks: true })).at(-1)).toEqual(["2026-09-28", "detected"]);
  });

  it("distinguishes inline code from a fenced block", () => {
    const inlineOnly = marks(settings({ scopeInlineCode: true }));

    expect(inlineOnly[3]).toEqual(["2026-09-01", "detected"]);
    expect(inlineOnly[4]).toEqual(["2026-09-20", "skipped"]);
  });

  it("marks nothing at all when no format can read the sample", () => {
    expect(marks(settings({ formats: [{ id: "dmy", pattern: "DD.MM.YYYY" }] }))).toEqual([]);
  });

  it("returns highlights in document order", () => {
    const offsets = sampleHighlights(settings(allScopesOn())).map((h) => h.from);

    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });
});

function allScopesOn(): Partial<KalendaeSettings> {
  return {
    scopeHeadings: true,
    scopeFrontmatter: true,
    scopeInlineCode: true,
    scopeCodeBlocks: true,
    scopeWikilinks: true,
  };
}
