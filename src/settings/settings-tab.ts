import {
  App,
  Menu,
  PluginSettingTab,
  Setting,
  SettingDefinitionItem,
  SettingGroup,
  moment,
  setIcon,
} from "obsidian";
import { BUILT_IN_FORMATS, DateFormatEntry, renderExample } from "../detect/formats";
import {
  KalendaeSettings,
  DEFAULT_SETTINGS,
  HOVER_ICONS,
  WEEK_STARTS,
  commandOnly,
  reorderById,
} from "../settings";
import { TASK_MARKERS } from "../detect/markers";
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
 * The plain rows are declarative `control` definitions binding by
 * `keyof KalendaeSettings`, so the inherited getControlValue/setControlValue
 * read and persist `plugin.settings[key]` with no save wiring here. The format
 * rows are `render` definitions instead — see format-list.ts for why — and
 * they mutate the settings themselves, which is what `saveSettings()` is for.
 *
 * The order is the order they are read in: what a date does in a note, what the
 * calendar shows, where dates are looked for, and last the formats, which is
 * the longest section and the one a reader visits deliberately.
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
        // What a date does under the pointer, which is a different subject from
        // what the calendar itself offers once it is open.
        type: "group",
        cls: "kalendae-group",
        heading: t("settings.notes.heading"),
        items: [
          {
            // Ahead of the two switches that put it there. With both of them
            // off nothing in a note opens the calendar, and the note cannot
            // say so — a date goes on outlining itself under the pointer and
            // then does nothing when clicked. The section says it instead, and
            // names the way in that is left.
            //
            // Not a heading, though it sits where one would: a second line of
            // heading under the section's own reads as a second section. It is
            // a line of small muted text, the same treatment the format list's
            // intro gets, so the switches below stay the loudest thing here.
            name: commandOnlyText(),
            visible: () => commandOnly(this.kalendae.settings),
            render: (setting) => renderCommandOnly(setting),
          },
          {
            name: t("settings.doubleClick.name"),
            desc: t("settings.doubleClick.desc"),
            control: {
              type: "toggle",
              key: "doubleClick",
              defaultValue: DEFAULT_SETTINGS.doubleClick,
            },
          },
          {
            name: t("settings.hoverIcon.name"),
            desc: hoverIconDesc(),
            control: {
              type: "dropdown",
              key: "hoverIcon",
              defaultValue: DEFAULT_SETTINGS.hoverIcon,
              options: Object.fromEntries(
                HOVER_ICONS.map((value) => [value, t(`settings.hoverIcon.options.${value}`)]),
              ),
            },
          },
          {
            // Third of the three ways in, under the two that came before it.
            // The emoji are in the name rather than the description: a reader
            // scanning the section sees which glyphs this is about without
            // reading a sentence, and the list has one definition — TASK_MARKERS
            // — rather than one here and one in thirteen locale files.
            name: t("settings.taskEmoji.name", { emojis: TASK_MARKERS.join(" ") }),
            desc: t("settings.taskEmoji.desc"),
            control: {
              type: "toggle",
              key: "taskEmoji",
              defaultValue: DEFAULT_SETTINGS.taskEmoji,
            },
          },
          {
            name: t("settings.hoverFrame.name"),
            control: {
              type: "toggle",
              key: "showHoverFrame",
              defaultValue: DEFAULT_SETTINGS.showHoverFrame,
            },
          },
        ],
      },
      {
        type: "group",
        cls: "kalendae-group",
        heading: t("settings.calendar.heading"),
        items: [
          {
            name: t("settings.weekNumbers.name"),
            control: {
              type: "toggle",
              key: "showWeekNumbers",
              defaultValue: DEFAULT_SETTINGS.showWeekNumbers,
            },
          },
          {
            name: t("settings.weekStart.name"),
            control: {
              type: "dropdown",
              key: "weekStart",
              defaultValue: DEFAULT_SETTINGS.weekStart,
              options: weekStartOptions(),
            },
          },
          {
            name: t("settings.writesPreview.name"),
            control: {
              type: "toggle",
              key: "showWritesPreview",
              defaultValue: DEFAULT_SETTINGS.showWritesPreview,
            },
          },
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
    ];
  }

  /**
   * Every declarative row saves through here, and the sub-header above them
   * all is why this is overridden: its `visible` predicate reads `doubleClick`
   * and `hoverIcon`, and a predicate is only re-evaluated when something asks.
   *
   * The redraw is `update()` rather than the cheaper `refreshDomState()`, and
   * only on the switch between the two states. `refreshDomState()` applies a
   * predicate's answer to the DOM that is already there, which settles nothing
   * about a row Obsidian may never have drawn — the tab is usually opened with
   * both triggers on and this row absent. `update()` builds the definitions
   * again, so the row exists either way. Twice per visit at the very most.
   */
  async setControlValue(key: string, value: unknown): Promise<void> {
    const before = commandOnly(this.kalendae.settings);
    await super.setControlValue(key, value);

    if (commandOnly(this.kalendae.settings) !== before) this.update();
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

/**
 * The line shown when the command is the last way into the calendar.
 *
 * The icon goes inside the name rather than beside it: the row carries no
 * control, so there is nowhere else on it for the icon to sit. Its spacing is
 * padding inside the icon's own box, which is the rule the hover icon in a
 * note follows too — a margin between two elements belongs to neither of them.
 */
function renderCommandOnly(setting: Setting): void {
  const name = createFragment();
  const icon = name.createSpan({ cls: "kalendae-inline-icon" });
  setIcon(icon, "info");
  name.appendText(commandOnlyText());

  setting.setName(name);
  setting.settingEl.addClass("kalendae-command-only");
}

/**
 * Named twice — once for search, once on screen — so the command's own name
 * is looked up in one place. It comes from the command rather than from a
 * second string, so it reads exactly as it does in the palette, in every
 * language.
 */
function commandOnlyText(): string {
  return t("settings.commandOnly.name", { command: t("commands.pickDate") });
}

/**
 * The hover-icon row's description, with the icon itself standing in it.
 *
 * A picture of the thing beats a name for it: the row is telling you what to
 * click, and the reader can then look for that shape in their note rather than
 * for the word "calendar". Translators are given the sentence with an {{icon}}
 * marker to place, which is why this is assembled rather than interpolated.
 */
function hoverIconDesc(): DocumentFragment {
  const description = createFragment();
  const [before, after] = t("settings.hoverIcon.desc").split("{{icon}}");

  description.appendText(before);
  if (after !== undefined) {
    const icon = description.createSpan({ cls: "kalendae-inline-icon" });
    setIcon(icon, "calendar");
    description.appendText(after);
  }

  return description;
}

/**
 * The week-start dropdown: the seven days, named by moment.
 *
 * The names come from the date library rather than from our locale files,
 * which is the rule the calendar itself follows — a vault in French says
 * "lundi" whether or not anyone has translated Kalendae into French. The order
 * of `WEEK_STARTS` is moment's own, so an entry's index is the day it names.
 */
function weekStartOptions(): Record<string, string> {
  const names = moment.weekdays();

  return Object.fromEntries(WEEK_STARTS.map((value, day) => [value, names[day]]));
}
