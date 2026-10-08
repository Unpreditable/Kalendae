import { DateFormatEntry } from "./detect/formats";
import { parseRule, presetById } from "./picker/quick";

/** Four, and the reason the quick-dates page needs no add button, trash or dragging. */
export const QUICK_SLOTS = 4;

/**
 * One shortcut under the calendar: a preset, a rule of the reader's own, or
 * nothing.
 *
 * A preset stores its id rather than its rule, so the catalogue can be
 * corrected without migrating anybody's settings, and its name follows the
 * app's language. A rule of your own stores its text, and must carry a name —
 * there is nothing underneath it to fall back on.
 */
export type QuickSlot = null | { preset: string; alias?: string } | { rule: string; alias: string };

/** A slot with something in it, which is what every reader of one wants. */
export type FilledSlot = Exclude<QuickSlot, null>;

/**
 * Whether the hover icon appears, and which side of the date it sits on.
 *
 * One setting rather than a switch and a position, because "off" and "which
 * side" are the same question asked once: an icon nobody wants has no side.
 *
 * The side is a class on the icon's anchor rather than a computed position —
 * the icon hangs off a zero-width span at one end of the date, so each side is
 * one CSS rule and neither costs any geometry in JavaScript. Left and right
 * only: an icon above or below the line can only be aligned with one edge of
 * the date, because centring it means measuring the date, and CSS cannot ask
 * how wide a range of text is.
 */
export const HOVER_ICONS = ["off", "left", "right"] as const;

export type HoverIcon = (typeof HOVER_ICONS)[number];

/**
 * How the hover hint words a date's distance from today, or "off" for no hint.
 *
 * Off by default. The hint is new behaviour on every date in every note, and a
 * reader who never asked for it may not know where to turn it off.
 */
export const HOVER_DISTANCES = ["off", "days", "rounded"] as const;

export type HoverDistance = (typeof HOVER_DISTANCES)[number];

/**
 * The orb in front of the hint, and which colour means which.
 *
 * Both ways round rather than one fixed pair: red for the past and green for
 * what is ahead is not how every reader is used to reading the two. Today
 * counts as ahead. Drawn only while the hint is — an orb alone says nothing
 * a reader could act on.
 */
export const HOVER_ORBS = ["off", "green-red", "red-green"] as const;

export type HoverOrb = (typeof HOVER_ORBS)[number];

/** Both hint settings out of what was stored, each falling back to its default. */
export function readHoverHint(
  stored: Partial<Pick<KalendaeSettings, "hoverDistance" | "hoverOrb">>,
): Pick<KalendaeSettings, "hoverDistance" | "hoverOrb"> {
  return {
    hoverDistance:
      HOVER_DISTANCES.find((value) => value === stored.hoverDistance) ??
      DEFAULT_SETTINGS.hoverDistance,
    hoverOrb: HOVER_ORBS.find((value) => value === stored.hoverOrb) ?? DEFAULT_SETTINGS.hoverOrb,
  };
}

/**
 * What makes a pick on the time picker's dial go into the note.
 *
 * OK by default: two picks make a time, and writing on the first click that
 * completes it surprises anyone who meant to look before committing. A click
 * writes on the last unit's click; a double-click writes whatever is under it,
 * keeping the other units, and leaves OK there for the keyboard.
 */
export const CLOCK_COMMITS = ["ok", "double-click", "click"] as const;

export type ClockCommit = (typeof CLOCK_COMMITS)[number];

export function readClockCommit(
  stored: Partial<Pick<KalendaeSettings, "clockCommit">>,
): Pick<KalendaeSettings, "clockCommit"> {
  return {
    clockCommit:
      CLOCK_COMMITS.find((value) => value === stored.clockCommit) ?? DEFAULT_SETTINGS.clockCommit,
  };
}

/**
 * Which modifier, held with the up and down arrows, steps the part of a date
 * the caret is on.
 *
 * A Mac has a setting of its own, offering Option alone: the system takes
 * Ctrl+arrows for Mission Control before Obsidian sees them, and Ctrl+Option
 * is how VoiceOver is driven. Two settings rather than one read differently per
 * computer, because a vault synced between a Mac and a PC carries one
 * `data.json` — with one value, whichever computer saved last would choose the
 * other's keys.
 */
export const STEP_KEYS = ["ctrl", "alt", "ctrl-alt", "off"] as const;

export type StepKeys = (typeof STEP_KEYS)[number];

