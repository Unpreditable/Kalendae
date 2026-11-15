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
  /**
   * The days that can be picked, as `YYYY-MM-DD` ranges (both ends included) or
   * single days, whatever `pattern` is. Other days are shown but cannot be
   * picked. Left out or empty, any day can be. An older Kalendae ignores this,
   * so check the day you get back.
   */
  allowed?: Array<{ from: string; to: string } | string>;
}

export interface KalendaeApi {
  /**
   * Opens the calendar and resolves with the chosen day written in `pattern`, or
   * null when the reader closes it without picking. The caller writes the date.
   */
  pickDate(options: KalendaePickDateOptions): Promise<string | null>;
}
