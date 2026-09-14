import { Menu, Setting, SettingPage, setIcon, setTooltip } from "obsidian";
import { QUICK_SLOTS, FilledSlot, KalendaeSettings, QuickSlot } from "../settings";
import { presetsAnchoredOn } from "../picker/quick";
import { createPanel } from "../picker/panel";
import { todayKey } from "../picker/month";
import { KalendaeHost } from "./host";
import { labelFor, shortFor, slotGloss } from "../picker/quick-text";
import { editQuickDate } from "./quick-date-modal";
import { t } from "../i18n/i18n";

/**
 * The four shortcut slots, and the switch that hides them without clearing
 * them.
 *
 * Drawn as a table rather than as `Setting` rows, for the reason the format
 * list is drawn by hand: a `Setting` puts its name and description on the left
 * and its controls hard against the right, which left the reading of each rule
 * stranded on a line of its own under a number, and the chooser and the name
 * field bunched at the far edge. Four slots have four things to say about each
 * of them, and things that line up column by column are read in one pass.
 *
 * Four slots, always four: no add button, no trash and no dragging, because a
 * list that cannot exceed four rows earns none of the three. Clearing a slot is
 * choosing nothing in its own chooser; reordering is editing two slots.
 */
export class QuickDatesPage extends SettingPage {
  private changed = false;
  private sampleEl: HTMLElement | null = null;

  constructor(
    private readonly host: KalendaeHost,
    private readonly onChanged: () => void,
  ) {
    super();
    this.title = t("settings.quickDates.heading");
  }

  /**
   * The summary row on the tab behind this page reads the same settings, and
   * `displayValue` only re-reads them when the tab is told to update. Leaving
   * is the moment to say so — doing it per change would redraw the tab under a
   * page the reader is still working on.
   */
  hide(): void {
    super.hide();
    if (!this.changed) return;
    this.changed = false;
    this.onChanged();
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.addClass("kalendae-settings-page", "kalendae-quick-dates");

    new Setting(this.containerEl)
      .setName(t("settings.quickDates.show"))
      // The line belongs to the switch rather than floating under it: a div of
      // its own sat outside every row's alignment and read as stray prose.
      .setDesc(t("settings.quickDates.description"))
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.showQuickDates).onChange((value) => {
          this.host.settings.showQuickDates = value;
          this.save();
          // The preview is what this switch is about: it shows the row
          // appearing and disappearing. Saving alone left it showing the state
          // before the switch was touched.
          this.drawSample();
        }),
      );

    new Setting(this.containerEl)
      .setName(t("settings.quickDates.shortcuts"))
      .setDesc(t("settings.quickDates.shortcutsDesc"))
      .setHeading();

    const table = this.containerEl.createDiv({ cls: "kalendae-quick-table" });
    for (const column of ["rule", "name", "meaning"] as const) {
      table.createDiv({
        cls: "kalendae-quick-head",
        text: t(`settings.quickDates.columns.${column}`),
      });
    }
    // The actions column is headed by nothing: a pencil needs no title, and a
    // word over it would be the widest thing in the narrowest column.
    table.createDiv({ cls: "kalendae-quick-head" });

    for (let at = 0; at < QUICK_SLOTS; at += 1) this.renderSlot(table, at);

    this.renderSample();
  }

  /**
   * The calendar as these settings currently draw it.
   *
   * The real panel, built by the real `createPanel()` from the live settings,
   * which is the rule the scope page's sample already follows: a worked example
   * that cannot drift from what the plugin does, because it is what the plugin
   * does. Redrawn with the rest of the page, so a name typed into a slot shows
   * up in it — including being cut off, which is the thing a reader most needs
   * to see before they leave.
   *
   * Picking a day does nothing. There is no note behind this one.
   */
  private renderSample(): void {
    new Setting(this.containerEl).setName(t("settings.quickDates.sample")).setHeading();
    this.sampleEl = this.containerEl.createDiv({ cls: "kalendae-quick-sample" });
    this.drawSample();
  }

  private drawSample(): void {
    if (!this.sampleEl) return;
    this.sampleEl.empty();

    const panel = createPanel({
      value: todayKey(),
      pattern: this.host.settings.formats[0].pattern,
      settings: this.host.settings,
      onPick: () => undefined,
      onClose: () => undefined,
    });

    this.sampleEl.append(panel.dom);
  }

  private renderSlot(table: HTMLElement, at: number): void {
    const slot = this.host.settings.quickDates[at];

    const chooser = table.createEl("button", {
      cls: "kalendae-quick-chooser",
      text: chooserLabel(slot),
    });
    chooser.addEventListener("click", (event) => this.openChooser(at, event));

    const alias = table.createEl("input", { cls: "kalendae-quick-alias", type: "text" });
    alias.placeholder = t("settings.quickDates.alias");
    // The real text, not a placeholder standing in for it: a placeholder cannot
    // be selected, appended to or edited down, so shortening a preset name
    // meant retyping it from nothing.
    alias.value = slot === null ? "" : labelFor(slot);
    alias.disabled = slot === null;
    alias.addEventListener("input", () => this.rename(at, alias.value, false));
    alias.addEventListener("blur", () => this.rename(at, alias.value, true));

    const gloss = slotGloss(slot) ?? "";
    const meaning = table.createDiv({ cls: "kalendae-quick-meaning", text: gloss });
    if (gloss !== "") setTooltip(meaning, gloss);

    const actions = table.createDiv({ cls: "kalendae-quick-actions" });
    if (slot !== null && !("preset" in slot)) {
      const pencil = actions.createEl("button", { cls: "kalendae-quick-edit" });
      setIcon(pencil, "pencil");
      setTooltip(pencil, t("settings.quickDates.edit"));
      pencil.setAttribute("aria-label", t("settings.quickDates.edit"));
      pencil.addEventListener("click", () => this.editSlot(at));
    }
  }

  /**
   * The chooser: nothing, the presets, and a rule of your own.
   *
   * The two families are separated but not titled. The headings they carried
   * were confusing — a reader choosing "End of this month" does not first ask
   * what it counts from — so the labels carry it instead, with "this" and "in"
   * against "that" and "later".
   */
  private openChooser(at: number, event: MouseEvent): void {
    // The DOM menu, not the OS one: Obsidian's "Native menus" setting would
    // otherwise draw this outside the theme and nothing like the menus beside
    // it — the same reason the format list's + menu asks for it.
    const menu = new Menu().setUseNativeMenu(false);

    menu.addItem((item) =>
      item.setTitle(t("settings.quickDates.empty")).onClick(() => this.fill(at, null)),
    );

    for (const anchor of ["today", "date"] as const) {
      menu.addSeparator();
      for (const preset of presetsAnchoredOn(anchor)) {
        menu.addItem((item) =>
          item
            // Two columns rather than two strings run together: spaces between
            // them collapse, and the pair then read as one sentence. Only the
            // name reaches the button.
            .setTitle(presetTitle(preset.id))
            .onClick(() => this.fill(at, { preset: preset.id })),
        );
      }
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle(t("settings.quickDates.custom")).onClick(() => this.editSlot(at)),
    );

    menu.showAtMouseEvent(event);
  }

  /** Opens the editor on what the slot holds; saving turns it into a rule of your own. */
  private editSlot(at: number): void {
    editQuickDate(
      this.host.app,
      this.host.settings,
      this.host.settings.quickDates[at],
      (slot) => this.fill(at, slot),
    );
  }

  /**
   * The name as it now stands, kept and shown in the preview.
   *
   * Only the preview is redrawn while the reader is typing: rebuilding the
   * table would take the focus out of the field under the caret. Leaving the
   * field redraws the row, and settles a rule of the reader's own whose name
   * has been emptied — `renamed` refuses that, so the old name comes back.
   * Refusing it mid-word would mean the field could not be cleared and
   * retyped; storing it would leave a nameless rule in `data.json` that the
   * next load throws away.
   */
  private rename(at: number, typed: string, leaving: boolean): void {
    const slot = this.host.settings.quickDates[at];
    if (slot === null) return;

    const next = renamed(slot, typed);
    const changed = next !== null && !same(slot, next);
    if (changed) {
      this.host.settings.quickDates[at] = next;
      this.save();
    }

    // Nothing to redraw for a field clicked into and out of again: rebuilding
    // the row would take the chooser out from under a pointer on its way to it.
    if (!leaving) {
      if (changed) this.drawSample();
      return;
    }

    if (changed || next === null) this.display();
  }

  private fill(at: number, slot: QuickSlot): void {
    this.host.settings.quickDates[at] = slot;
    this.save();
    this.display();
  }

  private save(): void {
    this.changed = true;
    void this.host.saveSettings();
  }
}

