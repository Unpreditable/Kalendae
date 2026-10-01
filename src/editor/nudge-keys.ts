import { Extension, Prec, StateEffect, StateField } from "@codemirror/state";
import { EditorView, KeyBinding, keymap } from "@codemirror/view";
import { Platform } from "obsidian";
import { nudge } from "../picker/nudge";
import { KalendaeSettings, StepKeys, commandScopes } from "../settings";
import { targetAt } from "./picker-tooltip";

/**
 * The arrow keys, held with a modifier, step the part of a date the caret is on.
 *
 * Every modifier the settings offer is bound, and each press asks this
 * computer's setting whether it is the one in force — so changing the dropdown takes effect at
 * once, with nothing to reconfigure. A press that is not ours, or that lands
 * off a date, returns false and the key does whatever it did before.
 *
 * `commandScopes`, as the `pick-date` command uses: a key pressed on purpose
 * treats every context as plain text, whatever the scope toggles say.
 */

/** The last date a press wrote, and the day of the month it was aiming for. */
interface Stepped {
  from: number;
  text: string;
  meant: number;
}

const remember = StateEffect.define<Stepped>();

/**
 * What keeps repeated presses from drifting: 30 January steps to 28 February,
 * and the next press needs to know it was the 30th that was meant.
 *
 * It holds only while the date is exactly what the last press wrote. Any other
 * change to the note forgets it — typing into the date, an undo, an edit
 * anywhere at all — which costs nothing worse than starting over from the day
 * that is written.
 */
const lastStep = StateField.define<Stepped | null>({
  create: () => null,

  update(current, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(remember)) return effect.value;
    }

    return transaction.docChanged ? null : current;
  },
});

function step(view: EditorView, settings: KalendaeSettings, by: 1 | -1): boolean {
  // One caret, and no selection: a selection is extended or moved by these
  // keys, and a date in the middle of one is not the thing being worked on.
  const { main, ranges } = view.state.selection;
  if (ranges.length > 1 || !main.empty) return false;

  const target = targetAt(view.state, commandScopes(settings), main.head);
  if (target === null) return false;

  const last = view.state.field(lastStep);
  const meant = last?.from === target.from && last.text === target.text ? last.meant : undefined;

  const next = nudge(target.text, target.pattern, target.locale, main.head - target.from, by, meant);
  if (next === null) return false;

  view.dispatch({
    changes: { from: target.from, to: target.to, insert: next.text },
    selection: { anchor: target.from + next.caret },
    effects: remember.of({ from: target.from, text: next.text, meant: next.meant }),
    // Not an `input.type` event, so history never folds two presses into one
    // undo: each press is its own step back.
    userEvent: "kalendae.step",
    scrollIntoView: true,
  });

  return true;
}

const MODIFIERS: Record<Exclude<StepKeys, "off">, string> = {
  ctrl: "Ctrl",
  alt: "Alt",
  "ctrl-alt": "Ctrl-Alt",
};

export function nudgeKeys(getSettings: () => KalendaeSettings): Extension {
  const bindings = Object.entries(MODIFIERS).flatMap(([keys, prefix]): KeyBinding[] => {
    const run = (by: 1 | -1) => (view: EditorView) => {
      const settings = getSettings();
      const chosen = Platform.isMacOS ? settings.stepKeysMac : settings.stepKeys;
      return chosen === keys && step(view, settings, by);
    };

    return [
      { key: `${prefix}-ArrowUp`, run: run(1) },
      { key: `${prefix}-ArrowDown`, run: run(-1) },
    ];
  });

  // Ahead of the editor's own bindings, which would otherwise move the caret or
  // the line first.
  return [lastStep, Prec.high(keymap.of(bindings))];
}
