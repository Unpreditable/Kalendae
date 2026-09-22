import {
  checkFormat,
  compileFormat,
  parsesStrictly,
  setDetectionLocales,
  renderExample,
  renderPattern,
  tokenGroupsPresent,
  warnFormat,
} from "../../src/detect/formats";
import { moment } from "obsidian";

/** The whole match, or null when the pattern doesn't match at all. */
function firstMatch(pattern: string, text: string): string | null {
  return text.match(compileFormat(pattern).matcher)?.[0] ?? null;
}

describe("compileFormat", () => {
  it("turns YYYY-MM-DD into a matcher for a four-digit year and zero-padded parts", () => {
    expect(firstMatch("YYYY-MM-DD", "2026-09-06")).toBe("2026-09-06");
  });

  it("treats a separator dot as a literal dot, not as regex any-char", () => {
    expect(firstMatch("DD.MM.YYYY", "06x09x2026")).toBeNull();
    expect(firstMatch("DD.MM.YYYY", "06.09.2026")).toBe("06.09.2026");
  });

  it("lets single-letter D and M match either one or two digits", () => {
    expect(firstMatch("D/M/YYYY", "6/9/2026")).toBe("6/9/2026");
    expect(firstMatch("D/M/YYYY", "06/09/2026")).toBe("06/09/2026");
  });

  it("requires MM and DD to be zero-padded", () => {
    expect(firstMatch("YYYY-MM-DD", "2026-9-6")).toBeNull();
  });

  it("matches a two-digit year for YY", () => {
    expect(firstMatch("MM/DD/YY", "09/06/26")).toBe("09/06/26");
  });

  it("matches a full month name for MMMM", () => {
    expect(firstMatch("MMMM D, YYYY", "September 6, 2026")).toBe("September 6, 2026");
  });

  it("matches an abbreviated month name for MMM", () => {
    expect(firstMatch("D MMM YYYY", "6 Sep 2026")).toBe("6 Sep 2026");
  });

  it("matches a weekday name for dddd and ddd", () => {
    expect(firstMatch("dddd, MMMM D, YYYY", "Sunday, September 6, 2026")).toBe(
      "Sunday, September 6, 2026",
    );
    expect(firstMatch("YYYY-MM-DD (ddd)", "2026-09-06 (Sun)")).toBe("2026-09-06 (Sun)");
  });

  it("prefers the longest token, so MMMM is never read as MMM followed by M", () => {
    // Read as MMM + M, "Sep" would satisfy MMM and leave a stray M to match a
    // digit — the whole match would then fail on a real month name.
    expect(firstMatch("MMMM", "September")).toBe("September");
  });
});

describe("checkFormat", () => {
  it("accepts a pattern built only from known tokens and separators", () => {
    expect(checkFormat("YYYY-MM-DD")).toBeNull();
  });

  it("reports letters that are not moment tokens", () => {
    expect(checkFormat("YYYY-MM-DD Q")).toEqual({ code: "unknown-tokens", chars: "Q" });
  });

  it("reports a missing component before a stray letter", () => {
    // The stray QQ is what displaced the month, but a missing part is reported
    // first, so the Q goes unmentioned until a month token is supplied.
    expect(checkFormat("YYYY-QQ-DD")).toEqual({ code: "missing-component", component: "month" });
  });

  it("reports a pattern with no day component", () => {
    expect(checkFormat("YYYY-MM")).toEqual({ code: "missing-component", component: "day" });
  });

  it("reports a pattern with no year component", () => {
    expect(checkFormat("MM-DD")).toEqual({ code: "missing-component", component: "year" });
  });

  it("does not mistake non-latin literals for unknown tokens", () => {
    expect(checkFormat("YYYY年MM月DD日")).toBeNull();
  });

  it("accepts a weekday token as decoration without it counting as a day", () => {
    expect(checkFormat("dddd, MMMM YYYY")).toEqual({
      code: "missing-component",
      component: "day",
    });
  });

  it("refuses a bracket pair, which moment reads as escaped text", () => {
    // moment reads [YYYY-MM-DD] as the literal string "YYYY-MM-DD", so the
    // compiled regex still finds text in the note and the strict parse then
    // rejects it: the report calls a real date invalid and nothing is offered.
    expect(checkFormat("[[YYYY-MM-DD]]")).toEqual({ code: "bracket-pair" });
  });

  it("reports the brackets before the letters they hold", () => {
    // "Due" is only a stray letter run because the brackets were meant to
    // excuse it, so naming the letters would explain the wrong thing.
    expect(checkFormat("[Due] YYYY-MM-DD")).toEqual({ code: "bracket-pair" });
  });

  it("refuses a bracket with no partner too, so the rule is the character", () => {
    // moment does parse a lone bracket as a literal, so this one is refused by
    // choice rather than by necessity: nobody separates a date with a bracket,
    // and "your format can't use [ or ]" has to be true as written.
    expect(checkFormat("YYYY-MM-DD]")).toEqual({ code: "bracket-pair" });
  });
});

