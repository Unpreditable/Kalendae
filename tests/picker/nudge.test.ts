import { moment } from "obsidian";
import { setDetectionLocales, tokenSpans } from "../../src/detect/formats";
import { meridiemStyleOf } from "../../src/detect/meridiem";
import { nudge, nudgeTime, partAt, stepDay } from "../../src/picker/nudge";

/**
 * The arrow keys on a date, with no editor in sight: which part the caret is
 * on, what one step does to it, and where the caret lands afterwards. Months
 * are 0-based throughout, matching moment, so February is 1 and March is 2.
 */

describe("tokenSpans", () => {
  it("places every token of an ISO date", () => {
    expect(tokenSpans("2026-10-09", "YYYY-MM-DD")).toEqual([
      { token: "YYYY", from: 0, to: 4 },
      { token: "MM", from: 5, to: 7 },
      { token: "DD", from: 8, to: 10 },
    ]);
  });

  it("measures a month name by the word the text holds", () => {
    expect(tokenSpans("March 22, 2024", "MMMM D, YYYY")).toEqual([
      { token: "MMMM", from: 0, to: 5 },
      { token: "D", from: 6, to: 8 },
      { token: "YYYY", from: 10, to: 14 },
    ]);
  });

  it("is null for text the pattern does not cover whole", () => {
    expect(tokenSpans("2026-10-09 and more", "YYYY-MM-DD")).toBeNull();
  });
});

describe("partAt", () => {
  const iso = tokenSpans("2026-10-09", "YYYY-MM-DD") ?? [];

  it.each([
    [0, "YYYY"],
    [2, "YYYY"],
    [4, "YYYY"],
    [5, "MM"],
    [6, "MM"],
    [7, "MM"],
    [8, "DD"],
    [9, "DD"],
    [10, "DD"],
  ])("puts a caret at %i on %s", (offset, token) => {
    expect(iso[partAt(iso, offset) ?? -1]?.token).toBe(token);
  });

  it("takes the part on the left where two parts touch with nothing between them", () => {
    const run = tokenSpans("20261009", "YYYYMMDD") ?? [];

    expect(run[partAt(run, 6) ?? -1]?.token).toBe("MM");
    expect(run[partAt(run, 4) ?? -1]?.token).toBe("YYYY");
  });

  it("finds nothing on a separator no part touches", () => {
    const weekday = tokenSpans("2026-10-09 (Fri)", "YYYY-MM-DD (ddd)") ?? [];

    expect(partAt(weekday, 11)).toBeNull();
  });
});

describe("stepDay", () => {
  it("carries a day step into the next month and the next year", () => {
    expect(stepDay({ year: 2026, month: 9, day: 31 }, "day", 1, 31).day).toEqual({
      year: 2026,
      month: 10,
      day: 1,
    });
    expect(stepDay({ year: 2026, month: 11, day: 31 }, "day", 1, 31).day).toEqual({
      year: 2027,
      month: 0,
      day: 1,
    });
  });

  it("carries a month step across the year", () => {
    expect(stepDay({ year: 2026, month: 11, day: 15 }, "month", 1, 15).day).toEqual({
      year: 2027,
      month: 0,
      day: 15,
    });
    expect(stepDay({ year: 2026, month: 0, day: 15 }, "month", -1, 15).day).toEqual({
      year: 2025,
      month: 11,
      day: 15,
    });
  });

  it("makes the day it lands on the day meant, for a day step", () => {
    expect(stepDay({ year: 2026, month: 0, day: 30 }, "day", 1, 12).meant).toBe(31);
  });

  /** Each step feeding the next, the way repeated presses do. */
  const chain = (from: { year: number; month: number; day: number }, part: "month" | "year", steps: number) => {
    const days = [from];
    let meant = from.day;
    for (let i = 0; i < steps; i += 1) {
      const next = stepDay(days[days.length - 1], part, 1, meant);
      days.push(next.day);
      meant = next.meant;
    }
    return days.map((day) => day.day);
  };

  it("comes back to the 30th after a short February", () => {
    expect(chain({ year: 2026, month: 0, day: 30 }, "month", 4)).toEqual([30, 28, 30, 30, 30]);
  });

  it("keeps a month-end a month-end", () => {
    expect(chain({ year: 2026, month: 0, day: 31 }, "month", 4)).toEqual([31, 28, 31, 30, 31]);
  });

  it("comes back to a leap day four years on", () => {
    expect(chain({ year: 2028, month: 1, day: 29 }, "year", 4)).toEqual([29, 28, 28, 28, 29]);
  });
});

