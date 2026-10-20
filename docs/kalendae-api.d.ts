// The Kalendae plugin's API, for other plugins to copy into their own source.
//
// Reach it with:
//   const kalendae = app.plugins.getPlugin("kalendae");
//   if (kalendae?.api?.pickDate) { ... }
// A missing `api` or `pickDate` means an older Kalendae, and the caller should
// leave its calendar option out.

export interface KalendaePickDateOptions {
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
  pickDate(options: KalendaePickDateOptions): Promise<string | null>;
}
