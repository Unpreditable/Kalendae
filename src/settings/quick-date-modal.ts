import {
  AbstractInputSuggest,
  App,
  ButtonComponent,
  Modal,
  Setting,
  TextComponent,
  moment,
} from "obsidian";
import {
  RuleProblem,
  checkRule,
  parseRule,
  resolveRule,
  stepFor,
  suggestionsFor,
  tokenAt,
} from "../picker/quick";
import { KalendaeSettings, QuickSlot } from "../settings";
import { DayKey, dayFor, firstDayOf, todayKey } from "../picker/month";
import { createPanel } from "../picker/panel";
import { glossFor, labelFor, ruleTextFor, stepGloss } from "../picker/quick-text";
import { replacementFor } from "../picker/write";
import { t } from "../i18n/i18n";

/**
 * The editor for a shortcut of the reader's own.
 *
 * One field and a list, rather than a row of chips and a step editor: the
 * builder that replaced typing turned out to be harder to understand than the
 * language it was hiding. Typing with suggestions under the caret is the
 * interaction everyone already knows from the command palette, and the list is
 * the documentation — every entry carries what it means.
 *
 * A modal rather than a settings sub-page, for the reason the format editor is
 * one: Save and Cancel do what their labels say, and Save is unavailable while
 * the rule does not read.
 */

/**
 * Chosen from the list to stop it reopening; Escape does the same.
 *
 * The leading space is what keeps it from colliding with a real token: the
 * language has none containing one.
 */
const DONE = " done";

/**
 * The test date is written and answered in one fixed format, never the
 * reader's own.
 *
 * Their first format could be `DD.MM.YYYY` or `MMM D, YYYY`, which makes the
 * field ambiguous to type into and the answer a different shape from the thing
 * it answers. Here both ends read the same way, and the row says which way that
 * is. Nothing about the shortcut itself depends on it: this field is a bench
 * test, not a date going into a note.
 */
const TEST_FORMAT = "YYYY/MM/DD";

