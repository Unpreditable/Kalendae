import { moment, setIcon } from "obsidian";
import { KalendaeSettings } from "../settings";
import { t } from "../i18n/i18n";
import { DayKey, buildMonth, firstDayOf, sameDay, shiftMonths, todayKey } from "./month";
import { replacementFor } from "./write";

/**
 * The calendar itself: a month at a time, with no editor in it.
 *
 * Knows nothing about CodeMirror, transactions or where the date came from. It
 * is handed the day the note holds and the format it was written in, and calls
 * back with the day the reader chose — which is what lets the same panel serve
 * a click on the icon, a double-click and the command.
 *
 * One view, and no month or year list behind it. `‹ ›` step a month and
 * `‹‹ ››` a year; anything further away costs more clicks than typing the date,
 * and typing it is then the right answer.
 */

export interface PanelOptions {
  /** The date the note holds now. */
  value: DayKey;
  /** The format it was written in, which is what it will be written back in. */
  pattern: string;
  settings: KalendaeSettings;
  onPick: (day: DayKey) => void;
  onClose: () => void;
}

export interface Panel {
  dom: HTMLElement;
  /** Called once the panel is in the document; focus needs a rendered element. */
  focus: () => void;
}

export function createPanel(options: PanelOptions): Panel {
  const dom = createDiv({ cls: "kalendae-panel" });
  const today = todayKey();
  const firstDay = firstDayOf(options.settings.weekStart);

  // Where the keyboard is, which is not the same as what the note holds: paging
  // moves this, and only Enter or a click turns it into a date in the note.
  let focused = options.value;

  const header = dom.createDiv({ cls: "kalendae-panel-header" });
  const label = createSpan({ cls: "kalendae-panel-month" });
  const grid = dom.createDiv({ cls: "kalendae-panel-grid" });
  const footer = dom.createDiv({ cls: "kalendae-panel-footer" });

  const step = (months: number) => {
    focused = shiftMonths(focused, months);
    render();
  };

  navButton(header, "chevrons-left", t("picker.prevYear"), () => step(-12));
  navButton(header, "chevron-left", t("picker.prevMonth"), () => step(-1));
  header.append(label);
  navButton(header, "chevron-right", t("picker.nextMonth"), () => step(1));
  navButton(header, "chevrons-right", t("picker.nextYear"), () => step(12));

  const todayButton = footer.createEl("button", {
    cls: "kalendae-panel-today",
    text: t("picker.today"),
  });
  todayButton.addEventListener("click", () => options.onPick(today));

  const writes = options.settings.showWritesPreview
    ? footer.createDiv({ cls: "kalendae-panel-writes" })
    : null;

  /**
   * The line follows whichever of the two is more recent, the pointer or the
   * keyboard.
   *
   * Following the keyboard alone made it useless to most people: a click both
   * chooses a day and commits it, so a mouse user never sees the preview of the
   * day they are about to pick. The pointer does not move the focus ring, which
   * stays where the keyboard left it — one is where you are looking, the other
   * is where Enter would land.
   */
  const preview = (day: DayKey) => {
    // The date and nothing else. A label in front of it doubles the width of
    // the footer for a format like "Wednesday, 9 September 2026", and the line
    // sits under a calendar where nothing else could be about to be written.
    writes?.setText(replacementFor(options.pattern, day));
  };

  todayButton.addEventListener("mouseenter", () => preview(today));
  // Bound once, to elements that outlive a redraw: the grid is emptied and
  // refilled on every step, so binding inside render would stack a listener per
  // month stepped through.
  footer.addEventListener("mouseleave", () => preview(focused));
  grid.addEventListener("mouseleave", () => preview(focused));

  function render(): void {
    label.setText(moment.utc({ ...focused, day: 1 }).format("MMMM YYYY"));
    grid.empty();
    grid.toggleClass("kalendae-panel-weeks", options.settings.showWeekNumbers);

    const names = moment.weekdaysMin();
    const head = grid.createDiv({ cls: "kalendae-panel-row kalendae-panel-weekdays" });
    if (options.settings.showWeekNumbers) {
      head.createDiv({ cls: "kalendae-panel-weeknumber", text: t("picker.weekColumn") });
    }
    for (let offset = 0; offset < 7; offset += 1) {
      head.createDiv({ cls: "kalendae-panel-weekday", text: names[(firstDay + offset) % 7] });
    }

    const weeks = buildMonth(focused.year, focused.month, {
      firstDay,
      selected: options.value,
      today,
    });

    for (const week of weeks) {
      const row = grid.createDiv({ cls: "kalendae-panel-row" });
      if (options.settings.showWeekNumbers) {
        row.createDiv({ cls: "kalendae-panel-weeknumber", text: String(week.weekNumber) });
      }

      for (const day of week.days) {
        const cell = row.createEl("button", {
          cls: "kalendae-panel-day",
          text: String(day.day),
        });
        cell.toggleClass("kalendae-day-outside", day.outside);
        cell.toggleClass("kalendae-day-selected", day.selected);
        cell.toggleClass("kalendae-day-today", day.today);
        cell.toggleClass("kalendae-day-focused", sameDay(day, focused));
        cell.addEventListener("click", () => options.onPick(day));
        cell.addEventListener("mouseenter", () => preview(day));
      }
    }

    // The exact text that will replace the date, in the note's own format. The
    // one place the format-preserving promise is visible before it is kept.
    preview(focused);
  }

  dom.tabIndex = -1;
  dom.addEventListener("keydown", (event) => {
    const moved = movedBy(event, focused);

    if (moved !== null) {
      event.preventDefault();
      focused = moved;
      render();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      options.onPick(focused);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      options.onClose();
    }
  });

  render();

  return { dom, focus: () => dom.focus() };
}

/** Where a key takes the keyboard, or null when the key is not ours. */
function movedBy(event: KeyboardEvent, from: DayKey): DayKey | null {
  const days: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  };

  const offset = days[event.key];
  if (offset !== undefined) return shiftDays(from, offset);

  // Shift turns a month step into a year, which is the same pairing the header
  // buttons make: one chevron a month, two a year.
  if (event.key === "PageUp") return shiftMonths(from, event.shiftKey ? -12 : -1);
  if (event.key === "PageDown") return shiftMonths(from, event.shiftKey ? 12 : 1);

  return null;
}

function shiftDays(from: DayKey, days: number): DayKey {
  const at = moment.utc(from).add(days, "days");

  return { year: at.year(), month: at.month(), day: at.date() };
}

function navButton(
  header: HTMLElement,
  icon: string,
  label: string,
  onClick: () => void,
): HTMLElement {
  const button = header.createEl("button", { cls: "kalendae-panel-step" });
  setIcon(button, icon);
  // The chevrons say which way but not how far, and a screen reader is told
  // both. Nothing here is visible text, so nothing crowds the header.
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);

  return button;
}