/** One menu entry: the preset's name, and its rule in words away to the right. */
function presetTitle(id: string): DocumentFragment {
  const title = createFragment();
  title.createSpan({
    cls: "kalendae-quick-menu-name",
    text: t(`settings.quickDates.presets.${id}`),
  });

  title.createSpan({
    cls: "kalendae-quick-menu-meaning",
    text: slotGloss({ preset: id }) ?? "",
  });

  return title;
}

/**
 * The slot under a new name, or null for a name it will not take.
 *
 * A preset whose field reads exactly its own short form stores no name at all:
 * the field is filled in for editing, so clicking into it and out again would
 * otherwise write that text down as the reader's own, and a stored name stops
 * following the app's language — leaving a German vault holding an English one
 * nobody typed.
 *
 * A rule of the reader's own has no name underneath it to fall back on, so an
 * empty one is refused. The read-back drops a nameless rule, and storing one
 * would throw the rule away at the next load.
 */
function renamed(slot: FilledSlot, typed: string): QuickSlot | null {
  const alias = typed.trim();
  if (!("preset" in slot)) return alias === "" ? null : { rule: slot.rule, alias };
  if (alias === "" || alias === shortFor(slot.preset)) return { preset: slot.preset };

  return { preset: slot.preset, alias };
}

/** Whether two slots say the same thing, which is all a redraw has to ask. */
function same(one: QuickSlot, other: QuickSlot): boolean {
  if (one === null || other === null) return one === other;
  if ("preset" in one) {
    return "preset" in other && one.preset === other.preset && one.alias === other.alias;
  }

  return !("preset" in other) && one.rule === other.rule && one.alias === other.alias;
}

function chooserLabel(slot: QuickSlot): string {
  if (slot === null) return t("settings.quickDates.empty");

  return "preset" in slot
    ? t(`settings.quickDates.presets.${slot.preset}`)
    : t("settings.quickDates.custom");
}

/**
 * Separates the shortcuts named in the summary line, and deliberately not a
 * comma — the argument `scopeSummary()` makes: a comma and a space is English
 * typography, and a middle dot reads as a list in every script.
 */
const SUMMARY_SEPARATOR = " · ";

/**
 * The shortcuts currently set, for the summary row on the settings tab.
 *
 * Three states, because the row has to tell them apart: switched off, on but
 * empty, and a list of names.
 */
export function quickDatesSummary(settings: KalendaeSettings): string {
  if (!settings.showQuickDates) return t("settings.quickDates.off");

  const names = settings.quickDates
    .filter((slot): slot is Exclude<QuickSlot, null> => slot !== null)
    .map((slot) => labelFor(slot));

  return names.length === 0 ? t("settings.quickDates.none") : names.join(SUMMARY_SEPARATOR);
}