describe("the token vocabulary", () => {
  it("matches a numeric weekday for d", () => {
    expect(firstMatch("d YYYY-MM-DD", "0 2026-09-06")).toBe("0 2026-09-06");
  });

  it("matches a two-letter weekday for dd", () => {
    expect(firstMatch("dd YYYY-MM-DD", "Su 2026-09-06")).toBe("Su 2026-09-06");
  });

  it("matches an ordinal day for Do", () => {
    expect(firstMatch("Do MMMM YYYY", "6th September 2026")).toBe("6th September 2026");
  });

  it("counts Do as the day of the month", () => {
    expect(checkFormat("Do MMMM YYYY")).toBeNull();
  });

  it("does not count a weekday token as the day of the month", () => {
    expect(checkFormat("dd MMMM YYYY")).toEqual({ code: "missing-component", component: "day" });
  });

  it("lists each unsupported run separately rather than running them together", () => {
    // "(dddd) M-d-YY ee" once reported "dee" — the stray d and the stray ee
    // concatenated into a string that appears nowhere in the pattern. All three
    // required parts are present so the strays are what gets reported.
    expect(checkFormat("YYYY-MM-DD qq ee")).toEqual({ code: "unknown-tokens", chars: "qq, ee" });
  });

  it("accepts a pattern whose only former problem was d", () => {
    expect(checkFormat("(dddd) M-D-YY")).toBeNull();
  });
});

describe("renderExample", () => {
  const day = new Date(2026, 8, 6); // Sunday 6 September 2026, local

  it("writes the date using the pattern's tokens", () => {
    expect(renderExample("YYYY-MM-DD", day)).toBe("2026-09-06");
  });

  it("keeps separators and stray punctuation exactly as typed", () => {
    expect(renderExample("(dddd) D/M/YY", day)).toBe("(Sunday) 6/9/26");
  });

  it("leaves a token Kalendae does not support standing in the output", () => {
    // moment itself renders lowercase yyyy as the year, so formatting through
    // moment made the preview claim a pattern worked that Kalendae rejects.
    // The preview has to show what Kalendae does, not what moment could do.
    expect(renderExample("yyyy-MM-DD", day)).toBe("yyyy-09-06");
  });

  it("renders an empty pattern as nothing", () => {
    expect(renderExample("", day)).toBe("");
  });
});

describe("tokenGroupsPresent", () => {
  it("names the groups a pattern draws on", () => {
    expect(tokenGroupsPresent("YYYY-MM-DD")).toEqual(new Set(["year", "month", "day"]));
  });

  it("counts a weekday token as its own group, never as the day", () => {
    expect(tokenGroupsPresent("dddd")).toEqual(new Set(["weekday"]));
  });

  it("counts Do as the day", () => {
    expect(tokenGroupsPresent("Do")).toEqual(new Set(["day"]));
  });

  it("names nothing for a pattern of pure punctuation", () => {
    expect(tokenGroupsPresent("--/--")).toEqual(new Set());
  });
});

