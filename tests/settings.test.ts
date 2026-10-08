import {
  DEFAULT_SETTINGS,
  HOVER_ICONS,
  KalendaeSettings,
  WEEK_STARTS,
  checkFormatChar,
  checkTrigger,
  alwaysOn,
  commandOnly,
  enabledLocales,
  commandScopes,
  migrateTriggers,
  normaliseStoredFormats,
  reorderById,
  defaultTimeFormats,
  normaliseStoredTimeFormats,
  readClockCommit,
  readHoverHint,
  readStepKeys,
} from "../src/settings";

describe("settings defaults", () => {
  it("opens on a double-click and on the hover icon, out of the box", () => {
    expect(DEFAULT_SETTINGS.doubleClick).toBe(true);
    expect(DEFAULT_SETTINGS.hoverIcon).toBe("left");
  });

  it("uses a Tasks emoji as the way in where a date has one", () => {
    // On out of the box because it costs the note nothing: the glyph is already
    // there, and no icon of ours is drawn on a date that has one.
    expect(DEFAULT_SETTINGS.taskEmoji).toBe(true);
  });

  it("offers the icon a side or none at all, once each", () => {
    expect([...HOVER_ICONS]).toEqual(["off", "left", "right"]);
  });

  it("starts with the outline on, week numbers off and the preview on", () => {
    // Week numbers are the one setting here that is noise to anyone who does
    // not plan by them, so they are the one that starts off.
    expect(DEFAULT_SETTINGS.showHoverFrame).toBe(true);
    expect(DEFAULT_SETTINGS.showWeekNumbers).toBe(false);
    expect(DEFAULT_SETTINGS.showWritesPreview).toBe(true);
  });

  it("names a day as the week's start rather than a rule to work out later", () => {
    // A fresh install overwrites this from the reader's own region on first
    // load; the constant is only what stands if that cannot be answered.
    expect(WEEK_STARTS).toContain(DEFAULT_SETTINGS.weekStart);
  });

  it("offers the seven days in moment's order, once each", () => {
    // The order is load-bearing: an entry's index in this list is the day
    // number moment counts in, which is how firstDayOf() reads it.
    expect([...WEEK_STARTS]).toEqual([
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ]);
  });
});

describe("reorderById", () => {
  const formats = [
    { id: "a", pattern: "YYYY-MM-DD" },
    { id: "b", pattern: "DD.MM.YYYY" },
    { id: "c", pattern: "D MMMM YYYY" },
  ];

  it("puts the formats in the order the ids give", () => {
    expect(reorderById(formats, ["c", "a", "b"])?.map((entry) => entry.id)).toEqual(["c", "a", "b"]);
  });

  it("moves a row up without dragging its neighbour down with it", () => {
    // The bug this replaced: the row landed one place from where it was dropped.
    expect(reorderById(formats, ["b", "a", "c"])?.map((entry) => entry.id)).toEqual(["b", "a", "c"]);
  });

  it("hands back the very same list when nothing moved", () => {
    expect(reorderById(formats, ["a", "b", "c"])).toBe(formats);
  });

  it("refuses an order that is not a permutation, rather than dropping a format", () => {
    expect(reorderById(formats, ["a", "b"])).toBeNull();
    expect(reorderById(formats, ["a", "b", "zz"])).toBeNull();
    expect(reorderById(formats, ["a", "b", "b"])).toBeNull();
  });

  it("tells a refusal apart from a drag that changed nothing", () => {
    // Both used to hand back the same list. The caller redraws on one and does
    // nothing on the other, and a refusal left undrawn shows the user an order
    // the settings never took.
    expect(reorderById(formats, ["a", "b", "c"])).not.toBeNull();
    expect(reorderById(formats, ["a", "b", "b"])).toBeNull();
  });
});

