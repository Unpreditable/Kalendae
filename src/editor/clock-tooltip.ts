import { Extension, StateEffect, StateField } from "@codemirror/state";
import { EditorView, Tooltip, showTooltip } from "@codemirror/view";
import { createClock } from "../picker/clock";
import { TimeValue, timeOf } from "../picker/clock-math";
import { KalendaeSettings } from "../settings";

/**
 * TEMPORARY. Opens the time picker at the caret, so it can be seen and tuned in
 * a vault before anything detects a time. Deleted, with its command, once
 * detection opens the picker for real.
 *
 * Each run takes the current time in a pattern and a language picked at random,
 * so a few runs show every shape: 24 and 12 hours, leading zeros or not,
 * seconds or not, and AM/PM words from two letters to six.
 *
 * OK and Now write nothing. The preview line already shows what would go in.
 */

const PATTERNS = ["HH:mm", "H:mm", "HH:mm:ss", "h:mm a", "hh:mm A", "h:mm:ss a"];
const LOCALES = ["en", "uk", "zh-cn", "ja", "tr"];

interface ClockTarget {
  pos: number;
  time: TimeValue;
  pattern: string;
  locale: string;
}

const openClock = StateEffect.define<ClockTarget>();
const closeClock = StateEffect.define<null>();

const openAt = StateField.define<ClockTarget | null>({
  create: () => null,

  update(current, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(openClock)) return effect.value;
      if (effect.is(closeClock)) return null;
    }

    return transaction.docChanged ? null : current;
  },
});

export function clockTooltip(getSettings: () => KalendaeSettings): Extension {
  return [
    openAt,
    showTooltip.compute([openAt], (state) => {
      const target = state.field(openAt);
      return target === null ? null : tooltipFor(target, getSettings());
    }),
  ];
}

export function tryClock(view: EditorView): void {
  view.dispatch({
    effects: openClock.of({
      pos: view.state.selection.main.head,
      time: timeOf(new Date()),
      pattern: pick(PATTERNS),
      locale: pick(LOCALES),
    }),
  });
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function tooltipFor(target: ClockTarget, settings: KalendaeSettings): Tooltip {
  return {
    pos: target.pos,
    above: false,
    arrow: false,
    create: (view) => {
      const close = () => {
        view.dispatch({ effects: closeClock.of(null) });
        view.focus();
      };

      const clock = createClock({
        value: target.time,
        pattern: target.pattern,
        locale: target.locale,
        settings,
        onPick: close,
        onClose: close,
      });

      const outside = (event: MouseEvent) => {
        if (!clock.dom.contains(event.target as Node)) close();
      };

      return {
        dom: clock.dom,
        mount: () => {
          clock.focus();
          view.dom.ownerDocument.addEventListener("mousedown", outside, true);
        },
        destroy: () => view.dom.ownerDocument.removeEventListener("mousedown", outside, true),
      };
    },
  };
}