describe("checkFormat and numbers that run together", () => {
  it("refuses two number tokens with nothing between them", () => {
    expect(checkFormat("DMMYYYY")).toEqual({
      code: "adjacent-numbers",
      first: "D",
      second: "MM",
      widen: [{ from: "D", to: "DD" }],
    });
  });

  it("offers the fixed-width form of whichever token has one", () => {
    // Separating them is one fix; YY-MM-DD is the other, and keeps the shape.
    expect(checkFormat("YYMDD")).toEqual({
      code: "adjacent-numbers",
      first: "YY",
      second: "M",
      widen: [{ from: "M", to: "MM" }],
    });
  });

  it("offers both where both tokens are one digit or two", () => {
    expect(checkFormat("MDYYYY")).toEqual({
      code: "adjacent-numbers",
      first: "M",
      second: "D",
      widen: [
        { from: "M", to: "MM" },
        { from: "D", to: "DD" },
      ],
    });
  });

  it("offers nothing to widen where the token has no fixed-width form", () => {
    // Do renders "7th", which has no two-digit sibling to grow into.
    expect(checkFormat("MMDo YYYY")).toEqual({
      code: "adjacent-numbers",
      first: "MM",
      second: "Do",
      widen: [],
    });
  });

  it("allows fixed widths to run together, since they can be read back", () => {
    expect(checkFormat("YYYYMMDD")).toBeNull();
    expect(checkFormat("DDMMYYYY")).toBeNull();
  });

  it("accepts numbers parted by so much as a single character", () => {
    expect(checkFormat("YYYY-MM-DD")).toBeNull();
    expect(checkFormat("DD.MM.YYYY")).toBeNull();
  });

  it("accepts a spelled-out month between two numbers", () => {
    // Month names cannot run into a digit, which is what makes this legible.
    expect(checkFormat("D MMMM YYYY")).toBeNull();
    expect(checkFormat("DMMMMYYYY")).toBeNull();
  });

  it("accepts an ordinal before a number, since it ends in letters", () => {
    expect(checkFormat("Do MMMM YYYY")).toBeNull();
  });

  it("reports a missing part before numbers running together", () => {
    // "DDMM" has both faults: no year at all, and two numbers touching.
    expect(checkFormat("DDMM")).toEqual({ code: "missing-component", component: "year" });
  });
});

describe("warnFormat", () => {
  it("warns that a run of fixed widths matches plain numbers, and counts them", () => {
    expect(warnFormat("YYYYMMDD")).toEqual({ code: "number-run", digits: 8 });
    expect(warnFormat("DDMMYY")).toEqual({ code: "number-run", digits: 6 });
  });

  it("says nothing about a lone number token", () => {
    // Four digits on their own are a year, which is what YYYY is for.
    expect(warnFormat("YYYY-MM-DD")).toBeNull();
    expect(warnFormat("D MMMM YYYY")).toBeNull();
  });

  it("says nothing where a separator keeps the match off a bare number", () => {
    expect(warnFormat("YYYYMM-DD")).toBeNull();
  });

  it("says nothing where anything else in the format distinguishes the match", () => {
    // Six digits at the end, but only ever after a weekday, a month name and a
    // dash — a plain number cannot match this.
    expect(warnFormat("(dddd) MMM-DDYYYY")).toBeNull();
    expect(checkFormat("(dddd) MMM-DDYYYY")).toBeNull();
  });
});

/**
 * moment's `ordinal` takes the period the number is standing in, and several
 * locales answer differently for each — Russian writes the day of the month as
 * "16-го" and the month as "1-й". Four of the thirteen languages this plugin
 * ships return the bare **number** when no period is given at all, which is not
 * a string and used to crash the settings tab on load.
 */
