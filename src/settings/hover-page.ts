import { DropdownComponent, Setting, SettingPage, moment, setIcon } from "obsidian";
import { HOVER_TIME, fillHint } from "../editor/hover-hint";
import { hintFor } from "../picker/hint";
import { DayKey, todayKey } from "../picker/month";
import { HOVER_DISTANCES, HOVER_ORBS, HOVER_ICONS, KalendaeSettings } from "../settings";
import { KalendaeHost } from "./host";
import { t } from "../i18n/i18n";

/**
 * Days from today for the preview's samples. The far ones read differently in
 * each distance wording and the near ones the same, so switching the wording
 * shows what it changes and what it leaves alone.
 */
const SAMPLE_OFFSETS = [-400, -61, -1, 0, 5, 40];

/**
 * Everything a date does while the pointer is over it, and a preview of the
 * result.
 *
 * The orb is part of the hint rather than a feature of its own, so it shares
 * the hint's row and is disabled while the distance is off.
 */
export class HoverPage extends SettingPage {
  private previewEl: HTMLElement | null = null;
  private previewDescEl: HTMLElement | null = null;
  private changed = false;
  /** Whether the pointer is in the preview box, or a tap has switched it on. */
  private lit = false;
  /** Whether the hints are up, which they are only once the pause has passed. */
  private hinting = false;
  private hintTimer: number | null = null;

  constructor(
    private readonly host: KalendaeHost,
    private readonly onChanged: () => void,
  ) {
    super();
    this.title = t("settings.hover.heading");
  }

