import type { CaretHint } from "../settings";

/**
 * The two questions the caret hint asks before anything is drawn, kept apart
 * from CodeMirror so they can be tested without an editor.
 */

/** Whether any pointer attached to the device can hover; see `caretHintApplies()`. */
export const ANY_HOVER = "(any-hover: hover)";

/**
 * Whether this device shows the hint at the caret, given whether any pointer
 * attached to it can hover.
 *
 * Asked of the pointers rather than of the platform: a touchscreen laptop
 * already has hover from its trackpad, and an iPad gains it with a trackpad
 * and loses it again without one.
 */
export function caretHintApplies(setting: CaretHint, canHover: boolean): boolean {
  return setting === "always" || !canHover;
}

/**
 * Whether a position is on a range, both ends counted: a caret just before the
 * first character or just after the last is still on the date.
 */
export function touches(pos: number, from: number, to: number): boolean {
  return from <= pos && pos <= to;
}
