import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

/**
 * The seam where date detection and the picker affordance will live.
 *
 * Source mode and Live Preview are the same CodeMirror EditorView, so this one
 * extension serves both — there is no second code path. Reading mode is not
 * CodeMirror and is deliberately out of scope.
 *
 * Today it produces no decorations. It exists so the registration, the build's
 * externalisation of @codemirror/*, and the recompute triggers are all proven
 * before there is anything to decorate.
 */
class DatePickerView {
  decorations: DecorationSet;

  constructor(_view: EditorView) {
    this.decorations = Decoration.none;
  }

  update(update: ViewUpdate): void {
    // Scanning is viewport-bound, so a scroll matters as much as an edit.
    if (update.docChanged || update.viewportChanged) {
      this.decorations = Decoration.none;
    }
  }
}

export const datePickerExtension = ViewPlugin.fromClass(DatePickerView, {
  decorations: (plugin) => plugin.decorations,
});
