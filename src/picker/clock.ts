import { setIcon } from "obsidian";
import { MeridiemStyle } from "../detect/meridiem";
import { t } from "../i18n/i18n";
import { KalendaeSettings } from "../settings";
import {
  ClockUnit,
  TimeValue,
  committed,
  dialValue,
  handOf,
  marksFor,
  meridiemVocabulary,
  meridiemWords,
  pointToValue,
  shapeOf,
  stepped,
  timeOf,
  unitText,
  unitsOf,
  withDialValue,
  withMeridiem,
} from "./clock-math";
import { Panel } from "./panel";

/**
 * The time picker: Material's clock dial in the calendar's shell.
 *
 * Knows nothing about CodeMirror, as the calendar does not. It is handed a time,
 * the pattern it was written in and that pattern's language, and calls back
 * with the time chosen. The pattern decides the shape — 12 or 24 hours, seconds
 * or not — and the locale only the AM/PM words.
 *
 * Two picks make a time, so by default it confirms with OK, unlike the
 * calendar; the clockCommit setting can make a click or a double-click write
 * instead. The big numbers at the top show the time and switch the dial
 * between units; they are not typeable, because the note is already a text
 * field.
 *
 * Everything else sits in the corners the round dial leaves free, so the panel
 * ends where the dial does: Now and Snap at the top, Cancel and OK at the
 * bottom — or Now and Snap at the bottom, when a click writes and there is no
 * OK to press.
 */

export interface ClockOptions {
  /** The time the note holds now. */
  value: TimeValue;
  /** The format it was written in, which is what it will be written back in. */
  pattern: string;
  /** The language it was written in, for the AM/PM words. */
  locale?: string;
  /** How the note spelled am/pm, which is how the toggle reads and what is written. */
  meridiem?: MeridiemStyle;
  /**
   * A new time rather than a change to one. There is no original to keep, so
   * ✓ writes even when nothing was touched.
   */
  insert?: boolean;
  settings: KalendaeSettings;
  onPick: (time: TimeValue) => void;
  onClose: () => void;
}

// The dial's geometry, in the SVG's own units: the face is radius 100 around
// 0,0. Attributes rather than styles, which is why the dial is SVG at all.
const OUTER = 80;
const INNER = 52;
const KNOB = 15;
const OUTER_TEXT = 14;
const INNER_TEXT = 11;

/**
 * How long after one release a press still counts as the second click of a
 * double-click. Windows' default; the pointer events behind a drag carry no
 * click count of their own.
 */
const DOUBLE_CLICK_MS = 500;

const UNIT_LABELS: Record<ClockUnit, string> = {
  hour: "picker.clock.hours",
  minute: "picker.clock.minutes",
  second: "picker.clock.seconds",
};

