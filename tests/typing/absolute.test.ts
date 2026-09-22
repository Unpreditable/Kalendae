import { AbsoluteContext, Spelling, absoluteDates } from "../../src/typing/absolute";

/**
 * A day named outright. Today is Sunday 13 September 2026 throughout, as in the
 * entries tests, and months are 0-based: November is 10.
 *
 * `months` is empty in most cases, which leaves the module's own English table
 * as the only one — that is the shape a vault in English hands over anyway.
 */
const context: AbsoluteContext = {
  today: { year: 2026, month: 8, day: 13 },
  months: [],
};

/** The days a query lands on, which is what most cases here are about. */
const daysFor = (query: string, on: AbsoluteContext = context) =>
  absoluteDates(query, on).map((row) => row.day);

/** Twelve lists of plain spellings, every one of them tagged with one language. */
const inLanguage = (locale: string, months: string[][]): Spelling[][] =>
  months.map((names) => names.map((text) => ({ text, locale })));

describe("absoluteDates", () => {
  it("reads a month and a day, in either order", () => {
    expect(daysFor("nov 3")).toEqual([
      { year: 2026, month: 10, day: 3 },
      { year: 2025, month: 10, day: 3 },
    ]);
    expect(daysFor("3 nov")).toEqual(daysFor("nov 3"));
    expect(daysFor("november 3")).toEqual(daysFor("nov 3"));
  });

  it("offers the nearest forward first, counting today", () => {
    // 13 September is today, so forward is today itself.
    expect(daysFor("sep 13")).toEqual([
      { year: 2026, month: 8, day: 13 },
      { year: 2025, month: 8, day: 13 },
    ]);
    // 12 September has gone, so forward is next year.
    expect(daysFor("sep 12")).toEqual([
      { year: 2027, month: 8, day: 12 },
      { year: 2026, month: 8, day: 12 },
    ]);
  });

  it("finds the nearest occurrence rather than the nearest year", () => {
    expect(daysFor("feb 29")).toEqual([
      { year: 2028, month: 1, day: 29 },
      { year: 2024, month: 1, day: 29 },
    ]);
  });

  it("reads a month alone as the 1st of it", () => {
    expect(daysFor("nov")).toEqual([
      { year: 2026, month: 10, day: 1 },
      { year: 2025, month: 10, day: 1 },
    ]);
  });

  it("takes a year as the year it says", () => {
    expect(daysFor("nov 3 2027")).toEqual([{ year: 2027, month: 10, day: 3 }]);
    expect(daysFor("3 nov 2027")).toEqual([{ year: 2027, month: 10, day: 3 }]);
    expect(daysFor("nov 3 198")).toEqual([{ year: 198, month: 10, day: 3 }]);
    expect(daysFor("nov 3 1")).toEqual([{ year: 1, month: 10, day: 3 }]);
    expect(daysFor("nov 3 0026")).toEqual([{ year: 26, month: 10, day: 3 }]);
    expect(daysFor("nov 3 3")).toEqual([{ year: 3, month: 10, day: 3 }]);
  });

  it("reads two digits both ways, the century first", () => {
    expect(daysFor("nov 3 26")).toEqual([
      { year: 2026, month: 10, day: 3 },
      { year: 26, month: 10, day: 3 },
    ]);
  });

  it("answers to any prefix of a month, and to every month a prefix names", () => {
    expect(daysFor("n 3")).toEqual(daysFor("nov 3"));
    expect(daysFor("3 n")).toEqual(daysFor("nov 3"));
    expect(daysFor("j")).toEqual([
      { year: 2027, month: 0, day: 1 },
      { year: 2026, month: 0, day: 1 },
      { year: 2027, month: 5, day: 1 },
      { year: 2026, month: 5, day: 1 },
      { year: 2027, month: 6, day: 1 },
      { year: 2026, month: 6, day: 1 },
    ]);
  });

  it("ignores case, doubled spaces, a leading zero and a trailing space", () => {
    expect(daysFor("NOV 3")).toEqual(daysFor("nov 3"));
    expect(daysFor("nov  3")).toEqual(daysFor("nov 3"));
    expect(daysFor("nov 03")).toEqual(daysFor("nov 3"));
    expect(daysFor("nov 3 ")).toEqual(daysFor("nov 3"));
  });

  it("takes a comma after the day, where a format writes one", () => {
    expect(daysFor("nov 3, 2027")).toEqual([{ year: 2027, month: 10, day: 3 }]);
    expect(daysFor("3, nov")).toEqual([]);
    expect(daysFor("3 nov, 2027")).toEqual([]);
  });

  it("drops a day the month does not have", () => {
    expect(daysFor("feb 30")).toEqual([]);
    expect(daysFor("feb 30 2026")).toEqual([]);
    expect(daysFor("feb 29 2026")).toEqual([]);
  });

  it("reads the reader's own month names, in every form they are handed in", () => {
    const russian: AbsoluteContext = {
      ...context,
      months: inLanguage("ru", [
        ["январь", "янв.", "января"],
        ["февраль", "февр.", "февраля"],
        ["март", "март", "марта"],
        ["апрель", "апр.", "апреля"],
        ["май", "май", "мая"],
        ["июнь", "июнь", "июня"],
        ["июль", "июль", "июля"],
        ["август", "авг.", "августа"],
        ["сентябрь", "сент.", "сентября"],
        ["октябрь", "окт.", "октября"],
        ["ноябрь", "нояб.", "ноября"],
        ["декабрь", "дек.", "декабря"],
      ]),
    };

    expect(daysFor("ноя 3", russian)).toEqual(daysFor("nov 3"));
    expect(daysFor("ноября 3", russian)).toEqual(daysFor("nov 3"));
    expect(daysFor("нояб 3", russian)).toEqual(daysFor("nov 3"));
    // English is the module's own, and answers whatever the reader's language is.
    expect(daysFor("nov 3", russian)).toEqual(daysFor("nov 3"));
  });

  it("refuses a prefix of digits alone, so a count stays a count", () => {
    const japanese: AbsoluteContext = {
      ...context,
      months: inLanguage("ja", Array.from({ length: 12 }, (_unused, month) => [`${month + 1}月`])),
    };

    expect(daysFor("3", japanese)).toEqual([]);
    expect(daysFor("3 4", japanese)).toEqual([]);
    expect(daysFor("11月 3", japanese)).toEqual(daysFor("nov 3"));
    // A whole name answers even where a longer name starts with it.
    expect(daysFor("1月 3", japanese)).toEqual([
      { year: 2027, month: 0, day: 3 },
      { year: 2026, month: 0, day: 3 },
    ]);
  });

  it("cannot type a month name with a space in it", () => {
    const vietnamese: AbsoluteContext = {
      ...context,
      months: inLanguage("vi", Array.from({ length: 12 }, (_unused, month) => [`tháng ${month + 1}`])),
    };

    expect(daysFor("tháng 11 3", vietnamese)).toEqual([]);
    expect(daysFor("tháng", vietnamese)).toEqual([]);
  });

  it("is not read at all where the query is something else", () => {
    expect(daysFor("")).toEqual([]);
    expect(daysFor("3")).toEqual([]);
    expect(daysFor("nov 0")).toEqual([]);
    expect(daysFor("nov 32")).toEqual([]);
    expect(daysFor("nov 00")).toEqual([]);
    expect(daysFor("2026 nov 3")).toEqual([]);
    expect(daysFor("nov 3rd")).toEqual([]);
    expect(daysFor("nov 3 eow")).toEqual([]);
    expect(daysFor("11/3")).toEqual([]);
    expect(daysFor("nov nov")).toEqual([]);
    expect(daysFor("lunch")).toEqual([]);
    expect(daysFor("next friday")).toEqual([]);
  });

  it("completes the query with the day and the year, keeping what was typed", () => {
    const completions = (query: string) => absoluteDates(query, context).map((row) => row.complete);

    expect(completions("nov 3")).toEqual(["nov 3 2026", "nov 3 2025"]);
    expect(completions("3 nov")).toEqual(["3 nov 2026", "3 nov 2025"]);
    expect(completions("nov")).toEqual(["nov 1 2026", "nov 1 2025"]);
    expect(completions("NOV 3")).toEqual(["NOV 3 2026", "NOV 3 2025"]);
    expect(completions("nov  3")).toEqual(["nov 3 2026", "nov 3 2025"]);
    expect(completions("nov 3,")).toEqual(["nov 3, 2026", "nov 3, 2025"]);
    // Two digits are the ambiguous length, so both rows spell the year in full.
    expect(completions("nov 3 26")).toEqual(["nov 3 2026", "nov 3 0026"]);
    // Nothing missing, nothing to complete.
    expect(completions("nov 3 2026")).toEqual([null]);
    expect(completions("nov 3 198")).toEqual([null]);
  });
});