class QuickDateModal extends Modal {
  private alias: string;
  private rule: string;
  private test: string;
  private save: ButtonComponent | null = null;
  private testField: TextComponent | null = null;
  private readingEl: HTMLElement | null = null;
  private landsEl: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly settings: KalendaeSettings,
    slot: QuickSlot,
    private readonly onSave: (slot: QuickSlot) => void,
  ) {
    super(app);
    this.alias = slot === null ? "" : labelFor(slot);
    this.rule = ruleTextFor(slot) ?? "";
    this.test = replacementFor(TEST_FORMAT, todayKey());
  }

  onClose(): void {
    this.contentEl.empty();
  }

  onOpen(): void {
    this.setTitle(t("settings.quickDates.modal.title"));
    this.contentEl.addClass("kalendae-settings-page", "kalendae-quick-modal");

    new Setting(this.contentEl)
      .setName(t("settings.quickDates.modal.name"))
      .setDesc(t("settings.quickDates.modal.nameDesc"))
      .addText((text) => {
        text.setValue(this.alias).onChange((value) => {
          this.alias = value;
          this.refresh();
        });
        text.inputEl.addClass("kalendae-quick-name");
      });

    // The field and its reading are one stack in the control column, so the
    // walkthrough starts where the rule starts.
    const ruleRow = new Setting(this.contentEl).setName(t("settings.quickDates.modal.rule"));
    const box = ruleRow.controlEl.createDiv({ cls: "kalendae-quick-rule-box" });

    // One line, three states — the reading, the reason it does not read, and a
    // hint while it is empty.
    this.readingEl = box.createDiv({ cls: "kalendae-quick-reads" });

    const input = box.createEl("input", { cls: "kalendae-quick-rule", type: "text" });
    input.value = this.rule;
    input.addEventListener("input", () => {
      this.rule = input.value;
      this.refresh();
    });

    new RuleSuggest(this.app, input, (value) => {
      this.rule = value;
      this.refresh();
    });

    // The test date stands in for both today and the date in the note, so every
    // rule answers to it: a shortcut can be tried on the day it would behave
    // differently — end of quarter in December, a weekday rule on that weekday.
    const test = new Setting(this.contentEl)
      .setName(t("settings.quickDates.modal.testDate"))
      .addText((text) => {
        text.setValue(this.test).onChange((value) => {
          this.test = value;
          this.refresh();
        });
        text.inputEl.addClass("kalendae-quick-test");
        this.testField = text;
      });

    test.addExtraButton((button) =>
      button
        .setIcon("calendar")
        .setTooltip(t("settings.quickDates.modal.pick"))
        .onClick(() => this.openCalendar()),
    );

    // The answer belongs on this row. A line of its own further down repeated
    // the date in order to say what it was an answer to.
    this.landsEl = test.controlEl.createSpan({ cls: "kalendae-quick-lands" });

    const actions = new Setting(this.contentEl).setClass("kalendae-format-actions");
    actions
      .addButton((button) =>
        button.setButtonText(t("settings.quickDates.modal.cancel")).onClick(() => this.close()),
      )
      .addButton((button) => {
        this.save = button
          .setButtonText(t("settings.quickDates.modal.save"))
          .setCta()
          .onClick(() => {
            this.onSave({ rule: this.rule.trim(), alias: this.alias.trim() });
            this.close();
          });
      });

    this.refresh();
  }

  /**
   * The plugin's own calendar, in a dialog of its own.
   *
   * Not a popover inside this one: an absolutely positioned panel still counts
   * towards the modal's scroll height, so opening it grew the dialog under the
   * pointer. Taking it out would mean positioning it against the button's
   * rectangle, and measuring geometry in JavaScript is the one thing this
   * plugin's layout never does. A second dialog needs no measurement, closes on
   * Escape and on a click outside, and is what Obsidian does with a picker
   * opened from a dialog anyway.
   */
  private openCalendar(): void {
    new CalendarModal(this.app, this.settings, this.testDay(), (day) => {
      this.test = replacementFor(TEST_FORMAT, day);
      this.testField?.setValue(this.test);
      this.refresh();
    }).open();
  }

  private testDay(): DayKey {
    return dayFor(this.test.trim(), TEST_FORMAT);
  }

  private testReads(): boolean {
    return moment.utc(this.test.trim(), TEST_FORMAT, true).isValid();
  }

  private refresh(): void {
    const problem = checkRule(this.rule.trim());
    const rule = problem === null ? parseRule(this.rule.trim()) : null;

    this.save?.setDisabled(rule === null || this.alias.trim() === "");

    const trouble = this.problemLine(problem);
    this.readingEl?.setText(trouble === "" && rule !== null ? glossFor(rule) : trouble);
    this.readingEl?.toggleClass(
      "kalendae-quick-problem-error",
      problem !== null && problem.kind !== "empty",
    );

    if (!this.testReads()) {
      this.landsEl?.setText(t("settings.quickDates.modal.badTestDate", { pattern: TEST_FORMAT }));
      return;
    }

    if (rule === null) {
      this.landsEl?.setText("");
      return;
    }

    // The base is the test date itself, sitting two inches to the left of its
    // own answer — which is what the field is for: a result with no visible
    // base says nothing about what it was a result of.
    const from = this.testDay();
    const day = resolveRule(rule, {
      value: from,
      today: from,
      firstDay: firstDayOf(this.settings.weekStart),
    });

    this.landsEl?.setText(`→ ${moment.utc(day).format(TEST_FORMAT)}`);
  }

  private problemLine(problem: RuleProblem | null): string {
    if (problem === null) return "";
    if (problem.kind === "empty") return t("settings.quickDates.modal.hint");
    if (problem.kind === "steps") return t("settings.quickDates.modal.problems.steps");
    if (problem.kind === "anchor") return t("settings.quickDates.modal.problems.anchor");

    return t(`settings.quickDates.modal.problems.${problem.kind}`, { token: problem.token });
  }
}

/** The calendar, on its own, for choosing a test date. */
class CalendarModal extends Modal {
  constructor(
    app: App,
    private readonly settings: KalendaeSettings,
    private readonly value: DayKey,
    private readonly onPick: (day: DayKey) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(t("settings.quickDates.modal.pick"));
    this.modalEl.addClass("kalendae-quick-calendar-modal");

    const panel = createPanel({
      value: this.value,
      pattern: TEST_FORMAT,
      // Without this the calendar for choosing a test date offers the very
      // shortcuts being edited, one of which may be the half-built rule that
      // opened it.
      settings: { ...this.settings, showQuickDates: false },
      onPick: (day) => {
        this.onPick(day);
        this.close();
      },
      onClose: () => this.close(),
    });

    this.contentEl.append(panel.dom);
    panel.focus();
  }
}

