import { Extension, StateEffect, StateField } from "@codemirror/state";
import { EditorView, Tooltip, showTooltip } from "@codemirror/view";
import { detectIn } from "../detect/detect";
import { DayKey, dayFor } from "../picker/month";
import { createPanel } from "../picker/panel";
import { insertionFor, stillThere } from "../picker/write";
import { KalendaeSettings } from "../settings";
import { DateTarget } from "./decorations";

/**
 * The calendar, mounted on the date it was opened from.
 *
 * A CodeMirror tooltip rather than a popup of our own: CodeMirror already
 * anchors to a document position, flips the panel when it would fall off the
 * bottom of the window, and keeps it with the text as the note scrolls.
 *
 * Opening is an effect, which is what makes the three triggers cost almost
 * nothing — the icon, a double-click and the command all dispatch the same one.
 */

// Private on purpose: everything that opens the picker goes through
// `showPicker`, so there is one way in and one place to change it.
const openPicker = StateEffect.define<DateTarget>();
const closePicker = StateEffect.define<null>();

const openOn = StateField.define<DateTarget | null>({
  create: () => null,

  update(current, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(openPicker)) return effect.value;
      if (effect.is(closePicker)) return null;
    }

    // Any edit closes it, including the one it makes itself. A calendar open on
    // a date that has since been typed over is pointed at nothing.
    return transaction.docChanged ? null : current;
  },
});

/** The date under a document position, if the plugin recognises one there. */
export function targetAt(
  state: EditorView["state"],
  settings: KalendaeSettings,
  pos: number,
): DateTarget | null {
  for (const detection of detectIn(state, settings, pos, pos)) {
    if (!detection.accepted || pos < detection.from || pos > detection.to) continue;

    return {
      from: detection.from,
      to: detection.to,
      text: detection.text,
      pattern: detection.pattern,
    };
  }

  return null;
}

export function pickerTooltip(getSettings: () => KalendaeSettings): Extension {
  return [
    openOn,
    showTooltip.compute([openOn], (state) => {
      const target = state.field(openOn);
      return target === null ? null : tooltipFor(target, getSettings());
    }),
    EditorView.domEventHandlers({
      // The second mousedown of a double-click, rather than the dblclick that
      // follows it. By the time dblclick fires the browser has already selected
      // a word — in a date that is one of YYYY, MM or DD, left highlighted
      // under the open panel — and preventDefault there cannot take it back.
      // Here it can, because the selection has not happened yet.
      mousedown: (event, view) => {
        const settings = getSettings();
        if (event.detail !== 2 || !settings.doubleClick) return false;

        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const target = pos === null ? null : targetAt(view.state, settings, pos);
        if (target === null) return false;

        event.preventDefault();
        view.dispatch({
          // Collapsed after the date, which is where picking a day would leave
          // the caret anyway.
          selection: { anchor: target.to },
          effects: openPicker.of(target),
        });
        return true;
      },
    }),
  ];
}

/** Opens the picker on a target, from anywhere that has a view. */
export function showPicker(view: EditorView, target: DateTarget): void {
  view.dispatch({ effects: openPicker.of(target) });
}

function tooltipFor(target: DateTarget, settings: KalendaeSettings): Tooltip {
  return {
    pos: target.from,
    end: target.to,
    above: false,
    // The panel is a surface of its own, with its own border and shadow; an
    // arrow would draw a second one pointing at the text it already sits on.
    arrow: false,
    create: (view) => {
      const panel = createPanel({
        value: dayFor(target.text, target.pattern),
        pattern: target.pattern,
        settings,
        onPick: (day) => write(view, target, day),
        onClose: () => close(view),
      });

      // A click anywhere else is a click elsewhere, and the panel should be gone
      // by the time it lands. Captured on the editor's own document, which is
      // not the app's when the note is open in a popout window.
      const outside = (event: MouseEvent) => {
        if (!panel.dom.contains(event.target as Node)) close(view);
      };

      return {
        dom: panel.dom,
        mount: () => {
          panel.focus();
          view.dom.ownerDocument.addEventListener("mousedown", outside, true);
        },
        destroy: () => view.dom.ownerDocument.removeEventListener("mousedown", outside, true),
      };
    },
  };
}

/**
 * One transaction, so one undo puts the old date back whole — or takes an
 * inserted one away whole, the empty range at a caret being the same write.
 *
 * Guarded first: the picker closes on any edit, but an edit from another pane
 * or a sync can land in the same tick as a pick, and a write aimed at a range
 * that no longer holds the date it was opened on would land in the middle of
 * whatever moved there.
 */
function write(view: EditorView, target: DateTarget, day: DayKey): void {
  const doc = view.state.doc.toString();
  if (!stillThere(doc, target.from, target.to, target.text)) {
    close(view);
    return;
  }

  const insert = insertionFor(doc, target.from, target.to, target.pattern, day);

  view.dispatch({
    changes: { from: target.from, to: target.to, insert },
    // After everything written, not before it: the reader was reading forwards,
    // and a caret left at the start reads as the edit having gone somewhere
    // else. Past a space the insert case added, too — a letter typed straight
    // after a pick would otherwise stick to the date and undo the separation
    // that space was there for.
    selection: { anchor: target.from + insert.length },
    effects: closePicker.of(null),
  });
  view.focus();
}

function close(view: EditorView): void {
  view.dispatch({ effects: closePicker.of(null) });
  view.focus();
}
