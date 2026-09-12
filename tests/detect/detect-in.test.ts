import { EditorState } from "@codemirror/state";
import { detectIn } from "../../src/detect/detect";
import { DEFAULT_SETTINGS } from "../../src/settings";

/**
 * The entry point the editor uses, as opposed to the one the report command
 * uses. It scans a range rather than a note, because a view plugin is asked
 * about what it renders — and CodeMirror has already parsed that far, so this
 * one has no parse budget and no partial answer to report.
 */

const doc = ["First 2026-01-01 line", "Second 2026-02-02 line", "Third 2026-03-03 line"].join("\n");

function accepted(from: number, to: number): string[] {
  const state = EditorState.create({ doc });
  return detectIn(state, DEFAULT_SETTINGS, from, to)
    .filter((detection) => detection.accepted)
    .map((detection) => detection.text);
}

describe("detectIn", () => {
  it("finds only the dates in the given range", () => {
    const secondLine = doc.indexOf("Second");
    expect(accepted(secondLine, secondLine + 6)).toEqual(["2026-02-02"]);
  });

  it("reports absolute document offsets, not offsets into the slice", () => {
    const state = EditorState.create({ doc });
    const thirdLine = doc.indexOf("Third");
    const [detection] = detectIn(state, DEFAULT_SETTINGS, thirdLine, doc.length).filter(
      (candidate) => candidate.accepted,
    );
    expect(doc.slice(detection.from, detection.to)).toBe("2026-03-03");
  });

  it("finds a date the range cuts through, by widening to whole lines", () => {
    // A viewport ends where the screen ends, which is no respecter of dates.
    const cut = doc.indexOf("2026-02-02") + 4;
    expect(accepted(doc.indexOf("Second"), cut)).toEqual(["2026-02-02"]);
  });

  it("finds every date when handed the whole document", () => {
    expect(accepted(0, doc.length)).toEqual(["2026-01-01", "2026-02-02", "2026-03-03"]);
  });

  it("keeps the rejections, so the same reasons reach the editor", () => {
    const state = EditorState.create({ doc: "Version 2026-02-30 is not a date." });
    const rejected = detectIn(state, DEFAULT_SETTINGS, 0, 33).filter(
      (detection) => !detection.accepted,
    );
    expect(rejected.map((detection) => detection.reason)).toEqual(["not-a-date"]);
  });

  it("reports a marker offset in document coordinates, like every other offset", () => {
    // The scan works on a slice of the note, so every offset it hands back has
    // to be moved — and a marker left in slice coordinates would point the
    // emoji's click target at a spot earlier in the note.
    const marked = ["First line", "- [ ] Write up 📅 2026-02-02"].join("\n");
    const state = EditorState.create({ doc: marked });
    const second = marked.indexOf("- [ ]");
    const [detection] = detectIn(state, DEFAULT_SETTINGS, second, marked.length).filter(
      (candidate) => candidate.accepted,
    );

    expect(marked.slice(detection.markerFrom as number)).toBe("📅 2026-02-02");
  });
});
