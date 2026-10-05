import {
  committed,
  dialValue,
  formatTime,
  handOf,
  marksFor,
  meridiemVocabulary,
  meridiemWords,
  pointToValue,
  shapeOf,
  stepped,
  timeOf,
  unitText,
  unitsOf,
  withDialValue,
  withMeridiem,
} from "../../src/picker/clock-math";

/**
 * The clock's arithmetic, with no DOM in sight. Hours are 0–23 throughout,
 * whatever the pattern shows; the dial's coordinates put its centre at 0,0 and
 * its edge at distance 1, with y growing downwards as it does on screen.
 */

const at = (hour: number, minute = 0, second = 0) => ({ hour, minute, second });

/** The point on the dial at a clock angle and a distance from the centre. */
const point = (degrees: number, distance: number): [number, number] => {
  const radians = (degrees * Math.PI) / 180;
  return [distance * Math.sin(radians), -distance * Math.cos(radians)];
};

const h24 = shapeOf("HH:mm");
const h12 = shapeOf("h:mm a");
const withSeconds = shapeOf("HH:mm:ss");

describe("shapeOf", () => {
  it("reads a 24-hour pattern", () => {
    expect(shapeOf("HH:mm")).toEqual({
      twelveHour: false,
      meridiemToken: null,
      seconds: false,
      padHour: true,
      padMinute: true,
      padSecond: false,
    });
  });

  it("reads leading zeros off the hour token", () => {
    expect(shapeOf("H:mm").padHour).toBe(false);
    expect(shapeOf("hh:mm A").padHour).toBe(true);
  });

  it("reads a 12-hour pattern and the case of its AM/PM", () => {
    expect(shapeOf("h:mm a")).toMatchObject({ twelveHour: true, meridiemToken: "a" });
    expect(shapeOf("hh:mm A")).toMatchObject({ twelveHour: true, meridiemToken: "A" });
  });

  it("reads seconds", () => {
    expect(shapeOf("HH:mm:ss")).toMatchObject({ seconds: true, padSecond: true });
    expect(shapeOf("h:mm:ss a")).toMatchObject({ seconds: true, twelveHour: true });
  });

  it("ignores letters inside moment's [literal] brackets", () => {
    expect(shapeOf("[at] HH:mm")).toMatchObject({ twelveHour: false, meridiemToken: null });
  });
});

describe("unitsOf", () => {
  it("is hour and minute without seconds in the pattern", () => {
    expect(unitsOf(h24, false)).toEqual(["hour", "minute"]);
  });

  it("adds seconds only with Snap off", () => {
    expect(unitsOf(withSeconds, false)).toEqual(["hour", "minute", "second"]);
    expect(unitsOf(withSeconds, true)).toEqual(["hour", "minute"]);
  });
});

describe("unitText", () => {
  it("follows the pattern's leading zeros", () => {
    expect(unitText("hour", at(9, 5), shapeOf("H:mm"))).toBe("9");
    expect(unitText("hour", at(9, 5), h24)).toBe("09");
    expect(unitText("minute", at(9, 5), h24)).toBe("05");
    expect(unitText("second", at(9, 5, 7), withSeconds)).toBe("07");
  });

  it("shows 12-hour hours as 12, 1 … 11", () => {
    expect(unitText("hour", at(0), h12)).toBe("12");
    expect(unitText("hour", at(12), h12)).toBe("12");
    expect(unitText("hour", at(13), h12)).toBe("1");
    expect(unitText("hour", at(13), shapeOf("hh:mm a"))).toBe("01");
  });
});

