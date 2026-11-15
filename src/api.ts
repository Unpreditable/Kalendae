import { App } from "obsidian";
import { openPopup } from "./picker/popup";
import { AllowedEntry } from "./picker/month";
import { KalendaeSettings } from "./settings";

/**
 * What other plugins may call, through `app.plugins.getPlugin("kalendae").api`.
 *
 * A caller checks that `pickDate` exists before using it, so an older Kalendae
 * without this object simply leaves the caller's row out. `docs/kalendae-api.d.ts`
 * is the same declaration in a form another plugin can copy.
 */

const DEFAULT_PATTERN = "YYYY-MM-DD";

export interface PickDateOptions {
  /** The date to open on, written in `pattern`. Empty or unreadable opens on today. */
  value: string;
  /**
   * A moment format for `value` and for the day returned, such as `DD.MM.YYYY`
   * or `dddd, MMMM D`. Defaults to `YYYY-MM-DD`.
   */
  pattern?: string;
  /** Where the calendar appears: beside an element, or at a click. */
  anchor: HTMLElement | MouseEvent;
  /**
   * The days that can be picked, as `YYYY-MM-DD` ranges (both ends included) or
   * single days, whatever `pattern` is. Other days are shown but cannot be
   * picked. Left out or empty, any day can be. An older Kalendae ignores this,
   * so check the day you get back.
   */
  allowed?: AllowedEntry[];
}

export interface KalendaeApi {
  /**
   * Opens the calendar and resolves with the chosen day written in `pattern`, or
   * null when the reader closes it without picking. The caller writes the date.
   */
  pickDate(options: PickDateOptions): Promise<string | null>;
}

export function createApi(app: App, getSettings: () => KalendaeSettings): KalendaeApi {
  return {
    pickDate: (options) =>
      openPopup(app, {
        value: options.value,
        pattern: options.pattern ?? DEFAULT_PATTERN,
        anchor: options.anchor,
        allowed: options.allowed,
        settings: getSettings(),
      }),
  };
}