  /** See `SectionsPage.hide()`: the summary row behind this page is told on leaving. */
  hide(): void {
    super.hide();
    this.light(false);
    if (!this.changed) return;
    this.changed = false;
    this.onChanged();
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.addClass("kalendae-settings-page");
    const settings = this.host.settings;

    new Setting(this.containerEl)
      .setName(t("settings.hoverIcon.name"))
      .setDesc(hoverIconDesc())
      .addDropdown((dropdown) => {
        for (const value of HOVER_ICONS) {
          dropdown.addOption(value, t(`settings.hoverIcon.options.${value}`));
        }
        dropdown.setValue(settings.hoverIcon).onChange((value) => {
          settings.hoverIcon = HOVER_ICONS.find((icon) => icon === value) ?? settings.hoverIcon;
          this.save();
        });
      });

    new Setting(this.containerEl).setName(t("settings.hoverFrame.name")).addToggle((toggle) =>
      toggle.setValue(settings.showHoverFrame).onChange((value) => {
        settings.showHoverFrame = value;
        this.save();
      }),
    );

    // The distance and the orb side by side in one row, each labelled above
    // its dropdown. Both are parts of the one hint, and an orb dropdown that
    // came and went with the distance made every row below it jump.
    const hintRow = new Setting(this.containerEl)
      .setName(t("settings.hoverHint.name"))
      .setDesc(t("settings.hoverHint.desc"))
      .setClass("kalendae-hint-row");
    // Under the name rather than beside it: two labelled dropdowns are too
    // wide for the control column, and below they line up with the text.
    const table = hintRow.settingEl.createDiv({ cls: "kalendae-hint-table" });
    table.createDiv({ cls: "kalendae-hint-label", text: t("settings.hoverDistance.name") });
    table.createDiv({ cls: "kalendae-hint-label", text: t("settings.hoverOrb.name") });

    const distance = new DropdownComponent(table.createDiv());
    const orb = new DropdownComponent(table.createDiv());

    for (const value of HOVER_DISTANCES) {
      distance.addOption(value, t(`settings.hoverDistance.options.${value}`));
    }
    for (const value of HOVER_ORBS) {
      orb.addOption(value, t(`settings.hoverOrb.options.${value}`));
    }

    // Disabled rather than hidden while there is no distance: an orb alone is a
    // colour with nothing to explain it. Its value is kept for when the
    // distance comes back.
    distance.setValue(settings.hoverDistance).onChange((value) => {
      settings.hoverDistance =
        HOVER_DISTANCES.find((wording) => wording === value) ?? settings.hoverDistance;
      orb.setDisabled(settings.hoverDistance === "off");
      this.save();
    });
    orb
      .setValue(settings.hoverOrb)
      .setDisabled(settings.hoverDistance === "off")
      .onChange((value) => {
        settings.hoverOrb = HOVER_ORBS.find((colours) => colours === value) ?? settings.hoverOrb;
        this.save();
      });

    // The description is the heading's own, so it sits under the word Preview
    // rather than a row's padding away from it. It changes with the pointer and
    // the settings; see `applyLight()`.
    const heading = new Setting(this.containerEl)
      .setName(t("settings.hover.preview.heading"))
      .setDesc(t("settings.hover.preview.desc"))
      .setHeading()
      .setClass("kalendae-hover-preview-heading");
    this.previewDescEl = heading.descEl;

    // A row of its own only to line the box up with the rows above.
    const body = new Setting(this.containerEl)
      .setClass("kalendae-sample-block")
      .setClass("kalendae-hover-preview-block");
    this.previewEl = body.settingEl.createDiv({
      cls: "kalendae-hover-preview",
    });

    // Plain until the pointer comes in, the way a date in a note is. A finger
    // has no hover, so a tap switches the box on and another switches it off.
    this.previewEl.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "touch") this.light(true);
    });
    this.previewEl.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "touch") this.light(false);
    });
    this.previewEl.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") this.light(!this.lit);
    });

    this.renderPreview();
  }

  /**
   * Lights the samples at once and their hints after the same pause a note
   * waits, so the box shows the timing as well as the look.
   */
  private light(on: boolean): void {
    this.lit = on;
    this.hinting = false;
    if (this.hintTimer !== null) window.clearTimeout(this.hintTimer);
    this.hintTimer = null;

    if (on) {
      this.hintTimer = window.setTimeout(() => {
        this.hintTimer = null;
        this.hinting = true;
        this.applyLight();
      }, HOVER_TIME);
    }
    this.applyLight();
  }

  /**
   * The box and its description, brought in line with the pointer and the
   * settings. With every row off a hovered date in a note does nothing, so the
   * box does nothing either, and the description says so in place of asking
   * for a hover that would show nothing.
   */
  private applyLight(): void {
    if (!this.previewEl) return;
    const nothing = showsNothing(this.host.settings);
    const lit = this.lit && !nothing;

    this.previewEl.toggleClass("kalendae-preview-lit", lit);
    this.previewEl.toggleClass("kalendae-preview-hinting", this.hinting && !nothing);
    this.previewEl.querySelectorAll(".kalendae-date, .kalendae-icon-anchor").forEach((element) => {
      element.toggleClass("kalendae-hot", lit);
    });

    const desc = nothing ? "nothing" : lit ? "hovered" : "desc";
    this.previewDescEl?.setText(t(`settings.hover.preview.${desc}`));
  }

  private save(): void {
    this.changed = true;
    void this.host.saveSettings();
    this.renderPreview();
  }

  /**
   * Each sample drawn the way a note draws a date: the same classes on the
   * same elements, with its hint above it, hidden until the box is hovered.
   * Written in the first format, which is the one a fresh date most likely
   * takes.
   */
  private renderPreview(): void {
    if (!this.previewEl) return;
    this.previewEl.empty();
    previewFrame(this.previewEl);

    const settings = this.host.settings;
    const pattern = settings.formats[0].pattern;
    const today = todayKey();

    for (const offset of SAMPLE_OFFSETS) {
      const day = shifted(today, offset);
      const sample = this.previewEl.createDiv({ cls: "kalendae-hover-sample" });

      // Drawn with the distance off as well, never shown, so the box keeps its
      // size and its columns whichever way the dropdown is set.
      const wording = settings.hoverDistance;
      const hint = sample.createDiv({ cls: "kalendae-hint" });
      hint.toggleClass("kalendae-hint-unused", wording === "off");
      hint.toggleClass("kalendae-hint-icon-left", settings.hoverIcon === "left");
      const shown = wording === "off" ? "days" : wording;
      fillHint(hint, hintFor(day, today, pattern, shown, settings.hoverOrb));

      // The column takes its width from copies of no height, never seen: this
      // date's hint in both wordings, each with its orb. So a column is as wide
      // as its hint can ever be, and nothing the dropdowns do moves a date.
      for (const sized of ["days", "rounded"] as const) {
        const sizer = sample.createDiv({ cls: "kalendae-hint kalendae-hint-sizer" });
        fillHint(sizer, hintFor(day, today, pattern, sized, "green-red"));
      }

      const line = sample.createDiv({ cls: "kalendae-hover-sample-line" });
      if (settings.hoverIcon === "left") iconAnchor(line, "left");

      const classes = ["kalendae-date"];
      if (settings.hoverIcon !== "off") classes.push(`kalendae-place-${settings.hoverIcon}`);
      if (settings.showHoverFrame) classes.push("kalendae-framed");
      line.createSpan({
        cls: classes.join(" "),
        text: moment.utc(day).format(pattern),
      });

      if (settings.hoverIcon === "right") iconAnchor(line, "right");
    }

    // Redrawn by a change of setting, which can land while a tap has the box on.
    this.applyLight();
  }
}