describe("marksFor", () => {
  it("puts 12 at the top of a 12-hour dial", () => {
    const marks = marksFor("hour", h12);
    expect(marks).toHaveLength(12);
    expect(marks[0]).toEqual({ value: 0, label: "12", degrees: 0, inner: false });
    expect(marks[3]).toEqual({ value: 3, label: "3", degrees: 90, inner: false });
  });

  it("gives a 24-hour dial two rings, 12 outside and 00 inside at the top", () => {
    const marks = marksFor("hour", h24);
    expect(marks).toHaveLength(24);
    expect(marks).toContainEqual({ value: 12, label: "12", degrees: 0, inner: false });
    expect(marks).toContainEqual({ value: 0, label: "00", degrees: 0, inner: true });
    expect(marks).toContainEqual({ value: 15, label: "15", degrees: 90, inner: true });
  });

  it("labels minutes and seconds every five", () => {
    const labels = marksFor("minute", h24).map((mark) => mark.label);
    expect(labels).toEqual(["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]);
    expect(marksFor("second", withSeconds)[1]).toEqual({
      value: 5,
      label: "05",
      degrees: 30,
      inner: false,
    });
  });
});

describe("dialValue and handOf", () => {
  it("places a 24-hour hour on its ring", () => {
    expect(handOf("hour", at(0), h24)).toEqual({ degrees: 0, inner: true });
    expect(handOf("hour", at(12), h24)).toEqual({ degrees: 0, inner: false });
    expect(handOf("hour", at(15), h24)).toEqual({ degrees: 90, inner: true });
    expect(handOf("hour", at(3), h24)).toEqual({ degrees: 90, inner: false });
  });

  it("keeps a 12-hour hand on the one ring", () => {
    expect(handOf("hour", at(15), h12)).toEqual({ degrees: 90, inner: false });
    expect(dialValue("hour", at(15), h12)).toBe(3);
  });

  it("turns minutes and seconds six degrees each", () => {
    expect(handOf("minute", at(9, 37), h24)).toEqual({ degrees: 222, inner: false });
    expect(handOf("second", at(9, 0, 15), withSeconds)).toEqual({ degrees: 90, inner: false });
  });
});

describe("pointToValue", () => {
  it("reads the hour off a 12-hour dial", () => {
    expect(pointToValue("hour", h12, true, ...point(0, 0.8))).toBe(0);
    expect(pointToValue("hour", h12, true, ...point(90, 0.8))).toBe(3);
    expect(pointToValue("hour", h12, true, ...point(95, 0.3))).toBe(3);
  });

  it("picks the ring of a 24-hour dial by distance from the centre", () => {
    expect(pointToValue("hour", h24, true, ...point(90, 0.8))).toBe(3);
    expect(pointToValue("hour", h24, true, ...point(90, 0.4))).toBe(15);
    expect(pointToValue("hour", h24, true, ...point(0, 0.8))).toBe(12);
    expect(pointToValue("hour", h24, true, ...point(0, 0.4))).toBe(0);
  });

  it("snaps minutes to five with Snap on, and not with it off", () => {
    expect(pointToValue("minute", h24, true, ...point(222, 0.8))).toBe(35);
    expect(pointToValue("minute", h24, false, ...point(222, 0.8))).toBe(37);
  });

  it("never snaps seconds", () => {
    expect(pointToValue("second", withSeconds, true, ...point(222, 0.8))).toBe(37);
  });

  it("wraps just before the top round to zero", () => {
    expect(pointToValue("minute", h24, false, ...point(359, 0.8))).toBe(0);
  });
});

describe("withDialValue", () => {
  it("keeps the half of the day a 12-hour pick lands in", () => {
    expect(withDialValue("hour", 3, at(14, 30), h12)).toEqual(at(15, 30));
    expect(withDialValue("hour", 3, at(2, 30), h12)).toEqual(at(3, 30));
    expect(withDialValue("hour", 0, at(14), h12)).toEqual(at(12));
    expect(withDialValue("hour", 0, at(2), h12)).toEqual(at(0));
  });

  it("takes a 24-hour pick as it is", () => {
    expect(withDialValue("hour", 15, at(2, 30), h24)).toEqual(at(15, 30));
  });

  it("sets minutes and seconds and nothing else", () => {
    expect(withDialValue("minute", 40, at(9, 5, 7), withSeconds)).toEqual(at(9, 40, 7));
    expect(withDialValue("second", 40, at(9, 5, 7), withSeconds)).toEqual(at(9, 5, 40));
  });
});

describe("stepped", () => {
  it("wraps hours through the whole day", () => {
    expect(stepped("hour", at(23), 1, true)).toEqual(at(0));
    expect(stepped("hour", at(0), -1, true)).toEqual(at(23));
    expect(stepped("hour", at(11, 30), 1, true)).toEqual(at(12, 30));
  });

  it("steps minutes by five with Snap on, landing on the five either side of an odd minute", () => {
    expect(stepped("minute", at(9, 37), 1, true)).toEqual(at(9, 40));
    expect(stepped("minute", at(9, 37), -1, true)).toEqual(at(9, 35));
    expect(stepped("minute", at(9, 40), 1, true)).toEqual(at(9, 45));
    expect(stepped("minute", at(9, 55), 1, true)).toEqual(at(9, 0));
  });

  it("steps minutes by one with Snap off, without carrying into the hour", () => {
    expect(stepped("minute", at(9, 37), 1, false)).toEqual(at(9, 38));
    expect(stepped("minute", at(9, 59), 1, false)).toEqual(at(9, 0));
    expect(stepped("minute", at(9, 0), -1, false)).toEqual(at(9, 59));
  });

  it("steps seconds by one, without carrying", () => {
    expect(stepped("second", at(9, 5, 0), -1, false)).toEqual(at(9, 5, 59));
  });
});

describe("withMeridiem", () => {
  it("moves the hour to the other half and leaves it where it is on the dial", () => {
    expect(withMeridiem(at(2, 5), true)).toEqual(at(14, 5));
    expect(withMeridiem(at(14, 5), false)).toEqual(at(2, 5));
    expect(withMeridiem(at(12), false)).toEqual(at(0));
    expect(withMeridiem(at(0), true)).toEqual(at(12));
  });
});

describe("meridiemWords", () => {
  it("is AM and PM in English, in the pattern's case", () => {
    expect(meridiemWords(at(2), "A", "en")).toEqual({ am: "AM", pm: "PM" });
    expect(meridiemWords(at(2), "a", "en")).toEqual({ am: "am", pm: "pm" });
  });

  it("follows the hour in a language with more than two words", () => {
    expect(meridiemWords(at(2), "a", "uk")).toEqual({ am: "ночі", pm: "дня" });
    expect(meridiemWords(at(9), "a", "uk")).toEqual({ am: "ранку", pm: "вечора" });
    expect(meridiemWords(at(21), "a", "uk")).toEqual({ am: "ранку", pm: "вечора" });
    expect(meridiemWords(at(7), "a", "ru")).toEqual({ am: "утра", pm: "вечера" });
  });

  it("follows the minute where the language does", () => {
    // Chinese turns to 中午, noon, at half past eleven.
    expect(meridiemWords(at(11, 0), "a", "zh-cn")).toEqual({ am: "上午", pm: "晚上" });
    expect(meridiemWords(at(11, 30), "a", "zh-cn")).toEqual({ am: "中午", pm: "晚上" });
  });
});

describe("meridiemVocabulary", () => {
  it("lists every word a language uses across the day, once each", () => {
    expect(meridiemVocabulary("a", "en")).toEqual(["am", "pm"]);
    expect(meridiemVocabulary("a", "uk")).toEqual(["ночі", "ранку", "дня", "вечора"]);
    expect(meridiemVocabulary("A", "ja")).toEqual(["午前", "午後"]);
  });
});

describe("formatTime", () => {
  it("writes the time through the pattern", () => {
    expect(formatTime("HH:mm", at(9, 5))).toBe("09:05");
    expect(formatTime("H:mm", at(9, 5))).toBe("9:05");
    expect(formatTime("h:mm:ss a", at(14, 5, 7), "en")).toBe("2:05:07 pm");
    expect(formatTime("hh:mm A", at(0, 30), "en")).toBe("12:30 AM");
  });

  it("writes AM/PM in the language the time was written in", () => {
    expect(formatTime("h:mm a", at(21), "uk")).toBe("9:00 вечора");
    expect(formatTime("A h:mm", at(14), "ja")).toBe("午後 2:00");
    expect(formatTime("h:mm a", at(14), "tr")).toBe("2:00 ös");
  });
});

describe("committed", () => {
  it("is nothing when the time did not change, so its seconds survive", () => {
    expect(committed(at(14, 32, 47), at(14, 32, 47), withSeconds, true)).toBeNull();
  });

  it("is nothing when an edit was taken back", () => {
    expect(committed(at(14, 32, 47), { ...at(14, 32), second: 47 }, withSeconds, false)).toBeNull();
  });

  it("writes seconds as zero with Snap on, once something changed", () => {
    expect(committed(at(14, 32, 47), at(14, 35, 47), withSeconds, true)).toEqual(at(14, 35, 0));
  });

  it("keeps the seconds with Snap off", () => {
    expect(committed(at(14, 32, 47), at(14, 35, 47), withSeconds, false)).toEqual(at(14, 35, 47));
  });
});

describe("timeOf", () => {
  it("reads the local time off a Date", () => {
    expect(timeOf(new Date(2026, 9, 3, 14, 37, 12))).toEqual(at(14, 37, 12));
  });
});
