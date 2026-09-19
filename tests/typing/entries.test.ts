import { Entry, EntryContext, entriesFor } from "../../src/typing/entries";

/**
 * What a query puts in the list. Weekday numbers are moment's — Sunday 0 —
 * and months are 0-based, as everywhere else in this codebase.
 *
 * Today is Sunday 13 September 2026 throughout, and the week starts on Sunday,
 * which is what makes the end of this week a Saturday.
 */
/** The keyword a row advertises, or "" for the rows that carry none. */
const keywordOf = (entry: Entry): string =>
  entry.kind === "named" || entry.kind === "step" ? entry.keyword : "";

const context: EntryContext = {
  today: { year: 2026, month: 8, day: 13 },
  firstDay: 0,
  months: [],
  formats: [{ id: "iso", pattern: "YYYY-MM-DD" }],
  formatChar: "_",
  names: [
    { label: "Today", rule: null },
    { label: "Tomorrow", rule: "today +1d" },
    { label: "Next Friday", rule: "today +1Fri" },
    { label: "End of this month", rule: "today EoM" },
  ],
};

describe("entriesFor", () => {
  it("lists every name for the trigger alone", () => {
    const entries = entriesFor("", context);

    expect(entries.map((entry) => entry.kind === "named" && entry.label)).toEqual([
      "Today",
      "Tomorrow",
      "Next Friday",
      "End of this month",
    ]);
  });

  it("carries the row that is today itself, which is not a rule", () => {
    expect(entriesFor("today", context)).toEqual([
      {
        kind: "named",
        label: "Today",
        keyword: "today",
        complete: "today ",
        day: { year: 2026, month: 8, day: 13 },
        rule: null,
      },
    ]);
    expect(entriesFor("tod", context)[0]).toEqual(entriesFor("today", context)[0]);
  });

  it("reads an anchor typed by hand followed by a step", () => {
    const [entry] = entriesFor("today 1d", context);

    expect(entry.kind).toBe("step");
    expect(entry.kind === "step" && entry.keyword).toBe("+1d");
    expect(entry.kind === "step" && entry.day).toEqual({ year: 2026, month: 8, day: 14 });
  });

  it("narrows to the names that start with what was typed, ignoring case", () => {
    expect(entriesFor("tom", context)).toEqual([
      {
        kind: "named",
        label: "Tomorrow",
        keyword: "+1d",
        complete: "+1d ",
        day: { year: 2026, month: 8, day: 14 },
        rule: { anchor: "today", steps: [{ kind: "amount", count: 1, unit: "d", back: false }] },
      },
    ]);
  });

  it("matches a word inside a name, not only its first one", () => {
    const entries = entriesFor("friday", context);

    expect(entries[0]).toEqual(
      expect.objectContaining({ kind: "named", label: "Next Friday", keyword: "+1Fri" }),
    );
  });

  it("matches a whole name across its spaces", () => {
    const entries = entriesFor("end of this", context);

    expect(entries.map((entry) => entry.kind === "named" && entry.label)).toEqual([
      "End of this month",
    ]);
  });

  it("resolves a name to a day, not to today", () => {
    const [entry] = entriesFor("end of this m", context);

    expect(entry.kind === "named" && entry.day).toEqual({ year: 2026, month: 8, day: 30 });
  });

  it("offers step rows once the query reads as a rule", () => {
    const entries = entriesFor("2", context);

    expect(entries.every((entry) => entry.kind === "step")).toBe(true);
    expect(entries.map((entry) => entry.kind === "step" && entry.keyword)).toEqual(
      expect.arrayContaining(["+2d", "+2w", "+2M", "+2Q", "+2y"]),
    );
  });

  it("resolves a step row through the whole chain", () => {
    // Two weeks on is Sunday 27 September; the end of the week that Sunday
    // starts, with the week starting on Sunday, is Saturday 3 October.
    const entries = entriesFor("2w Eo", context);
    const week = entries.find((entry) => entry.kind === "step" && entry.keyword === "EoW");

    expect(week && week.kind === "step" && week.day).toEqual({ year: 2026, month: 9, day: 3 });
  });

  it("shows the token a row adds, not the chain it completes", () => {
    const entries = entriesFor("2w Eo", context);

    expect(entries.map((entry) => entry.kind === "step" && entry.keyword)).toEqual([
      "EoW",
      "EoM",
      "EoQ",
      "EoY",
    ]);
  });

  it("appends the token to what was typed, keeping it word for word", () => {
    const [entry] = entriesFor("today 1", context);

    expect(entry.kind === "step" && entry.complete).toBe("today +1d ");
  });

  it("keeps the chain as typed at the top, as a step before the space and an accept after", () => {
    expect(entriesFor("2w", context)[0]).toEqual(
      expect.objectContaining({ kind: "step", keyword: "+2w", complete: "2w " }),
    );
    expect(entriesFor("2w ", context)[0]).toEqual({
      kind: "accept",
      day: { year: 2026, month: 8, day: 27 },
    });
  });

  it("answers a finished token with that one answer, not every alternative", () => {
    // `suggestionsFor` offers every token in place once the one under the caret
    // is complete, which is what the builder in settings needs. Here it would
    // be twenty-seven ways to unsay what was just said.
    expect(entriesFor("Sun", context)).toEqual([
      expect.objectContaining({ kind: "step", keyword: "Sun", complete: "Sun " }),
    ]);
    expect(entriesFor("Su", context)).toEqual([
      expect.objectContaining({ kind: "step", keyword: "Sun", complete: "Sun " }),
    ]);
  });

  it("opens the next step only once a space asks for one", () => {
    const entries = entriesFor("Sun ", context);

    // The inclusive form counts today, and today is a Sunday.
    expect(entries[0]).toEqual({ kind: "accept", day: { year: 2026, month: 8, day: 13 } });
    expect(entries.slice(1).every((entry) => entry.kind === "step")).toBe(true);
    expect(
      entries.slice(1).every((entry) => entry.kind === "step" && entry.complete.startsWith("Sun ")),
    ).toBe(true);
    expect(entries.map(keywordOf)).toEqual(expect.arrayContaining(["Sun", "+1d", "EoW"]));
  });

  it("offers the accept row after a space on every date, the bare anchor included", () => {
    const afterAnchor = entriesFor("today ", context);

    expect(afterAnchor[0]).toEqual({
      kind: "accept",
      day: { year: 2026, month: 8, day: 13 },
    });
    expect(afterAnchor.slice(1).every((entry) => entry.kind === "step")).toBe(true);

    for (const query of ["Sun ", "2w ", "eom ", "2w eow "]) {
      expect(entriesFor(query, context)[0]).toEqual(
        expect.objectContaining({ kind: "accept" }),
      );
    }
  });

  it("lists one row when two names hold the same rule, the first one", () => {
    const names = [
      { label: "Tomorrow", rule: "today +1d" },
      { label: "1 day on", rule: "today +1d" },
      { label: "Next Friday", rule: "today +1Fri" },
    ];
    const entries = entriesFor("", { ...context, names });

    expect(entries.map((entry) => entry.kind === "named" && entry.label)).toEqual([
      "Tomorrow",
      "Next Friday",
    ]);
  });

  it("does not list the bare anchor twice before the space", () => {
    const entries = entriesFor("today", context);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(expect.objectContaining({ kind: "named", label: "Today" }));
  });

  it("offers a name of several steps in first position and nowhere else", () => {
    const names = [...context.names, { label: "Start of next week", rule: "today +1w SoW" }];
    const withMultiStep = { ...context, names };

    // First position, whole or partly typed, with or without its spaces.
    expect(entriesFor("", withMultiStep).some((entry) => entry.kind === "named")).toBe(true);
    expect(entriesFor("start", withMultiStep)[0]).toEqual(
      expect.objectContaining({ kind: "named", label: "Start of next week", keyword: "+1w SoW" }),
    );
    expect(entriesFor("start of next", withMultiStep)[0]).toEqual(
      expect.objectContaining({ kind: "named", label: "Start of next week" }),
    );

    // Never once a step or the anchor stands before the caret.
    for (const query of ["today start", "2w start", "Sun start", "2w eow start", "today "]) {
      expect(entriesFor(query, withMultiStep).some((entry) => entry.kind === "named")).toBe(false);
    }
  });

  it("leaves no accept row where the chain so far is not a date", () => {
    expect(entriesFor("2w lunch ", context)).toEqual([{ kind: "invalid" }]);
  });

  it("offers a name only in first position", () => {
    expect(entriesFor("tod", context).some((entry) => entry.kind === "named")).toBe(true);
    expect(entriesFor("today ", context).some((entry) => entry.kind === "named")).toBe(false);
    expect(entriesFor("2w ", context).some((entry) => entry.kind === "named")).toBe(false);
  });

  it("answers an unmatched query with one invalid row", () => {
    expect(entriesFor("nonsense", context)).toEqual([{ kind: "invalid" }]);
    expect(entriesFor("2w lunch", context)).toEqual([{ kind: "invalid" }]);
  });

  it("puts a name before a rule that reads the same way", () => {
    const entries = entriesFor("e", context);

    expect(entries[0].kind).toBe("named");
  });

  it("lists one row for a name and a step that mean the same thing", () => {
    // "End of this month" is a name and `EoM` is a step, and they are one date.
    const keywords = entriesFor("eo", context).map(keywordOf);

    expect(keywords.filter((keyword) => keyword === "EoM")).toHaveLength(1);
    expect(keywords).toEqual(expect.arrayContaining(["EoW", "EoQ", "EoY"]));
  });
});