describe("Do, in a locale whose ordinals are not plain numbers", () => {
  const locale = moment.locale();

  afterEach(() => {
    moment.locale(locale);
  });

  it.each(["ru", "uk", "ja", "ko"])("compiles in %s rather than throwing", (language) => {
    moment.locale(language);

    expect(() => compileFormat("Do MMMM YYYY")).not.toThrow();
    expect(checkFormat("Do MMMM YYYY")).toBeNull();
  });

  it("matches the ordinal moment actually writes", () => {
    moment.locale("ru");
    // The ordinal follows the app's language; the month follows the enabled
    // list, and this case needs both to be Russian.
    setDetectionLocales(["en", "ru"]);

    const written = moment.utc({ year: 2026, month: 8, day: 16 }).format("Do MMMM YYYY");

    expect(written).toBe("16-го сентября 2026");
    expect(firstMatch("Do MMMM YYYY", written)).toBe(written);
  });

  it("still matches a plain English ordinal", () => {
    moment.locale("en");

    expect(firstMatch("Do MMMM YYYY", "16th September 2026")).toBe("16th September 2026");
  });
});

/**
 * A language that declines its months spells one month two ways, and a note may
 * hold either. `moment.months()` lists the standalone name — the one a reader
 * sees in a calendar and may well type — while a date written out carries the
 * in-date name, which is a different word: Russian lists `сентябрь` and writes
 * `6 сентября 2026`. The compiled alternation used to carry the standalone
 * list alone, so `D MMMM YYYY` found nothing at all in ru, uk and lt — silently,
 * a format matching nothing looking exactly like a note with no dates in it.
 *
 * lv is here because it is the language that proves the fix is not a Slavic
 * special case: it declines nothing in a date, so both spellings are one word
 * and the test must still pass.
 */
describe("month names, in a language that declines them", () => {
  const locale = moment.locale();
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

  it("is two different words in Russian, so nothing below is vacuous", () => {
    moment.locale("ru");

    expect(moment.months()[8]).toBe("сентябрь");
    expect(moment.months("D MMMM")[8]).toBe("сентября");
    expect(moment.monthsShort()[4]).toBe("май");
    expect(moment.monthsShort("D MMM")[4]).toBe("мая");
  });

  it.each(["ru", "uk", "lt", "lv"])("matches a date as %s writes one", (language) => {
    reading(language);

    for (const pattern of ["D MMMM YYYY", "D MMM YYYY"]) {
      const written = moment.utc(day).format(pattern);

      expect(firstMatch(pattern, written)).toBe(written);
    }
  });

  it.each(["ru", "uk", "lt", "lv"])("matches the listed spelling in %s too", (language) => {
    reading(language);

    // renderPattern formats each token on its own, so a month name comes back
    // in the standalone spelling — the one a reader copying the calendar would
    // type. Whichever spelling is written, detection has to find it again.
    for (const pattern of ["D MMMM YYYY", "D MMM YYYY"]) {
      const written = renderPattern(pattern, day);

      expect(firstMatch(pattern, written)).toBe(written);
    }
  });

  it("still matches an English month name, which has one spelling", () => {
    moment.locale("en");

    expect(firstMatch("D MMMM YYYY", "6 September 2026")).toBe("6 September 2026");
    expect(firstMatch("D MMM YYYY", "6 Sep 2026")).toBe("6 Sep 2026");
  });
});

/**
 * The other half of the same problem, and the half that reaches the note:
 * moment writes the in-date spelling only when it can see a day token beside
 * the month, so a pattern rendered a token at a time came back in the
 * standalone spelling and Kalendae wrote `6 сентябрь 2026` into a Russian
 * note — a date no Russian speaker would write.
 */
