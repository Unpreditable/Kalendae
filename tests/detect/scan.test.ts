import { moment } from "obsidian";

import { DateFormatEntry, setDetectionLocales } from "../../src/detect/formats";
import { cleanBoundaryAfter, cleanBoundaryBefore, scanText } from "../../src/detect/scan";

function formats(...patterns: string[]): DateFormatEntry[] {
  return patterns.map((pattern, i) => ({ id: `f${i}`, pattern }));
}

const ISO = formats("YYYY-MM-DD");

/** The text of every candidate the scanner accepted, in document order. */
function accepted(text: string, entries: DateFormatEntry[] = ISO): string[] {
  return scanText(text, entries)
    .filter((c) => c.accepted)
    .map((c) => c.text);
}

describe("scanText", () => {
  it("finds an ISO date in prose", () => {
    expect(accepted("due 2026-09-06 at the latest")).toEqual(["2026-09-06"]);
  });

  it("reports offsets that point back at the date in the source text", () => {
    const source = "due 2026-09-06 at the latest";
    const [candidate] = scanText(source, ISO);

    expect(source.slice(candidate.from, candidate.to)).toBe("2026-09-06");
  });

  it("finds every date on a line, not just the first", () => {
    expect(accepted("from 2026-09-06 to 2026-09-20")).toEqual(["2026-09-06", "2026-09-20"]);
  });

  describe("false positives", () => {
    // The complaint cluster on the closest prior art: joycode-hub/datepicker-plugin
    // issues #13 and #23, where version strings were offered as dates.
    it("finds nothing in semver strings under the default ISO format", () => {
      expect(accepted("v0.9.1 and 2.11.1.1 and 1.2.3.4")).toEqual([]);
    });

    it("rejects a date with a digit stuck to the end", () => {
      expect(accepted("2026-09-061")).toEqual([]);
    });

    it("rejects a date with a digit stuck to the front", () => {
      expect(accepted("12026-09-06")).toEqual([]);
    });

    it("rejects a date with a letter stuck to the front", () => {
      expect(accepted("v2026-09-06")).toEqual([]);
    });

    it("says why it rejected, rather than staying silent about it", () => {
      const [candidate] = scanText("2026-09-061", ISO);

      expect(candidate.accepted).toBe(false);
      expect(candidate.reason).toBe("boundary");
    });

    it("accepts a date flanked by punctuation, which is ordinary prose", () => {
      expect(accepted("(2026-09-06), [[2026-09-20]].")).toEqual(["2026-09-06", "2026-09-20"]);
    });

    it("accepts a date that ends a sentence", () => {
      // The trailing dot only condemns a match when a digit follows it — that
      // is the dotted-number case. A full stop is just a full stop.
      expect(accepted("The deadline is 2026-09-06.")).toEqual(["2026-09-06"]);
    });

    it("rejects a dotted date that is really part of a longer dotted number", () => {
      const dmy: DateFormatEntry[] = [{ id: "dmy", pattern: "DD.MM.YYYY" }];

      expect(accepted("12.11.2026.5", dmy)).toEqual([]);
      expect(accepted("Shipped 12.11.2026.", dmy)).toEqual(["12.11.2026"]);
    });
  });

  describe("emphasis", () => {
    // All three mark up a date the user wrote in prose, and the plugin has no
    // business treating one of them differently from the other two.
    it("accepts a date in every kind of emphasis", () => {
      expect(accepted("*2026-09-06*")).toEqual(["2026-09-06"]);
      expect(accepted("_2026-09-06_")).toEqual(["2026-09-06"]);
      expect(accepted("**2026-09-06**")).toEqual(["2026-09-06"]);
      expect(accepted("__2026-09-06__")).toEqual(["2026-09-06"]);
      expect(accepted("~~2026-09-06~~")).toEqual(["2026-09-06"]);
    });

    it("accepts an emphasised date sitting in a sentence", () => {
      expect(accepted("due _2026-09-06_ at the latest")).toEqual(["2026-09-06"]);
    });

    // The case the underscore rule exists for. An underscore with a word on the
    // far side is joining the date to that word, not marking it up.
    it("still rejects a date that is one part of an underscored name", () => {
      expect(accepted("backup_2026-09-06_final")).toEqual([]);
      expect(accepted("_2026-09-06_final")).toEqual([]);
      expect(accepted("backup_2026-09-06")).toEqual([]);
    });
  });

  describe("calendar validity", () => {
    it("rejects a day the month does not have", () => {
      expect(accepted("2026-02-30")).toEqual([]);
    });

    it("rejects a month that does not exist", () => {
      expect(accepted("2026-13-01")).toEqual([]);
    });

    it("reports an impossible date as not-a-date rather than a boundary problem", () => {
      const [candidate] = scanText("2026-02-30", ISO);

      expect(candidate.reason).toBe("not-a-date");
    });

    it("accepts 29 February in a leap year and rejects it in a common year", () => {
      expect(accepted("2024-02-29")).toEqual(["2024-02-29"]);
      expect(accepted("2026-02-29")).toEqual([]);
    });
  });

  describe("format list", () => {
    it("finds nothing for a format the user has not added", () => {
      // Presence is the whole of a format's state: an empty list means no
      // detection, not detection with defaults.
      expect(accepted("06.09.2026", [])).toEqual([]);
    });

    it("gives an overlap to whichever enabled format comes first in the list", () => {
      const dayFirst = formats("DD/MM/YYYY", "MM/DD/YYYY");
      const monthFirst = formats("MM/DD/YYYY", "DD/MM/YYYY");

      expect(scanText("03/09/2026", dayFirst).find((c) => c.accepted)?.formatId).toBe("f0");
      expect(scanText("03/09/2026", monthFirst).find((c) => c.accepted)?.formatId).toBe("f0");
    });

    it("reports the losing format of an overlap rather than dropping it", () => {
      const both = formats("DD/MM/YYYY", "MM/DD/YYYY");
      const loser = scanText("03/09/2026", both).find((c) => !c.accepted);

      expect(loser?.formatId).toBe("f1");
      expect(loser?.reason).toBe("overlap");
    });

    it("skips an unusable format instead of throwing", () => {
      const entries: DateFormatEntry[] = [
        { id: "bad", pattern: "YYYY-QQ-DD" },
        { id: "iso", pattern: "YYYY-MM-DD" },
      ];

      expect(accepted("2026-09-06", entries)).toEqual(["2026-09-06"]);
    });
  });

  // The rule itself lives in markers.ts and is tested there. What matters here
  // is that a candidate carries the answer, because the editor layer reads it
  // off the detection rather than going back to the text for it.
  describe("task emoji markers", () => {
    it("records where the marker in front of a date begins", () => {
      const source = "- [ ] Write up 📅 2026-09-06";
      const [candidate] = scanText(source, ISO);

      expect(source.slice(candidate.markerFrom as number)).toBe("📅 2026-09-06");
    });

    it("leaves it unset on a date with nothing in front of it", () => {
      const [candidate] = scanText("due 2026-09-06 at the latest", ISO);

      expect(candidate.markerFrom).toBeUndefined();
    });

    it("records one on a date it rejected, so the reason is the only thing missing", () => {
      const [candidate] = scanText("📅 2026-02-30", ISO);

      expect(candidate.accepted).toBe(false);
      expect(candidate.markerFrom).toBe(0);
    });
  });
});

