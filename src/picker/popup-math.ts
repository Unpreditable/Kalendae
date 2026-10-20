/**
 * Where a popup opened from outside the editor goes: pure arithmetic, so it can
 * be unit-tested without a window.
 *
 * Below the anchor when there is room, above it when there is not, and held
 * inside the window sideways. CodeMirror does the same for the tooltips it
 * places in a note; a calendar opened from another plugin has no editor to do
 * it for it.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Air between the anchor and the popup, so the popup does not touch what opened it. */
const GAP = 4;

export function placementFor(anchor: Box, popup: Size, window: Size): { left: number; top: number } {
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - popup.height;

  // Above only when below would fall off the window and above fits. Where neither
  // fits, below wins: the popup is fixed to the window and cannot be scrolled
  // to, so it is the bottom that is cut off and the month's header stays in view.
  const top = below + popup.height > window.height && above >= 0 ? above : below;

  // Held inside the window on both sides, so the popup never starts off-screen
  // to the left or runs past the right edge.
  const left = Math.max(0, Math.min(anchor.left, window.width - popup.width));

  return { left, top };
}