export const MAC_STEP_KEYS = ["alt", "off"] as const;

export type MacStepKeys = (typeof MAC_STEP_KEYS)[number];

/** Both step-key settings out of what was stored, each falling back to its default. */
export function readStepKeys(
  stored: Partial<Pick<KalendaeSettings, "stepKeys" | "stepKeysMac">>,
): Pick<KalendaeSettings, "stepKeys" | "stepKeysMac"> {
  return {
    stepKeys: STEP_KEYS.find((value) => value === stored.stepKeys) ?? DEFAULT_SETTINGS.stepKeys,
    stepKeysMac:
      MAC_STEP_KEYS.find((value) => value === stored.stepKeysMac) ?? DEFAULT_SETTINGS.stepKeysMac,
  };
}

/**
 * Which day a week starts on in the calendar.
 *
 * Named days rather than the numbers moment counts in, because a dropdown's
 * value is a string: storing `0` would read back as `"0"` and quietly stop
 * being the number the type promises. `firstDayOf()` in `picker/month.ts` turns
 * one of these into moment's index.
 *
 * Seven entries and no "follow the app" option. A fresh install resolves one
 * from the reader's own region — see `defaultWeekStart()` — and writes it down,
 * so the setting always names a day rather than a rule to be worked out again.
 */
export const WEEK_STARTS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type WeekStart = (typeof WEEK_STARTS)[number];

/**
 * Where a date is allowed to be for the plugin to offer to edit it.
 *
 * Text is always in scope and has no flag. The rest are off by default, not
 * because a date in a code block is never a real date — that is the user's
 * business — but because a fresh install should find only the unambiguous
 * cases until the user says otherwise.
 *
 * Flat booleans rather than a nested `scopes` object so each one binds
 * straight to a declarative toggle by `keyof KalendaeSettings`, with no
 * hand-written save wiring.
 */
export interface KalendaeSettings {
  /** Whether double-clicking a date opens the calendar on it. */
  doubleClick: boolean;
  hoverIcon: HoverIcon;
  /**
   * Whether a Tasks-plugin date emoji in front of a date is the way into the
   * calendar for that date — see `detect/markers.ts`.
   *
   * Its own setting rather than part of `hoverIcon`, because the two are
   * separate questions and every combination of them means something. The
   * common case is this on with the icon off: a task list is reached through
   * the glyphs it already carries, and nothing is drawn over anything else.
   *
   * A marked date never gets an icon as well. That is not a preference — two
   * buttons on one date, one of them sitting over the emoji that is the other,
   * is not a choice worth offering.
   */
  taskEmoji: boolean;
  /** Ordered and never empty; the first format that matches a range claims it. */
  formats: DateFormatEntry[];
  /**
   * The time formats, in priority order, as `formats` is for dates. May be
   * empty, which switches times off; the first one is what a new time is
   * written in.
   */
  timeFormats: DateFormatEntry[];
  /**
   * Locale codes whose month and weekday names can be typed, and are looked
   * for in a note.
   *
   * English is not in here and never is: it is always in force, so storing it
   * would invite a `data.json` that says otherwise. Seeded on first run with
   * the app's own language — see `loadSettings` — so a Russian vault goes on
   * typing `@ноя 3` without anyone having to visit settings for it.
   */
  languages: string[];
  /**
   * On by default, unlike the rest. A dated heading in a log or daily note is
   * an ordinary thing to want to edit — but editing one rewrites the heading,
   * which breaks any [[note#2026-09-06]] link pointing at it, so it is worth
   * being able to switch off.
   */
  scopeHeadings: boolean;
  scopeInlineCode: boolean;
  scopeCodeBlocks: boolean;
  scopeFrontmatter: boolean;
  scopeWikilinks: boolean;
  /** The outline drawn around a hovered date and its icon. */
  showHoverFrame: boolean;
  /** The hint above a hovered date; see HOVER_DISTANCES. */
  hoverDistance: HoverDistance;
  /** Its orb; see HOVER_ORBS. */
  hoverOrb: HoverOrb;
  showWeekNumbers: boolean;
  weekStart: WeekStart;
  /** The line naming the exact text a pick will write into the note. */
  showWritesPreview: boolean;
  /**
   * Where the time picker's Snap starts each time it opens. The panel's own
   * checkbox overrides it for one pick and never writes it back.
   */
  snapMinutes: boolean;
  /** See CLOCK_COMMITS. */
  clockCommit: ClockCommit;
  /** The modifier the arrow keys step a date with, off a Mac; see STEP_KEYS. */
  stepKeys: StepKeys;
  /** The same, on a Mac. */
  stepKeysMac: MacStepKeys;
  /** Whether the list of dates opens while you type at all. */
  typeToInsert: boolean;
  /**
   * The phrase that opens it: one to three characters, at the start of a word.
   *
   * A phrase rather than a character because a single one fires where nobody
   * meant it to — `@channel` opens the list and leaves it saying Invalid date
   * to the end of the line — and two characters end that whole class of it.
   * See `checkTrigger` for what a field will accept.
   */
  typeTrigger: string;
  /** The single character that turns the open list into that day in each format. */
  formatTrigger: string;
  /** Whether the quick-date row is drawn at all; the slots are kept either way. */
  showQuickDates: boolean;
  /** Exactly QUICK_SLOTS entries, in the order they appear under the calendar. */
  quickDates: QuickSlot[];
}