/**
 * The same rule asked of a date about to be written rather than one already
 * found, which is how the insert case knows which side needs a space.
 */
describe("cleanBoundaryBefore", () => {
  it("accepts the start of the note, where there is nothing to run into", () => {
    expect(cleanBoundaryBefore("2026", 0)).toBe(true);
  });

  it("accepts a space", () => {
    expect(cleanBoundaryBefore("due ", 4)).toBe(true);
  });

  it("accepts punctuation", () => {
    expect(cleanBoundaryBefore("due:", 4)).toBe(true);
  });

  it("refuses a letter", () => {
    expect(cleanBoundaryBefore("backup", 6)).toBe(false);
  });

  it("refuses a digit", () => {
    expect(cleanBoundaryBefore("v12", 3)).toBe(false);
  });

  it("accepts the underscores of emphasis", () => {
    expect(cleanBoundaryBefore("__", 2)).toBe(true);
  });

  it("refuses an underscore that joins the date to a word", () => {
    expect(cleanBoundaryBefore("backup_", 7)).toBe(false);
  });

  it("refuses a dot with a digit beyond it", () => {
    expect(cleanBoundaryBefore("5.", 2)).toBe(false);
  });

  it("accepts a dot ending a sentence", () => {
    expect(cleanBoundaryBefore("so.", 3)).toBe(true);
  });
});

