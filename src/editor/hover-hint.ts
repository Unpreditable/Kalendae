import { EditorState, Extension, StateEffect, StateField } from "@codemirror/state";
import {
  EditorView,
  Tooltip,
  TooltipView,
  ViewPlugin,
  ViewUpdate,
  closeHoverTooltips,
  hoverTooltip,
  showTooltip,
} from "@codemirror/view";
import { detectIn } from "../detect/detect";
import { Hint, hintFor } from "../picker/hint";
import { dayFor, todayKey } from "../picker/month";
import { KalendaeSettings } from "../settings";
import { ANY_HOVER, caretHintApplies, touches } from "./caret-hint-rule";
import { pickerOpen } from "./picker-tooltip";

/**
 * The line above a date saying how far it is from today, once the pointer has
 * rested on it — or the caret, on the devices `caretHint` names.
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
 * settings preview waits the same, to show the timing a note will have, and
 * the caret rests as long before its hint shows.
 */
export const HOVER_TIME = 400;

/** A date with a hint to show, and where on the line it starts and ends. */
interface HintTarget {
  from: number;
  to: number;
  hint: Hint;
  /** Whether the icon sits before the date, so the hint lines up past it. */
  iconLeft: boolean;
}

/** The hint for the date on `pos`, if there is one and the hint is on at all. */
function hintTargetAt(
  state: EditorState,
  settings: KalendaeSettings,
  pos: number,
): HintTarget | null {
  if (settings.hoverDistance === "off" || pickerOpen(state)) return null;

  for (const detection of detectIn(state, settings, pos, pos)) {
    // Dates only. A time does not say which day it belongs to, so a
    // distance from now would be right in today's note and wrong in
    // last week's.
    if (detection.kind !== "date") continue;

    // A Tasks emoji in front of the date is part of the same target: the
    // outline already treats the pair as one, so the hint does as well.
    const from = settings.taskEmoji ? (detection.markerFrom ?? detection.from) : detection.from;
    if (!detection.accepted || !touches(pos, from, detection.to)) continue;

    return {
      from,
      to: detection.to,
      hint: hintFor(
        dayFor(detection.text, detection.pattern, detection.locale),
        todayKey(),
        detection.pattern,
        settings.hoverDistance,
        settings.hoverOrb,
      ),
      // Which way the outline reaches, so the hint can line up with it: past
      // the icon when there is one before the date.
      iconLeft: settings.hoverIcon === "left" && from === detection.from,
    };
  }

  return null;
}

function hintDom(target: HintTarget): HTMLElement {
  const dom = createDiv({
    cls: target.iconLeft ? "kalendae-hint kalendae-hint-icon-left" : "kalendae-hint",
  });
  fillHint(dom, target.hint);
  return dom;
}

/**
 * The classes that let styles.css reach the hint's host, which carries the pale
 * background, without `:has()`, which Obsidian's review refuses.
 */
function hostMarks(target: HintTarget): string[] {
  return target.iconLeft
    ? ["kalendae-hint-host", "kalendae-hint-host-icon-left"]
    : ["kalendae-hint-host"];
}

/** The pointer's hint in each editor while it is up, so the caret's can stand in for it. */
const hoverShown = new WeakMap<EditorView, HintTarget>();

export function hoverHint(getSettings: () => KalendaeSettings): Extension {
  return hoverTooltip(
    (view, pos) => {
      const target = hintTargetAt(view.state, getSettings(), pos);
      if (target === null) return null;

      // One hint per date: the caret's is already up on this one.
      if (view.state.field(caretShown, false)?.from === target.from) return null;

      return {
        pos: target.from,
        end: target.to,
        above: true,
        arrow: false,
        create: (): TooltipView => {
          const dom = hintDom(target);

          // CodeMirror hangs every hover tooltip in a host of its own, and
          // the host carries the background. Marked from here while the hint
          // is in it, so the marks stay off every other plugin's hover tooltip.
          const marks = hostMarks(target);
          let host: HTMLElement | null = null;
          return {
            dom,
            mount: () => {
              host = dom.parentElement;
              host?.addClasses(marks);
              hoverShown.set(view, target);
            },
            destroy: () => {
              host?.removeClasses(marks);
              if (hoverShown.get(view) === target) hoverShown.delete(view);
            },
          };
        },
      };
    },
    { hoverTime: HOVER_TIME, hideOnChange: true },
  );
}

