import { setDetectionLocales } from "../../src/detect/formats";
import { WEEK_STARTS } from "../../src/settings";
import {
  allowedDays,
  buildMonth,
  clampDay,
  dayFor,
  defaultWeekStart,
  defaultWeekend,
  firstDayOf,
  isWeekend,
  openingDay,
  pageTo,
  sameDay,
  shiftMonths,
  stepTo,
  todayKey,
} from "../../src/picker/month";

/**
 * The calendar's arithmetic, with no DOM and no editor in sight. Months are
 * 0-based throughout, matching moment, so February is 1 and March is 2.
 *
 * March 2024 is the worked example everywhere because it exercises both awkward
 * cases at once: it starts on a Friday, so a Monday-start grid leads in with
 * three days of February, and it ends on a Sunday, so a Sunday-start grid needs
 * a sixth row for the 31st alone.
 */

const today = { year: 2026, month: 8, day: 9 };
const monday = { firstDay: 1, selected: null, today };
const sunday = { firstDay: 0, selected: null, today };

describe("buildMonth", () => {
  it("leads in with the previous month to reach the first day of the week", () => {
    expect(buildMonth(2024, 2, monday)[0].days[0]).toEqual({
      year: 2024,
      month: 1,
      day: 26,
      outside: true,
      selected: false,
      today: false,
    });
  });

  it("leads in from a different day when the week starts on Sunday", () => {
    expect(buildMonth(2024, 2, sunday)[0].days[0]).toMatchObject({ month: 1, day: 25 });
  });

  it("uses as many weeks as the month needs, and no more", () => {
    // Feb 26 to Mar 31 is exactly five weeks; from Feb 25 the 31st spills into a
    // sixth. Padding every month to six rows would make the panel change height
    // for no reason.
    expect(buildMonth(2024, 2, monday)).toHaveLength(5);
    expect(buildMonth(2024, 2, sunday)).toHaveLength(6);
  });

  it("gives every week seven days", () => {
    const weeks = buildMonth(2024, 2, monday);
    expect(weeks.every((week) => week.days.length === 7)).toBe(true);
  });

  it("holds every day of a leap February", () => {
    const inMonth = buildMonth(2024, 1, monday)
      .flatMap((week) => week.days)
      .filter((day) => !day.outside);
    expect(inMonth).toHaveLength(29);
    expect(inMonth[28]).toMatchObject({ month: 1, day: 29 });
  });

  it("numbers the weeks by the locale's rule", () => {
    const weeks = buildMonth(2024, 2, monday);
    expect(weeks.map((week) => week.weekNumber)).toEqual([9, 10, 11, 12, 13]);
  });

  it("marks the day the note holds, and only that day", () => {
    const selected = buildMonth(2024, 2, {
      firstDay: 1,
      selected: { year: 2024, month: 2, day: 22 },
      today,
    })
      .flatMap((week) => week.days)
      .filter((day) => day.selected);

    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ month: 2, day: 22 });
  });

  it("marks nothing when the note's date falls in another month", () => {
    // Paging away from the date leaves no cell filled, so no cell invites a
    // click that would change nothing.
    const weeks = buildMonth(2024, 3, {
      firstDay: 1,
      selected: { year: 2024, month: 2, day: 22 },
      today,
    });
    expect(weeks.flatMap((week) => week.days).some((day) => day.selected)).toBe(false);
  });

  it("marks today, wherever it falls", () => {
    const marked = buildMonth(2026, 8, monday)
      .flatMap((week) => week.days)
      .filter((day) => day.today);
    expect(marked).toHaveLength(1);
    expect(marked[0]).toMatchObject({ year: 2026, month: 8, day: 9 });
  });

  it("does not mistake the same day of an adjoining month for today", () => {
    // September's grid leads in with August days; 9 August is not 9 September.
    const august = buildMonth(2026, 7, monday)
      .flatMap((week) => week.days)
      .filter((day) => day.today);
    expect(august).toHaveLength(0);
  });
});

describe("clampDay", () => {
  it("leaves a day that exists alone", () => {
    expect(clampDay(2024, 2, 31)).toBe(31);
  });

  it("pulls a day back to the end of a shorter month", () => {
    expect(clampDay(2024, 1, 31)).toBe(29);
    expect(clampDay(2023, 1, 31)).toBe(28);
    expect(clampDay(2024, 3, 31)).toBe(30);
  });
});