describe("cleanBoundaryAfter", () => {
  it("accepts the end of the note", () => {
    expect(cleanBoundaryAfter("due ", 4)).toBe(true);
  });

  it("accepts a space", () => {
    expect(cleanBoundaryAfter(" x", 0)).toBe(true);
  });

  it("refuses a letter", () => {
    expect(cleanBoundaryAfter("up", 0)).toBe(false);
  });

  it("refuses a dot with a digit beyond it", () => {
    expect(cleanBoundaryAfter(".5", 0)).toBe(false);
  });

  it("accepts a dot ending a sentence", () => {
    expect(cleanBoundaryAfter(". ", 0)).toBe(true);
  });
});

/**
 * A month has two spellings in a language that declines them, and gate 3 knew
 * one of them. moment builds its strict month table from the standalone list —
 * the one a calendar shows — so `6 вересня 2026`, which is how Ukrainian
 * writes that date and what moment's own `format()` produces, was matched by
 * the regex and then thrown out here as not a date. The note said nothing,
 * because a rejected candidate looks exactly like text that was never a date.
 *
 * ru and lv accept both spellings unaided — ru ships parse regexes covering
 * each, lv declines nothing in a date — and are here to keep it that way.
 */
describe("a month name in a language that declines it", () => {
  const locale = moment.locale();
  const long = formats("D MMMM YYYY");
  const day = { year: 2026, month: 8, day: 6 };

  afterEach(() => {
    moment.locale(locale);
    setDetectionLocales(["en"]);
  });

  /**
   * Detection reads the languages that are turned on, not the app's own, so a
   * case about Ukrainian months has to turn Ukrainian on. In a real vault the
   * two coincide: `languages` is seeded with the app's language on first run.
   */
  const reading = (language: string) => {
    moment.locale(language);
    setDetectionLocales(["en", language]);
  };

  it.each(["ru", "uk", "lt", "lv"])("accepts the date %s itself writes", (language) => {
    reading(language);
    const written = moment.utc(day).format("D MMMM YYYY");

    expect(accepted(`до ${written} at the latest`, long)).toEqual([written]);
  });

  it.each(["ru", "uk", "lt", "lv"])("accepts the listed spelling in %s too", (language) => {
    reading(language);
    const written = `6 ${moment.months()[8]} 2026`;

    expect(accepted(written, long)).toEqual([written]);
  });

  it("still refuses a month name that is not one, and a day the month lacks", () => {
    reading("uk");

    expect(accepted("6 вересняти 2026", long)).toEqual([]);
    expect(accepted("31 вересня 2026", long)).toEqual([]);
  });

  it("still finds an English month name, which has one spelling", () => {
    moment.locale("en");

    expect(accepted("due 6 September 2026", long)).toEqual(["6 September 2026"]);
  });
});

describe("a note written in a language that was turned on", () => {
  const formats = [{ id: "long", pattern: "D MMMM YYYY" }];

  afterEach(() => {
    setDetectionLocales(["en"]);
  });

  it("finds a Spanish date with Spanish on and none with it off", () => {
    const text = "Vence el 6 septiembre 2026 sin falta.";

    setDetectionLocales(["en", "es"]);
    expect(scanText(text, formats).filter((found) => found.accepted)).toHaveLength(1);

    setDetectionLocales(["en"]);
    expect(scanText(text, formats).filter((found) => found.accepted)).toHaveLength(0);
  });

  it("finds an English date either way", () => {
    const text = "Due 6 September 2026 without fail.";

    setDetectionLocales(["en", "es"]);
    expect(scanText(text, formats).filter((found) => found.accepted)).toHaveLength(1);
  });
});

describe("the language a date was read in", () => {
  const long = formats("D MMMM YYYY");

  afterEach(() => {
    setDetectionLocales(["en"]);
  });

  it("is recorded on the candidate", () => {
    setDetectionLocales(["en", "ru"]);

    const [found] = scanText("6 сентября 2026", long).filter((c) => c.accepted);

    expect(found.locale).toBe("ru");
  });

  it("prefers the app's own language where several read it the same", () => {
    // `6 September 2026` is the same text in English and German. Picking a
    // different month afterwards is where that stops being harmless — October
    // against Oktober — so the reader's own language is the right guess.
    setDetectionLocales(["en", "de"]);

    const [found] = scanText("6 September 2026", long).filter((c) => c.accepted);

    expect(found.locale).toBe(moment.locale());
  });

  it("carries none where nothing read it", () => {
    setDetectionLocales(["en"]);

    expect(scanText("6 сентября 2026", long).filter((c) => c.accepted)).toHaveLength(0);
  });
});