/**
 * The box's dashed border, drawn as an SVG rectangle rather than a CSS border:
 * a dashed border's dash length is the browser's choice, and an SVG stroke's
 * is ours. The colours and dashes are in styles.css.
 */
function previewFrame(parent: HTMLElement): void {
  const svg = parent.createSvg("svg", { cls: "kalendae-preview-frame" });
  svg.setAttribute("aria-hidden", "true");
  svg.createSvg("rect");
}

function shifted(day: DayKey, days: number): DayKey {
  const at = moment.utc(day).add(days, "days");
  return { year: at.year(), month: at.month(), day: at.date() };
}

function iconAnchor(parent: HTMLElement, side: "left" | "right"): void {
  const anchor = parent.createSpan({
    cls: `kalendae-icon-anchor kalendae-icon-${side}`,
  });
  setIcon(anchor.createSpan({ cls: "kalendae-icon" }), "calendar");
}

/**
 * The icon row's description, with the icon itself standing in it.
 *
 * A picture of the thing beats a name for it: the row is telling you what to
 * click, and the reader can then look for that shape in their note rather than
 * for the word "calendar". Translators are given the sentence with an {{icon}}
 * marker to place, which is why this is assembled rather than interpolated.
 * A time shows a clock where a date shows a calendar, so the sentence carries
 * both.
 */
function hoverIconDesc(): DocumentFragment {
  const description = createFragment();
  const icons: Record<string, string> = { "{{icon}}": "calendar", "{{clock}}": "clock" };

  // Split on the markers and keep them, so each lands where the translator
  // put it and in the order their language wants.
  for (const part of t("settings.hoverIcon.desc").split(/({{icon}}|{{clock}})/)) {
    if (part in icons) {
      setIcon(description.createSpan({ cls: "kalendae-inline-icon" }), icons[part]);
    } else {
      description.appendText(part);
    }
  }

  return description;
}

/** Whether every row on the page is off, so a hovered date looks no different. */
function showsNothing(settings: KalendaeSettings): boolean {
  return (
    settings.hoverIcon === "off" && !settings.showHoverFrame && settings.hoverDistance === "off"
  );
}

/** What the page has switched on, for the summary row on the settings tab. */
export function hoverSummary(settings: KalendaeSettings): string {
  const on: string[] = [];
  if (settings.hoverIcon === "left") on.push(t("settings.hover.summary.iconLeft"));
  if (settings.hoverIcon === "right") on.push(t("settings.hover.summary.iconRight"));
  if (settings.showHoverFrame) on.push(t("settings.hover.summary.outline"));
  if (settings.hoverDistance !== "off") {
    on.push(t(`settings.hover.summary.${settings.hoverDistance}`));
    if (settings.hoverOrb !== "off") on.push(t("settings.hover.summary.orb"));
  }
  // The same separator as the sections summary, for the same reasons.
  return on.length === 0 ? t("settings.hover.summary.none") : on.join(" · ");
}