describe("shiftMonths", () => {
  it("pages forward and back, across a year end", () => {
    expect(shiftMonths({ year: 2024, month: 2, day: 22 }, 1)).toEqual({
      year: 2024,
      month: 3,
      day: 22,
    });
    expect(shiftMonths({ year: 2024, month: 0, day: 15 }, -1)).toEqual({
      year: 2023,
      month: 11,
      day: 15,
    });
  });

  it("pages a year at a time", () => {
    expect(shiftMonths({ year: 2024, month: 2, day: 22 }, 12)).toEqual({
      year: 2025,
      month: 2,
      day: 22,
    });
  });

  it("clamps the day rather than spilling into the next month", () => {
    // The 31st of January, paged forward, is the 29th of February — not the
    // 2nd of March, which is where naive arithmetic lands.
    expect(shiftMonths({ year: 2024, month: 0, day: 31 }, 1)).toEqual({
      year: 2024,
      month: 1,
      day: 29,
    });
  });

  it("clamps the day meant rather than the day in front of it", () => {
    // 31 January through February and on to March comes back to the 31st, where
    // clamping the day in front would have stuck at the 29th.
    const february = shiftMonths({ year: 2024, month: 0, day: 31 }, 1, 31);
    expect(february).toEqual({ year: 2024, month: 1, day: 29 });
    expect(shiftMonths(february, 1, 31)).toEqual({ year: 2024, month: 2, day: 31 });
    expect(shiftMonths(february, 12, 30)).toEqual({ year: 2025, month: 1, day: 28 });
  });
});

describe("todayKey", () => {
  it("reads the local calendar, not UTC", () => {
    // Late on the 9th in a timezone ahead of Greenwich, UTC still says the 8th.
    // The calendar has to agree with the wall clock the reader is looking at.
    expect(todayKey(new Date(2026, 8, 9, 23, 30))).toEqual({ year: 2026, month: 8, day: 9 });
  });
});

describe("sameDay", () => {
  it("compares all three parts", () => {
    expect(sameDay({ year: 2026, month: 8, day: 9 }, { year: 2026, month: 8, day: 9 })).toBe(true);
    expect(sameDay({ year: 2026, month: 8, day: 9 }, { year: 2025, month: 8, day: 9 })).toBe(false);
    expect(sameDay({ year: 2026, month: 8, day: 9 }, { year: 2026, month: 7, day: 9 })).toBe(false);
  });
});

describe("firstDayOf", () => {
  it("turns a named day into the index moment counts in", () => {
    expect(firstDayOf("sunday")).toBe(0);
    expect(firstDayOf("monday")).toBe(1);
    expect(firstDayOf("saturday")).toBe(6);
  });

  it("agrees with buildMonth about which day a grid starts on", () => {
    const weeks = buildMonth(2024, 2, { firstDay: firstDayOf("monday"), selected: null, today });
    expect(weeks[0].days[0]).toMatchObject({ month: 1, day: 26 });
  });
});

describe("defaultWeekStart", () => {
  it("answers with a day the setting can hold", () => {
    // Which day depends on the machine: the region is asked first and the app's
    // language second, so the test can only insist the answer is usable.
    expect(WEEK_STARTS).toContain(defaultWeekStart());
  });

  it("never leaves the caller without an answer", () => {
    expect(typeof defaultWeekStart()).toBe("string");
  });
});

describe("defaultWeekend", () => {
  type WeekInfo = { firstDay?: number; weekend?: number[] };
  const proto = Intl.Locale.prototype as Intl.Locale & { getWeekInfo?: () => WeekInfo };
  const original = proto.getWeekInfo;

  afterEach(() => {
    proto.getWeekInfo = original;
  });

  it("turns the region's Friday and Saturday into the setting's days", () => {
    // Intl counts Monday as 1 through Sunday as 7.
    proto.getWeekInfo = () => ({ firstDay: 6, weekend: [5, 6] });
    expect(defaultWeekend()).toEqual(["friday", "saturday"]);
  });

  it("reads Intl's 7 as Sunday", () => {
    proto.getWeekInfo = () => ({ firstDay: 1, weekend: [6, 7] });
    expect(defaultWeekend()).toEqual(["sunday", "saturday"]);
  });

  it("falls back to Saturday and Sunday when the browser cannot say", () => {
    proto.getWeekInfo = undefined;
    expect(defaultWeekend()).toEqual(["sunday", "saturday"]);
  });
});

