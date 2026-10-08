import { checkFormat, setDetectionLocales } from "../../src/detect/formats";
import {
  BUILT_IN_TIME_FORMATS,
  checkTimeFormat,
  compileTimeFormat,
  hourStyle,
  readTime,
  readTimeIn,
  renderTime,
  renderTimeExample,
  renderTimeSample,
  timeSampleParts,
  timeSpans,
  timeTokenGroupsPresent,
  withSeconds,
} from "../../src/detect/time-formats";

/**
 * What a time format is and what it reads. The regex is a pre-filter, as the
 * date one is: moment's strict parser has the last word, so the cases here are
 * about what the filter must let through and what it must not.
 */

const at = (hour: number, minute = 0, second = 0) => ({ hour, minute, second });
const finds = (pattern: string, text: string) =>
  Array.from(text.matchAll(compileTimeFormat(pattern)), (match) => match[0]);

afterEach(() => setDetectionLocales(["en"]));

describe("timeSpans", () => {
  it("places every token of a time with seconds", () => {
    expect(timeSpans("14:05:09", "HH:mm:ss")).toEqual([
      { token: "HH", from: 0, to: 2 },
      { token: "mm", from: 3, to: 5 },
      { token: "ss", from: 6, to: 8 },
    ]);
  });

  it("measures the hour by the digits the text holds", () => {
    expect(timeSpans("9:05", "H:mm")?.[0]).toEqual({ token: "H", from: 0, to: 1 });
    expect(timeSpans("19:05", "H:mm")?.[0]).toEqual({ token: "H", from: 0, to: 2 });
  });

  it("measures am/pm by the spelling the text holds", () => {
    expect(timeSpans("2:05 p.m.", "h:mm a")?.[2]).toEqual({ token: "a", from: 5, to: 9 });
    expect(timeSpans("2:05p", "h:mma")?.[2]).toEqual({ token: "a", from: 4, to: 5 });
  });

  it("is null for text the pattern does not cover whole", () => {
    expect(timeSpans("14:05 and more", "HH:mm")).toBeNull();
  });
});

describe("checkTimeFormat", () => {
  it("accepts the built-in formats and their kin", () => {
    for (const entry of BUILT_IN_TIME_FORMATS) expect(checkTimeFormat(entry.pattern)).toBeNull();
    expect(checkTimeFormat("HH:mm:ss")).toBeNull();
    expect(checkTimeFormat("HHmm")).toBeNull();
    expect(checkTimeFormat("A h:mm")).toBeNull();
  });

  it("treats a date's letters as any other letters it does not know", () => {
    expect(checkTimeFormat("YYYY-MM-DD HH:mm")).toEqual({
      code: "unknown-tokens",
      chars: "YYYY, MM, DD",
    });
    expect(checkTimeFormat("YYYY-MM-DD")).toEqual({ code: "missing-component", component: "hour" });
  });

  it("needs an hour and a minute", () => {
    expect(checkTimeFormat("mm:ss")).toEqual({ code: "missing-component", component: "hour" });
    expect(checkTimeFormat("HH")).toEqual({ code: "missing-component", component: "minute" });
  });

  it("refuses brackets and letters it does not know", () => {
    expect(checkTimeFormat("HH:mm [x]")).toEqual({ code: "bracket-pair" });
    expect(checkTimeFormat("HH:mm Q")).toEqual({ code: "unknown-tokens", chars: "Q" });
  });

  it("pairs a 12-hour hour with am/pm, and only that", () => {
    expect(checkTimeFormat("h:mm")).toEqual({ code: "meridiem-missing" });
    expect(checkTimeFormat("HH:mm a")).toEqual({ code: "meridiem-stray" });
  });

  it("refuses numbers of unsettled width run together", () => {
    expect(checkTimeFormat("Hmm")).toEqual({ code: "adjacent-numbers", first: "H", second: "mm" });
  });
});

describe("checkFormat", () => {
  it("treats a time's letters in a date format as it always has", () => {
    expect(checkFormat("YYYY-MM-DD HH:mm")).toEqual({ code: "unknown-tokens", chars: "HH, mm" });
    expect(checkFormat("HH:mm")).toEqual({ code: "missing-component", component: "year" });
  });
});

