import { DateFormatEntry } from "./detect/formats";

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
  showWeekNumbers: boolean;
  weekStart: WeekStart;
  /** The line naming the exact text a pick will write into the note. */
  showWritesPreview: boolean;
}

export const DEFAULT_SETTINGS: KalendaeSettings = {
  doubleClick: true,
  hoverIcon: "left",
  taskEmoji: true,
  formats: [{ id: "iso", pattern: "YYYY-MM-DD" }],
  scopeHeadings: true,
  scopeInlineCode: false,
  scopeCodeBlocks: false,
  scopeFrontmatter: false,
  scopeWikilinks: false,
  showHoverFrame: true,
  showWeekNumbers: false,
  weekStart: "monday",
  showWritesPreview: true,
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
