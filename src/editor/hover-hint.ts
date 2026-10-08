import { Extension } from "@codemirror/state";
import { hoverTooltip } from "@codemirror/view";
import { detectIn } from "../detect/detect";
import { Hint, hintFor } from "../picker/hint";
import { dayFor, todayKey } from "../picker/month";
import { KalendaeSettings } from "../settings";
import { pickerOpen } from "./picker-tooltip";

/**
 * The line above a date saying how far it is from today, once the pointer has
 * rested on it.
 *
 * CodeMirror's own hover tooltip rather than one driven off `hotDate`: it
 * already waits before showing, follows the pointer off the text, and closes
 * on a click. `hotDate` lights the outline the moment the pointer arrives,
 * which is right for the outline and wrong for a line of text — a hint that
 * appeared on every date the pointer crossed would flicker across a paragraph.
 *
 * Nothing in the note changes for it. The hint is a tooltip, laid over the
 * line above, and is gone the moment the pointer leaves.
 */

/**
 * Long enough that crossing a date on the way elsewhere draws nothing. The
 * settings preview waits the same, to show the timing a note will have.
 */
export const HOVER_TIME = 400;

export function hoverHint(getSettings: () => KalendaeSettings): Extension {
  return hoverTooltip(
    (view, pos) => {
      const settings = getSettings();
      if (settings.hoverDistance === "off" || pickerOpen(view.state)) return null;

      for (const detection of detectIn(view.state, settings, pos, pos)) {
        // Dates only. A time does not say which day it belongs to, so a
        // distance from now would be right in today's note and wrong in
        // last week's.
        if (detection.kind !== "date") continue;

        // A Tasks emoji in front of the date is part of the same target: the
        // outline already treats the pair as one, so the hint does as well.
        const from = settings.taskEmoji ? (detection.markerFrom ?? detection.from) : detection.from;
        if (!detection.accepted || pos < from || pos > detection.to) continue;

        const hint = hintFor(
          dayFor(detection.text, detection.pattern, detection.locale),
          todayKey(),
          detection.pattern,
          settings.hoverDistance,
          settings.hoverOrb,
        );

        return {
          pos: from,
          end: detection.to,
          above: true,
          arrow: false,
          create: () => {
            // Which way the outline reaches, so the hint can line up with it:
            // past the icon when there is one before the date.
            const iconLeft = settings.hoverIcon === "left" && from === detection.from;
            const dom = createDiv({
              cls: iconLeft ? "kalendae-hint kalendae-hint-icon-left" : "kalendae-hint",
            });
            fillHint(dom, hint);

            // CodeMirror hangs every hover tooltip in a host of its own, and
            // the host carries the pale background. Marked from here while the
            // hint is in it, so styles.css can reach the host without `:has()`,
            // which Obsidian's review refuses.
            const marks = iconLeft
              ? ["kalendae-hint-host", "kalendae-hint-host-icon-left"]
              : ["kalendae-hint-host"];
            let host: HTMLElement | null = null;
            return {
              dom,
              mount: () => {
                host = dom.parentElement;
                host?.addClasses(marks);
              },
              destroy: () => host?.removeClasses(marks),
            };
          },
        };
      }

      return null;
    },
    { hoverTime: HOVER_TIME, hideOnChange: true },
  );
}

/**
 * Writes a hint into an element: the orb, the weekday and the distance.
 *
 * Shared with the settings preview, so the page shows exactly what a note
 * would.
 */
export function fillHint(parent: HTMLElement, hint: Hint): void {
  if (hint.orb !== null) {
    parent.createSpan({ cls: `kalendae-hint-orb kalendae-hint-${hint.orb}` });
  }
  if (hint.weekday !== null) {
    parent.createSpan({ text: hint.weekday });
    parent.createSpan({ cls: "kalendae-hint-separator", text: "·" });
  }
  parent.createSpan({ text: hint.distance });
}
