import { App, Scope } from "obsidian";
import { KalendaeSettings } from "../settings";
import { dayFor } from "./month";
import { createPanel } from "./panel";
import { Box, placementFor } from "./popup-math";
import { replacementFor } from "./write";

/**
 * The calendar opened from outside the editor, for another plugin's row or
 * menu.
 *
 * Nothing here knows CodeMirror: the panel is mounted on the window itself,
 * placed beside whatever it was opened from, and closed by Escape, a pick, a
 * click elsewhere, or anything scrolling or resizing out from under it. The
 * caller writes the date; this only reports the day chosen.
 */

export interface PopupOptions {
  /** The date to open on, written in `pattern`. Empty or unreadable opens on today. */
  value: string;
  /** The moment format `value` is read in, and the result is written in. */
  pattern: string;
  /** An element to sit beside, or the point of a click. */
  anchor: HTMLElement | MouseEvent;
  settings: KalendaeSettings;
}

/** Only one popup is open at a time; opening another closes the first with null. */
let closeOpen: (() => void) | null = null;

/** Closes the open popup, if any, with null — on unload, so no caller is left waiting. */
export function closePopup(): void {
  closeOpen?.();
}

export function openPopup(app: App, options: PopupOptions): Promise<string | null> {
  closePopup();

  return new Promise((resolve) => {
    const doc = documentOf(options.anchor);
    const win = doc.defaultView ?? activeWindow;

    // Escape is ours while the calendar is open. Pushed onto the keymap rather
    // than caught on the panel, so a modal or menu the calendar was opened from
    // does not close on the same key.
    const scope = new Scope(app.scope);
    scope.register([], "Escape", () => {
      close();
      return false;
    });

    let settled = false;

    // The single exit: whichever way out comes first settles the promise, and
    // the rest are ignored.
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;

      app.keymap.popScope(scope);
      doc.removeEventListener("mousedown", outside, true);
      doc.removeEventListener("scroll", moved, true);
      win.removeEventListener("resize", close);
      panel.dom.remove();
      if (closeOpen === close) closeOpen = null;
      resolve(result);
    };

    const close = () => finish(null);

    const panel = createPanel({
      value: dayFor(options.value || "", options.pattern),
      pattern: options.pattern,
      settings: options.settings,
      onPick: (day) => finish(replacementFor(options.pattern, day)),
      onClose: close,
    });

    const outside = (event: MouseEvent) => {
      if (!panel.dom.contains(event.target as Node)) close();
    };

    // The popup is fixed to the window, so a scroll would leave it beside
    // nothing. Closed rather than followed, as Obsidian's own menus are.
    const moved = (event: Event) => {
      if (!panel.dom.contains(event.target as Node)) close();
    };

    panel.dom.addClass("kalendae-panel-popup");
    doc.body.appendChild(panel.dom);

    // Measured once it is in the document, since its size is only known then.
    const box = panel.dom.getBoundingClientRect();
    const at = placementFor(
      boxOf(options.anchor),
      { width: box.width, height: box.height },
      { width: win.innerWidth, height: win.innerHeight },
    );

    panel.dom.setCssProps({
      "--kalendae-popup-left": `${at.left}px`,
      "--kalendae-popup-top": `${at.top}px`,
    });

    panel.focus();
    app.keymap.pushScope(scope);
    doc.addEventListener("mousedown", outside, true);
    doc.addEventListener("scroll", moved, true);
    win.addEventListener("resize", close);
    closeOpen = close;
  });
}

/**
 * Asked by shape, not `instanceof`: an element in a pop-out window belongs to
 * that window's `HTMLElement`, which the main window's does not recognise.
 */
function isElement(anchor: HTMLElement | MouseEvent): anchor is HTMLElement {
  return "getBoundingClientRect" in anchor;
}

function documentOf(anchor: HTMLElement | MouseEvent): Document {
  if (isElement(anchor)) return anchor.ownerDocument;

  return anchor.view?.document ?? activeDocument;
}

function boxOf(anchor: HTMLElement | MouseEvent): Box {
  if (isElement(anchor)) {
    const rect = anchor.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }

  // A click has no area, so the popup is placed from the point it landed on.
  return { left: anchor.clientX, top: anchor.clientY, right: anchor.clientX, bottom: anchor.clientY };
}