export const DEFAULT_SETTINGS: KalendaeSettings = {
  doubleClick: true,
  hoverIcon: "left",
  taskEmoji: true,
  formats: [{ id: "iso", pattern: "YYYY-MM-DD" }],
  timeFormats: [{ id: "time-24", pattern: "HH:mm" }],
  languages: [],
  scopeHeadings: true,
  scopeInlineCode: false,
  scopeCodeBlocks: false,
  scopeFrontmatter: false,
  scopeWikilinks: false,
  showHoverFrame: true,
  hoverDistance: "off",
  hoverOrb: "green-red",
  showWeekNumbers: false,
  weekStart: "monday",
  showWritesPreview: true,
  snapMinutes: true,
  clockCommit: "ok",
  stepKeys: "ctrl",
  stepKeysMac: "alt",
  typeToInsert: true,
  typeTrigger: "@",
  formatTrigger: "_",
  showQuickDates: true,
  quickDates: [
    { preset: "tomorrow" },
    { preset: "endOfThisWeek" },
    { preset: "endOfThisMonth" },
    null,
  ],
};

/**
 * Whether the command is the last way into the calendar.
 *
 * Every pointer trigger off is a choice, not a mistake: a reader who wants
 * nothing drawn over their prose still has `pick-date` and whatever hotkey
 * they gave it. It is a choice the settings have to own up to, though, because
 * the note cannot — a date goes on outlining itself under the pointer and then
 * does nothing when clicked. The settings tab reads this and shows a
 * sub-header naming the way in that is left.
 *
 * All three are counted, the emoji included, so the sentence stays literally
 * true: with the emoji on, clicking one opens the calendar, and a notice saying
 * only the command does would contradict the row three lines below it. The
 * silence that leaves is real and accepted — a date with no emoji still
 * outlines itself and still does nothing when clicked, and nothing here says
 * so.
 *
 * The outline is deliberately not part of the question. It marks a date; it
 * has never opened one.
 */
export function commandOnly(settings: KalendaeSettings): boolean {
  return !settings.doubleClick && settings.hoverIcon === "off" && !settings.taskEmoji;
}

/**
 * The characters Obsidian pairs for you, which a trigger therefore cannot be.
 *
 * Typing one of these puts two in the note with the caret between them, so the
 * text that arrives is never the text that was typed. `[` is here for that
 * reason as well as for the link menu it opens.
 */
const OPENERS = new Set(["(", "[", "{", '"', "'"]);

/** The one language always in force, whatever `languages` holds. */
export const BASE_LOCALE = "en";

/**
 * The locale codes whose names are typable and detectable, English first.
 *
 * English leads because it is the universal fallback: every other language's
 * names are additions to it, and the three languages that number their months
 * — Japanese, Korean, Chinese — have no letter prefix to type at all without
 * it. The reader's own order is kept after that, since it is the order the
 * page shows them in.
 *
 * **The app's own language is in force too, and is not stored.** Before this
 * list existed, month names followed `moment.locale()`, so switching Obsidian
 * to Latvian made Latvian dates work at once. Seeding the list on first run
 * alone took that away: a reader who switched afterwards found their own
 * language missing and nothing explaining why. It behaves exactly as English
 * does — always present, shown on the page and immovable.
 */
export function enabledLocales(settings: KalendaeSettings, appLocale: string): string[] {
  return [...new Set([BASE_LOCALE, appLocale, ...settings.languages])];
}

/** Whether a language is in force whatever the list says, so cannot be removed. */
export function alwaysOn(code: string, appLocale: string): boolean {
  return code === BASE_LOCALE || code === appLocale;
}

