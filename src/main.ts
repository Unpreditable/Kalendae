import { MarkdownView, Notice, Plugin } from "obsidian";
import { datePickerExtension, editorViewIn } from "./editor/DatePickerExtension";
import { firstTargetIn, showPicker, targetAt } from "./editor/picker-tooltip";
import { defaultWeekStart } from "./picker/month";
import {
  DEFAULT_SETTINGS,
  KalendaeSettings,
  migrateTriggers,
  normaliseStoredFormats,
} from "./settings";
import { KalendaeSettingTab } from "./settings/settings-tab";
import { t } from "./i18n/i18n";

export default class KalendaePlugin extends Plugin {
  // The settings tab's inherited setControlValue mutates and persists this
  // object directly for its declarative controls; the format list and section
  // toggles mutate it themselves and call saveSettings().
  settings: KalendaeSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new KalendaeSettingTab(this.app, this));
    this.registerEditorExtension(datePickerExtension(() => this.settings));

    this.addCommand({
      id: "pick-date",
      name: t("commands.pickDate"),
      editorCallback: (_editor, ctx) => {
        this.pickDate(ctx instanceof MarkdownView ? ctx : null);
      },
    });
  }

  /**
   * Opens the picker on the date the cursor is in, for anyone who would rather
   * not reach for the mouse.
   *
   * The cursor's own position first, then the line it sits on: a cursor just
   * after a date is beside it as far as the reader is concerned, and refusing
   * on an off-by-one would read as the command not working. Where a line holds
   * two dates and the cursor is in neither, the first is as good an answer as
   * any and better than none.
   */
  private pickDate(view: MarkdownView | null): void {
    const editorView = view && editorViewIn(view.contentEl);
    if (!editorView) {
      new Notice(t("notices.noEditor"));
      return;
    }

    const at = editorView.state.selection.main.head;
    const line = editorView.state.doc.lineAt(at);
    const target =
      targetAt(editorView.state, this.settings, at) ??
      firstTargetIn(editorView.state, this.settings, line.from, line.to);

    if (!target) {
      new Notice(t("notices.noDateHere"));
      return;
    }

    showPicker(editorView, target);
  }

  async loadSettings(): Promise<void> {
    // data.json is whatever a previous version of this plugin wrote, not a
    // trusted shape. The cast below is a claim about the happy path only:
    // normaliseStoredFormats validates the format list entry by entry, because
    // that is the part a spread cannot make safe.
    const stored = (await this.loadData()) as Partial<KalendaeSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      // Never guessed twice: whichever day the reader's region starts weeks on is
      // resolved once, on the first run, and is an ordinary setting after that.
      weekStart: stored?.weekStart ?? defaultWeekStart(),
      ...migrateTriggers(stored),
      formats: normaliseStoredFormats(stored?.formats),
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