/**
 * The list under the rule field.
 *
 * Chained: choosing a token appends it with a space and opens the list again
 * for the next one, so a whole rule is assembled without typing between picks.
 * **— Done —** heads the list once the rule reads, and Escape does the same
 * thing — both leave what has been typed alone.
 *
 * The reopen goes through an `input` event rather than `open()`, because the
 * suggestions are re-queried by the input listener: opening on its own would
 * show the list that was built for the previous token.
 */
class RuleSuggest extends AbstractInputSuggest<string> {
  constructor(
    app: App,
    private readonly input: HTMLInputElement,
    private readonly onPicked: (value: string) => void,
  ) {
    super(app, input);
    // The list is about the token the caret is in, so it has to be asked again
    // whenever the caret moves — and moving a caret fires no `input` event.
    // A click is handled rather than the focus that precedes it: at focus time
    // the browser has not yet placed the caret where the pointer went, so the
    // answer would be about wherever it used to be.
    const reask = (): void => {
      input.dispatchEvent(new Event("input"));
    };

    input.addEventListener("focus", reask);
    input.addEventListener("click", reask);
    input.addEventListener("keyup", (event) => {
      // Not the vertical arrows: those are the reader moving through the list,
      // and re-asking would drop them back at the top of it.
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) reask();
    });
  }

  protected getSuggestions(query: string): string[] {
    const caret = this.caret();
    const tokens = suggestionsFor(query, caret);
    // Only at the end of a rule that reads: mid-rule there is nothing to be
    // done with, and an unfinished rule has nothing to stop.
    const done = caret === query.length && query.endsWith(" ") && checkRule(query.trim()) === null;

    return done ? [DONE, ...tokens] : tokens;
  }

  renderSuggestion(token: string, el: HTMLElement): void {
    if (token === DONE) {
      el.createSpan({
        cls: "kalendae-quick-suggestion-done",
        text: t("settings.quickDates.modal.done"),
      });
      return;
    }

    el.createSpan({ cls: "kalendae-quick-suggestion-token", text: token });
    el.createSpan({ cls: "kalendae-quick-suggestion-meaning", text: meaningOf(token) });
  }

  selectSuggestion(token: string): void {
    if (token === DONE) {
      // Out of the field, not merely out of the list: a list closed under a
      // caret still in the field is one keystroke from being back.
      this.input.blur();
      this.close();
      return;
    }

    const value = this.input.value;
    const { from, to } = tokenAt(value, this.caret());
    const ending = to === value.length;
    const next = value.slice(0, from) + token + (ending ? " " : "") + value.slice(to);
    const caret = from + token.length + (ending ? 1 : 0);

    this.setValue(next);
    this.onPicked(next);
    this.input.setSelectionRange(caret, caret);

    // At the end, the list opens again for the token after this one. In the
    // middle of a rule the reader came to fix one token, and has.
    if (ending) this.input.dispatchEvent(new Event("input"));
    else this.close();
  }

  private caret(): number {
    return this.input.selectionStart ?? this.input.value.length;
  }
}

/**
 * What an offered token means, in the reader's language.
 *
 * The anchors get a sentence of their own rather than the name a reading uses:
 * "today Today" said nothing to anyone meeting the field for the first time.
 */
function meaningOf(token: string): string {
  if (token === "today" || token === "date") return t(`settings.quickDates.modal.starts.${token}`);
  const step = stepFor(token);

  return step === null ? "" : stepGloss(step);
}

/**
 * Opens the editor on whatever the slot held, a preset included — saving turns
 * it into a rule of the reader's own, name and all.
 *
 * Takes the settings whole rather than in pieces: the calendar dialog needs
 * them, and week edges follow the week-start among them.
 */
export function editQuickDate(
  app: App,
  settings: KalendaeSettings,
  slot: QuickSlot,
  onSave: (slot: QuickSlot) => void,
): void {
  new QuickDateModal(app, settings, slot, onSave).open();
}
