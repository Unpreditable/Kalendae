/**
 * The emoji the Tasks plugin writes in front of a date, and where one sits.
 *
 * A marked date is offered through the emoji itself rather than through an icon
 * of ours: the glyph is already beside the date and already means "this is a
 * date", so using it as the button adds nothing to the line at all — the best
 * outcome the least-interference goal has.
 *
 * Pure text, like `scan.ts`, and deliberately ignorant of whether the Tasks
 * plugin is installed. Someone who typed 📅 in front of a date said what they
 * meant by it, and a rule that changed with another plugin's state would make
 * the same note behave two ways.
 */

/**
 * The six Tasks emoji that are followed by a date: created, start, scheduled,
 * due, done, cancelled.
 *
 * The rest of the plugin's vocabulary is deliberately absent. Recurrence (🔁),
 * the five priorities, on-completion (🏁), ids (🆔) and dependencies (⛔) are
 * all followed by something other than a date, so a date near one of them is
 * not the date it marks.
 */
export const TASK_MARKERS = ["➕", "🛫", "⏳", "📅", "✅", "❌"] as const;

/**
 * How far behind a date the lookback reaches, in UTF-16 units.
 *
 * An emoji is two of them, the optional variation selector a third, which
 * leaves room for five spaces — more than the single one Tasks writes. The
 * window is what keeps this cheap: a whole-note scan asks per candidate, and
 * slicing from the start of the note each time would cost a long note with many
 * dates its square.
 */
const LOOKBACK = 8;

/**
 * A marker, and any run of spaces between it and the date, immediately before
 * the date. Anchored at the end, so anything in between — a word, a digit, a
 * newline — means there is no marker.
 *
 * The variation selector is tolerated rather than required: every one of these
 * renders as an emoji on its own, but some keyboards and some older notes carry
 * U+FE0F after it, and the two forms are the same glyph to the reader.
 */
const MARKER_BEFORE = new RegExp(`(?:${TASK_MARKERS.join("|")})️?[ \t]*$`, "u");

/**
 * Where the marker in front of the date at `at` begins, or null if there is
 * none.
 *
 * The offset reaches back past the spaces as well as the emoji, which is what
 * makes the pair one target: the gap between them belongs to neither half, and
 * a gap a pointer can fall into is what made the hover affordance flicker
 * before the icon's leading space became padding inside its own box.
 */
export function markerBefore(text: string, at: number): number | null {
  const match = MARKER_BEFORE.exec(text.slice(Math.max(0, at - LOOKBACK), at));

  return match === null ? null : at - match[0].length;
}