describe("the language a month name was read in", () => {
  const localesFor = (query: string, on: AbsoluteContext = context) =>
    absoluteDates(query, on).map((row) => row.locale);

  const latvian = inLanguage("lv", [
    ["janvāris", "jan"],
    ["februāris", "feb"],
    ["marts", "mar"],
    ["aprīlis", "apr"],
    ["maijs", "mai"],
    ["jūnijs", "jūn"],
    ["jūlijs", "jūl"],
    ["augusts", "aug"],
    ["septembris", "sep"],
    ["oktobris", "okt"],
    ["novembris", "nov"],
    ["decembris", "dec"],
  ]);
  const english = inLanguage("en", [
    ["January", "Jan"],
    ["February", "Feb"],
    ["March", "Mar"],
    ["April", "Apr"],
    ["May"],
    ["June", "Jun"],
    ["July", "Jul"],
    ["August", "Aug"],
    ["September", "Sep"],
    ["October", "Oct"],
    ["November", "Nov"],
    ["December", "Dec"],
  ]);
  /** Each month's spellings, the first table's before the second's. */
  const merged = (first: Spelling[][], second: Spelling[][]) =>
    first.map((names, month) => [...names, ...second[month]]);

  it("is the language whose spelling matched", () => {
    const withRussian: AbsoluteContext = {
      ...context,
      months: inLanguage("ru", [
        ["январь"], ["февраль"], ["март"], ["апрель"], ["май"], ["июнь"],
        ["июль"], ["август"], ["сентябрь"], ["октябрь"], ["ноябрь", "ноября"], ["декабрь"],
      ]),
    };

    expect(localesFor("ноя 3", withRussian)).toEqual(["ru", "ru"]);
    expect(localesFor("nov 3", withRussian)).toEqual(["en", "en"]);
  });

  it("is English for the module's own table, with nothing handed in", () => {
    expect(localesFor("sept 3")).toEqual(["en", "en"]);
  });

  it("goes to whichever language is listed first where two read the prefix", () => {
    // `ma` is March and May in English and marts and maijs in Latvian. The
    // caller lists the app's own language first, which is how it wins.
    const appLatvian: AbsoluteContext = { ...context, months: merged(latvian, english) };
    const appEnglish: AbsoluteContext = { ...context, months: merged(english, latvian) };

    expect(new Set(localesFor("ma 13", appLatvian))).toEqual(new Set(["lv"]));
    expect(new Set(localesFor("ma 13", appEnglish))).toEqual(new Set(["en"]));
  });

  it("is decided month by month, not once for the query", () => {
    // `jū` is Latvian alone — jūnijs, jūlijs — and `ju` English alone.
    const appEnglish: AbsoluteContext = { ...context, months: merged(english, latvian) };

    expect(new Set(localesFor("jū 3", appEnglish))).toEqual(new Set(["lv"]));
    expect(new Set(localesFor("ju 3", appEnglish))).toEqual(new Set(["en"]));
  });
});
