import { scanText } from "../../src/detect/scan";

/**
 * Times beside dates. Dates are scanned first and win a tie; a time is never
 * cut out of a longer one; and the am/pm spelling rides along on the candidate
 * so the write-back can keep it.
 */

const DATES = [{ id: "iso", pattern: "YYYY-MM-DD" }];
const T24 = [{ id: "time-24", pattern: "HH:mm" }];
const T12 = [
  { id: "time-12", pattern: "h:mm a" },
  { id: "time-12-tight", pattern: "h:mma" },
];

const accepted = (text: string, dates = DATES, times = T24) =>
  scanText(text, dates, times)
    .filter((candidate) => candidate.accepted)
    .map((candidate) => [candidate.kind, candidate.text, candidate.pattern]);

describe("scanText with time formats", () => {
  it("still marks a date as a date, with or without a time list", () => {
    expect(scanText("2026-10-04", DATES)[0].kind).toBe("date");
    expect(scanText("2026-10-04", DATES, T24)[0].kind).toBe("date");
  });

  it("finds a date and a time side by side as two things", () => {
    expect(accepted("Meet 2026-10-04 14:30.")).toEqual([
      ["date", "2026-10-04", "YYYY-MM-DD"],
      ["time", "14:30", "HH:mm"],
    ]);
  });

  it("reads seconds through a format that does not name them", () => {
    expect(accepted("at 14:05:09 sharp")).toEqual([["time", "14:05:09", "HH:mm:ss"]]);
  });

  it("never cuts a time out of a longer one", () => {
    expect(accepted("took 1:14:05 in all")).toEqual([]);
    expect(accepted("ratio 14:05:9")).toEqual([]);
  });

  it("refuses what is not a time", () => {
    expect(accepted("at 25:70")).toEqual([]);
    expect(accepted("v14:05")).toEqual([]);
  });

  it("lets a sentence end on a time", () => {
    expect(accepted("We left at 14:05.")).toEqual([["time", "14:05", "HH:mm"]]);
    expect(accepted("We left at 2:05 pm.", DATES, T12)).toEqual([["time", "2:05 pm", "h:mm a"]]);
  });

  it("gives a contested string to the date", () => {
    const dates = [{ id: "dmy", pattern: "DD.MM.YY" }];
    const times = [{ id: "dotted", pattern: "HH.mm" }];
    expect(accepted("12.10.25", dates, times)).toEqual([["date", "12.10.25", "DD.MM.YY"]]);
  });

  it("gives a contested time to the format listed first", () => {
    const times = [
      { id: "short", pattern: "H:mm" },
      { id: "padded", pattern: "HH:mm" },
    ];
    const found = scanText("09:30", [], times).filter((candidate) => candidate.accepted);
    expect(found.map((candidate) => candidate.formatId)).toEqual(["short"]);
  });

  it("reads a time at its fullest, whatever the order of the list", () => {
    const times = [
      { id: "time-24", pattern: "HH:mm" },
      { id: "time-12", pattern: "h:mm a" },
    ];
    expect(accepted("at 12:05 am and 10:30 PM", DATES, times)).toEqual([
      ["time", "12:05 am", "h:mm a"],
      ["time", "10:30 PM", "h:mm a"],
    ]);
    expect(accepted("at 12:05 sharp", DATES, times)).toEqual([["time", "12:05", "HH:mm"]]);
  });

  it("carries the am/pm spelling it found", () => {
    const [short] = scanText("2:05p", [], T12).filter((candidate) => candidate.accepted);
    expect(short).toMatchObject({
      text: "2:05p",
      pattern: "h:mma",
      meridiem: { upper: false, dots: false, short: true },
    });

    const [dotted] = scanText("2:05 P.M. sharp", [], T12).filter((candidate) => candidate.accepted);
    expect(dotted).toMatchObject({
      text: "2:05 P.M.",
      meridiem: { upper: true, dots: true, short: false },
    });
  });

  it("carries no spelling for a 24-hour time", () => {
    const [found] = scanText("14:05", [], T24).filter((candidate) => candidate.accepted);
    expect(found.meridiem).toBeUndefined();
  });

  it("does not take a word after a time for am", () => {
    expect(accepted("at 2:05 a friend called", DATES, T12)).toEqual([]);
  });

  it("gives a time no Tasks marker", () => {
    const [found] = scanText("📅 14:05", [], T24).filter((candidate) => candidate.accepted);
    expect(found.markerFrom).toBeUndefined();
  });

  it("does not take a UTC offset for a time", () => {
    expect(accepted("2026-10-04T14:30:00+02:00")).toEqual([]);
    expect(accepted("2026-10-04T14:30:00-05:00")).toEqual([]);
    expect(accepted("+02:00")).toEqual([]);
    expect(accepted("2026-10-04 14:30:00 +02:00")).toEqual([
      ["date", "2026-10-04", "YYYY-MM-DD"],
      ["time", "14:30:00", "HH:mm:ss"],
    ]);
    expect(accepted("at 14:30:00 -05:00")).toEqual([["time", "14:30:00", "HH:mm:ss"]]);
  });

  it("still reads both ends of a range", () => {
    expect(accepted("10:30-11:45")).toEqual([
      ["time", "10:30", "HH:mm"],
      ["time", "11:45", "HH:mm"],
    ]);
    expect(accepted("10:30 - 11:45")).toEqual([
      ["time", "10:30", "HH:mm"],
      ["time", "11:45", "HH:mm"],
    ]);
  });
});
