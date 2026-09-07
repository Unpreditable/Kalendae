import { DateFormatEntry } from "./detect/formats";

/**
 * How the picker offers itself on a date the plugin has recognised.
 *
 * The design goal is least interference: the note should look untouched until
 * the user reaches for the date. Which of these ends up as the default is an
 * open question — see TODO.md.
 */
export type TriggerMode = "hover-icon" | "double-click" | "both";

export const TRIGGER_MODES: TriggerMode[] = ["hover-icon", "double-click", "both"];

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
  trigger: TriggerMode;
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
}

export const DEFAULT_SETTINGS: KalendaeSettings = {
  trigger: "both",
  formats: [{ id: "iso", pattern: "YYYY-MM-DD" }],
  scopeHeadings: true,
  scopeInlineCode: false,
  scopeCodeBlocks: false,
  scopeFrontmatter: false,
  scopeWikilinks: false,
};

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