/**
 * The same hint for a caret resting on a date, which is the only way to it on
 * a device with no hover.
 *
 * Held in a field rather than worked out from the selection on every update,
 * so it can wait the same pause the pointer does: the field is set once the
 * caret has rested, and drops the hint itself the moment anything moves.
 */
const setCaretHint = StateEffect.define<HintTarget | null>();

const caretShown = StateField.define<HintTarget | null>({
  create: () => null,

  update(current, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setCaretHint)) return effect.value;
    }
    if (current === null) return null;

    // Gone on any edit, any caret move and while the picker is up; back once
    // the caret rests again.
    const moved = transaction.docChanged || transaction.selection !== undefined;
    return moved || pickerOpen(transaction.state) ? null : current;
  },

  provide: (field) =>
    showTooltip.from(field, (target) => (target === null ? null : caretTooltip(target))),
});

function caretTooltip(target: HintTarget): Tooltip {
  return {
    pos: target.from,
    end: target.to,
    above: true,
    arrow: false,
    create: () => {
      // Built like the host a hover tooltip hangs in, with the same marks, so
      // the two hints are one look and one set of rules in styles.css.
      const dom = createDiv({ cls: ["cm-tooltip-hover", ...hostMarks(target)] });
      dom.appendChild(hintDom(target));
      return { dom };
    },
  };
}

export function caretHint(getSettings: () => KalendaeSettings): Extension {
  return [
    caretShown,
    ViewPlugin.fromClass(
      class {
        private timer: number | null = null;
        // Asked live, not once: an iPad gains hover with a trackpad attached
        // and loses it again without one.
        private readonly canHover = window.matchMedia(ANY_HOVER);
        private readonly onHoverChange = (): void => this.rest(0);

        constructor(private readonly view: EditorView) {
          this.canHover.addEventListener("change", this.onHoverChange);
          this.rest(HOVER_TIME);
        }

        update(update: ViewUpdate): void {
          const pickerToggled = pickerOpen(update.startState) !== pickerOpen(update.state);
          if (!update.docChanged && !update.selectionSet && !update.focusChanged && !pickerToggled) {
            return;
          }
          // Leaving the editor takes the hint at once; everything else waits
          // for the caret to rest.
          this.rest(update.focusChanged && !this.view.hasFocus ? 0 : HOVER_TIME);
        }

        destroy(): void {
          if (this.timer !== null) window.clearTimeout(this.timer);
          this.canHover.removeEventListener("change", this.onHoverChange);
        }

        private rest(delay: number): void {
          if (this.timer !== null) window.clearTimeout(this.timer);
          this.timer = window.setTimeout(() => {
            this.timer = null;
            this.show();
          }, delay);
        }

        private show(): void {
          const { state } = this.view;
          const settings = getSettings();

          // The main caret only, and a caret rather than a selection: a hint
          // over selected text would sit on top of whatever is done with it.
          const main = state.selection.main;
          const applies =
            this.view.hasFocus &&
            main.empty &&
            caretHintApplies(settings.caretHint, this.canHover.matches);
          const target = applies ? hintTargetAt(state, settings, main.head) : null;

          const current = state.field(caretShown);
          if (current?.from === target?.from && current?.to === target?.to) return;

          // One hint per date: the pointer's makes way, since the caret's
          // stays while the pointer wanders off.
          const effects: StateEffect<unknown>[] = [setCaretHint.of(target)];
          if (target !== null && hoverShown.get(this.view)?.from === target.from) {
            effects.push(closeHoverTooltips);
          }
          this.view.dispatch({ effects });
        }
      },
    ),
  ];
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