export function createClock(options: ClockOptions): Panel {
  const shape = shapeOf(options.pattern);
  const token = shape.meridiemToken ?? "A";
  const vocabulary = shape.twelveHour
    ? meridiemVocabulary(token, options.locale, options.meridiem)
    : [];

  // The time being built, which reaches the note only through OK.
  let time = options.value;
  // Where Snap starts is the setting's business; ticking the box lasts this pick.
  let snap = options.settings.snapMinutes;
  let unit: ClockUnit = "hour";
  // The current time while the pointer rests on Now, previewed at the top.
  let nowHovered: TimeValue | null = null;

  const dom = createDiv({ cls: "kalendae-panel kalendae-clock" });
  const top = dom.createDiv({ cls: "kalendae-clock-top" });
  const digits = top.createDiv({ cls: "kalendae-clock-digits" });
  const meridiem = shape.twelveHour ? top.createDiv({ cls: "kalendae-clock-meridiem" }) : null;
  const am = meridiem?.createEl("button", { cls: "kalendae-clock-meridiem-option" });
  const pm = meridiem?.createEl("button", { cls: "kalendae-clock-meridiem-option" });
  const stage = dom.createDiv({ cls: "kalendae-clock-stage" });
  const dial = stage.createSvg("svg", {
    cls: "kalendae-clock-dial",
    attr: { viewBox: "-100 -100 200 200" },
  });
  const mode = options.settings.clockCommit;
  const asksForOk = mode !== "click";
  const corner = (where: string) => stage.createDiv({ cls: `kalendae-clock-corner ${where}` });

  am?.addEventListener("click", () => {
    time = withMeridiem(time, false);
    render();
  });
  pm?.addEventListener("click", () => {
    time = withMeridiem(time, true);
    render();
  });

  const nowButton = iconButton(
    corner(asksForOk ? "kalendae-clock-top-left" : "kalendae-clock-bottom-left"),
    "clock",
    t("picker.now"),
  );
  nowButton.addEventListener("click", () => options.onPick(timeOf(new Date())));
  nowButton.addEventListener("mouseenter", () => {
    nowHovered = timeOf(new Date());
    render();
  });
  nowButton.addEventListener("mouseleave", () => {
    nowHovered = null;
    render();
  });

  const snapButton = iconButton(
    corner(asksForOk ? "kalendae-clock-top-right" : "kalendae-clock-bottom-right"),
    "magnet",
    t("picker.clock.snap"),
  );
  snapButton.addEventListener("click", () => {
    // The value stays where it is; the next move follows the new setting.
    snap = !snap;
    render();
  });

  if (asksForOk) {
    iconButton(corner("kalendae-clock-bottom-left"), "x", t("picker.clock.cancel"))
      .addEventListener("click", () => options.onClose());

    const ok = iconButton(corner("kalendae-clock-bottom-right"), "check", t("picker.clock.ok"));
    ok.addClass("kalendae-clock-ok");
    ok.addEventListener("click", () => confirm());
  }

  function confirm(): void {
    const result = committed(options.value, time, shape, snap);

    if (result !== null) options.onPick(result);
    else if (options.insert) options.onPick(time);
    else options.onClose();
  }

  function render(): void {
    const units = unitsOf(shape, snap);
    // Snap takes seconds away; a panel left on them moves back to minutes.
    if (!units.includes(unit)) unit = units[units.length - 1];

    // What a click would give while the pointer rests on the dial or on Now;
    // the time being built the rest of the time.
    const shown = previewed() ?? time;

    digits.empty();
    units.forEach((each, index) => {
      if (index > 0) digits.createSpan({ cls: "kalendae-clock-colon", text: ":" });

      const button = digits.createEl("button", {
        cls: "kalendae-clock-digit",
        text: unitText(each, shown, shape),
        attr: { tabindex: "-1", "aria-label": t(UNIT_LABELS[each]) },
      });
      button.toggleClass("kalendae-clock-active", each === unit);
      button.addEventListener("click", () => {
        unit = each;
        render();
      });
    });

    snapButton.toggleClass("kalendae-clock-active", snap);
    snapButton.setAttribute("aria-pressed", String(snap));

    if (am && pm) {
      const words = meridiemWords(shown, token, options.locale, options.meridiem);
      fillMeridiem(am, words.am, vocabulary);
      fillMeridiem(pm, words.pm, vocabulary);
      am.toggleClass("kalendae-clock-active", shown.hour < 12);
      pm.toggleClass("kalendae-clock-active", shown.hour >= 12);
    }

    drawDial();
  }

  function previewed(): TimeValue | null {
    if (nowHovered !== null) return nowHovered;
    if (hovered === null || hovered === dialValue(unit, time, shape)) return null;

    return withDialValue(unit, hovered, time, shape);
  }

  function drawDial(): void {
    dial.empty();
    dial.createSvg("circle", { cls: "kalendae-clock-face", attr: { r: 100 } });

    const current = dialValue(unit, time, shape);
    const ghost = hovered === null || hovered === current ? null : ghostAt(hovered);
    if (ghost) {
      dial.createSvg("circle", {
        cls: "kalendae-clock-ghost",
        attr: { cx: ghost.x, cy: ghost.y, r: KNOB },
      });
    }

    const hand = handOf(unit, time, shape);
    const [x, y] = pointAt(hand.degrees, hand.inner ? INNER : OUTER);
    dial.createSvg("line", { cls: "kalendae-clock-hand", attr: { x1: 0, y1: 0, x2: x, y2: y } });
    dial.createSvg("circle", { cls: "kalendae-clock-pivot", attr: { r: 3 } });
    dial.createSvg("circle", { cls: "kalendae-clock-knob", attr: { cx: x, cy: y, r: KNOB } });

    for (const mark of marksFor(unit, shape)) {
      const [markX, markY] = pointAt(mark.degrees, mark.inner ? INNER : OUTER);
      const text = dial.createSvg("text", {
        cls: "kalendae-clock-mark",
        attr: { x: markX, y: markY, "font-size": mark.inner ? INNER_TEXT : OUTER_TEXT },
      });
      text.textContent = mark.label;
      text.toggleClass("kalendae-clock-mark-inner", mark.inner);
      text.toggleClass("kalendae-clock-mark-on", mark.value === current);
    }

    // A value between the labels, such as 37, has no number of its own on the
    // dial; the faded marker carries it.
    if (ghost && !ghost.labelled) {
      const text = dial.createSvg("text", {
        cls: "kalendae-clock-mark",
        attr: { x: ghost.x, y: ghost.y, "font-size": ghost.inner ? INNER_TEXT : OUTER_TEXT },
      });
      text.textContent = ghost.label;
    }
  }

  /** Where the faded marker sits for a value, in the dial's terms, and what it reads. */
  function ghostAt(value: number) {
    const at = withDialValue(unit, value, time, shape);
    const hand = handOf(unit, at, shape);
    const [x, y] = pointAt(hand.degrees, hand.inner ? INNER : OUTER);
    const labelled = marksFor(unit, shape).some((mark) => mark.value === value);

    return { x, y, inner: hand.inner, labelled, label: unitText(unit, at, shape) };
  }

  // Pointer capture keeps the hand following a drag that leaves the dial, and
  // the release still settles the unit wherever it lands.
  let dragging = false;
  // The last release, for telling the second click of a double-click: when it
  // happened, and the unit it was on before the dial moved on.
  let released: { at: number; unit: ClockUnit } | null = null;
  // The value a click would pick under a resting pointer, shown as a faded
  // marker. Not the raw pointer position: it jumps between the values a click
  // can land on, so it says exactly what a click there would do.
  let hovered: number | null = null;

  const valueUnder = (event: PointerEvent) => {
    const box = dial.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * 2 - 1;
    const y = ((event.clientY - box.top) / box.height) * 2 - 1;
    return pointToValue(unit, shape, snap, x, y);
  };

  const aim = (event: PointerEvent) => {
    time = withDialValue(unit, valueUnder(event), time, shape);
    render();
  };

  dial.addEventListener("pointerdown", (event) => {
    // Also stops the mousedown, so the focus is put back here instead.
    event.preventDefault();
    dom.focus();
    if (event.button !== 0) return;

    // The first click has already moved the dial on; the second is about the
    // unit the first was on, so it goes back there and writes what is under
    // it, keeping the rest.
    if (mode === "double-click" && released && event.timeStamp - released.at < DOUBLE_CLICK_MS) {
      unit = released.unit;
      released = null;
      time = withDialValue(unit, valueUnder(event), time, shape);
      confirm();
      return;
    }

    dial.setPointerCapture(event.pointerId);
    dragging = true;
    // The solid marker takes over for the drag.
    hovered = null;
    aim(event);
  });
  dial.addEventListener("pointermove", (event) => {
    if (dragging) {
      aim(event);
      return;
    }

    const value = valueUnder(event);
    if (value === hovered) return;
    hovered = value;
    render();
  });
  dial.addEventListener("pointerleave", () => {
    if (hovered === null) return;
    hovered = null;
    render();
  });
  dial.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    dragging = false;
    aim(event);
    released = { at: event.timeStamp, unit };

    // On to the next unit, Material's way. The last one waits for OK, unless a
    // click is what writes.
    const units = unitsOf(shape, snap);
    const next = units[units.indexOf(unit) + 1];
    if (next !== undefined) {
      unit = next;
      render();
    } else if (mode === "click") {
      confirm();
    }
  });
  dial.addEventListener("pointercancel", () => {
    dragging = false;
  });

  // A click puts the keyboard back on the panel, so the arrows go on working
  // after the mouse has been used, even if Tab had left focus on a control.
  // Tab still reaches every control.
  dom.addEventListener("mousedown", (event) => {
    if (event.target === dom) return;
    event.preventDefault();
    dom.focus();
  });

  dom.tabIndex = -1;
  dom.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      options.onClose();
      return;
    }

    // Tab goes round the panel and nowhere else: the dial, then each control,
    // then the dial again. Left to the browser, the Tab after the last control
    // walked out into the note with the clock still open over it.
    if (event.key === "Tab") {
      event.preventDefault();

      const controls = dom.querySelectorAll<HTMLElement>("button:not([tabindex='-1'])");
      const stops = [dom, ...Array.from(controls)];
      const at = Math.max(0, stops.indexOf(event.target as HTMLElement));
      const step = event.shiftKey ? -1 : 1;

      stops[(at + step + stops.length) % stops.length].focus();
      return;
    }

    // A control reached with Tab answers its own keys: Enter on Cancel is
    // Cancel, not OK as well.
    if (event.target !== dom) return;

    const units = unitsOf(shape, snap);
    const index = units.indexOf(unit);

    switch (event.key) {
      case "ArrowUp":
        time = stepped(unit, time, 1, snap);
        break;
      case "ArrowDown":
        time = stepped(unit, time, -1, snap);
        break;
      case "ArrowLeft":
        unit = units[Math.max(0, index - 1)];
        break;
      case "ArrowRight":
        unit = units[Math.min(units.length - 1, index + 1)];
        break;
      case "Enter":
        event.preventDefault();
        confirm();
        return;
      default:
        return;
    }

    event.preventDefault();
    render();
  });

  render();

  return { dom, focus: () => dom.focus() };
}

/**
 * A half of the AM/PM toggle: the word for this hour, over every word the
 * language has, hidden. They share one grid cell, so the button is as wide as
 * the longest word and does not jump when the hour changes `ночі` to `ранку`.
 */
function fillMeridiem(button: HTMLElement, word: string, vocabulary: string[]): void {
  button.empty();
  button.createSpan({ cls: "kalendae-clock-word", text: word });
  for (const each of vocabulary) {
    button.createSpan({ cls: "kalendae-clock-sizer", text: each, attr: { "aria-hidden": "true" } });
  }
}

/** A corner button: an icon, with its name for the tooltip and screen readers. */
function iconButton(parent: HTMLElement, icon: string, label: string): HTMLElement {
  const button = parent.createEl("button", { cls: "kalendae-clock-icon" });
  setIcon(button, icon);
  button.setAttribute("aria-label", label);

  return button;
}

/** A point on the dial at a clock angle and a radius, in the SVG's units. */
function pointAt(degrees: number, radius: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  const round = (value: number) => Math.round(value * 100) / 100;

  return [round(radius * Math.sin(radians)), round(-radius * Math.cos(radians))];
}