describe("isWeekend", () => {
  it("asks by moment's day number, 0 being Sunday", () => {
    expect(isWeekend(["friday", "saturday"], 5)).toBe(true);
    expect(isWeekend(["friday", "saturday"], 0)).toBe(false);
    expect(isWeekend([], 6)).toBe(false);
  });
});

describe("dayFor", () => {
  it("reads a date back through the format it was written in", () => {
    expect(dayFor("09.09.2026", "DD.MM.YYYY")).toEqual(today);
  });

  it("answers with today when there is no date to read", () => {
    // The insert case: the picker is opened on an empty range at the caret, and
    // today is the day it should land on.
    expect(dayFor("", "YYYY-MM-DD")).toEqual(todayKey());
  });

  it("answers with today rather than a day built out of NaN", () => {
    expect(dayFor("not a date", "YYYY-MM-DD")).toEqual(todayKey());
  });

  it("reads a month name in the spelling a declining language writes", () => {
    // Ukrainian writes вересня inside a date and lists вересень on its own, and
    // moment's strict parse knows only the second.
    setDetectionLocales(["en", "uk"]);
    try {
      expect(dayFor("6 вересня 2026", "D MMMM YYYY", "uk")).toEqual({
        year: 2026,
        month: 8,
        day: 6,
      });
    } finally {
      setDetectionLocales(["en"]);
    }
  });
});

/**
 * The days a caller of `pickDate` allows. November 2026 is the worked example:
 * the 16th is a Monday, so 16–22 is one whole week, and 1 December sits past a
 * gap to exercise a list of more than one entry.
 */
const d = (month: number, day: number) => ({ year: 2026, month, day });
const week = allowedDays([{ from: "2026-11-16", to: "2026-11-22" }])!;
const weekAndDec1 = allowedDays([{ from: "2026-11-16", to: "2026-11-22" }, "2026-12-01"])!;

describe("allowedDays", () => {
  it("is no limit when nothing is given or nothing can be read", () => {
    expect(allowedDays(undefined)).toBeNull();
    expect(allowedDays([])).toBeNull();
    expect(allowedDays(["nonsense", { from: "x", to: "y" }])).toBeNull();
  });

  it("allows a range with both ends included", () => {
    expect(week.test(d(10, 16))).toBe(true);
    expect(week.test(d(10, 22))).toBe(true);
    expect(week.test(d(10, 15))).toBe(false);
    expect(week.test(d(10, 23))).toBe(false);
  });

  it("keeps the limit when only some entries can be read", () => {
    const partly = allowedDays([{ from: "2026-11-16", to: "2026-11-22" }, "nonsense"])!;
    expect(partly.test(d(10, 15))).toBe(false);
    expect(partly.test(d(10, 16))).toBe(true);
  });

  it("skips a range written backwards", () => {
    expect(allowedDays([{ from: "2026-11-22", to: "2026-11-16" }])).toBeNull();
  });

  it("reads days strictly", () => {
    expect(allowedDays(["2026-11-31"])).toBeNull();
  });

  it("allows single days beside ranges", () => {
    expect(weekAndDec1.test(d(11, 1))).toBe(true);
    expect(weekAndDec1.test(d(11, 2))).toBe(false);
  });

  it("is no limit when what it is given is not a list", () => {
    // Called from other plugins' JavaScript, where nothing checks the shape.
    const loose = allowedDays as (entries: unknown) => ReturnType<typeof allowedDays>;
    expect(loose({ from: "2026-11-16", to: "2026-11-22" })).toBeNull();
    expect(loose("2026-11-16")).toBeNull();
    expect(loose(null)).toBeNull();
  });

  it("skips entries of the wrong shape inside a list", () => {
    const loose = allowedDays as (entries: unknown) => ReturnType<typeof allowedDays>;
    const mixed = loose([null, 42, { from: 1, to: 2 }, "2026-11-16"])!;
    expect(mixed.test(d(10, 16))).toBe(true);
    expect(mixed.test(d(10, 17))).toBe(false);
  });
});

