import { WEEK_STARTS } from "../../src/settings";
import {
  buildMonth,
  clampDay,
  dayFor,
  defaultWeekStart,
  firstDayOf,
  sameDay,
  shiftMonths,
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
});
