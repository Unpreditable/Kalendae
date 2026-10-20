import { App } from "obsidian";
import { openPopup } from "./picker/popup";
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
        settings: getSettings(),
      }),
  };
}
