import { Setting, SettingPage, moment } from "obsidian";
import { LocaleChoice, localeChoices } from "../i18n/languages";
import { KalendaeSettings, alwaysOn, enabledLocales } from "../settings";
import { KalendaeHost } from "./host";
import { t } from "../i18n/i18n";

/**
 * Which languages' month and weekday names can be typed, and are looked for.
 *
 * A search field over the whole list rather than an add-and-remove list. The
 * format list is already the one page here that reads as too much machinery,
 * and this list is four times longer; a search field is one control, and what
 * is on stays visible without opening anything.
 *
 * The rows are drawn by hand into a div of their own rather than as settings
 * definitions, because the list is rebuilt on every keystroke in the search
 * field and only that div should be thrown away each time.
 */
export class LanguagesPage extends SettingPage {
  private search = "";
  private listEl: HTMLElement | null = null;
  private changed = false;

  constructor(
    private readonly host: KalendaeHost,
    private readonly onChanged: () => void,
  ) {
    super();
    this.title = t("settings.languages.heading");
  }

  /**
   * The row behind this page names the languages in force, and `displayValue`
   * only re-reads them when the tab is told to update. Leaving is the moment
   * to say so: doing it per toggle would redraw the tab underneath while the
   * reader is still working on top of it.
   */
  hide(): void {
    super.hide();
    for (const el of this.scrollers()) el.removeClass("kalendae-stable-gutter");
    if (!this.changed) return;
    this.changed = false;
    this.onChanged();
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.addClass("kalendae-settings-page", "kalendae-languages");
    for (const el of this.scrollers()) el.addClass("kalendae-stable-gutter");

    new Setting(this.containerEl)
      .setClass("kalendae-languages-intro")
      .setName(t("settings.languages.description"));

    // `addSearch`, not `addText`: it brings the clear button with it, which a
    // field you narrow a list of 111 with has to have. No placeholder — the
    // row is already labelled Search, and a placeholder some themes render in
    // the same colour as real input reads as a value that is already there.
    new Setting(this.containerEl)
      .setClass("kalendae-languages-search")
      .setName(t("settings.languages.search"))
      .addSearch((search) =>
        search.onChange((value) => {
          this.search = value.trim().toLowerCase();
          this.renderList();
        }),
      );

    this.listEl = this.containerEl.createDiv({ cls: "kalendae-language-list" });
    this.renderList();
  }

  /**
   * The panes that may be scrolling this page, which keep their scrollbar's
   * width reserved while it is open — so narrowing the list with the search
   * does not drop the scrollbar and reflow the page a few pixels wider.
   *
   * Both candidates, because the scrolling element is Obsidian's and
   * undocumented. The class comes off in `hide()`: the same pane goes on to
   * show every other settings tab.
   */
  private scrollers(): HTMLElement[] {
    const found: HTMLElement[] = [];
    for (let el = this.containerEl.parentElement; el !== null; el = el.parentElement) {
      if (el.matches(".vertical-tab-content, .modal-content")) found.push(el);
    }

    return found;
  }

  /**
   * English first and immovable, then what is on, then everything else.
   *
   * **Sorted on arrival, never while the reader is here.** Ticking a row does
   * not rebuild this list: a language turned on at row ninety would leap to
   * the top and out from under the pointer that just clicked it, which is a
   * worse thing to do than to leave the order a moment out of date. The order
   * is settled when the page opens and when the search changes — both moments
   * where the whole list is replaced, so nothing appears to move.
   *
   * A reader looking for what they turned on should not have to scroll a list
   * of 111 to find it; a reader looking for a language they have not turned on
   * is typing rather than scrolling. The search matches the code as well as
   * the name, so someone who thinks in `pt-br` finds it.
   */
  private renderList(): void {
    const list = this.listEl;
    if (list === null) return;
    list.empty();

    const enabled = new Set(this.host.settings.languages);
    const all = localeChoices(moment.locales(), moment.locale());
    const matches = (choice: LocaleChoice) =>
      this.search === "" ||
      choice.name.toLowerCase().includes(this.search) ||
      choice.code.toLowerCase().includes(this.search);

    // English and the app's own language lead, on and immovable. They are in
    // force whatever the list holds, so a toggle that could be thrown would be
    // lying about what it does.
    const app = moment.locale();
    const locked = all.filter((choice) => alwaysOn(choice.code, app) && matches(choice));
    for (const choice of locked) this.row(list, choice, true, true);

    const rest = all.filter((choice) => !alwaysOn(choice.code, app) && matches(choice));
    for (const choice of rest.filter((choice) => enabled.has(choice.code))) {
      this.row(list, choice, true, false);
    }
    for (const choice of rest.filter((choice) => !enabled.has(choice.code))) {
      this.row(list, choice, false, false);
    }

    if (list.childElementCount === 0) {
      list.createDiv({ cls: "kalendae-language-empty", text: t("settings.languages.none") });
    }
  }

  /**
   * One language. English is drawn on and disabled rather than left out: a
   * switch that cannot move says "always" more economically than a line of
   * prose, which is the same answer the Sections page gives for Body text.
   */
  private row(parent: HTMLElement, choice: LocaleChoice, on: boolean, locked: boolean): void {
    new Setting(parent)
      .setClass("kalendae-language-row")
      // The code beside the name, muted. The search matches it as well as the
      // name, and without it showing, a two-letter query answers with rows
      // that look unrelated — `cy` finds Welsh, whose code that is, and there
      // was nothing on the row to say so.
      .setName(
        createFragment((fragment) => {
          fragment.createSpan({ text: choice.name });
          fragment.createSpan({ cls: "kalendae-language-code", text: choice.code });
        }),
      )
      .addToggle((toggle) =>
        toggle
          .setValue(on)
          .setDisabled(locked)
          .onChange((value) => this.set(choice.code, value)),
      );
  }

  /**
   * Appended rather than inserted in the catalogue's order, so the list reads
   * in the order the reader turned them on. Nothing downstream cares: the
   * alternation deduplicates and English is put in front by `enabledLocales`.
   *
   * The list is deliberately not redrawn — see `renderList`. The toggle has
   * already moved itself, which is the whole of what changed on screen.
   */
  private set(code: string, on: boolean): void {
    const languages = this.host.settings.languages.filter((held) => held !== code);
    this.host.settings.languages = on ? [...languages, code] : languages;
    this.changed = true;
    void this.host.saveSettings();
  }
}

/**
 * The languages in force, for the row on the tab behind the page.
 *
 * A middle dot rather than a comma and a space, which is English typography:
 * Chinese and Japanese enumerate with a comma of their own and no space. The
 * separator the scope summary settled on, for the same reason.
 */
export function languagesSummary(settings: KalendaeSettings, uiLanguage: string): string {
  const named = new Map(localeChoices(moment.locales(), uiLanguage).map((c) => [c.code, c.name]));

  return enabledLocales(settings, uiLanguage)
    .map((code) => named.get(code) ?? code)
    .join(" · ");
}