describe("words", () => {
  it("finds a date nobody named", () => {
    const [entry] = entriesFor("in three weeks", context);

    expect(entry).toEqual(
      expect.objectContaining({ kind: "step", keyword: "+3w", complete: "+3w " }),
    );
    expect(entry.kind === "step" && entry.day).toEqual({ year: 2026, month: 9, day: 4 });
  });

  it("writes the canonical spelling, not the words", () => {
    const [entry] = entriesFor("3 months ago", context);

    expect(entry.kind === "step" && entry.complete).toBe("-3M ");
    expect(entry.kind === "step" && entry.day).toEqual({ year: 2026, month: 5, day: 13 });
  });

  it("gives one row to the several ways of saying one date", () => {
    for (const query of ["in a month", "in 1 month", "in one month", "next month"]) {
      const months = entriesFor(query, context).filter((entry) => keywordOf(entry) === "+1M");

      expect(months).toHaveLength(1);
    }
  });

  it("says which way a token count runs when the sign does not", () => {
    // `2w` is the token spelling of `2 weeks`, and neither names a direction.
    expect(entriesFor("2w", context).map(keywordOf)).toEqual(["+2w", "-2w", "+2Wed", "-2Wed"]);

    // A sign settles it, and the twins go away — the two rows left are the two
    // subjects `2w` is a prefix of, which is a different thing entirely.
    expect(entriesFor("-2w", context).map(keywordOf)).toEqual(["-2w", "-2Wed"]);
    expect(entriesFor("+2w", context).map(keywordOf)).toEqual(["+2w", "+2Wed"]);

    // An edge has no direction to offer.
    expect(entriesFor("2w eow", context).map(keywordOf)).toEqual(["EoW"]);
  });

  it("says which way a count runs when the words do not", () => {
    expect(entriesFor("3 months", context).map(keywordOf)).toEqual(["+3M", "-3M"]);
  });

  it("names the number as the problem when only the number is", () => {
    expect(entriesFor("in 1000 days", context)).toEqual([{ kind: "invalid", reason: "count" }]);
    expect(entriesFor("nonsense", context)).toEqual([{ kind: "invalid" }]);
  });

  it("lets a name win the row it shares with a phrase", () => {
    const entries = entriesFor("next friday", context);

    expect(entries[0]).toEqual(expect.objectContaining({ kind: "named", label: "Next Friday" }));
    expect(
      entries.filter((entry) => keywordOf(entry) === "+1Fri"),
    ).toHaveLength(1);
  });

  it("reads words only in first position", () => {
    expect(entriesFor("2w next friday", context)).toEqual([{ kind: "invalid" }]);
    expect(entriesFor("next friday eow", context)).toEqual([{ kind: "invalid" }]);
  });

  it("leaves a sentence invalid", () => {
    expect(entriesFor("the friday after the sprint review", context)).toEqual([
      { kind: "invalid" },
    ]);
  });
});

