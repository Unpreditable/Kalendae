import { moment } from "obsidian";
import { daysFrom, hintFor, namesWeekday } from "../../src/picker/hint";

/**
 * What the hover hint says about a date, with no editor in sight. Months are
 * 0-based, matching moment: October is 9.
 */

const today = { year: 2026, month: 9, day: 1 };

describe("daysFrom", () => {
  it("counts whole days forward and back", () => {
    expect(daysFrom(today, { year: 2026, month: 9, day: 6 })).toBe(5);
    expect(daysFrom(today, { year: 2026, month: 8, day: 30 })).toBe(-1);
    expect(daysFrom(today, today)).toBe(0);
  });

  it("crosses a year", () => {
    expect(daysFrom(today, { year: 2025, month: 7, day: 27 })).toBe(-400);
  });
});

describe("namesWeekday", () => {
  it("is true for a pattern that writes the weekday out", () => {
    expect(namesWeekday("dddd, MMMM D")).toBe(true);
    expect(namesWeekday("ddd DD.MM.YYYY")).toBe(true);
    expect(namesWeekday("dd YYYY-MM-DD")).toBe(true);
  });

  it("is false for day numbers and for a d inside brackets", () => {
    expect(namesWeekday("YYYY-MM-DD")).toBe(false);
    expect(namesWeekday("Do MMMM")).toBe(false);
    expect(namesWeekday("[dddd] YYYY-MM-DD")).toBe(false);
  });
});

describe("hintFor", () => {
  const iso = "YYYY-MM-DD";

  it("names today, tomorrow and yesterday in words, without a weekday", () => {
    expect(hintFor(today, today, iso, "days", "off")).toEqual({
      orb: null,
      weekday: null,
      distance: "Today",
    });
    expect(hintFor({ year: 2026, month: 9, day: 2 }, today, iso, "days", "off").distance).toBe(
      "Tomorrow",
    );
    expect(hintFor({ year: 2026, month: 8, day: 30 }, today, iso, "days", "off").distance).toBe(
      "Yesterday",
    );
  });

  it("counts in days, however far", () => {
    const hint = hintFor({ year: 2025, month: 7, day: 27 }, today, iso, "days", "off");
    expect(hint).toEqual({
      orb: null,
      weekday: "Wednesday",
      distance: "400 days ago",
    });
    expect(hintFor({ year: 2026, month: 9, day: 11 }, today, iso, "days", "off").distance).toBe(
      "in 10 days",
    );
  });

  it("rounds past 25 days", () => {
    expect(hintFor({ year: 2026, month: 9, day: 6 }, today, iso, "rounded", "off").distance).toBe(
      "in 5 days",
    );
    expect(hintFor({ year: 2026, month: 10, day: 10 }, today, iso, "rounded", "off").distance).toBe(
      "in a month",
    );
    expect(hintFor({ year: 2025, month: 7, day: 27 }, today, iso, "rounded", "off").distance).toBe(
      "a year ago",
    );
  });

  it("leaves the weekday out when the date already names it", () => {
    const hint = hintFor({ year: 2026, month: 9, day: 6 }, today, "dddd, MMMM D", "days", "off");
    expect(hint.weekday).toBeNull();
  });

  it("colours today and later one way and the past the other", () => {
    const ahead = { year: 2026, month: 9, day: 6 };
    const past = { year: 2026, month: 8, day: 1 };

    expect(hintFor(ahead, today, iso, "days", "green-red").orb).toBe("green");
    expect(hintFor(today, today, iso, "days", "green-red").orb).toBe("green");
    expect(hintFor(past, today, iso, "days", "green-red").orb).toBe("red");
    expect(hintFor(ahead, today, iso, "days", "red-green").orb).toBe("red");
    expect(hintFor(past, today, iso, "days", "red-green").orb).toBe("green");
  });

  it("speaks the app's language", () => {
    const before = moment.locale();
    moment.locale("ru");
    try {
      const hint = hintFor({ year: 2026, month: 10, day: 15 }, today, iso, "days", "off");
      expect(hint).toEqual({
        orb: null,
        weekday: "воскресенье",
        distance: "через 45 дней",
      });
    } finally {
      moment.locale(before);
    }
  });
});
