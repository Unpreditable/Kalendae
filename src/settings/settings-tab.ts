import {
  App,
  Menu,
  PluginSettingTab,
  Setting,
  SettingDefinitionItem,
  SettingGroup,
} from "obsidian";
import { BUILT_IN_FORMATS, DateFormatEntry, renderExample } from "../detect/formats";
import { KalendaeSettings, DEFAULT_SETTINGS, TRIGGER_MODES, reorderById } from "../settings";
import { shadowedFormats } from "../detect/shadow";
import { CUSTOM_PREFIX, editFormat, releaseSortable, renderFormatRow } from "./format-list";
import { KalendaeHost } from "./host";
import { SectionsPage, scopeSummary } from "./sections-page";
import { t } from "../i18n/i18n";

/**
 * minAppVersion is 1.13.0, so this implements getSettingDefinitions() only.
 * Obsidian never calls display() for a tab that returns definitions, and there
 * is no older version to fall back for — which is the whole reason the floor
 * is 1.13.
 *
 * The trigger dropdown is a declarative `control` and binds by
 * `keyof KalendaeSettings`, so the inherited getControlValue/setControlValue
 * read and persist `plugin.settings[key]` with no save wiring here. The format
 * rows are `render` definitions instead — see format-list.ts for why — and
 * they mutate the settings themselves, which is what `saveSettings()` is for.
 */
export class KalendaeSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly kalendae: KalendaeHost,
  ) {
    super(app, kalendae);
  }

  getSettingDefinitions(): SettingDefinitionItem<keyof KalendaeSettings>[] {
    // Once for the list, not once per row: every row's verdict depends on all
    // the others, and every row would otherwise recompute the same answer.
    const shadows = shadowedFormats(this.kalendae.settings.formats);

    return [
      {
        name: t("settings.trigger.name"),
        desc: t("settings.trigger.description"),
        control: {
          type: "dropdown",
          key: "trigger",
          defaultValue: DEFAULT_SETTINGS.trigger,
          options: Object.fromEntries(
            TRIGGER_MODES.map((mode) => [mode, t(`settings.trigger.options.${mode}`)]),
          ),
        },
      },
      {
        // Heading, explanation and rows are one list, so the framework's own
        // grouping is what binds them together and the add button sits in the
        // list header beside the title. The formats keep their array indices
        // because the intro row is only ever prepended in `items`, never in
        // `settings.formats`.
        type: "list",
        cls: "kalendae-format-list",
        heading: t("settings.formats.heading"),
        // The framework's own add affordance rather than a hand-rolled header
        // button: a + in the list header on desktop, tooltipped with the name,
        // and a tappable "+ Add format" row under the list on mobile. It hands
        // back whichever element was pressed, which is what the menu anchors to.
        addItem: {
          name: t("settings.formats.add"),
          action: (el) => this.openAddMenu(el),
        },
        items: [
          {
            // A first item rather than a description on the heading, which a
            // group has no field for. The class is what keeps it reading as
            // prose instead of as another format's title.
            name: t("settings.formats.description"),
            render: (setting) => setting.settingEl.addClass("kalendae-format-intro"),
          },
          ...this.kalendae.settings.formats.map((entry, index) => ({
            name: entry.pattern,
            render: (setting: Setting, group: SettingGroup) =>
              renderFormatRow(
                setting,
                group,
                this.app,
                this.kalendae,
                index,
                {
                  onEdit: (id, pattern) => this.editFormat(id, pattern),
                  onDelete: (at) => void this.deleteFormat(at),
                  onReorder: (ids) => void this.reorderFormat(ids),
                },
                shadows.get(entry.id),
              ),
          })),
        ],
      },
      {
        // A heading with one row under it, rather than a row that carries both
        // its own name and its value. The heading names the thing once; the row
        // then has nothing left to say but what is currently scanned.
        type: "group",
        cls: "kalendae-scope-group",
        heading: t("settings.scopes.heading"),
        items: [
          {
            // No name of its own. The heading above has already said what this
            // is, so the row is left with nothing but the value — which is what
            // `displayValue` is for, and it keeps the value out of the page
            // title the row's name would otherwise supply.
            name: "",
            type: "page",
            displayValue: () => scopeSummary(this.kalendae.settings),
            page: () => new SectionsPage(this.kalendae, () => this.update()),
          },
        ],
      },
    ];
  }

  /**
   * Reopening the tab builds a new list element, and the drag binding on the
   * old one would outlive it. See releaseSortable().
   */
  hide(): void {
    releaseSortable();
    super.hide();
  }

  /** The catalogue, minus what is already in the list, plus a way to write one. */
  private openAddMenu(anchor: HTMLElement): void {
    const present = new Set(this.kalendae.settings.formats.map((entry) => entry.pattern));
    // Obsidian's Appearance -> "Native menus" setting would otherwise hand this
    // to the OS, which draws it outside the theme and nothing like the menus
    // beside it. The DOM menu is the one that matches the rest of the app.
    const menu = new Menu().setUseNativeMenu(false);

    for (const entry of BUILT_IN_FORMATS) {
      if (present.has(entry.pattern)) continue;
      menu.addItem((item) =>
        item
          .setTitle(`${entry.pattern}   ${renderExample(entry.pattern)}`)
          .onClick(() => void this.addFormat({ ...entry })),
      );
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle(t("settings.formats.addCustom")).onClick(() => this.addCustom()),
    );

    const rect = anchor.getBoundingClientRect();
    // `left: true` makes x the menu's right edge, so it hangs back under the +
    // rather than off to the right of a button already at the list's end.
    menu.showAtPosition({ x: rect.right, y: rect.bottom, left: true });
  }

  /** A custom format only joins the list once it is worth having. */
  private addCustom(): void {
    editFormat(this.app, "", (pattern) => {
      void this.addFormat({ id: `${CUSTOM_PREFIX}${Date.now().toString(36)}`, pattern });
    });
  }

  private editFormat(id: string, pattern: string): void {
    editFormat(this.app, pattern, (updated) => {
      const entry = this.kalendae.settings.formats.find((item) => item.id === id);
      if (!entry) return;
      entry.pattern = updated;
      void this.persist();
    });
  }

  private async addFormat(entry: DateFormatEntry): Promise<void> {
    this.kalendae.settings.formats.push(entry);
    await this.persist();
  }

  private async deleteFormat(index: number): Promise<void> {
    this.kalendae.settings.formats.splice(index, 1);
    await this.persist();
  }

  private async reorderFormat(ids: string[]): Promise<void> {
    const reordered = reorderById(this.kalendae.settings.formats, ids);

    // Refused. Sortable moved the row before telling us, so the list on screen
    // now shows an order the settings do not hold, and every row's index is
    // pointing at whatever format has slid into its place. Redrawing is what
    // takes that back; leaving it would aim the delete buttons at the wrong
    // formats.
    if (reordered === null) {
      this.update();
      return;
    }

    // A drop that changed nothing still ends a drag, and rewriting the settings
    // to the order they already hold would redraw the list for no reason.
    if (reordered === this.kalendae.settings.formats) return;

    this.kalendae.settings.formats = reordered;
    await this.persist();
  }

  private async persist(): Promise<void> {
    await this.kalendae.saveSettings();
    this.update();
  }
}
