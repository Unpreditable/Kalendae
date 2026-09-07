import { Setting, SettingPage } from "obsidian";
import { KalendaeSettings } from "../settings";
import { KalendaeHost } from "./host";
import { SAMPLE_TEXT, sampleHighlights } from "./sample";
import { t } from "../i18n/i18n";

/** The toggleable sections, in the order they appear on the page. */
const SCOPES = [
  ["scopeHeadings", "headings"],
  ["scopeFrontmatter", "frontmatter"],
  ["scopeInlineCode", "inlineCode"],
  ["scopeCodeBlocks", "codeBlocks"],
  ["scopeWikilinks", "wikilinks"],
] as const;

export type ScopeSettingKey = (typeof SCOPES)[number][0];

/**
 * Which parts of a note are searched, and a worked example of what that means.
 *
 * The toggles carry no descriptions. Once the user has chosen the formats
 * themselves, the plugin has no standing to tell them a date in a code block
 * probably isn't a date — that is their vault. The sample shows what the
 * setting does instead of arguing for it.
 */
export class SectionsPage extends SettingPage {
  private sampleEl: HTMLElement | null = null;
  private changed = false;

  constructor(
    private readonly host: KalendaeHost,
    private readonly onChanged: () => void,
  ) {
    super();
    this.title = t("settings.scopes.heading");
  }

  /**
   * The summary row on the tab behind this page reads the same settings, and
   * `displayValue` only re-reads them when the tab is told to update. Leaving
   * the page is the moment to say so. Doing it per toggle would redraw the tab
   * underneath while the user is still working on top of it; not doing it at
   * all leaves the row naming the sections as they were before the visit.
   */
  hide(): void {
    super.hide();
    if (!this.changed) return;
    this.changed = false;
    this.onChanged();
  }

  display(): void {
    this.containerEl.empty();
    // Compacts the row spacing and lines the preview up with the toggles —
    // Obsidian's default rows are sized for pages with far fewer of them.
    this.containerEl.addClass("kalendae-settings-page", "kalendae-sections");

    // Listed rather than left implicit, so the set of sections is complete on
    // the page. Its toggle is on and disabled: a switch that cannot move says
    // "always scanned" more economically than a line of prose, and keeps the
    // row the same shape as every other one.
    new Setting(this.containerEl)
      .setName(t("settings.scopes.text.name"))
      .addToggle((toggle) => toggle.setValue(true).setDisabled(true));

    for (const [key, label] of SCOPES) {
      new Setting(this.containerEl).setName(t(`settings.scopes.${label}.name`)).addToggle((toggle) =>
        toggle.setValue(this.host.settings[key]).onChange((value) => {
          this.host.settings[key] = value;
          this.changed = true;
          void this.host.saveSettings();
          this.renderSample();
        }),
      );
    }

    new Setting(this.containerEl).setName(t("settings.scopes.sample.heading")).setHeading();

    // The body sits in a Setting of its own so it lines up with the rows above
    // rather than flush against the edge, while the heading stays a heading.
    const body = new Setting(this.containerEl)
      .setDesc(t("settings.scopes.sample.description"))
      .setClass("kalendae-sample-block");

    this.renderLegend(body.settingEl);
    this.sampleEl = body.settingEl.createEl("pre", { cls: "kalendae-sample" });
    this.renderSample();
  }

  private renderLegend(parent: HTMLElement): void {
    const legend = parent.createDiv({ cls: "kalendae-sample-legend" });
    legend.createSpan({
      cls: "kalendae-sample-detected",
      text: t("settings.scopes.sample.detected"),
    });
    legend.createSpan({
      cls: "kalendae-sample-skipped",
      text: t("settings.scopes.sample.skipped"),
    });
  }

  /**
   * Repaints the sample from the live settings. Whether a date matches is
   * computed by the real scanner, so this cannot drift from what the plugin
   * would actually do to a note of the same shape.
   */
  private renderSample(): void {
    if (!this.sampleEl) return;
    this.sampleEl.empty();

    let at = 0;
    for (const highlight of sampleHighlights(this.host.settings)) {
      this.sampleEl.appendText(SAMPLE_TEXT.slice(at, highlight.from));
      this.sampleEl.createSpan({
        cls: `kalendae-sample-${highlight.kind}`,
        text: SAMPLE_TEXT.slice(highlight.from, highlight.to),
      });
      at = highlight.to;
    }
    this.sampleEl.appendText(SAMPLE_TEXT.slice(at));
  }
}

/**
 * Separates the names in the summary line, and deliberately not a comma.
 *
 * A comma and a space is English typography. Chinese and Japanese enumerate
 * with a comma of their own and no space, so `", "` was wrong in two shipped
 * locales and right in the rest only by accident — and pushing the separator
 * into the locale files would ask thirteen translators a question none of them
 * raised. A middle dot reads as a list in every script.
 *
 * It also settles the casing. Run together as a sentence the names wanted
 * lower case, which is wrong in German, where nouns keep their capital, and
 * wrong for Frontmatter and Wikilinks in every language. Separated as a list
 * each name can simply stand as its translator wrote it.
 */
const SUMMARY_SEPARATOR = " · ";

/** The sections currently scanned, for the summary line on the settings tab. */
export function scopeSummary(settings: KalendaeSettings): string {
  const on = [t("settings.scopes.text.name")];
  for (const [key, label] of SCOPES) {
    if (settings[key]) on.push(t(`settings.scopes.${label}.name`));
  }
  return on.join(SUMMARY_SEPARATOR);
}
