import { TASK_MARKERS, markerBefore } from "../../src/detect/markers";

/**
 * The rule behind the Tasks-emoji affordance: a date with one of the plugin's
 * six date emoji in front of it is offered through that emoji instead of
 * through an icon of ours.
 *
 * Pure text, like the rest of `scan.ts` — the emoji is a marker whoever typed
 * it, so nothing here asks whether the Tasks plugin is installed.
 */

/** Where the date sits in each of these, by construction. */
const DATE = "2026-09-12";

function markerIn(text: string): number | null {
  return markerBefore(text, text.indexOf(DATE));
}

describe("markerBefore", () => {
  it("finds every one of the Tasks plugin's date emoji", () => {
    for (const emoji of TASK_MARKERS) {
      expect(markerIn(`- [ ] Write up ${emoji} ${DATE}`)).not.toBeNull();
    }
  });

  it("names the six the plugin puts in front of a date, and no others", () => {
    // Created, start, scheduled, due, done, cancelled. The rest of the Tasks
    // vocabulary — recurrence, priorities, ids, dependencies — carries
    // something other than a date, so none of it marks one.
    expect([...TASK_MARKERS]).toEqual(["➕", "🛫", "⏳", "📅", "✅", "❌"]);
  });

  it("reports the offset the emoji itself starts at", () => {
    const text = `- [ ] Write up 📅 ${DATE}`;
    const at = markerIn(text);

    expect(at).not.toBeNull();
    expect(text.slice(at as number)).toBe(`📅 ${DATE}`);
  });

  it("takes the space between emoji and date in with it", () => {
    // The gap is part of the target, never a gap beside it: pixels belonging to
    // neither half are what made the hover affordance flicker.
    const text = `due 📅   ${DATE}`;
    expect(text.slice(markerIn(text) as number, text.indexOf(DATE))).toBe("📅   ");
  });

  it("accepts a date written straight after the emoji", () => {
    expect(markerIn(`due 📅${DATE}`)).not.toBeNull();
  });

  it("accepts a tab between the two", () => {
    expect(markerIn(`due 📅\t${DATE}`)).not.toBeNull();
  });

  it("accepts the emoji some keyboards type with a variation selector", () => {
    const text = `due ➕️ ${DATE}`;
    expect(text.slice(markerIn(text) as number)).toBe(`➕️ ${DATE}`);
  });

  it("accepts an emoji opening the line", () => {
    expect(markerIn(`📅 ${DATE}`)).toBe(0);
  });

  it("ignores a Tasks emoji that carries something other than a date", () => {
    expect(markerIn(`- [ ] Water the plants 🔁 every day 🔼 ${DATE}`)).toBeNull();
  });

  it("ignores an emoji with a word between it and the date", () => {
    expect(markerIn(`📅 deadline ${DATE}`)).toBeNull();
  });

  it("ignores an emoji on the line before", () => {
    expect(markerIn(`📅\n${DATE}`)).toBeNull();
  });

  it("finds nothing in front of a date that opens the text", () => {
    expect(markerIn(DATE)).toBeNull();
  });

  it("does not lend one emoji to the date after the pair it marks", () => {
    const text = `📅 ${DATE} 2026-09-20`;
    expect(markerBefore(text, text.indexOf("2026-09-20"))).toBeNull();
  });

  it("marks each date on a line with its own emoji", () => {
    const text = `- [ ] Write up 🛫 ${DATE} 📅 2026-09-20`;

    expect(text.slice(markerIn(text) as number)).toBe(`🛫 ${DATE} 📅 2026-09-20`);
    expect(text.slice(markerBefore(text, text.indexOf("2026-09-20")) as number)).toBe(
      "📅 2026-09-20",
    );
  });
});