/** What is wrong with a character somebody typed into one of the two fields. */
export type TriggerProblem =
  // "length" is the trigger's one-to-three rule and "single" the format
  // character's exactly-one. Two problems rather than one, because a single
  // message cannot tell a reader both at once and each field has only one of
  // them to say.
  | "length"
  | "single"
  | "letter"
  | "digit"
  | "space"
  | "reserved"
  | "comma"
  | "sign"
  | "clash";

/**
 * Whether a phrase can open the list while you type, and why not.
 *
 * One to three characters: a trigger is a keystroke or two, not a word. Every
 * rule but the length is about the **first** character, because that is the
 * only one the word-start rule ever looks at. A letter or a digit there puts
 * the trigger inside ordinary words and numbers, which no filtering afterwards
 * cleans up; `#` or `[` there collides with a menu Obsidian opens itself, and
 * two menus over one caret is a defect rather than a preference. Later
 * positions are free, because they can only ever appear where the first
 * character already did: the `d` in `@d` and the `#` in `@#` fire nothing.
 *
 * The openers `(`, `[`, `{`, `"` and `'` are refused in first position too, and
 * this replaces an earlier reading that allowed them as merely unwise. They are
 * broken: Obsidian auto-pairs every one of them, so typing `"` puts `""` in the
 * note with the caret between, and the trigger the reader meant to type is not
 * the text that arrives. A trigger that cannot be typed is not a preference.
 */
export function checkTrigger(value: string, formatChar: string): TriggerProblem | null {
  const characters = [...value];

  if (characters.length === 0 || characters.length > 3) return "length";
  if (/\s/.test(value)) return "space";
  if (/\p{L}/u.test(characters[0])) return "letter";
  if (/\p{N}/u.test(characters[0])) return "digit";
  if (OPENERS.has(characters[0]) || characters[0] === "#") return "reserved";
  if (characters.includes(formatChar)) return "clash";

  return null;
}

/**
 * Whether a character can turn the open list into the formats, and why not.
 *
 * One character, and none of those the date language has already spent. `+`
 * and `-` begin a step. `,` is tolerated after the day of a named date —
 * `@Nov 3, 2027` has to be typable — so the two cannot both have it. A letter
 * or a digit would be read as part of the query in front of it: with `d` here,
 * `@2d` could never be typed.
 *
 * **`#` and `[` are fine.** They are refused as the first character of a
 * trigger, where Obsidian opens its own tag and link menus, and that reason
 * does not reach this far: by the time this character is pressed the caret is
 * mid-query, Obsidian's menus start at a word start, and nothing of ours is
 * competing.
 *
 * It may not be a character the trigger is made of, and that one is concrete
 * rather than tidy-minded: `triggerAt` finds the trigger by looking back for
 * the last one before the caret, so with `@` in both fields `@tom@` finds the
 * second `@`, fails the word-start test against the `m` in front of it, and
 * the list closes rather than offering anything.
 */
export function checkFormatChar(value: string, trigger: string): TriggerProblem | null {
  if ([...value].length !== 1) return "single";
  if (/\s/.test(value)) return "space";
  if (/\p{L}/u.test(value)) return "letter";
  if (/\p{N}/u.test(value)) return "digit";
  if (value === ",") return "comma";
  if (value === "+" || value === "-") return "sign";
  if ([...trigger].includes(value)) return "clash";

  return null;
}

/**
 * The scopes an explicitly invoked command works in, which is all of them.
 *
 * The toggles govern what the plugin offers unprompted: an icon over a date
 * nobody asked about, and a double-click that means something other than
 * "select this word". Asking for the calendar by name is not unprompted, so
 * every context is plain text to a command — a date in a code block, in
 * frontmatter or inside `[[2026-09-06]]` is editable from the palette whatever
 * the toggles say, and a date can be written into any of them the same way.
 *
 * Wikilinks included, deliberately. Editing the date in a link repoints it, and
 * possibly at nothing — which is the reader's business, theirs to see and theirs
 * to undo. A command that quietly declined would be the worse surprise.
 */
export function commandScopes(settings: KalendaeSettings): KalendaeSettings {
  return {
    ...settings,
    scopeHeadings: true,
    scopeInlineCode: true,
    scopeCodeBlocks: true,
    scopeFrontmatter: true,
    scopeWikilinks: true,
  };
}

