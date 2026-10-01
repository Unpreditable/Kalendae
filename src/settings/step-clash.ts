import { App, Hotkey, Modifier } from "obsidian";
import { StepKeys } from "../settings";

/**
 * Obsidian hotkeys that hold the same keys as the date steps.
 *
 * A hotkey wins over the editor's own keys, so a step bound to Ctrl+↑ does
 * nothing while a command holds Ctrl+↑ too. The settings row names the command
 * rather than leaving the reader to find out from a key that quietly does
 * something else.
 */

/** A command and the hotkeys it answers to right now. */
export interface BoundCommand {
  name: string;
  hotkeys: Hotkey[];
}

export interface StepClash {
  arrow: "up" | "down";
  command: string;
}

const STEP_MODIFIERS: Record<Exclude<StepKeys, "off">, Modifier[]> = {
  ctrl: ["Ctrl"],
  alt: ["Alt"],
  "ctrl-alt": ["Alt", "Ctrl"],
};

const ARROWS = { ArrowUp: "up", ArrowDown: "down" } as const;

/**
 * Every command holding the chosen modifier with either arrow.
 *
 * The modifiers must match exactly: Alt+Shift+↑ is a different combination
 * from Alt+↑ and takes nothing from it. `Mod` is what Obsidian stores for the
 * platform's main modifier, Ctrl off a Mac and Cmd on one.
 */
export function stepClashes(keys: StepKeys, isMac: boolean, commands: BoundCommand[]): StepClash[] {
  if (keys === "off") return [];
  const wanted = STEP_MODIFIERS[keys].join(",");

  return commands.flatMap((command) =>
    command.hotkeys.flatMap((hotkey): StepClash[] => {
      if (!(hotkey.key in ARROWS)) return [];

      const held = hotkey.modifiers
        .map((modifier) => (modifier === "Mod" ? (isMac ? "Meta" : "Ctrl") : modifier))
        .sort()
        .join(",");

      return held === wanted
        ? [{ arrow: ARROWS[hotkey.key as keyof typeof ARROWS], command: command.name }]
        : [];
    }),
  );
}

/** The parts of Obsidian's hotkey and command registries this reads. */
interface Registries {
  hotkeyManager?: {
    customKeys?: Record<string, Hotkey[] | undefined>;
    defaultKeys?: Record<string, Hotkey[] | undefined>;
  };
  commands?: { commands?: Record<string, { name?: unknown } | undefined> };
}

/**
 * Every command with the hotkeys it holds: the reader's own where they set
 * any, and the command's defaults where they did not.
 *
 * Obsidian has no public API for this, so it reads two internal registries and
 * trusts neither. A registry that is missing or shaped differently gives back
 * an empty list, which shows no warning: a missed clash leaves the reader
 * where they were before this existed, while a wrong one would send them
 * looking for a hotkey that is not there.
 */
export function boundCommands(app: App): BoundCommand[] {
  const registries = app as unknown as Registries;
  const custom = registries.hotkeyManager?.customKeys;
  const defaults = registries.hotkeyManager?.defaultKeys;
  const commands = registries.commands?.commands;
  if (typeof custom !== "object" || typeof defaults !== "object" || typeof commands !== "object") {
    return [];
  }

  return Object.entries(commands).flatMap(([id, command]) => {
    // An empty list of the reader's own is a deliberate one: it is how
    // Obsidian records a default hotkey removed, so it must not fall through.
    const hotkeys = custom[id] ?? defaults[id];
    if (typeof command?.name !== "string" || !Array.isArray(hotkeys)) return [];

    return [{ name: command.name, hotkeys: hotkeys.filter(isHotkey) }];
  });
}

function isHotkey(value: unknown): value is Hotkey {
  const hotkey = value as Partial<Hotkey> | null;
  return typeof hotkey?.key === "string" && Array.isArray(hotkey.modifiers);
}