describe("nudge", () => {
  it("steps the day under the caret and leaves the caret where it was", () => {
    expect(nudge("2026-10-09", "YYYY-MM-DD", undefined, 10, 1)).toEqual({
      text: "2026-10-10",
      caret: 10,
      meant: 10,
    });
  });

  it("steps the month in a dotted date", () => {
    expect(nudge("22.03.2024", "DD.MM.YYYY", undefined, 4, -1)?.text).toBe("22.02.2024");
  });

  it("steps a month written as a word", () => {
    expect(nudge("March 22, 2024", "MMMM D, YYYY", undefined, 2, 1)?.text).toBe(
      "April 22, 2024",
    );
  });

  it("keeps a caret at the end of a month name at the end of the next one", () => {
    const step = nudge("February 10, 2026", "MMMM D, YYYY", undefined, 8, 1);

    expect(step?.text).toBe("March 10, 2026");
    expect(step?.caret).toBe(5);
  });

  it("keeps a caret inside a month name inside the next one, cut to its length", () => {
    // "Septem|ber" is six letters in; "October" has room, "May" does not.
    expect(nudge("September 1, 2026", "MMMM D, YYYY", undefined, 6, 1)?.caret).toBe(6);
    expect(nudge("April 1, 2026", "MMMM D, YYYY", undefined, 4, 1)?.caret).toBe(3);
  });

  it("follows a one-digit day that grows to two", () => {
    expect(nudge("9/3/2026", "D/M/YYYY", undefined, 1, 1)).toEqual({
      text: "10/3/2026",
      caret: 2,
      meant: 10,
    });
  });

  it("steps the day when the caret is on the weekday, and writes the new weekday", () => {
    expect(nudge("2026-10-09 (Fri)", "YYYY-MM-DD (ddd)", undefined, 13, 1)?.text).toBe(
      "2026-10-10 (Sat)",
    );
  });

  it("clamps to the day meant rather than the day written", () => {
    expect(nudge("2026-02-28", "YYYY-MM-DD", undefined, 6, 1, 30)?.text).toBe("2026-03-30");
  });

  it("turns a two-digit year over", () => {
    expect(nudge("12/31/99", "MM/DD/YY", undefined, 8, 1)?.text).toBe("12/31/00");
  });

  it("is null when the caret touches no part", () => {
    expect(nudge("2026-10-09 (Fri)", "YYYY-MM-DD (ddd)", undefined, 11, 1)).toBeNull();
  });

  describe("in a language that declines its months", () => {
    const locale = moment.locale();

    afterEach(() => {
      moment.locale(locale);
      setDetectionLocales(["en"]);
    });

    it("reads the in-date spelling and writes the next month the same way", () => {
      setDetectionLocales(["en", "uk"]);

      expect(nudge("6 вересня 2026", "D MMMM YYYY", "uk", 4, 1)?.text).toBe("6 жовтня 2026");
    });
  });
});

describe("nudgeTime", () => {
  it("steps the hour under the caret and leaves the caret where it was", () => {
    expect(nudgeTime("14:05", "HH:mm", undefined, undefined, 1, 1)).toEqual({
      text: "15:05",
      caret: 1,
    });
  });

  it("steps the minute by one", () => {
    expect(nudgeTime("14:32", "HH:mm", undefined, undefined, 4, 1)?.text).toBe("14:33");
    expect(nudgeTime("14:32", "HH:mm", undefined, undefined, 4, -1)?.text).toBe("14:31");
  });

  it("carries a minute step into the hour", () => {
    expect(nudgeTime("14:59", "HH:mm", undefined, undefined, 5, 1)?.text).toBe("15:00");
    expect(nudgeTime("15:00", "HH:mm", undefined, undefined, 5, -1)?.text).toBe("14:59");
  });

  it("carries a second step into the minute and the hour", () => {
    expect(nudgeTime("14:59:59", "HH:mm:ss", undefined, undefined, 8, 1)?.text).toBe("15:00:00");
  });

  it("leaves the seconds alone on a minute step", () => {
    expect(nudgeTime("14:32:47", "HH:mm:ss", undefined, undefined, 4, 1)?.text).toBe("14:33:47");
  });

  it("wraps at midnight, having no day to carry into", () => {
    expect(nudgeTime("23:59", "HH:mm", undefined, undefined, 5, 1)?.text).toBe("00:00");
    expect(nudgeTime("00:00", "HH:mm", undefined, undefined, 5, -1)?.text).toBe("23:59");
    expect(nudgeTime("23:05", "HH:mm", undefined, undefined, 1, 1)?.text).toBe("00:05");
  });

  it("crosses noon on an hour step", () => {
    expect(nudgeTime("11:30 am", "h:mm a", undefined, undefined, 1, 1)?.text).toBe("12:30 pm");
    expect(nudgeTime("12:30 pm", "h:mm a", undefined, undefined, 1, -1)?.text).toBe("11:30 am");
  });

  it("switches the half of the day on am/pm, whichever key it was", () => {
    expect(nudgeTime("2:05 pm", "h:mm a", undefined, undefined, 6, 1)?.text).toBe("2:05 am");
    expect(nudgeTime("2:05 pm", "h:mm a", undefined, undefined, 6, -1)?.text).toBe("2:05 am");
    expect(nudgeTime("2:05 am", "h:mm a", undefined, undefined, 6, 1)?.text).toBe("2:05 pm");
  });

  it("keeps the note's spelling of am/pm", () => {
    const dotted = meridiemStyleOf("11:05 P.M.") ?? undefined;
    const short = meridiemStyleOf("2:05p") ?? undefined;

    expect(nudgeTime("11:05 P.M.", "h:mm a", undefined, dotted, 1, 1)?.text).toBe("12:05 A.M.");
    expect(nudgeTime("2:05p", "h:mma", undefined, short, 5, 1)?.text).toBe("2:05a");
  });

  it("follows an hour that changes width", () => {
    expect(nudgeTime("9:05", "H:mm", undefined, undefined, 1, 1)).toEqual({
      text: "10:05",
      caret: 2,
    });
    expect(nudgeTime("10:05", "H:mm", undefined, undefined, 2, -1)).toEqual({
      text: "9:05",
      caret: 1,
    });
  });

  it("keeps a caret on the minute there when the hour ahead of it grows", () => {
    expect(nudgeTime("9:59", "H:mm", undefined, undefined, 4, 1)).toEqual({
      text: "10:00",
      caret: 5,
    });
  });

  it("is null when the caret touches no part", () => {
    expect(nudgeTime("14 - 05", "HH - mm", undefined, undefined, 3, 1)).toBeNull();
  });

  describe("in a language with am/pm words of its own", () => {
    afterEach(() => setDetectionLocales(["en"]));

    it("reads the word and writes the other one", () => {
      setDetectionLocales(["en", "ko"]);

      expect(nudgeTime("오후 2:05", "a h:mm", "ko", undefined, 1, 1)?.text).toBe("오전 2:05");
    });
  });
});