describe("withSeconds", () => {
  it("adds seconds after the minutes, on the separator before them", () => {
    expect(withSeconds("HH:mm")).toBe("HH:mm:ss");
    expect(withSeconds("h:mm a")).toBe("h:mm:ss a");
    expect(withSeconds("h:mma")).toBe("h:mm:ssa");
    expect(withSeconds("HH.mm")).toBe("HH.mm.ss");
    expect(withSeconds("A h:mm")).toBe("A h:mm:ss");
  });

  it("is nothing where the format has seconds, or no separator to borrow", () => {
    expect(withSeconds("HH:mm:ss")).toBeNull();
    expect(withSeconds("HHmm")).toBeNull();
  });
});

describe("compileTimeFormat", () => {
  it("finds a 24-hour time", () => {
    expect(finds("HH:mm", "at 14:05 today")).toEqual(["14:05"]);
    expect(finds("H:mm", "at 9:05 today")).toEqual(["9:05"]);
  });

  it("finds am/pm however it is spelled", () => {
    expect(finds("h:mm a", "2:05 pm, 2:05 PM, 2:05 p.m., 2:05 P.M.")).toEqual([
      "2:05 pm",
      "2:05 PM",
      "2:05 p.m.",
      "2:05 P.M.",
    ]);
  });

  it("leaves a sentence's own full stop out of the time", () => {
    expect(finds("h:mm a", "We left at 2:05 pm.")).toEqual(["2:05 pm"]);
  });

  it("takes a bare a or p only when it is attached", () => {
    expect(finds("h:mma", "2:05p 2:05a 2:05pm 2:05P")).toEqual(["2:05p", "2:05a", "2:05pm", "2:05P"]);
    expect(finds("h:mm a", "at 2:05 a friend called")).toEqual([]);
    expect(finds("h:mm a", "by 5:30 p")).toEqual([]);
  });

  it("finds another language's words once that language is in force", () => {
    expect(finds("h:mm a", "о 9:00 вечора")).toEqual([]);
    setDetectionLocales(["en", "uk"]);
    expect(finds("h:mm a", "о 9:00 вечора")).toEqual(["9:00 вечора"]);
  });
});

describe("readTimeIn and readTime", () => {
  it("has the final say on whether it is a time", () => {
    expect(readTimeIn("14:05", "HH:mm")).toBe("en");
    expect(readTimeIn("25:70", "HH:mm")).toBeNull();
    expect(readTimeIn("14:05 pm", "h:mm a")).toBeNull();
  });

  it("names the language that read it", () => {
    setDetectionLocales(["en", "uk"]);
    expect(readTimeIn("9:00 вечора", "h:mm a")).toBe("uk");
    expect(readTimeIn("9:00 pm", "h:mm a")).toBe("en");
  });

  it("reads the time of day", () => {
    expect(readTime("2:05 P.M.", "h:mm a", "en")).toEqual(at(14, 5));
    expect(readTime("12:00 am", "h:mm a", "en")).toEqual(at(0));
    expect(readTime("14:05:09", "HH:mm:ss")).toEqual(at(14, 5, 9));
    expect(readTime("nope", "HH:mm")).toBeNull();
  });
});

describe("renderTime", () => {
  it("writes a time through the pattern", () => {
    expect(renderTime("HH:mm:ss", at(9, 5, 7))).toBe("09:05:07");
    expect(renderTime("H:mm", at(9, 5))).toBe("9:05");
    expect(renderTime("h:mm a", at(14, 5), "en")).toBe("2:05 pm");
    expect(renderTime("h:mm A", at(0, 30), "en")).toBe("12:30 AM");
  });

  it("writes am/pm in the spelling it is handed", () => {
    expect(renderTime("h:mm a", at(14, 5), "en", { upper: true, dots: true, short: false })).toBe(
      "2:05 P.M.",
    );
    expect(renderTime("h:mma", at(4, 30), "en", { upper: false, dots: false, short: true })).toBe(
      "4:30a",
    );
  });

  it("writes another language's own word", () => {
    expect(renderTime("h:mm a", at(21), "uk")).toBe("9:00 вечора");
  });

  it("renders an example at a given moment", () => {
    expect(renderTimeExample("HH:mm", new Date(2026, 0, 1, 14, 5, 9))).toBe("14:05");
    expect(renderTimeExample("h:mm:ss a", new Date(2026, 0, 1, 14, 5, 9))).toBe("2:05:09 pm");
  });
});

