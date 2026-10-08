import { App, Setting, SettingGroup, setIcon, setTooltip } from "obsidian";
import Sortable from "sortablejs";
import { DateFormatEntry, FormatKind, checkFormat, renderExample } from "../detect/formats";
import { checkTimeFormat, timeSampleParts } from "../detect/time-formats";
import { Shadow } from "../detect/shadow";
import { FormatModal } from "./format-modal";
import { t } from "../i18n/i18n";

/**
 * One row of the format list, rendered by hand.
 *
 * The declarative row types could not carry this: a `page` row gets no delete
 * or drag affordance, and a plain row gets no buttons at all, so a custom
 * format could either be edited or removed but never both. Owning the row
 * settles that, and puts the drag handle at the start where it belongs rather
 * than wherever the framework happens to place it.
 */

/** Marks a format the user wrote, as opposed to one picked from the catalogue. */
export const CUSTOM_PREFIX = "custom-";

/** One of the two lists a row can belong to. */
export interface FormatList {
  kind: FormatKind;
  entries: DateFormatEntry[];
  /**
   * How few rows the list may hold. One for dates, which always need a format
   * to write a new date in; none for times, where an empty list is how they
   * are switched off.
   */
  minimum: number;
}

export interface FormatListActions {
  onEdit: (id: string, pattern: string) => void;
  onDelete: (index: number) => void;
  /** The rows as they now sit, by format id. */
  onReorder: (ids: string[]) => void;
}

export function renderFormatRow(
  setting: Setting,
  group: SettingGroup,
  list: FormatList,
  index: number,
  actions: FormatListActions,
  shadow: Shadow | undefined,
): void {
  const entry = list.entries[index];
  if (!entry) return;

  setting.settingEl.empty();
  setting.settingEl.addClass("kalendae-format-row");
  // What the row is, so a finished drag can be read off the list itself.
  setting.settingEl.dataset.formatId = entry.id;

  const custom = entry.id.startsWith(CUSTOM_PREFIX);

  renderHandle(setting.settingEl, list);
  ensureSortable(group.listEl, list.kind, actions);
  renderKind(setting.settingEl, custom);

  setting.settingEl.createDiv({
    cls: "kalendae-format-pattern",
    text: entry.pattern || t("settings.formats.newFormat"),
  });
  renderShadow(setting.settingEl, shadow);
  fillExample(setting.settingEl.createDiv({ cls: "kalendae-format-example" }), entry, list.kind);

  const buttons = setting.settingEl.createDiv({ cls: "kalendae-format-buttons" });
  if (custom) {
    iconButton(buttons, "pencil", t("settings.formats.edit"), () =>
      actions.onEdit(entry.id, entry.pattern),
    );
  } else {
    renderPencilSpacer(buttons);
  }
  // Withheld at one format: the list must never empty out, and a delete button
  // that refuses to delete is worse than no button.
  if (list.entries.length > list.minimum) {
    iconButton(buttons, "trash-2", t("settings.formats.delete"), () => actions.onDelete(index));
  }
}

/**
 * The grip. Sortable does the dragging; this only has to be the thing you take
 * hold of, and to stop inviting a drag there is nothing to reorder.
 */
function renderHandle(row: HTMLElement, list: FormatList): void {
  const handle = row.createDiv({ cls: "kalendae-format-handle" });
  setIcon(handle, "grip-vertical");
  handle.setAttribute("aria-label", t("settings.formats.reorder"));

  if (list.entries.length < 2) handle.addClass("kalendae-format-handle-idle");
}

/**
 * Reordering, delegated to Sortable.
 *
 * The hand-rolled version this replaces could move a format but could never
 * show where it was going: the browser will say which row the pointer is over,
 * but not which row it has left — Chromium leaves that empty during a drag —
 * so the marker was erased as fast as it appeared. Sortable carries the row
 * with the pointer and keeps a real placeholder in the list, which is the
 * behaviour that was wanted and not worth rebuilding by hand.
 *
 * Bound to the list rather than to a row, once: `Sortable.get` is what keeps a
 * re-render from stacking a second instance on the same element. Indices count
 * only elements matching `draggable`, so the explanatory first row of the list
 * is skipped and they line up with the formats array.
 *
 * That guard is enough while the element lives. It is not enough when the
 * element is replaced: Obsidian reuses the group across `update()`, but empties
 * the container and builds a fresh list when the tab is reopened after being
 * closed. `Sortable.get` then reports nothing, while the instance bound to the
 * old element is still held in the library's own module-level list of every
 * sortable ever created — that list is only ever shortened by `destroy()`. Left
 * alone it pins one detached list, with all its rows and their closures, per
 * visit to the tab, and every drag anywhere in the app walks past them.
 */
const sortables = new Map<FormatKind, Sortable>();

