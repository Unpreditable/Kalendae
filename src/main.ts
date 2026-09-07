import { MarkdownView, Notice, Plugin } from "obsidian";
import { datePickerExtension, editorViewIn } from "./editor/DatePickerExtension";
import { buildReport } from "./detect/report";
import { DEFAULT_SETTINGS, KalendaeSettings, normaliseStoredFormats } from "./settings";
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
    this.registerEditorExtension(datePickerExtension);

    this.addCommand({
      id: "pick-date",
      name: t("commands.pickDate"),
      editorCallback: () => {
        new Notice(t("notices.notImplemented"));
      },
    });

    this.addCommand({
      id: "report-detected-dates",
      name: t("commands.reportDetections"),
      editorCallback: (_editor, ctx) => {
        this.reportDetections(ctx instanceof MarkdownView ? ctx : null);
      },
    });
  }

  /**
   * Prints every date candidate in the note — accepted and rejected, with the
   * reason — to the developer console.
   *
   * Deliberately writes nothing to the note and decorates nothing in the
   * editor: this is the instrument for checking detection against what you
   * expected, and an instrument that changes what it measures is no use. The
   * `nodes` column carries Obsidian's own syntax-tree names, which is how the
   * scope classifier gets corrected against a real vault.
   */
  private reportDetections(view: MarkdownView | null): void {
    const editorView = view && editorViewIn(view.contentEl);
    if (!editorView) {
      new Notice(t("notices.noEditor"));
      return;
    }

    const report = buildReport(editorView.state, this.settings);
    if (report.rows.length === 0) {
      new Notice(t("notices.reportEmpty"));
      return;
    }

    // The guideline this suppresses is about incidental logging. Here the
    // console *is* the output: the user ran a command whose entire purpose is
    // to print this table, and printing it anywhere else would mean changing
    // the note or the editor, which is the one thing this command must not do.
    // eslint-disable-next-line obsidianmd/rule-custom-message
    console.table(report.rows);
    new Notice(
      t("notices.reportSummary", { accepted: report.accepted, rejected: report.rejected }),
    );
    if (!report.contextComplete) {
      new Notice(t("notices.reportPartialContext"));
    }
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
      formats: normaliseStoredFormats(stored?.formats),
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
