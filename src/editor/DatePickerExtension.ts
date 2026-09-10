import { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { KalendaeSettings } from "../settings";
import { dateDecorations } from "./decorations";
import { hotDate, hoverHandlers } from "./hover-state";
import { pickerTooltip, showPicker } from "./picker-tooltip";

/**
 * Everything Kalendae adds to an editor, in one extension.
 *
 * Source mode and Live Preview are the same CodeMirror EditorView, so this
 * serves both and there is no second code path. Reading mode is not CodeMirror
 * and is deliberately out of scope.
 *
 * The pieces, in the order they depend on each other: a registry of live views
 * so a command can find one, the field holding which date the pointer is on,
 * the handlers that set it, and the decorations that read it.
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

const registry = ViewPlugin.fromClass(
  class {
    constructor(private readonly view: EditorView) {
      liveViews.add(view);
    }

    destroy(): void {
      liveViews.delete(this.view);
    }
  },
);

export function datePickerExtension(getSettings: () => KalendaeSettings): Extension {
  return [
    registry,
    hotDate,
    hoverHandlers,
    // The icon opens the same picker the double-click and the command open,
    // by dispatching the same effect.
    dateDecorations(getSettings, (target, view) => showPicker(view, target)),
    pickerTooltip(getSettings),
  ];
}
