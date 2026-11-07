import { Compartment, Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, tooltips } from "@codemirror/view";

/**
 * Tooltips for an editor in a table cell, hung on the window's body.
 *
 * A table in Live Preview is a widget, and Obsidian gives every widget in the
 * content `contain: paint`, which clips whatever is inside it — `position:
 * fixed` included, since containment makes the widget the box a fixed element
 * is placed in. The cell being edited is an editor of its own inside that
 * widget, so its tooltips — the calendar, the clock, the hint — were drawn
 * inside it and cut off at the table's edge. Hung on the body they are outside
 * the widget and nothing clips them.
 *
 * Only for a cell: the setting moves every tooltip in the editor, and an editor
 * outside a table has nothing to escape.
 */

const tooltipHost = new Compartment();

const IN_TABLE = "kalendae-in-table";

/** Whether this editor is a table cell's. */
export function inTable(view: EditorView): boolean {
  return view.dom.closest(".cm-table-widget") !== null;
}

const liftInTable = ViewPlugin.fromClass(
  class {
    private readonly timer: number;

    constructor(view: EditorView) {
      // Asked a tick later because a cell's editor is built first and put in
      // the table after, so at this point it is in no table at all. A dispatch
      // could not happen here anyway, a plugin being built inside an update.
      this.timer = window.setTimeout(() => {
        if (!inTable(view)) return;

        const body = view.dom.ownerDocument.body;
        view.dispatch({
          effects: tooltipHost.reconfigure([
            tooltips({ parent: body }),
            // For styles.css, which cannot ask whether an editor is in a table
            // with `:has()`, Obsidian's review refusing it.
            EditorView.editorAttributes.of({ class: IN_TABLE }),
          ]),
        });
      });
    }

    destroy(): void {
      window.clearTimeout(this.timer);
    }
  },
);

export function tableCellTooltips(): Extension {
  return [tooltipHost.of([]), liftInTable];
}