describe("renderPattern, where the spelling depends on the whole pattern", () => {
  const locale = moment.locale();
  const day = { year: 2026, month: 8, day: 6 };

  afterEach(() => {
    moment.locale(locale);
  });

  it.each(["ru", "uk", "lt", "lv"])("writes what moment itself writes in %s", (language) => {
    moment.locale(language);

    // Patterns moment reads the same way we do, so its own output is the
    // answer to compare against: every letter in them is a token.
    for (const pattern of ["D MMMM YYYY", "DD MMMM YYYY", "Do MMMM YYYY", "D MMM YYYY"]) {
      expect(renderPattern(pattern, day)).toBe(moment.utc(day).format(pattern));
    }
  });

  it("writes the standalone spelling where the month stands alone", () => {
    moment.locale("ru");

    // Not a hedge — `сентябрь 2026` is the correct Russian for a month and a
    // year with no day in them, and it is moment's rule about a neighbouring
    // day token that gets it right. Rewriting every month name to the in-date
    // spelling would have written `сентября 2026` here.
    expect(renderPattern("MMMM YYYY", day)).toBe("сентябрь 2026");
    expect(renderPattern("D MMMM YYYY", day)).toBe("6 сентября 2026");
  });

  it("keeps every literal exactly as typed", () => {
    moment.locale("en");

    expect(renderPattern("DD.MM.YYYY", day)).toBe("06.09.2026");
    expect(renderPattern("#DD.MM.YYYY#", day)).toBe("#06.09.2026#");
    expect(renderPattern("(week) DD/MM/YYYY", day)).toBe("(week) 06/09/2026");
  });

  it("leaves a letter Kalendae does not compile standing, as it always has", () => {
    moment.locale("en");

    expect(renderPattern("yyyy-MM-DD", day)).toBe("yyyy-09-06");
    expect(renderPattern("", day)).toBe("");
  });
});

/**
 * Which languages detection reads.
 *
 * Set back to English after each case: the locales are module state, the way
 * the compiled-pattern cache beside them is, so a case that left one on would
 * change what the next one sees.
 */
describe("month names from a language that was turned on", () => {
  afterEach(() => {
    setDetectionLocales(["en"]);
  });

  it("matches a Spanish month once Spanish is on, and not before", () => {
    setDetectionLocales(["en"]);
    expect(firstMatch("D MMMM YYYY", "6 septiembre 2026")).toBeNull();

    setDetectionLocales(["en", "es"]);
    expect(firstMatch("D MMMM YYYY", "6 septiembre 2026")).toBe("6 septiembre 2026");
  });

  it("keeps English matching when another language is added", () => {
    setDetectionLocales(["en", "es"]);

    expect(firstMatch("D MMMM YYYY", "6 September 2026")).toBe("6 September 2026");
  });

  it("takes both spellings of a language that declines its months", () => {
    setDetectionLocales(["en", "uk"]);

    expect(firstMatch("D MMMM YYYY", "6 вересня 2026")).toBe("6 вересня 2026");
    expect(firstMatch("D MMMM YYYY", "6 вересень 2026")).toBe("6 вересень 2026");
  });

  it("rebuilds when the set changes rather than serving a stale regex", () => {
    setDetectionLocales(["en", "es"]);
    expect(firstMatch("D MMMM YYYY", "6 septiembre 2026")).not.toBeNull();

    setDetectionLocales(["en"]);
    expect(firstMatch("D MMMM YYYY", "6 septiembre 2026")).toBeNull();
  });

  it("takes weekday names from an enabled language too", () => {
    setDetectionLocales(["en", "es"]);

    expect(firstMatch("dddd, D MMMM YYYY", "domingo, 6 septiembre 2026")).toBe(
      "domingo, 6 septiembre 2026",
    );
  });
});

describe("parsesStrictly, across the enabled languages", () => {
  afterEach(() => {
    setDetectionLocales(["en"]);
  });

  it("accepts a date written in a language that is on", () => {
    setDetectionLocales(["en", "fr"]);

    expect(parsesStrictly("6 septembre 2026", "D MMMM YYYY")).toBe(true);
  });

  it("refuses the same date when that language is off", () => {
    setDetectionLocales(["en"]);

    expect(parsesStrictly("6 septembre 2026", "D MMMM YYYY")).toBe(false);
  });

  it("still accepts the declined spelling a locale writes", () => {
    setDetectionLocales(["en", "uk"]);

    expect(parsesStrictly("6 вересня 2026", "D MMMM YYYY")).toBe(true);
  });

  it("refuses a day the month does not have, in any language", () => {
    setDetectionLocales(["en", "fr"]);

    expect(parsesStrictly("31 septembre 2026", "D MMMM YYYY")).toBe(false);
  });

  it("keeps English working when a language is on", () => {
    setDetectionLocales(["en", "fr"]);

    expect(parsesStrictly("6 September 2026", "D MMMM YYYY")).toBe(true);
  });
});
