import {
  checkFormat,
  compileFormat,
  renderExample,
  tokenGroupsPresent,
  warnFormat,
} from "../../src/detect/formats";

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