function ensureSortable(listEl: HTMLElement, kind: FormatKind, actions: FormatListActions): void {
  if (Sortable.get(listEl)) return;
  // Whatever this replaces is bound to an element no longer in the document.
  sortables.get(kind)?.destroy();
  sortables.set(kind, Sortable.create(listEl, {
    draggable: ".kalendae-format-row",
    handle: ".kalendae-format-handle",
    animation: 150,
    // Half a row, not the whole one. The library's default asks the row you are
    // carrying to cover its neighbour completely before the two trade places,
    // so a drag travels a full row height before anything on screen moves —
    // which reads as the list being slow rather than as the threshold being
    // high.
    swapThreshold: 0.5,
    // Stated rather than detected. Left unset, the default is a function that
    // reads three computed styles and measures two rows to work out which way
    // the list runs — on every pointer move of every drag, each one forcing a
    // style and layout recalculation mid-drag. The list is vertical and cannot
    // become anything else.
    direction: "vertical",
    ghostClass: "kalendae-format-row-placeholder",
    dragClass: "kalendae-format-row-moving",
    // Sortable has already moved the element, so the list is the answer. Read
    // the order off it rather than deriving it from the indices Sortable
    // reports: those are relative to whichever siblings it counts, and the
    // list holds a row that is not a format at all.
    onEnd: () => {
      const rows = listEl.querySelectorAll<HTMLElement>(".kalendae-format-row");
      actions.onReorder(Array.from(rows, (row) => row.dataset.formatId ?? ""));
    },
  }));
}

/**
 * Lets go of the drag binding and the list element it holds.
 *
 * Called when the tab is hidden, which is the ordinary way out. The rebind
 * above covers the rest: `hide()` is documented as not guaranteed to run when
 * the host window is destroyed.
 */
export function releaseSortable(): void {
  for (const sortable of sortables.values()) sortable.destroy();
  sortables.clear();
}

/**
 * Which kind of format this is, said once at the start of the row.
 *
 * The distinction is otherwise invisible until you notice that only some rows
 * carry a pencil, which is a rule you have to infer from an absence. The word
 * itself is on hover — where there is no hover, the two icons still tell the
 * kinds apart even if the label cannot be read.
 */
function renderKind(row: HTMLElement, custom: boolean): void {
  const mark = row.createDiv({ cls: "kalendae-format-kind" });
  setIcon(mark, custom ? "settings-2" : "package");

  const label = t(custom ? "settings.formats.custom" : "settings.formats.builtIn");
  setTooltip(mark, label);
  mark.setAttribute("aria-label", label);
}

/**
 * An icon per remedy, so the row says what to do without being hovered.
 *
 * The names are the stable ones in Obsidian's icon set rather than the tidier
 * modern spellings, which have been renamed under it before.
 */
const SHADOW_ICONS: Record<Shadow["kind"], string> = {
  move: "arrow-up",
  remove: "copy",
  shared: "info",
};

/**
 * What the list order is doing to this format.
 *
 * Three icons rather than one, because the three cases want three different
 * things of the reader and only two of them want anything at all. Always
 * drawn, hidden when there is nothing to say, so the examples beside it stay
 * in one column.
 */
function renderShadow(row: HTMLElement, shadow: Shadow | undefined): void {
  const mark = row.createDiv({ cls: "kalendae-format-warn" });

  if (!shadow) {
    setIcon(mark, "info");
    mark.addClass("kalendae-format-warn-empty");
    mark.setAttribute("aria-hidden", "true");
    return;
  }

  setIcon(mark, SHADOW_ICONS[shadow.kind]);
  // Nothing is wrong with a shared pair, so it is not coloured as though it is.
  if (shadow.kind === "shared") mark.addClass("kalendae-format-warn-quiet");

  const label = t(`settings.formats.shadow.${shadow.kind}`, { by: shadow.by });
  setTooltip(mark, label);
  mark.setAttribute("aria-label", label);
}

/**
 * The space a pencil would take on a row that has none.
 *
 * A real icon, hidden rather than absent, so it is sized by whatever sizes the
 * buttons beside it and cannot drift out of step with them. Without it the
 * delete buttons sit at a different place on every kind of row.
 */
function renderPencilSpacer(parent: HTMLElement): void {
  const spacer = parent.createDiv({ cls: "kalendae-format-button kalendae-format-button-empty" });
  setIcon(spacer, "pencil");
  spacer.setAttribute("aria-hidden", "true");
}

function iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
  const button = parent.createEl("button", { cls: "kalendae-format-button" });
  setIcon(button, icon);
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);
}

/** Opens the editor for a format, new or existing. */
export function editFormat(
  app: App,
  pattern: string,
  onSave: (pattern: string) => void,
  kind: FormatKind,
): void {
  new FormatModal(app, pattern, onSave, kind).open();
}

/**
 * Today in a date format, a sample time in a time format, or a note that the
 * format is unfinished.
 */
function fillExample(el: HTMLElement, entry: DateFormatEntry, kind: FormatKind): void {
  if (kind === "time" && checkTimeFormat(entry.pattern) === null) {
    fillTimeExample(el, entry.pattern);
    return;
  }

  const usable = kind === "date" && checkFormat(entry.pattern) === null;
  el.setText(usable ? renderExample(entry.pattern) : t("settings.formats.unfinished"));
}

/**
 * A sample time in a format: `9:05[:07] pm`.
 *
 * A time format reads its time with seconds too, and the row is where that is
 * said. One time with the seconds in brackets rather than two times and an
 * "or": it is shorter, it shows where the seconds go, and it needs no word
 * translated. The brackets are drawn fainter than the time, so they read as
 * "may be there" rather than as part of what is written.
 */
export function fillTimeExample(el: HTMLElement, pattern: string): void {
  const { before, seconds, after } = timeSampleParts(pattern);

  el.empty();
  el.appendText(before);
  if (seconds !== "") el.createSpan({ cls: "kalendae-format-optional", text: `[${seconds}]` });
  el.appendText(after);
}
