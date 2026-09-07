import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

/**
 * The seam where date detection and the picker affordance will live.
 *
 * Source mode and Live Preview are the same CodeMirror EditorView, so this one
 * extension serves both — there is no second code path. Reading mode is not
 * CodeMirror and is deliberately out of scope.
 *
 * Today it still produces no decorations. Detection exists, but nothing yet
 * consumes it in the editor, so scanning on every change would be work thrown
 * away; the report command scans on demand instead. What this plugin does
 * provide is the registry below, which is how a command reaches the live
 * EditorView — and its EditorState, and so the syntax tree — for a note.
 */

const liveViews = new Set<EditorView>();

/**
 * The EditorView rendering inside `container`, if one is registered.
 *
 * Commands need this because Obsidian's `Editor` does not expose the
 * underlying CodeMirror view through any typed API, and matching on the DOM
 * beats reaching for an untyped `.cm` property. Matching on the container
 * rather than on focus also survives the command palette, which takes focus
 * away from the editor before the command ever runs.
 */
export function editorViewIn(container: HTMLElement): EditorView | null {
  for (const view of liveViews) {
    if (container.contains(view.dom)) return view;
  }
  return null;
}

class DatePickerView {
  decorations: DecorationSet;

  constructor(private readonly view: EditorView) {
    this.decorations = Decoration.none;
    liveViews.add(view);
  }

  update(update: ViewUpdate): void {
    // Scanning is viewport-bound, so a scroll matters as much as an edit.
    if (update.docChanged || update.viewportChanged) {
      this.decorations = Decoration.none;
    }
  }

  destroy(): void {
    liveViews.delete(this.view);
  }
}

export const datePickerExtension = ViewPlugin.fromClass(DatePickerView, {
  decorations: (plugin) => plugin.decorations,
});
