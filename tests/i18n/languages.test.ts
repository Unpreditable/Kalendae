import { localeChoices } from "../../src/i18n/languages";

/**
 * The catalogue the Languages page offers.
 *
 * Codes are handed in rather than read from `moment.locales()`, which answers
 * with what has been *loaded* — one under Node until something touches a
 * locale, 139 in Obsidian, which preloads them all. Touching a locale here is
 * what `moment.localeData(code)` does, so the lists below arrive populated.
 */
describe("localeChoices", () => {
  it("keeps the base code even where moment lists a regional one first", () => {
    // moment's own order is `es-do es-mx es-us es` and `it-ch it`, so taking
    // whichever came first offered Spanish (Dominican Republic) and Italian
    // (Switzerland) while Spanish and Italian were nowhere in the list.
    const named = (codes: string[]) =>
      Object.fromEntries(localeChoices(codes, "en").map((c) => [c.code, c.name]));

    expect(named(["es-do", "es-mx", "es-us", "es"])).toEqual({ es: "Spanish" });
    expect(named(["it-ch", "it"])).toEqual({ it: "Italian" });
  });

  it("drops a locale whose names duplicate another's, keeping the plainer code", () => {
    const codes = localeChoices(["en", "en-gb", "en-au", "de"], "en").map((c) => c.code);

    expect(codes).toContain("en");
    expect(codes).toContain("de");
    expect(codes).not.toContain("en-gb");
    expect(codes).not.toContain("en-au");
  });

  it("keeps a variant whose names really differ", () => {
    // de-at writes Jänner for January, where de-ch matches de exactly.
    const codes = localeChoices(["de", "de-at", "de-ch"], "en").map((c) => c.code);

    expect(codes).toContain("de");
    expect(codes).toContain("de-at");
    expect(codes).not.toContain("de-ch");
  });

  it("names each language in the reader's own", () => {
    const named = (codes: string[], ui: string) =>
      Object.fromEntries(localeChoices(codes, ui).map((c) => [c.code, c.name]));

    expect(named(["de", "fr"], "en")).toEqual({ de: "German", fr: "French" });
    expect(named(["de"], "ru").de).toBe("немецкий");
  });

  it("drops a code the platform has no name for", () => {
    // moment carries a few CLDR does not name: `x-pseudo` is a locale for
    // testing and `tzl` a constructed language. A row reading only its code is
    // not a choice anyone can make, so it is left out.
    expect(localeChoices(["de", "x-pseudo", "tzl"], "en").map((c) => c.code)).toEqual(["de"]);
  });

  it("keeps a language that is merely unfamiliar", () => {
    // Klingon and Tetum are named by CLDR, so they stay. Dropping them would
    // mean curating a list by hand and then keeping it curated.
    const named = Object.fromEntries(
      localeChoices(["tlh", "tet"], "en").map((c) => [c.code, c.name]),
    );

    expect(named).toEqual({ tlh: "Klingon", tet: "Tetum" });
  });

  it("sorts by the displayed name, not by the code", () => {
    const names = localeChoices(["ru", "de", "fr"], "en").map((c) => c.name);

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("drops a code moment does not carry, on the names it falls back to", () => {
    // `moment.localeData` answers with the English locale for a code it has no
    // data for, rather than with null. So a bogus code arrives carrying en's
    // names and is deduplicated away by them, needing no check of its own.
    expect(localeChoices(["en", "not-a-locale"], "en").map((c) => c.code)).toEqual(["en"]);
  });
});

describe("naming a language whose code carries a region", () => {
  it("drops the region where that language has only one code", () => {
    // moment ships no bare zh, hy, pa or ug, so Intl answers "Chinese
    // (China)" and "Armenian (Armenia)" — a country that says nothing when
    // there is only one of that language on the list.
    const named = (codes: string[]) =>
      Object.fromEntries(localeChoices(codes, "en").map((c) => [c.code, c.name]));

    expect(named(["zh-cn"])).toEqual({ "zh-cn": "Chinese" });
    expect(named(["hy-am"])).toEqual({ "hy-am": "Armenian" });
    expect(named(["pa-in"])).toEqual({ "pa-in": "Punjabi" });
  });

  it("keeps the qualifier where several codes of that language survive", () => {
    // Brazilian and European Portuguese write different month names, and only
    // the label tells the two rows apart. Parenthesised rather than Intl's
    // default "Brazilian Portuguese", so the two sort together.
    const named = Object.fromEntries(
      localeChoices(["pt", "pt-br"], "en").map((c) => [c.code, c.name]),
    );

    expect(named).toEqual({ pt: "Portuguese", "pt-br": "Portuguese (Brazil)" });
  });

  it("puts a variant next to the language it qualifies", () => {
    const names = localeChoices(["pt", "pt-br", "de", "de-at"], "en").map((c) => c.name);

    expect(names).toEqual([
      "German",
      "German (Austria)",
      "Portuguese",
      "Portuguese (Brazil)",
    ]);
  });

  it("keeps a script qualifier for the same reason", () => {
    const codes = localeChoices(["sr", "sr-cyrl"], "en").map((c) => c.name);

    expect(codes).toContain("Serbian");
    expect(codes).toContain("Serbian (Cyrillic)");
  });
});
