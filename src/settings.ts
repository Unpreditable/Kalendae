/**
 * How the picker offers itself on a date the plugin has recognised.
 *
 * The design goal is least interference: the note should look untouched until
 * the user reaches for the date. Which of these ends up as the default is an
 * open question — see TODO.md.
 */
export type TriggerMode = "hover-icon" | "double-click" | "both";

export const TRIGGER_MODES: TriggerMode[] = ["hover-icon", "double-click", "both"];

export interface KalendaeSettings {
  trigger: TriggerMode;
}

export const DEFAULT_SETTINGS: KalendaeSettings = {
  trigger: "both",
};
