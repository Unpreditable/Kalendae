import { readFileSync } from "fs";
import { join } from "path";
import { scanText } from "../../src/detect/scan";
import { DEFAULT_SETTINGS } from "../../src/settings";

/**
 * Drives `tests/fixtures/detection-corpus.md` through the pure scanner under
 * the shipped defaults. The same file is the manual test note: open it in a
 * vault and run the report command, and the console table should agree with
 * what is asserted here for every section outside code, frontmatter and links,
 * which only the syntax tree can judge.
 */

const corpus = readFileSync(join(__dirname, "../fixtures/detection-corpus.md"), "utf8");

/** The body of one `## ` section, by heading. */
function section(heading: string): string {
  const body = corpus.split(`## ${heading}\n`)[1];
  if (body === undefined) throw new Error(`corpus has no section "${heading}"`);
  return body.split("\n## ")[0];
}

function acceptedIn(heading: string): string[] {
  return scanText(section(heading), DEFAULT_SETTINGS.formats)
    .filter((candidate) => candidate.accepted)
    .map((candidate) => candidate.text);
}

describe("the detection corpus, under the shipped defaults", () => {
  it("recognises every date in the prose section that should be recognised", () => {
    expect(acceptedIn("Prose — should be recognised")).toEqual([
      "2024-03-22",
      "2024-03-22",
      "2024-04-05",
      "2024-02-29",
      "2024-03-22",
      "2024-03-22",
      "2024-03-22",
      "2024-03-22",
    ]);
  });

  it("recognises nothing in the prose section that should be rejected", () => {
    expect(acceptedIn("Prose — should not be recognised")).toEqual([]);
  });

  it("gives a reason for every rejection, so the report can explain itself", () => {
    const rejected = scanText(
      section("Prose — should not be recognised"),
      DEFAULT_SETTINGS.formats,
    ).filter((candidate) => !candidate.accepted);

    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected.every((candidate) => candidate.reason !== undefined)).toBe(true);
  });

  it("leaves the non-ISO formats alone, since a fresh install has only ISO", () => {
    // The one hit is the ISO date inside "2024-03-22 (Fri)" — the date part is
    // genuinely ISO, and the bracketed weekday is simply not part of the match.
    expect(acceptedIn("Other formats — off by default")).toEqual(["2024-03-22"]);
  });
});