describe("names, words and tokens together", () => {
  /** What `catalogue()` builds: the curated rows first, the generated ones after. */
  const withGenerated: EntryContext = {
    ...context,
    names: [
      ...context.names,
      { label: "this Friday", rule: "today Fri" },
      { label: "next Friday", rule: "today +1Fri" },
      { label: "last Friday", rule: "today -1Fri" },
      { label: "1 day on", rule: "today +1d" },
      { label: "1 day back", rule: "today -1d" },
    ],
  };

  it("gives a date one row however many sources reach it", () => {
    const friday = entriesFor("friday", withGenerated).filter(
      (entry) => keywordOf(entry) === "+1Fri",
    );

    expect(friday).toHaveLength(1);
    expect(friday[0]).toEqual(expect.objectContaining({ kind: "named", label: "Next Friday" }));
  });

  it("keeps the curated name and drops the generated one that repeats it", () => {
    const labels = entriesFor("", withGenerated).map(
      (entry) => entry.kind === "named" && entry.label,
    );

    expect(labels).toContain("Tomorrow");
    expect(labels).not.toContain("1 day on");
  });

  it("drops the weekday row that lands where another weekday row already landed", () => {
    // Today is a Sunday, so `Fri` and `+1Fri` are both the 18th and only one of
    // them is worth a row. On a Friday they are a week apart and both stand.
    const labels = entriesFor("friday", withGenerated).map((entry) =>
      entry.kind === "named" ? entry.label : "",
    );

    expect(labels).toContain("Next Friday");
    expect(labels).toContain("last Friday");
    expect(labels).not.toContain("this Friday");
  });

  it("survives a space after a phrase", () => {
    // `friday` is a step on its own and no step at all inside `next friday`,
    // which is why the gate reads the whole head rather than each word.
    expect(entriesFor("next friday ", withGenerated)[0]).toEqual(
      expect.objectContaining({ keyword: "+1Fri" }),
    );
    expect(entriesFor("3 friday ago", withGenerated)[0]).toEqual(
      expect.objectContaining({ keyword: "-3Fri" }),
    );
  });

  it("still shuts the names off once a token stands before the caret", () => {
    for (const query of ["2w ", "today ", "Sun ", "2w eow "]) {
      expect(entriesFor(query, withGenerated).some((entry) => entry.kind === "named")).toBe(false);
    }
  });
});

