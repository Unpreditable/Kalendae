import { MarkdownView, Notice, Plugin, moment } from "obsidian";
import { setDetectionLocales } from "./detect/formats";
import { KalendaeDateSuggest } from "./editor/date-suggest";
import { datePickerExtension, editorViewIn } from "./editor/DatePickerExtension";
import { showPicker, targetAt } from "./editor/picker-tooltip";
import { defaultWeekStart } from "./picker/month";
import {
  BASE_LOCALE,
  DEFAULT_SETTINGS,
  KalendaeSettings,
  enabledLocales,
  commandScopes,
  migrateTriggers,
  normaliseStoredFormats,
  normaliseStoredQuickDates,
  readStepKeys,
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
    this.applyLanguages();

    this.addSettingTab(new KalendaeSettingTab(this.app, this));
    this.registerEditorExtension(datePickerExtension(() => this.settings));
    this.registerEditorSuggest(new KalendaeDateSuggest(this.app, () => this.settings));

    this.addCommand({
      id: "pick-date",
      name: t("commands.pickDate"),
      editorCallback: (_editor, ctx) => {
        this.pickDate(ctx instanceof MarkdownView ? ctx : null);
      },
    });
  }

  /**
   * Opens the picker on the date the cursor is in, or on the empty space the
   * cursor is in — for anyone who would rather not reach for the mouse, and for
   * a note that has no date to edit yet.
   *
   * Nothing but the cursor's own position is consulted. A cursor touching a
   * date counts as being on it, so an off-by-one still edits rather than
   * inserting; a cursor anywhere else gets an empty range at that exact spot,
   * which the picker fills with the day that is chosen. Reaching for a date
   * further along the line was tried and taken out: the calendar opening on a
   * date the reader was not looking at is a jump they never asked for, and it
   * made a second date on one line impossible to add.
   *
   * The first format in the list is the one an insert is written in — the same
   * format that claims a contested range, which is what makes it the preferred
   * one rather than merely the top one.
   *
   * `commandScopes` is why the cursor's context does not matter here at all: a
   * command the reader ran deliberately treats every context as plain text, so
   * a code block, frontmatter and the inside of a wikilink are all as editable
   * as prose whatever those toggles are set to. The toggles decide what the
   * plugin draws over a note unasked, which is a different question.
   */
  private pickDate(view: MarkdownView | null): void {
    const editorView = view && editorViewIn(view.contentEl);
    if (!editorView) {
      new Notice(t("notices.noEditor"));
      return;
    }

    const at = editorView.state.selection.main.head;
    const target = targetAt(editorView.state, commandScopes(this.settings), at) ?? {
      from: at,
      to: at,
      text: "",
      pattern: this.settings.formats[0].pattern,
    };

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
      // Seeded once, like weekStart, and an ordinary setting afterwards. A
      // vault reading Russian types `@ноя 3` today; upgrading must not take
      // that away and then wait to be asked for it back.
      languages: stored?.languages ?? defaultLanguages(),
      ...readStepKeys(stored ?? {}),
      ...migrateTriggers(stored),
      formats: normaliseStoredFormats(stored?.formats),
      quickDates: normaliseStoredQuickDates(stored?.quickDates),
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applyLanguages();
  }

  /**
   * Hands the enabled languages to detection, which has no way to ask.
   *
   * Both on load and on every save, not one: the first makes detection right
   * at startup, the second makes it right the moment a reader turns a language
   * on, without reloading the plugin to see it.
   */
  private applyLanguages(): void {
    setDetectionLocales(enabledLocales(this.settings, moment.locale()));
  }
}

/**
 * The app's own language, unless that is English, which is always in force.
 *
 * `moment.locale()` rather than `getLanguage()`: the names this list governs
 * are moment's, so the code stored has to be one moment answers to.
 */
function defaultLanguages(): string[] {
  const locale = moment.locale();

  return locale === BASE_LOCALE ? [] : [locale];
}