describe("renderTimeSample", () => {
  const on = (hour: number, minute = 41, second = 23) => new Date(2026, 0, 1, hour, minute, second);

  it("shows the current time while its hour is a single digit", () => {
    expect(renderTimeSample("H:mm", on(8))).toBe("8:41");
    expect(renderTimeSample("HH:mm", on(8))).toBe("08:41");
    expect(renderTimeSample("h:mm a", on(14))).toBe("2:41 pm");
    expect(renderTimeSample("hh:mm:ss a", on(14))).toBe("02:41:23 pm");
  });

  it("shows nine past five instead once the hour takes two digits", () => {
    // At 22:41 `H:mm` and `HH:mm` would both read 22:41, and the row is there
    // to show the two apart.
    expect(renderTimeSample("H:mm", on(22))).toBe("9:05");
    expect(renderTimeSample("HH:mm", on(22))).toBe("09:05");
    expect(renderTimeSample("HH:mm:ss", on(10))).toBe("09:05:07");
  });

  it("keeps the half of the day for a 12-hour format", () => {
    expect(renderTimeSample("h:mm a", on(22))).toBe("9:05 pm");
    expect(renderTimeSample("hh:mm a", on(11))).toBe("09:05 am");
    expect(renderTimeSample("h:mm a", on(0))).toBe("9:05 am");
    expect(renderTimeSample("h:mm a", on(12))).toBe("9:05 pm");
  });
});

describe("timeSampleParts", () => {
  const late = new Date(2026, 0, 1, 22, 41, 23);

  it("sets the seconds a format also reads apart from the rest", () => {
    expect(timeSampleParts("HH:mm", late)).toEqual({ before: "09:05", seconds: ":07", after: "" });
    expect(timeSampleParts("h:mm a", late)).toEqual({ before: "9:05", seconds: ":07", after: " pm" });
    expect(timeSampleParts("h:mma", late)).toEqual({ before: "9:05", seconds: ":07", after: "pm" });
    expect(timeSampleParts("HH.mm", late)).toEqual({ before: "09.05", seconds: ".07", after: "" });
    expect(timeSampleParts("a h:mm", late)).toEqual({ before: "pm 9:05", seconds: ":07", after: "" });
  });

  it("uses the current time while its hour is a single digit", () => {
    const early = new Date(2026, 0, 1, 8, 41, 41);
    expect(timeSampleParts("H:mm", early)).toEqual({ before: "8:41", seconds: ":41", after: "" });
  });

  it("has no seconds apart where the format names them, or cannot add them", () => {
    expect(timeSampleParts("HH:mm:ss", late)).toEqual({ before: "09:05:07", seconds: "", after: "" });
    expect(timeSampleParts("HHmm", late)).toEqual({ before: "0905", seconds: "", after: "" });
  });
});

describe("hourStyle", () => {
  it("says which clock a pattern's hour is on", () => {
    expect(hourStyle("h:mm a")).toBe("12");
    expect(hourStyle("hh:mm")).toBe("12");
    expect(hourStyle("HH:mm")).toBe("24");
    expect(hourStyle("H:mm a")).toBe("24");
    expect(hourStyle("mm:ss")).toBeNull();
  });
});

describe("the built-in formats", () => {
  it("round-trip, with seconds and without", () => {
    for (const entry of BUILT_IN_TIME_FORMATS) {
      const seconds = withSeconds(entry.pattern);
      expect(seconds).not.toBeNull();

      for (const pattern of [entry.pattern, seconds!]) {
        const written = renderTime(pattern, at(14, 5, 9), "en");
        expect(finds(pattern, written)).toEqual([written]);
        expect(readTime(written, pattern, "en")).toMatchObject({ hour: 14, minute: 5 });
      }
    }
  });
});

describe("timeTokenGroupsPresent", () => {
  it("names the parts a pattern draws on", () => {
    expect(timeTokenGroupsPresent("h:mm a")).toEqual(new Set(["hour", "minute", "meridiem"]));
    expect(timeTokenGroupsPresent("HH:mm:ss")).toEqual(new Set(["hour", "minute", "second"]));
  });
});
