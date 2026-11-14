import { Setting, SettingPage, moment } from "obsidian";
import { KalendaeSettings, WEEK_STARTS, WeekStart } from "../settings";
import { firstDayOf, todayKey } from "../picker/month";
import { createPanel } from "../picker/panel";
import { KalendaeHost } from "./host";
import { t } from "../i18n/i18n";

/**
 * Which days the calendar shades as the weekend, and this month's calendar
 * showing it.
 *
 * Seven pills rather than seven switches: the short names are the calendar's
 * own header, so the row reads as the top of the calendar under it. They run
 * from the week's first day for the same reason.
 */
export class WeekendPage extends SettingPage {
  private previewEl: HTMLElement | null = null;
  private changed = false;

  constructor(
    private readonly host: KalendaeHost,
    private readonly onChanged: () => void,
  ) {
    super();
    this.title = t("settings.weekend.name");
  }

  /** See SectionsPage.hide(): the summary row behind is told once, on leaving. */
  hide(): void {
    super.hide();
    if (!this.changed) return;
    this.changed = false;
    this.onChanged();
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.addClass("kalendae-settings-page");

    const row = new Setting(this.containerEl)
      .setName(t("settings.weekend.days"))
      .setDesc(t("settings.weekend.daysDesc"));
    const pills = row.controlEl.createDiv({ cls: "kalendae-weekend-pills" });

    const short = moment.weekdaysMin();
    const full = moment.weekdays();
    for (const day of weekOrder(this.host.settings)) {
      const index = WEEK_STARTS.indexOf(day);
      const pill = pills.createEl("button", { cls: "kalendae-weekend-pill", text: short[index] });
      pill.setAttribute("aria-label", full[index]);

      const paint = () => {
        const on = this.host.settings.weekend.includes(day);
        pill.toggleClass("is-active", on);
        pill.setAttribute("aria-pressed", String(on));
      };
      paint();

      pill.addEventListener("click", () => {
        const weekend = new Set(this.host.settings.weekend);
        if (!weekend.delete(day)) weekend.add(day);
        this.host.settings.weekend = WEEK_STARTS.filter((each) => weekend.has(each));
        this.changed = true;
        void this.host.saveSettings();
        paint();
        this.renderPreview();
      });
    }

    new Setting(this.containerEl).setName(t("settings.weekend.preview")).setHeading();
    this.previewEl = this.containerEl.createDiv({ cls: "kalendae-weekend-preview" });
    this.renderPreview();
  }

  /** Redrawn whole on every pick: one month is cheap, and nothing in it holds state. */
  private renderPreview(): void {
    if (!this.previewEl) return;
    this.previewEl.empty();

    const panel = createPanel({
      value: todayKey(),
      pattern: "YYYY-MM-DD",
      settings: this.host.settings,
      onPick: () => {},
      onClose: () => {},
      preview: true,
    });
    this.previewEl.append(panel.dom);
  }
}

/** The seven days, starting on the week's first. */
function weekOrder(settings: KalendaeSettings): WeekStart[] {
  const first = firstDayOf(settings.weekStart);
  return WEEK_STARTS.map((_, offset) => WEEK_STARTS[(first + offset) % 7]);
}

/**
 * The weekend days for the summary line on the settings tab, in week order,
 * or "None". Full names, separated as the other summaries are; see
 * SUMMARY_SEPARATOR in sections-page.ts for why a middle dot.
 */
export function weekendSummary(settings: KalendaeSettings): string {
  const names = moment.weekdays();
  const days = weekOrder(settings).filter((day) => settings.weekend.includes(day));
  if (days.length === 0) return t("settings.weekend.none");

  return days.map((day) => names[WEEK_STARTS.indexOf(day)]).join(" · ");
}