describe("stepTo", () => {
  it("goes to the target when it is allowed", () => {
    expect(stepTo(d(10, 16), d(10, 17), week)).toEqual(d(10, 17));
  });

  it("stops at the allowed day nearest the target, short of it", () => {
    expect(stepTo(d(10, 16), d(10, 23), week)).toEqual(d(10, 22));
  });

  it("stays put when nothing is allowed that way", () => {
    expect(stepTo(d(10, 22), d(10, 23), week)).toEqual(d(10, 22));
    expect(stepTo(d(10, 16), d(10, 15), week)).toEqual(d(10, 16));
  });

  it("jumps a gap to the next allowed day", () => {
    expect(stepTo(d(10, 22), d(10, 23), weekAndDec1)).toEqual(d(11, 1));
  });

  it("jumps a gap backwards", () => {
    expect(stepTo(d(11, 1), d(10, 24), weekAndDec1)).toEqual(d(10, 22));
  });

  it("pages a month into the nearest allowed day short of it", () => {
    expect(stepTo(d(10, 16), d(11, 16), weekAndDec1)).toEqual(d(11, 1));
  });

  it("stays when the target is where it already is", () => {
    expect(stepTo(d(10, 18), d(10, 18), week)).toEqual(d(10, 18));
  });
});

describe("openingDay", () => {
  it("keeps an allowed day", () => {
    expect(openingDay(d(10, 18), week)).toEqual(d(10, 18));
  });

  it("moves a day before the range onto its first day", () => {
    expect(openingDay(d(10, 14), week)).toEqual(d(10, 16));
  });

  it("takes the nearer side", () => {
    expect(openingDay(d(10, 26), weekAndDec1)).toEqual(d(10, 22));
  });

  it("takes the later day on a tie", () => {
    expect(openingDay(d(10, 15), allowedDays(["2026-11-10", "2026-11-20"])!)).toEqual(d(10, 20));
  });
});

describe("the nearest-day searches with days far apart", () => {
  // Years between entries: a day-by-day walk takes seconds here, so a bound on
  // the time is what tells a direct search from one.
  const far = allowedDays(["2026-11-16", "9999-12-31"])!;
  const quickly = (run: () => void) => {
    const start = Date.now();
    run();
    expect(Date.now() - start).toBeLessThan(200);
  };

  it("opens on the nearer of two far-apart days", () => {
    const ends = allowedDays(["1000-01-01", "9999-12-31"])!;
    quickly(() => expect(openingDay(d(10, 20), ends)).toEqual({ year: 1000, month: 0, day: 1 }));
  });

  it("jumps years to the next allowed day", () => {
    quickly(() => expect(stepTo(d(10, 16), d(10, 17), far)).toEqual({ year: 9999, month: 11, day: 31 }));
  });

  it("stops short across years", () => {
    quickly(() => expect(stepTo({ year: 9999, month: 11, day: 31 }, d(10, 1), far)).toEqual(d(10, 16)));
  });
});

describe("pageTo", () => {
  // January and March can be picked, February cannot.
  const janMar = allowedDays([
    { from: "2026-01-10", to: "2026-01-20" },
    { from: "2026-03-05", to: "2026-03-15" },
  ])!;
  const jan = (day: number) => d(0, day);
  const mar = (day: number) => d(2, day);

  it("skips a month with nothing to pick, wherever the ring is", () => {
    expect(pageTo(jan(15), d(1, 15), janMar)).toEqual(mar(5));
    expect(pageTo(jan(20), d(1, 20), janMar)).toEqual(mar(5));
  });

  it("skips it going back too", () => {
    expect(pageTo(mar(10), d(1, 10), janMar)).toEqual(jan(20));
  });

  it("goes to the target when it can be picked", () => {
    expect(pageTo(jan(15), mar(10), janMar)).toEqual(mar(10));
  });

  it("goes nowhere when no other month that way has a day to pick", () => {
    expect(pageTo(d(10, 16), d(11, 16), week)).toEqual(d(10, 16));
    expect(pageTo(d(10, 16), d(9, 16), week)).toEqual(d(10, 16));
  });

  it("never lands back in the month on show", () => {
    const november = allowedDays([{ from: "2026-11-01", to: "2026-11-30" }])!;
    expect(pageTo(d(10, 15), d(9, 15), november)).toEqual(d(10, 15));
  });

  it("takes the day nearest the aim on a year step", () => {
    const marches = allowedDays(["2026-03-10", "2027-03-10"])!;
    expect(pageTo(jan(15), { year: 2027, month: 0, day: 15 }, marches)).toEqual({ year: 2027, month: 2, day: 10 });
  });
});
