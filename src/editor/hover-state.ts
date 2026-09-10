import { MapMode, StateEffect, StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * Which date the pointer is on, held in editor state rather than on the DOM.
 *
 * The spike toggled a class onto the elements directly and proved why not: a
 * redraw replaces them, and the class goes with them while the pointer has not
 * moved. Held here, the highlight is rebuilt with every other decoration and
 * cannot be stranded.
 *
 * The value is the date's start offset, which is also the id the mark and its
 * icon share. They cannot be found by walking the DOM from one to the other:
 * CodeMirror slips a zero-width `cm-widgetBuffer` between them so the cursor
 * can sit on either side, and Obsidian's formatting spans — emphasis, strong,
 * strikethrough, headings, `[…]` — reparent one without the other.
 */

const setHotDate = StateEffect.define<number | null>();

export const hotDate = StateField.define<number | null>({
  create: () => null,

  update(current, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setHotDate)) return effect.value;
    }

    if (current === null || !transaction.docChanged) return current;

    // TrackDel gives back null when the date the pointer was on has been typed
    // over, which is the moment the highlight should stop existing rather than
    // slide onto whatever took its place.
    return transaction.changes.mapPos(current, -1, MapMode.TrackDel);
  },
});

/** Reads the id off whichever of the pair the pointer is over. */
function hotIdAt(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;

  const owner = target.closest("[data-kalendae]");
  const id = owner?.getAttribute("data-kalendae");

  return id === undefined || id === null ? null : Number(id);
}

export const hoverHandlers = EditorView.domEventHandlers({
  mouseover: (event, view) => {
    // Not while a button is down. Dragging across a paragraph to select it is
    // not reaching for a date, and lighting up every date the selection crosses
    // is noise in the middle of a deliberate gesture.
    const id = event.buttons === 0 ? hotIdAt(event.target) : null;
    if (id !== view.state.field(hotDate)) view.dispatch({ effects: setHotDate.of(id) });
  },

  mousedown: (_event, view) => {
    // A selection starting on a date should not leave it lit for the length of
    // the drag.
    if (view.state.field(hotDate) !== null) view.dispatch({ effects: setHotDate.of(null) });
  },

  mouseleave: (_event, view) => {
    if (view.state.field(hotDate) !== null) view.dispatch({ effects: setHotDate.of(null) });
  },
});