describe("a day named outright", () => {
  it("leads the list, and carries no keyword", () => {
    const entries = entriesFor("nov 3", context);

    expect(entries).toEqual([
      { kind: "date", day: { year: 2026, month: 10, day: 3 }, complete: "nov 3 2026" },
      { kind: "date", day: { year: 2025, month: 10, day: 3 }, complete: "nov 3 2025" },
    ]);
    expect(entries.map(keywordOf)).toEqual(["", ""]);
  });

  it("takes the year as typed, and offers nothing to chain", () => {
    expect(entriesFor("nov 3 2027", context)).toEqual([
      { kind: "date", day: { year: 2027, month: 10, day: 3 }, complete: null },
    ]);
    expect(entriesFor("nov 3 ", context)).toEqual(entriesFor("nov 3", context));
  });

  it("goes last where a single letter named the month", () => {
    // `3 d` is three days on in the language as it stands, and that row keeps
    // the top of the list.
    const entries = entriesFor("3 d", context);

    expect(entries[0]).toEqual(expect.objectContaining({ kind: "step", keyword: "+3d" }));
    expect(entries.filter((entry) => entry.kind === "date")).toEqual([
      { kind: "date", day: { year: 2026, month: 11, day: 3 }, complete: "3 d 2026" },
      { kind: "date", day: { year: 2025, month: 11, day: 3 }, complete: "3 d 2025" },
    ]);
    expect(entries[entries.length - 1]).toEqual(
      expect.objectContaining({ kind: "date", day: { year: 2025, month: 11, day: 3 } }),
    );
  });

  it("goes last where only the month was typed", () => {
    const entries = entriesFor("f", context);

    expect(entries[0].kind).not.toBe("date");
    expect(entries.filter((entry) => entry.kind === "date")).toEqual([
      { kind: "date", day: { year: 2027, month: 1, day: 1 }, complete: "f 1 2027" },
      { kind: "date", day: { year: 2026, month: 1, day: 1 }, complete: "f 1 2026" },
    ]);
  });

  it("leaves every offset query answering exactly as it did", () => {
    expect(entriesFor("3", context).every((entry) => entry.kind === "step")).toBe(true);
    expect(entriesFor("next friday", context)[0]).toEqual(
      expect.objectContaining({ kind: "named", label: "Next Friday" }),
    );
    expect(entriesFor("2w eow", context)[0]).toEqual(
      expect.objectContaining({ kind: "step", keyword: "EoW" }),
    );
  });

  it("goes last, even naming a month of two letters or more, once another source answers the query too", () => {
    // Lithuanian: `3 sa` names both 3 January (`sausis`) and `+3Sat`, so the
    // rule cannot be "a longer month name leads" — that would take Enter from
    // three Saturdays on. It has to be "nothing else answered".
    const months = [
      ["sausis", "sau", "sausio"],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ];
    const entries = entriesFor("3 sa", { ...context, months });
    const dates = entries.filter((entry) => entry.kind === "date");

    expect(entries[0]).toEqual(expect.objectContaining({ kind: "step", keyword: "+3Sat" }));
    expect(dates.length).toBeGreaterThan(0);
    expect(entries.slice(entries.length - dates.length)).toEqual(dates);
  });

  it("calls a bad day an invalid date, not a refused count", () => {
    expect(entriesFor("nov 0", context)).toEqual([{ kind: "invalid" }]);
    expect(entriesFor("0 nov", context)).toEqual([{ kind: "invalid" }]);
    expect(entriesFor("nov 32", context)).toEqual([{ kind: "invalid" }]);
    expect(entriesFor("feb 30", context)).toEqual([{ kind: "invalid" }]);
    // A count out of range still says so, which is the row this one borrowed.
    expect(entriesFor("in 1000 days", context)).toEqual([{ kind: "invalid", reason: "count" }]);
    expect(entriesFor("1000", context)).toEqual([{ kind: "invalid", reason: "count" }]);
  });
});

