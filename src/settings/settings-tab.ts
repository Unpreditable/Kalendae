import {
  App,
  Menu,
  Platform,
  PluginSettingTab,
  Setting,
  SettingDefinition,
  SettingDefinitionItem,
  SettingGroup,
  moment,
  setIcon,
} from "obsidian";
import { BUILT_IN_FORMATS, DateFormatEntry, FormatKind, renderExample } from "../detect/formats";
import { BUILT_IN_TIME_FORMATS } from "../detect/time-formats";
import {
  ClockCommit,
  KalendaeSettings,
  DEFAULT_SETTINGS,
  STEP_KEYS,
  StepKeys,
  WEEK_STARTS,
  TriggerProblem,
  checkFormatChar,
  checkTrigger,
  commandOnly,
  reorderById,
} from "../settings";
import { TASK_MARKERS } from "../detect/markers";
import { Shadow, shadowedFormats } from "../detect/shadow";
import {
  CUSTOM_PREFIX,
  FormatList,
  editFormat,
  releaseSortable,
  fillTimeExample,
  renderFormatRow,
} from "./format-list";
import { HoverPage, hoverSummary } from "./hover-page";
import { KalendaeHost } from "./host";
import { QuickDatesPage, quickDatesSummary } from "./quick-dates-page";
import { LanguagesPage, languagesSummary } from "./languages-page";
import { SectionsPage, scopeSummary } from "./sections-page";
import { boundCommands, stepClashes } from "./step-clash";
import { TypingHelpPage } from "./typing-help-page";
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
    const timeShadows = shadowedFormats(this.kalendae.settings.timeFormats, "time");

    return [
      {
        // What a date does under the pointer, which is a different subject from
        // what the calendar itself offers once it is open.
        //
        // A class of its own rather than the shared one: this is the first
        // section, and the only one with nothing above it to be separated from.
        type: "group",
        cls: "kalendae-notes-group",
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
            // The last way in, under the double-click. The icon, the other one,
            // lives on the On hover page further down.
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
          this.stepKeysRow(),
          {
            // The icon, the outline and the hint, on a page of their own: three
            // answers to "what happens under the pointer", with a preview the
            // tab has no room for.
            name: t("settings.hover.heading"),
            type: "page",
            displayValue: () => hoverSummary(this.kalendae.settings),
            page: () => new HoverPage(this.kalendae, () => this.update()),
          },
        ],
      },
      {
        type: "group",
        cls: "kalendae-group",
        heading: t("settings.calendar.heading"),
        items: [
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
            name: t("settings.weekNumbers.name"),
            control: {
              type: "toggle",
              key: "showWeekNumbers",
              defaultValue: DEFAULT_SETTINGS.showWeekNumbers,
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
          {
            // A page rather than four rows inline: a slot is a name, a chooser
            // and a reading of what it does, which is three controls too many
            // for a section about the calendar's appearance. The value here
            // says which shortcuts are set without opening it.
            name: t("settings.quickDates.heading"),
            type: "page",
            displayValue: () => quickDatesSummary(this.kalendae.settings),
            page: () => new QuickDatesPage(this.kalendae, () => this.update()),
          },
        ],
      },
      {
        type: "group",
        cls: "kalendae-group",
        heading: t("settings.times.heading"),
        items: [
          {
            name: t("settings.snapMinutes.name"),
            desc: snapMinutesDesc(),
            control: {
              type: "toggle",
              key: "snapMinutes",
              defaultValue: DEFAULT_SETTINGS.snapMinutes,
            },
          },
          {
            name: t("settings.clockCommit.name"),
            // What the chosen option does, so it follows the dropdown; see
            // setControlValue for how it is kept in step.
            desc: clockCommitDesc(this.kalendae.settings.clockCommit),
            control: {
              type: "dropdown",
              key: "clockCommit",
              defaultValue: DEFAULT_SETTINGS.clockCommit,
              options: {
                ok: t("settings.clockCommit.ok"),
                "double-click": t("settings.clockCommit.doubleClick"),
                click: t("settings.clockCommit.click"),
              },
            },
          },
        ],
      },
      {
        // Typing is not one of the ways into the calendar above: those all act
        // on a date already written, and this one writes a date that is not
        // there yet. Its own section, and it sits beside the scopes because the
        // list obeys them.
        type: "group",
        cls: "kalendae-group",
        heading: t("settings.typing.heading"),
        items: [
          {
            name: t("settings.typeToInsert.name"),
            desc: t("settings.typeToInsert.desc", {
              trigger: this.kalendae.settings.typeTrigger,
            }),
            control: {
              type: "toggle",
              key: "typeToInsert",
              defaultValue: DEFAULT_SETTINGS.typeToInsert,
            },
          },
          {
            name: t("settings.typeTrigger.name"),
            desc: t("settings.typeTrigger.desc"),
            control: {
              type: "text",
              key: "typeTrigger",
              defaultValue: DEFAULT_SETTINGS.typeTrigger,
              // Greyed rather than hidden. A row that vanishes as a switch
              // above it is thrown is a worse surprise than one visibly
              // inactive, and the reader is looking straight at the switch.
              disabled: () => !this.kalendae.settings.typeToInsert,
              validate: (value: string) =>
                problemText(checkTrigger(value, this.kalendae.settings.formatTrigger), "trigger"),
            },
          },
          {
            name: t("settings.formatTrigger.name"),
            desc: t("settings.formatTrigger.desc", { formats: t("settings.formats.heading") }),
            control: {
              type: "text",
              key: "formatTrigger",
              defaultValue: DEFAULT_SETTINGS.formatTrigger,
              disabled: () => !this.kalendae.settings.typeToInsert,
              validate: (value: string) =>
                problemText(checkFormatChar(value, this.kalendae.settings.typeTrigger), "format"),
            },
          },
          {
            // Last, and a page rather than a paragraph. The list teaches its
            // own keywords — every row carries one — but nothing in it says
            // that words and named days are read at all, and that is three
            // grammars' worth of examples, which is a page.
            name: t("settings.typingHelp.heading"),
            type: "page",
            page: () => new TypingHelpPage(() => this.kalendae.settings),
          },
        ],
      },
      {
        // Two rows that govern both halves of the plugin, which is what earns
        // them one heading. The scope toggles are not detection-only —
        // `date-suggest.ts` reads them too, which is why `@tom` opens nothing
        // inside a code block — and a language is read by the typed list and
        // the scanner alike.
        //
        // Sections had this heading to itself and a nameless row beneath it,
        // on the reasoning that the heading named the thing once. A second row
        // ends that arrangement, so the row takes its name back.
        type: "group",
        cls: "kalendae-scope-group",
        heading: t("settings.recognising.heading"),
        items: [
          {
            name: t("settings.scopes.heading"),
            type: "page",
            displayValue: () => scopeSummary(this.kalendae.settings),
            page: () => new SectionsPage(this.kalendae, () => this.update()),
          },
          {
            // Directly above Date formats, and the adjacency earns its keep: a
            // language changes nothing for a format carrying no month or
            // weekday token, so the two rows are read together by exactly the
            // people they affect.
            name: t("settings.languages.heading"),
            type: "page",
            displayValue: () => languagesSummary(this.kalendae.settings, moment.locale()),
            page: () => new LanguagesPage(this.kalendae, () => this.update()),
          },
        ],
      },
      this.formatGroup(
        "date",
        t("settings.formats.heading"),
        t("settings.formats.description"),
        shadows,
      ),
      // Directly below the date list rather than under Time picker: the two
      // lists are the same kind of setting, and that section is about what
      // the clock does once it is open.
      this.formatGroup(
        "time",
        t("settings.timeFormats.heading"),
        t("settings.timeFormats.description"),
        timeShadows,
      ),
    ];
  }

  /** The list a kind names, as the row code wants it. */
  private list(kind: FormatKind): FormatList {
    return kind === "time"
      ? { kind, entries: this.kalendae.settings.timeFormats, minimum: 0 }
      : { kind, entries: this.kalendae.settings.formats, minimum: 1 };
  }

  /** One of the two format lists, as a definition. */
  private formatGroup(
    kind: FormatKind,
    heading: string,
    description: string,
    shadows: Map<string, Shadow>,
  ): SettingDefinitionItem<keyof KalendaeSettings> {
    const list = this.list(kind);

    return {
      // Heading, explanation and rows are one list, so the framework's own
      // grouping is what binds them together and the add button sits in the
      // list header beside the title. The formats keep their array indices
      // because the intro row is only ever prepended in `items`, never in
      // the settings.
      type: "list",
      cls: "kalendae-format-list",
      heading,
      // The framework's own add affordance rather than a hand-rolled header
      // button: a + in the list header on desktop, tooltipped with the name,
      // and a tappable "+ Add format" row under the list on mobile. It hands
      // back whichever element was pressed, which is what the menu anchors to.
      addItem: {
        name: t("settings.formats.add"),
        action: (el) => this.openAddMenu(el, kind),
      },
      items: [
        {
          // A first item rather than a description on the heading, which a
          // group has no field for. The class is what keeps it reading as
          // prose instead of as another format's title.
          name: description,
          render: (setting) => setting.settingEl.addClass("kalendae-format-intro"),
        },
        ...list.entries.map((entry, index) => ({
          name: entry.pattern,
          render: (setting: Setting, group: SettingGroup) =>
            renderFormatRow(
              setting,
              group,
              list,
              index,
              {
                onEdit: (id, pattern) => this.editFormat(id, pattern, kind),
                onDelete: (at) => void this.deleteFormat(at, kind),
                onReorder: (ids) => void this.reorderFormat(ids, kind),
              },
              shadows.get(entry.id),
            ),
        })),
      ],
    };
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

    // The dropdown's description says what the chosen option does, and is
    // rewritten in place rather than by update(). Obsidian skips rebuilding a
    // row whose control still has focus, and whether the dropdown keeps focus
    // after a pick varies — so the description changed only some of the time.
    if (key === "clockCommit") {
      const text = t(CLOCK_COMMIT_DESCS[value as ClockCommit]);
      this.containerEl
        .querySelectorAll(".kalendae-clock-commit-desc")
        .forEach((element) => element.setText(text));
      return;
    }

    // All three typing settings, because each one changes how the others are
    // drawn or judged. The switch greys the two fields below it; the trigger is
    // quoted in the switch's own description; and the two fields validate
    // against each other, so accepting a value in one settles a verdict already
    // shown under the other.
    //
    // That last one is why `formatTrigger` belongs here and was the bug when it
    // did not: Obsidian runs `validate` on the field being edited and on every
    // field it mounts, never on a neighbour. Fixing the clash from the other
    // side left the first field showing a message about a collision that no
    // longer existed, and no way to clear it but retyping.
    if (TYPING_KEYS.has(key)) {
      this.update();
      return;
    }

    if (commandOnly(this.kalendae.settings) !== before) this.update();
  }

  /**
   * The row for this computer's step keys, and only this computer's.
   *
   * Each kind of computer binds its own setting, so a vault synced between a
   * Mac and a PC keeps both; see STEP_KEYS. The platform cannot change while
   * the tab is open, so the other row is left out rather than hidden.
   *
   * The warnings sit in their own element after the description, and are
   * written when the row is drawn rather than when it is defined. Obsidian
   * defines the rows once, when the plugin loads, and draws those same rows
   * every time the tab opens — so a warning written at definition would name
   * whatever hotkeys existed at startup. Nor can rebuilding the definitions
   * reach it on a change of key: Obsidian leaves a row unredrawn while focus
   * is inside its control, and the dropdown has focus as it changes.
   *
   * `visible` is the hook, being the one thing Obsidian asks of a row every
   * time it draws the tab or refreshes it after a control changes, with the
   * rows already on screen. It always answers yes; asking it is what rewrites
   * the warnings. They are looked up on screen rather than held from here,
   * because Obsidian draws a copy of every description and the element built
   * here is never the one shown.
   *
   * The same hook marks the dropdown, which Obsidian otherwise narrows to the
   * option chosen: on Ctrl, too narrow to show Ctrl + Alt. A definition has no
   * class of its own to carry, so the mark goes on the drawn element.
   */
  private stepKeysRow(): SettingDefinition<keyof KalendaeSettings> {
    const desc = createFragment();
    desc.appendText(t("settings.stepKeys.desc"));
    desc.createDiv({ cls: STEP_CLASHES });

    const visible = () => {
      const shown = this.containerEl.querySelector<HTMLElement>(`.${STEP_CLASHES}`);
      if (shown !== null) fillStepClashes(shown, this.app, this.kalendae.settings);
      shown?.closest(".setting-item")?.querySelector("select")?.addClass("kalendae-step-keys");
      return true;
    };

    if (Platform.isMacOS) {
      return {
        name: t("settings.stepKeys.name"),
        desc,
        visible,
        control: {
          type: "dropdown",
          key: "stepKeysMac",
          defaultValue: DEFAULT_SETTINGS.stepKeysMac,
          options: { alt: stepKeyName("alt", true), off: t("settings.stepKeys.options.off") },
        },
      };
    }

    return {
      name: t("settings.stepKeys.name"),
      desc,
      visible,
      control: {
        type: "dropdown",
        key: "stepKeys",
        defaultValue: DEFAULT_SETTINGS.stepKeys,
        options: Object.fromEntries(
          STEP_KEYS.map((value) => [value, t(`settings.stepKeys.options.${value}`)]),
        ),
      },
    };
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
  private openAddMenu(anchor: HTMLElement, kind: FormatKind): void {
    const present = new Set(this.list(kind).entries.map((entry) => entry.pattern));
    const builtIn = kind === "time" ? BUILT_IN_TIME_FORMATS : BUILT_IN_FORMATS;
    // Obsidian's Appearance -> "Native menus" setting would otherwise hand this
    // to the OS, which draws it outside the theme and nothing like the menus
    // beside it. The DOM menu is the one that matches the rest of the app.
    const menu = new Menu().setUseNativeMenu(false);

    for (const entry of builtIn) {
      if (present.has(entry.pattern)) continue;
      menu.addItem((item) => {
        const title = formatOption(entry.pattern, kind);
        const row = title.firstElementChild;
        item.setTitle(title).onClick(() => void this.addFormat({ ...entry }, kind));
        // The row now sits in the item's title element, which sizes to its
        // content. Marked so `styles.css` can let it fill the item: the menu
        // offers no class of its own, and reaching up with `:has()` is what the
        // linter refuses.
        row?.parentElement?.addClass("kalendae-format-title");
      });
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle(t("settings.formats.addCustom")).onClick(() => this.addCustom(kind)),
    );

    const rect = anchor.getBoundingClientRect();
    // `left: true` makes x the menu's right edge, so it hangs back under the +
    // rather than off to the right of a button already at the list's end.
    menu.showAtPosition({ x: rect.right, y: rect.bottom, left: true });
  }

  /** A custom format only joins the list once it is worth having. */
  private addCustom(kind: FormatKind): void {
    editFormat(
      this.app,
      "",
      (pattern) => {
        void this.addFormat({ id: `${CUSTOM_PREFIX}${Date.now().toString(36)}`, pattern }, kind);
      },
      kind,
    );
  }

  private editFormat(id: string, pattern: string, kind: FormatKind): void {
    editFormat(
      this.app,
      pattern,
      (updated) => {
        const entry = this.list(kind).entries.find((item) => item.id === id);
        if (!entry) return;
        entry.pattern = updated;
        void this.persist();
      },
      kind,
    );
  }

  private async addFormat(entry: DateFormatEntry, kind: FormatKind): Promise<void> {
    this.list(kind).entries.push(entry);
    await this.persist();
  }

  private async deleteFormat(index: number, kind: FormatKind): Promise<void> {
    this.list(kind).entries.splice(index, 1);
    await this.persist();
  }

  private async reorderFormat(ids: string[], kind: FormatKind): Promise<void> {
    const entries = this.list(kind).entries;
    const reordered = reorderById(entries, ids);

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
    if (reordered === entries) return;

    if (kind === "time") this.kalendae.settings.timeFormats = reordered;
    else this.kalendae.settings.formats = reordered;
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
  return t("settings.commandOnly.name", {
    command: t("commands.pickDate"),
    timeCommand: t("commands.pickTime"),
  });
}

/**
 * The settings whose rows have to be built again when any of them changes.
 *
 * A set rather than a chain of comparisons, so adding the fourth row this
 * section is designed for — the languages page — is one entry rather than one
 * more `||` on a line already carrying three.
 */
const TYPING_KEYS = new Set<string>(["typeToInsert", "typeTrigger", "formatTrigger"]);

/**
 * One format in the add menu: the pattern, and today in it over on the right.
 *
 * The same two classes the format rows use, so the menu a format is picked
 * from and the list it lands in read alike — monospace for what you type,
 * muted for what it writes. Two spans rather than one string with spaces in
 * it: spaces cannot line a column up in a proportional font, and the example
 * is the half a reader is actually choosing between.
 */
function formatOption(pattern: string, kind: FormatKind): DocumentFragment {
  return createFragment((fragment) => {
    const row = fragment.createSpan({ cls: "kalendae-format-option" });

    row.createSpan({ cls: "kalendae-format-pattern", text: pattern });
    const example = row.createSpan({ cls: "kalendae-format-example" });
    if (kind === "time") fillTimeExample(example, pattern);
    else example.setText(renderExample(pattern));
  });
}

/**
 * A rejected value, said in terms the reader can act on.
 *
 * Undefined is the accepting answer Obsidian wants: a non-empty string rejects
 * the change and shows itself under the field, and the value is never stored.
 * So a reader who closes the tab mid-edit keeps whatever was last valid.
 *
 * A message per field, not per problem. Every message names what to type
 * instead, and what to type instead is different in the two fields: `@ ; //`
 * opens a list and `_ ~ !` picks a format. A shared string could only say the
 * vague half of that.
 */
function problemText(problem: TriggerProblem | null, field: "trigger" | "format"): string | void {
  return problem === null ? undefined : t(`settings.triggerError.${field}.${problem}`);
}

/** A modifier as the keyboard in front of the reader names it: Option, on a Mac. */
function stepKeyName(keys: StepKeys, isMac: boolean): string {
  return t(isMac && keys === "alt" ? "settings.stepKeys.options.option" : `settings.stepKeys.options.${keys}`);
}

/** Marks where the step keys' warnings sit, so a change of key can find them. */
const STEP_CLASHES = "kalendae-step-clashes";

/**
 * A line for each command holding the chosen step keys, replacing whatever the
 * element held. A hotkey wins over the editor's keys, so the reader is told
 * which command is taking them rather than finding out from a date that will
 * not move.
 */
function fillStepClashes(el: HTMLElement, app: App, settings: KalendaeSettings): void {
  const isMac = Platform.isMacOS;
  const keys = isMac ? settings.stepKeysMac : settings.stepKeys;

  el.empty();
  for (const clash of stepClashes(keys, isMac, boundCommands(app))) {
    el.createDiv({
      cls: "kalendae-step-clash",
      text: t("settings.stepKeys.clash", {
        keys: `${stepKeyName(keys, isMac)} + ${clash.arrow === "up" ? "↑" : "↓"}`,
        command: clash.command,
      }),
    });
  }
}

/**
 * The week-start dropdown: the seven days, named by moment.
 *
 * The names come from the date library rather than from our locale files,
 * which is the rule the calendar itself follows — a vault in French says
 * "lundi" whether or not anyone has translated Kalendae into French. The order
 * of `WEEK_STARTS` is moment's own, so an entry's index is the day it names.
 */
const CLOCK_COMMIT_DESCS: Record<ClockCommit, string> = {
  ok: "settings.clockCommit.okDesc",
  "double-click": "settings.clockCommit.doubleClickDesc",
  click: "settings.clockCommit.clickDesc",
};

function clockCommitDesc(commit: ClockCommit): DocumentFragment {
  return createFragment((fragment) => {
    fragment.createSpan({ cls: "kalendae-clock-commit-desc", text: t(CLOCK_COMMIT_DESCS[commit]) });
  });
}

/**
 * The Snap row's description, with the picker's magnet standing in it — the
 * reader is told what to look for, not what it is called. Assembled around an
 * {{icon}} marker, as the hover icon's description is.
 */
function snapMinutesDesc(): DocumentFragment {
  const description = createFragment();
  const [before, after] = t("settings.snapMinutes.desc").split("{{icon}}");

  description.appendText(before);
  if (after !== undefined) {
    setIcon(description.createSpan({ cls: "kalendae-inline-icon" }), "magnet");
    description.appendText(after);
  }

  return description;
}

function weekStartOptions(): Record<string, string> {
  const names = moment.weekdays();

  return Object.fromEntries(WEEK_STARTS.map((value, day) => [value, names[day]]));
}