describe("normaliseStoredFormats", () => {
  it("keeps the first of two entries sharing an id", () => {
    // A duplicate id makes a drag unresolvable and points a row's delete button
    // at a different format, so the list must never hold one.
    const kept = normaliseStoredFormats([
      { id: "iso", pattern: "YYYY-MM-DD" },
      { id: "iso", pattern: "DD.MM.YYYY" },
    ]);

    expect(kept).toEqual([{ id: "iso", pattern: "YYYY-MM-DD" }]);
  });

  it("drops the retired enabled:false entries and keeps the rest in order", () => {
    const kept = normaliseStoredFormats([
      { id: "a", pattern: "YYYY-MM-DD" },
      { id: "b", pattern: "DD.MM.YYYY", enabled: false },
      { id: "c", pattern: "D MMMM YYYY" },
    ]);

    expect(kept.map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  it("falls back to the default rather than an empty list", () => {
    expect(normaliseStoredFormats([])).toEqual(DEFAULT_SETTINGS.formats);
    expect(normaliseStoredFormats("nonsense")).toEqual(DEFAULT_SETTINGS.formats);
  });
});

describe("migrating the trigger settings", () => {
  it("reads the old hover-icon mode as an icon and no double-click", () => {
    expect(migrateTriggers({ trigger: "hover-icon", iconPlacement: "left" })).toEqual({
      doubleClick: false,
      hoverIcon: "left",
    });
  });

  it("reads the old double-click mode as no icon", () => {
    expect(migrateTriggers({ trigger: "double-click", iconPlacement: "right" })).toEqual({
      doubleClick: true,
      hoverIcon: "off",
    });
  });

  it("reads the old both mode as both", () => {
    expect(migrateTriggers({ trigger: "both", iconPlacement: "left" })).toEqual({
      doubleClick: true,
      hoverIcon: "left",
    });
  });

  it("falls back to the right-hand side when the old placement is missing", () => {
    expect(migrateTriggers({ trigger: "both" })).toEqual({ doubleClick: true, hoverIcon: "right" });
  });

  it("leaves settings already in the new shape alone", () => {
    expect(migrateTriggers({ doubleClick: false, hoverIcon: "off" })).toEqual({
      doubleClick: false,
      hoverIcon: "off",
    });
  });

  it("gives a fresh install the defaults", () => {
    expect(migrateTriggers(null)).toEqual({
      doubleClick: DEFAULT_SETTINGS.doubleClick,
      hoverIcon: DEFAULT_SETTINGS.hoverIcon,
    });
  });

  it("ignores a stored trigger that is not one of the old modes", () => {
    expect(migrateTriggers({ trigger: "sideways" })).toEqual({
      doubleClick: DEFAULT_SETTINGS.doubleClick,
      hoverIcon: DEFAULT_SETTINGS.hoverIcon,
    });
  });
});

describe("commandOnly", () => {
  const both = { ...DEFAULT_SETTINGS };

  it("is false while any way in from the note is left", () => {
    expect(commandOnly(both)).toBe(false);
    expect(commandOnly({ ...both, hoverIcon: "off" })).toBe(false);
    expect(commandOnly({ ...both, doubleClick: false })).toBe(false);
    expect(commandOnly({ ...both, taskEmoji: false })).toBe(false);
  });

  it("counts a Tasks emoji as a way in, when it is the only one left", () => {
    expect(commandOnly({ ...both, doubleClick: false, hoverIcon: "off" })).toBe(false);
  });

  it("is true once none of the three is left", () => {
    expect(
      commandOnly({ ...both, doubleClick: false, hoverIcon: "off", taskEmoji: false }),
    ).toBe(true);
  });

  it("does not count the outline, which opens nothing", () => {
    // The outline still follows the pointer with both triggers off. It marks a
    // date; it has never been a way to open one.
    expect(commandOnly({ ...both, showHoverFrame: false })).toBe(false);
  });
});

describe("commandScopes", () => {
  /**
   * Every scope switched off, built from the defaults rather than listed, so a
   * toggle added later is off here too and the test below notices it.
   */
  const allOff = Object.fromEntries(
    Object.entries(DEFAULT_SETTINGS).map(([key, value]) => [
      key,
      key.startsWith("scope") ? false : value,
    ]),
  ) as KalendaeSettings;

  it("puts every scope in play, whatever the toggles say", () => {
    const opened = commandScopes(allOff) as unknown as Record<string, unknown>;

    // Named rather than looped as well, so the test reads as the promise.
    expect(opened.scopeHeadings).toBe(true);
    expect(opened.scopeInlineCode).toBe(true);
    expect(opened.scopeCodeBlocks).toBe(true);
    expect(opened.scopeFrontmatter).toBe(true);
    // Wikilinks included: editing the date in a link repoints it, which is the
    // reader's own business when they asked for the calendar by name.
    expect(opened.scopeWikilinks).toBe(true);
  });

  it("leaves no scope behind", () => {
    // Fails the day a sixth scope is added to the settings, whether or not it
    // was opened here — the count is pinned on purpose, so the named promises
    // above get revisited rather than quietly going out of date.
    const opened = commandScopes(allOff) as unknown as Record<string, unknown>;
    const scopes = Object.keys(allOff).filter((key) => key.startsWith("scope"));

    expect(scopes.length).toBe(5);
    for (const key of scopes) expect(opened[key]).toBe(true);
  });

  it("changes nothing but the scopes", () => {
    const opened = commandScopes(allOff);

    expect({
      ...opened,
      scopeHeadings: false,
      scopeInlineCode: false,
      scopeCodeBlocks: false,
      scopeFrontmatter: false,
      scopeWikilinks: false,
    }).toEqual(allOff);
  });
});

describe("checkTrigger", () => {
  it("accepts one to three characters that cannot begin inside a word", () => {
    expect(checkTrigger("@", "_")).toBeNull();
    expect(checkTrigger("@@", "_")).toBeNull();
    expect(checkTrigger("$%@", "_")).toBeNull();
    expect(checkTrigger(";;", "_")).toBeNull();
  });

  it("refuses an empty field and anything longer than three characters", () => {
    expect(checkTrigger("", "_")).toBe("length");
    expect(checkTrigger("@@@@", "_")).toBe("length");
  });

  it("refuses a letter or a digit in first position, in any alphabet", () => {
    expect(checkTrigger("a@", "_")).toBe("letter");
    expect(checkTrigger("Я", "_")).toBe("letter");
    expect(checkTrigger("7@", "_")).toBe("digit");
  });

  it("allows a letter or a digit after the first character", () => {
    // They can only ever appear where the first character already did, so the
    // word-start rule has nothing to say about them.
    expect(checkTrigger("@d", "_")).toBeNull();
    expect(checkTrigger("@1", "_")).toBeNull();
  });

  it("refuses whitespace anywhere in it", () => {
    expect(checkTrigger(" ", "_")).toBe("space");
    expect(checkTrigger("@ @", "_")).toBe("space");
  });

  it("refuses the two characters Obsidian gives its own menu, in first position only", () => {
    expect(checkTrigger("#", "_")).toBe("reserved");
    expect(checkTrigger("[", "_")).toBe("reserved");
    expect(checkTrigger("@#", "_")).toBeNull();
  });

  it("refuses a trigger that uses the format character", () => {
    expect(checkTrigger("_", "_")).toBe("clash");
    expect(checkTrigger("@_", "_")).toBe("clash");
  });

  it("refuses the characters Obsidian pairs for you", () => {
    // Typing one puts two in the note with the caret between, so the trigger
    // that arrives is never the one that was typed.
    for (const opener of ["(", "[", "{", '"', "'"]) {
      expect(checkTrigger(opener, "_")).toBe("reserved");
    }

    // Later positions are unaffected: nothing is auto-paired mid-word.
    expect(checkTrigger("@(", "_")).toBeNull();
  });
});

describe("checkFormatChar", () => {
  it("accepts a single character that is none of the ones already spoken for", () => {
    expect(checkFormatChar("_", "@")).toBeNull();
    expect(checkFormatChar("~", "@")).toBeNull();
  });

  it("refuses anything but exactly one character", () => {
    expect(checkFormatChar("", "@")).toBe("single");
    expect(checkFormatChar("__", "@")).toBe("single");
  });

  it("refuses a letter, a digit and whitespace", () => {
    expect(checkFormatChar("a", "@")).toBe("letter");
    expect(checkFormatChar("7", "@")).toBe("digit");
    expect(checkFormatChar(" ", "@")).toBe("space");
  });

  it("refuses the characters the date language has already spent", () => {
    expect(checkFormatChar(",", "@")).toBe("comma");
    expect(checkFormatChar("+", "@")).toBe("sign");
    expect(checkFormatChar("-", "@")).toBe("sign");
  });

  it("allows the two Obsidian claims, which it only claims at a word start", () => {
    // The caret is mid-query by the time this character is pressed, and
    // Obsidian's tag and link menus open at a word start. Nothing collides.
    expect(checkFormatChar("#", "@")).toBeNull();
    expect(checkFormatChar("[", "@")).toBeNull();
  });

  it("refuses a character the trigger is made of, wherever it sits in it", () => {
    expect(checkFormatChar("@", "@")).toBe("clash");
    expect(checkFormatChar("%", "$%@")).toBe("clash");
  });
});

describe("enabledLocales", () => {
  it("always puts English first, whether or not it is stored", () => {
    expect(enabledLocales({ ...DEFAULT_SETTINGS, languages: [] }, "en")).toEqual(["en"]);
    expect(enabledLocales({ ...DEFAULT_SETTINGS, languages: ["ru"] }, "en")).toEqual(["en", "ru"]);
  });

  it("keeps the app's own language in force without storing it", () => {
    // Before this list existed, month names followed the app's language, so
    // switching Obsidian to Latvian made Latvian dates work at once. A list
    // seeded only on first run took that away from anyone who switched later.
    expect(enabledLocales({ ...DEFAULT_SETTINGS, languages: [] }, "lv")).toEqual(["en", "lv"]);
  });

  it("does not list a language twice when it is stored as well", () => {
    expect(enabledLocales({ ...DEFAULT_SETTINGS, languages: ["lv"] }, "lv")).toEqual(["en", "lv"]);
    expect(enabledLocales({ ...DEFAULT_SETTINGS, languages: ["en", "ru"] }, "en")).toEqual([
      "en",
      "ru",
    ]);
  });

  it("keeps the reader's order after the two that are always on", () => {
    expect(enabledLocales({ ...DEFAULT_SETTINGS, languages: ["ru", "de"] }, "lv")).toEqual([
      "en",
      "lv",
      "ru",
      "de",
    ]);
  });

  it("starts empty, so a fresh install adds nothing of its own", () => {
    expect(DEFAULT_SETTINGS.languages).toEqual([]);
  });
});

describe("alwaysOn", () => {
  it("names English and the app's own language", () => {
    expect(alwaysOn("en", "lv")).toBe(true);
    expect(alwaysOn("lv", "lv")).toBe(true);
    expect(alwaysOn("ru", "lv")).toBe(false);
  });
});

describe("readStepKeys", () => {
  it("defaults to Ctrl, and to Option on a Mac", () => {
    expect(readStepKeys({})).toEqual({ stepKeys: "ctrl", stepKeysMac: "alt" });
  });

  it("keeps each computer's choice apart, so a sync carries both", () => {
    expect(readStepKeys({ stepKeys: "ctrl-alt", stepKeysMac: "off" })).toEqual({
      stepKeys: "ctrl-alt",
      stepKeysMac: "off",
    });
  });

  it("falls back to the default for anything a Mac or the others cannot use", () => {
    expect(readStepKeys({ stepKeys: "shift", stepKeysMac: "ctrl" } as never)).toEqual({
      stepKeys: "ctrl",
      stepKeysMac: "alt",
    });
  });
});

describe("readHoverHint", () => {
  it("starts with the hint off, and the orb ready for when it is turned on", () => {
    expect(readHoverHint({})).toEqual({ hoverDistance: "off", hoverOrb: "green-red" });
  });

  it("keeps what was chosen", () => {
    expect(readHoverHint({ hoverDistance: "rounded", hoverOrb: "red-green" })).toEqual({
      hoverDistance: "rounded",
      hoverOrb: "red-green",
    });
  });

  it("falls back to the default for a value it does not know", () => {
    expect(readHoverHint({ hoverDistance: "weeks", hoverOrb: "blue" } as never)).toEqual({
      hoverDistance: "off",
      hoverOrb: "green-red",
    });
  });
});

describe("readClockCommit", () => {
  it("asks for OK out of the box", () => {
    expect(DEFAULT_SETTINGS.clockCommit).toBe("ok");
    expect(readClockCommit({})).toEqual({ clockCommit: "ok" });
  });

  it("keeps a stored choice", () => {
    expect(readClockCommit({ clockCommit: "click" })).toEqual({ clockCommit: "click" });
    expect(readClockCommit({ clockCommit: "double-click" })).toEqual({
      clockCommit: "double-click",
    });
  });

  it("falls back to OK for a value it does not know", () => {
    expect(readClockCommit({ clockCommit: "hover" as never })).toEqual({ clockCommit: "ok" });
  });
});

describe("time formats in settings", () => {
  const fallback = [{ id: "time-12", pattern: "h:mm a" }];

  it("starts on 24 hours where nothing says otherwise", () => {
    expect(DEFAULT_SETTINGS.timeFormats).toEqual([{ id: "time-24", pattern: "HH:mm" }]);
  });

  it("seeds 12 hours where the region writes time that way", () => {
    expect(defaultTimeFormats("h:mm A")).toEqual([{ id: "time-12", pattern: "h:mm a" }]);
  });

  it("seeds am/pm first where the region writes it first", () => {
    // Korean, Hindi and others: `오후 2:05`. `h:mm a` would read nothing they write.
    expect(defaultTimeFormats("A h:mm")).toEqual([{ id: "time-12-leading", pattern: "a h:mm" }]);
    expect(defaultTimeFormats("a h:mm [बजे]")).toEqual([
      { id: "time-12-leading", pattern: "a h:mm" },
    ]);
  });

  it("seeds 24 hours everywhere else", () => {
    expect(defaultTimeFormats("HH:mm")).toEqual([{ id: "time-24", pattern: "HH:mm" }]);
    expect(defaultTimeFormats("H:mm")).toEqual([{ id: "time-24", pattern: "HH:mm" }]);
  });

  it("seeds a vault that has never stored a time list", () => {
    expect(normaliseStoredTimeFormats(undefined, fallback)).toEqual(fallback);
    expect(normaliseStoredTimeFormats("nonsense", fallback)).toEqual(fallback);
  });

  it("keeps an emptied list empty: that is how times are switched off", () => {
    expect(normaliseStoredTimeFormats([], fallback)).toEqual([]);
  });

  it("keeps what is stored, minus what is not a format or repeats an id", () => {
    const stored = [
      { id: "time-24-short", pattern: "H:mm" },
      { id: "time-24-short", pattern: "HH:mm" },
      "junk",
      { pattern: "no id" },
    ];
    expect(normaliseStoredTimeFormats(stored, fallback)).toEqual([
      { id: "time-24-short", pattern: "H:mm" },
    ]);
  });
});