/**
 * The two trigger settings, read out of whatever an older version wrote.
 *
 * Until 2026-09-10 these were a three-way `trigger` — hover icon, double-click
 * or both — beside an `iconPlacement` that meant nothing in the first two
 * cases. They are now one boolean and one three-way, which is the same set of
 * choices with the impossible combination removed and one less row on screen.
 *
 * Anything unrecognised falls back to the defaults rather than to a guess: a
 * stored value from a version that never existed says nothing about what the
 * reader wants.
 */
export function migrateTriggers(stored: unknown): Pick<KalendaeSettings, "doubleClick" | "hoverIcon"> {
  const settings = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};

  if (typeof settings.doubleClick === "boolean" && isHoverIcon(settings.hoverIcon)) {
    return { doubleClick: settings.doubleClick, hoverIcon: settings.hoverIcon };
  }

  // "right" is what that version drew, not what this one defaults to. This is
  // reconstructing what the reader was looking at, so it stays a literal and
  // does not follow DEFAULT_SETTINGS.
  const side = isHoverIcon(settings.iconPlacement) ? settings.iconPlacement : "right";

  if (settings.trigger === "hover-icon") return { doubleClick: false, hoverIcon: side };
  if (settings.trigger === "double-click") return { doubleClick: true, hoverIcon: "off" };
  if (settings.trigger === "both") return { doubleClick: true, hoverIcon: side };

  return { doubleClick: DEFAULT_SETTINGS.doubleClick, hoverIcon: DEFAULT_SETTINGS.hoverIcon };
}

function isHoverIcon(value: unknown): value is HoverIcon {
  return HOVER_ICONS.includes(value as HoverIcon);
}

/**
 * Reads the format list out of `data.json`, which is whatever some version of
 * this plugin wrote and not a shape to be trusted.
 *
 * Nothing is ever added: a format is active because it is in the list, so
 * merging in built-ins on upgrade would switch them on behind the user's back.
 * Entries only ever get dropped — malformed ones, and `enabled: false` ones
 * left by the older shape where the list held every format and a flag decided
 * which counted.
 *
 * The list is guaranteed non-empty, because a plugin that recognises no format
 * at all can only look broken.
 *
 * Ids are guaranteed unique too. A row is addressed by its id everywhere it
 * matters — reordering reads the ids off the DOM, and the shadow map is keyed
 * by them — so a duplicate does not merely confuse a lookup, it makes a drag
 * unresolvable and points a row's delete button at a different format. The
 * duplicate is the entry that gets dropped rather than renamed: two entries
 * claiming one id have already lost the answer to which of them a stored
 * position referred to.
 */
export function normaliseStoredFormats(stored: unknown): DateFormatEntry[] {
  if (!Array.isArray(stored)) return [...DEFAULT_SETTINGS.formats];

  const seen = new Set<string>();
  const kept = stored
    .filter(isStoredFormat)
    .filter((entry) => entry.enabled !== false)
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .map(({ id, pattern }) => ({ id, pattern }));

  return kept.length > 0 ? kept : [...DEFAULT_SETTINGS.formats];
}

/**
 * The one time format a vault starts with, from how its region writes time.
 *
 * Handed moment's own short time for the app's language rather than reading it
 * here, so this stays pure. A 12-hour region gets the format that needs am/pm
 * to match — it leaves `3:16` and `01:30` alone — and everywhere else gets the
 * padded 24-hour time that daily notes, Tasks and Dataview all write.
 *
 * Which side am/pm stands on is the region's too. Korean, Hindi and a handful
 * of others write it first — `오후 2:05` — and `h:mm a` reads nothing they
 * write, which would look like times not working at all.
 */
export function defaultTimeFormats(shortTime: string): DateFormatEntry[] {
  const tokens = shortTime.replace(/\[[^\]]*\]/g, "");
  const hour = tokens.indexOf("h");
  if (hour < 0) return [{ id: "time-24", pattern: "HH:mm" }];

  const meridiem = tokens.search(/[aA]/);

  return meridiem >= 0 && meridiem < hour
    ? [{ id: "time-12-leading", pattern: "a h:mm" }]
    : [{ id: "time-12", pattern: "h:mm a" }];
}

/**
 * The stored time list, or the seed for a vault that has never had one.
 *
 * Unlike the date list an empty one is kept: emptying it is how times are
 * switched off, and seeding it again on the next load would switch them back
 * on behind the reader's back. Only a list that was never stored is seeded.
 */
