import { moment, setIcon } from "obsidian";
import { KalendaeSettings } from "../settings";
import { t } from "../i18n/i18n";
import {
  AllowedDays,
  DayKey,
  buildMonth,
  firstDayOf,
  isWeekend,
  openingDay,
  pageTo,
  sameDay,
  shiftMonths,
  stepTo,
  todayKey,
} from "./month";
import { resolveRule } from "./quick";
import { labelFor, ruleFor } from "./quick-text";
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
  /**
   * The days that can be picked, when another plugin limits them. The rest are
   * drawn struck through and answer neither a click nor the keyboard. Absent,
   * every day can be picked.
   */
  allowed?: AllowedDays;
  /**
   * A calendar to look at, not to use: the settings page draws one to show
   * what its choices do. No chevrons, no footer, no date filled in, and
   * nothing answers a click or a key. Drawn by this same function rather than
   * by a copy, so the preview cannot drift from the picker it previews.
   */
  preview?: boolean;
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
  const allowed = options.allowed;
  const canPick = (day: DayKey): boolean => allowed === undefined || allowed.test(day);
  // Where a move aimed at `target` lands: a day outside is never landed on.
  const land = (target: DayKey): DayKey => (allowed ? stepTo(focused, target, allowed) : target);
  // A month or year step skips months with nothing to pick, and goes nowhere
  // rather than landing back in the month on show.
  const page = (target: DayKey): DayKey => (allowed ? pageTo(focused, target, allowed) : target);

  // Opened on a day that cannot be picked, the ring starts on the nearest one
  // that can; the fill stays on the date the caller had.
  let focused = allowed ? openingDay(options.value, allowed) : options.value;
  // The day of the month paging aims for, so 31 January pages through February
  // and back to the 31st. A day arrow is a new choice of day and resets it.
  let meant = focused.day;

  const live = options.preview !== true;
  dom.toggleClass("kalendae-panel-preview", !live);

  const header = dom.createDiv({ cls: "kalendae-panel-header" });
  const label = createSpan({ cls: "kalendae-panel-month" });
  const grid = dom.createDiv({ cls: "kalendae-panel-grid" });

  if (!live) {
    header.append(label);
    render();
    return { dom, focus: () => {} };
  }

  const footer = dom.createDiv({ cls: "kalendae-panel-footer" });

  const steps: { button: HTMLElement; months: number }[] = [];

  const step = (months: number) => {
    focused = page(shiftMonths(focused, months, meant));
    render();
  };

  const stepButton = (icon: string, text: string, months: number) => {
    const button = navButton(header, icon, text, () => {
      if (!button.hasClass("kalendae-day-blocked")) step(months);
    });
    steps.push({ button, months });
  };

  stepButton("chevrons-left", t("picker.prevYear"), -12);
  stepButton("chevron-left", t("picker.prevMonth"), -1);
  header.append(label);
  stepButton("chevron-right", t("picker.nextMonth"), 1);
  stepButton("chevrons-right", t("picker.nextYear"), 12);

  const todayButton = footer.createEl("button", {
    cls: "kalendae-panel-today",
    text: t("picker.today"),
  });
  block(todayButton, !canPick(today));
  todayButton.addEventListener("click", () => {
    if (canPick(today)) options.onPick(today);
  });

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
    if (writes === null) return;
    writes.empty();
    // A day that cannot be picked still shows its date, readable, behind a
    // lock: the reader learns which day it is and that it is not on offer.
    if (!canPick(day)) setIcon(writes.createSpan({ cls: "kalendae-lock" }), "lock");
    // The date and nothing else. A label in front of it doubles the width of
    // the footer for a format like "Wednesday, 9 September 2026", and the line
    // sits under a calendar where nothing else could be about to be written.
    writes.appendText(replacementFor(options.pattern, day));
  };

  todayButton.addEventListener("mouseenter", () => preview(today));

  // After the preview in the DOM, which is what lets the shortcuts take a
  // full-width break under it rather than pushing it down a line.
  footer.toggleClass("kalendae-panel-footer-preview", writes !== null);
  const quick = options.settings.showQuickDates ? renderQuick() : null;

  // Bound once, to elements that outlive a redraw: the grid is emptied and
  // refilled on every step, so binding inside render would stack a listener per
  // month stepped through.
  footer.addEventListener("mouseleave", () => preview(focused));
  grid.addEventListener("mouseleave", () => preview(focused));
  quick?.addEventListener("mouseleave", () => preview(focused));

  /**
   * The reader's own shortcuts, each resolved once against the date the
   * calendar opened on.
   *
   * A slot whose rule cannot be read is passed over rather than drawn as a
   * button that does nothing — the settings reader empties such a slot on the
   * next load, and until then it is simply not offered. Where that leaves no
   * buttons at all, the row goes too: an empty one still takes a full-width
   * break under the preview.
   */
  function renderQuick(): HTMLElement | null {
    const row = footer.createDiv({ cls: "kalendae-panel-quick" });

    for (const slot of options.settings.quickDates) {
      const rule = ruleFor(slot);
      if (rule === null) continue;

      const day = resolveRule(rule, { value: options.value, today, firstDay });
      const label = labelFor(slot);
      const button = row.createEl("button", { cls: "kalendae-panel-quick-date", text: label });

      // The date it lands on, for a screen reader, which would otherwise hear
      // only a name somebody made up.
      button.setAttribute("aria-label", `${label} — ${replacementFor(options.pattern, day)}`);
      block(button, !canPick(day));
      button.addEventListener("click", () => {
        if (canPick(day)) options.onPick(day);
      });
      button.addEventListener("mouseenter", () => preview(day));
    }

    if (!row.hasChildNodes()) {
      row.remove();
      return null;
    }

    return row;
  }

  function render(): void {
    label.setText(moment.utc({ ...focused, day: 1 }).format("MMMM YYYY"));
    grid.empty();
    grid.toggleClass("kalendae-panel-weeks", options.settings.showWeekNumbers);

    const names = moment.weekdaysMin();
    const head = grid.createDiv({ cls: "kalendae-panel-row kalendae-panel-weekdays" });
    if (options.settings.showWeekNumbers) {
      head.createDiv({ cls: "kalendae-panel-weeknumber", text: t("picker.weekColumn") });
    }
    const weekend = (offset: number): boolean =>
      isWeekend(options.settings.weekend, (firstDay + offset) % 7);
    for (let offset = 0; offset < 7; offset += 1) {
      const name = head.createDiv({ cls: "kalendae-panel-weekday", text: names[(firstDay + offset) % 7] });
      name.toggleClass("kalendae-weekend", weekend(offset));
    }

    const weeks = buildMonth(focused.year, focused.month, {
      firstDay,
      selected: live ? options.value : null,
      today,
    });

    for (const week of weeks) {
      const row = grid.createDiv({ cls: "kalendae-panel-row" });
      if (options.settings.showWeekNumbers) {
        row.createDiv({ cls: "kalendae-panel-weeknumber", text: String(week.weekNumber) });
      }

      week.days.forEach((day, offset) => {
        const cell = row.createEl("button", {
          cls: "kalendae-panel-day",
          text: String(day.day),
        });
        cell.toggleClass("kalendae-weekend", weekend(offset));
        cell.toggleClass("kalendae-day-outside", day.outside);
        cell.toggleClass("kalendae-day-selected", day.selected);
        cell.toggleClass("kalendae-day-today", day.today);
        if (!live) {
          cell.tabIndex = -1;
          return;
        }
        cell.toggleClass("kalendae-day-focused", sameDay(day, focused));
        cell.addEventListener("mouseenter", () => preview(day));
        if (!canPick(day)) {
          block(cell, true);
          // The number in a span of its own, so the fade dims the number alone:
          // opacity on the button would take its weekend band and today's
          // outline down with it.
          cell.empty();
          cell.createSpan({ cls: "kalendae-day-number", text: String(day.day) });
          // Kept from taking focus: a click here picks nothing, so the button
          // would keep focus, and the next key's redraw would remove it and
          // leave the keyboard with nowhere to go.
          cell.addEventListener("mousedown", (event) => event.preventDefault());
          return;
        }
        cell.addEventListener("click", () => options.onPick(day));
      });
    }

    // A chevron that would not change the month has nowhere to go.
    for (const { button, months } of steps) {
      block(button, sameDay(page(shiftMonths(focused, months, meant)), focused));
    }

    // The exact text that will replace the date, in the note's own format. The
    // one place the format-preserving promise is visible before it is kept.
    if (live) preview(focused);
  }

  dom.tabIndex = -1;
  dom.addEventListener("keydown", (event) => {
    const moved = movedBy(event, focused, meant);

    if (moved !== null) {
      event.preventDefault();
      const day = moved.byDay ? land(moved.day) : page(moved.day);
      // A day arrow is a new choice of day; a page keeps the one paging aims for.
      meant = moved.byDay ? day.day : moved.meant;
      focused = day;
      render();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (canPick(focused)) options.onPick(focused);
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

/**
 * Where a key takes the keyboard, and the day of the month paging should aim
 * for next, or null when the key is not ours. `byDay` marks a day arrow, whose
 * landing day becomes the new aim even when limited days moved it elsewhere.
 */
function movedBy(
  event: KeyboardEvent,
  from: DayKey,
  meant: number,
): { day: DayKey; meant: number; byDay: boolean } | null {
  const days: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  };

  const offset = days[event.key];
  if (offset !== undefined) {
    const day = shiftDays(from, offset);
    return { day, meant: day.day, byDay: true };
  }

  // Shift turns a month step into a year, which is the same pairing the header
  // buttons make: one chevron a month, two a year.
  const months = { PageUp: -1, PageDown: 1 }[event.key];
  if (months !== undefined) {
    return { day: shiftMonths(from, event.shiftKey ? 12 * months : months, meant), meant, byDay: false };
  }

  return null;
}

function shiftDays(from: DayKey, days: number): DayKey {
  const at = moment.utc(from).add(days, "days");

  return { year: at.year(), month: at.month(), day: at.date() };
}

/** Marks a control as not usable here, without `disabled`, which would also silence its hover. */
function block(element: HTMLElement, blocked: boolean): void {
  element.toggleClass("kalendae-day-blocked", blocked);
  if (blocked) element.setAttribute("aria-disabled", "true");
  else element.removeAttribute("aria-disabled");
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