const withFormats: EntryContext = {
  ...context,
  formats: [
    { id: "iso", pattern: "YYYY-MM-DD" },
    { id: "custom-1", pattern: "DD/MM/YYYY" },
    { id: "custom-2", pattern: "MMM D, YYYY" },
  ],
};

describe("the format switch", () => {
  it("lists the day in every format, in list order", () => {
    const day = { year: 2026, month: 8, day: 14 };

    expect(entriesFor("tom_", withFormats)).toEqual([
      { kind: "format", pattern: "YYYY-MM-DD", text: "2026-09-14", day },
      { kind: "format", pattern: "DD/MM/YYYY", text: "14/09/2026", day },
      { kind: "format", pattern: "MMM D, YYYY", text: "Sep 14, 2026", day },
    ]);
  });

  it("works on a rule as well as a name", () => {
    expect(entriesFor("2w eow_", withFormats)[0]).toEqual({
      kind: "format",
      pattern: "YYYY-MM-DD",
      text: "2026-10-03",
      day: { year: 2026, month: 9, day: 3 },
    });
  });

  it("takes the first row where a query answers with several", () => {
    const [first] = entriesFor("e", withFormats);

    expect(first.kind).not.toBe("invalid");
    expect(entriesFor("e_", withFormats)[0]).toMatchObject({
      kind: "format",
      day: first.kind === "invalid" ? null : first.day,
    });
  });

  it("takes the nearest year forward where a named day gives two", () => {
    expect(entriesFor("nov 3_", withFormats)[0]).toEqual({
      kind: "format",
      pattern: "YYYY-MM-DD",
      text: "2026-11-03",
      day: { year: 2026, month: 10, day: 3 },
    });
  });

  it("reads a completed query, which is what the key handler leaves behind", () => {
    expect(entriesFor("nov 3 2025_", withFormats)[0]).toMatchObject({ text: "2025-11-03" });
    expect(entriesFor("1d_", withFormats)[0]).toMatchObject({ text: "2026-09-14" });
  });

  it("narrows the formats by what follows the character", () => {
    expect(entriesFor("tom_14/", withFormats)).toEqual([
      {
        kind: "format",
        pattern: "DD/MM/YYYY",
        text: "14/09/2026",
        day: { year: 2026, month: 8, day: 14 },
      },
    ]);
  });

  it("is an ordinary character when the query does not resolve", () => {
    expect(entriesFor("nonsense_", withFormats)).toEqual([{ kind: "invalid" }]);
  });

  it("is an ordinary character when only one format is in the list", () => {
    const single = { ...withFormats, formats: [{ id: "iso", pattern: "YYYY-MM-DD" }] };

    expect(entriesFor("tom_", single)).toEqual([{ kind: "invalid" }]);
  });

  it("follows a configured character other than the default", () => {
    const comma = { ...withFormats, formatChar: "," };

    expect(entriesFor("tom,", comma)).toHaveLength(3);
    expect(entriesFor("tom_", comma)).toEqual([{ kind: "invalid" }]);
  });
});
