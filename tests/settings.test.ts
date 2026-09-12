import {
  DEFAULT_SETTINGS,
  HOVER_ICONS,
  KalendaeSettings,
  WEEK_STARTS,
  commandOnly,
  commandScopes,
  migrateTriggers,
  normaliseStoredFormats,
  reorderById,
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