export function normaliseStoredTimeFormats(
  stored: unknown,
  fallback: DateFormatEntry[],
): DateFormatEntry[] {
  if (!Array.isArray(stored)) return [...fallback];

  const seen = new Set<string>();

  return stored
    .filter(isStoredFormat)
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .map(({ id, pattern }) => ({ id, pattern }));
}

/**
 * The formats in the order the given ids give, or the list untouched.
 *
 * Takes the order from the ids themselves rather than from a pair of indices.
 * Index arithmetic has to agree with whatever the drag library counts as a
 * position — whether a non-draggable row in the same list is included, whether
 * the index is read before or after the element moves — and a disagreement
 * shows up as a row landing one place from where it was dropped. Ids cannot be
 * off by one.
 *
 * Anything but a permutation of the current list is refused outright: a
 * partial order would silently drop formats. Refusal is `null` rather than the
 * list back, because the caller has to tell it from a drag that changed
 * nothing. The two look identical here and could not be less alike on screen:
 * after a refusal the drag library has already moved the row, so the list the
 * user is looking at disagrees with the list that was kept, and only a redraw
 * puts them back together.
 */
export function reorderById(formats: DateFormatEntry[], ids: string[]): DateFormatEntry[] | null {
  if (ids.length !== formats.length) return null;

  const byId = new Map(formats.map((entry) => [entry.id, entry]));
  const ordered: DateFormatEntry[] = [];

  for (const id of ids) {
    const entry = byId.get(id);
    if (!entry) return null;
    byId.delete(id);
    ordered.push(entry);
  }

  // The same list back, by reference, when nothing moved: a drag dropped where
  // it started still ends in a drop, and the caller uses this to tell a real
  // reorder from one.
  return ordered.every((entry, at) => entry === formats[at]) ? formats : ordered;
}

/** The stored shape, which may still carry the retired `enabled` flag. */
interface StoredFormat extends DateFormatEntry {
  enabled?: boolean;
}

function isStoredFormat(value: unknown): value is StoredFormat {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && typeof entry.pattern === "string";
}

/**
 * The quick dates read out of `data.json`, which is not a shape to be trusted.
 *
 * Always four slots. Anything that cannot be read — an unknown preset, a rule
 * that does not parse, a rule with no name — leaves its slot empty rather than
 * guessing: a file written by a future version, or edited by hand, must never
 * be able to put a wrong date or a nameless button in front of a reader.
 *
 * A slot carrying both a preset and a rule is read as the preset. That is the
 * reading that cannot be wrong — the rule behind a preset is ours and is known
 * good — while a stray rule string is the shape a half-finished write leaves.
 *
 * A list that is present but empty stays empty. Only a missing or malformed
 * list falls back to the defaults, because four deliberately cleared slots are
 * an answer and refilling them would overrule it.
 */
export function normaliseStoredQuickDates(stored: unknown): QuickSlot[] {
  if (!Array.isArray(stored)) return [...DEFAULT_SETTINGS.quickDates];

  return Array.from({ length: QUICK_SLOTS }, (_unused, at) => readSlot(stored[at]));
}

function readSlot(value: unknown): QuickSlot {
  if (typeof value !== "object" || value === null) return null;
  const slot = value as Record<string, unknown>;
  const alias = typeof slot.alias === "string" ? slot.alias.trim() : "";

  if (typeof slot.preset === "string" && presetById(slot.preset)) {
    return alias === "" ? { preset: slot.preset } : { preset: slot.preset, alias };
  }

  if (typeof slot.rule === "string" && alias !== "" && parseRule(slot.rule)) {
    return { rule: slot.rule, alias };
  }

  return null;
}

/**
 * The phrase that opens the list, and the character that lists the formats,
 * both refusing a value a hand-edited `data.json` put there.
 *
 * Obsidian shows a stored value that fails validation without rewriting it, so
 * a setting can hold something unusable and this is where that stops. The
 * fallback is the default rather than nothing, because a trigger of `""` would
 * match at every offset in a line.
 */
export function triggerOf(settings: KalendaeSettings): string {
  return checkTrigger(settings.typeTrigger, settings.formatTrigger) === null
    ? settings.typeTrigger
    : DEFAULT_SETTINGS.typeTrigger;
}

export function formatCharOf(settings: KalendaeSettings): string {
  return checkFormatChar(settings.formatTrigger, settings.typeTrigger) === null
    ? settings.formatTrigger
    : DEFAULT_SETTINGS.formatTrigger;
}
