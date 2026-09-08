import { App, ButtonComponent, Modal, Setting, setIcon } from "obsidian";
import {
  FormatProblem,
  FormatWarning,
  LITERAL_SAMPLE,
  TOKEN_GROUPS,
  checkFormat,
  renderExample,
  warnFormat,
  tokenGroupsPresent,
} from "../detect/formats";
import { t } from "../i18n/i18n";

/**
 * The editor for one custom format.
 *
 * A modal rather than a settings sub-page. Owning the format rows means
 * rendering them ourselves, and a rendered row cannot also be a navigable
 * page — Obsidian offers no way to open one from code. The modal is the
 * better trade anyway: Save and Cancel do what their labels say, and Save is
 * simply unavailable while the format is unusable, so there is no rule about
 * discarding on exit for the user to be caught out by.
 */
export class FormatModal extends Modal {
  private draft: string;
  private save: ButtonComponent | null = null;
  private result: HTMLElement | null = null;
  private problem: HTMLElement | null = null;
  private readonly marks = new Map<string, HTMLElement>();

  constructor(
    app: App,
    pattern: string,
    private readonly onSave: (pattern: string) => void,
  ) {
    super(app);
    this.draft = pattern;
  }

  onOpen(): void {
    this.setTitle(t("settings.formats.modal.title"));
    this.contentEl.addClass("kalendae-settings-page");

    // Vocabulary first, then the field it is there to help you fill, then what
    // that field produces. Reference, work, result — reading downwards.
    this.renderTokens();

    // The field and what it produces, on one line. Two rows made the reader
    // carry the pattern down the dialog to check it; here the answer is beside
    // the question, and there is nothing left to label.
    const field = new Setting(this.contentEl)
      .setName(t("settings.formats.modal.pattern"))
      .setClass("kalendae-format-field")
      .addText((text) =>
        text.setValue(this.draft).onChange((value) => {
          this.draft = value;
          this.refresh();
        }),
      );

    field.controlEl.createSpan({ cls: "kalendae-format-arrow", text: "→" });
    this.result = field.controlEl.createSpan({ cls: "kalendae-format-result" });

    // The reason Save is unavailable. On the row's own left edge rather than
    // pressed against the buttons, where a long message would crowd them.
    const actions = new Setting(this.contentEl).setClass("kalendae-format-actions");
    this.problem = actions.infoEl.createSpan({ cls: "kalendae-format-problem" });

    actions
      .addButton((button) =>
        button.setButtonText(t("settings.formats.modal.cancel")).onClick(() => this.close()),
      )
      .addButton((button) => {
        this.save = button
          .setButtonText(t("settings.formats.modal.save"))
          .setCta()
          .onClick(() => {
            this.onSave(this.draft);
            this.close();
          });
      });

    this.refresh();
  }

  /**
   * The token vocabulary, one row per part of a date, ticked or crossed as the
   * pattern gains or loses it.
   *
   * A grid rather than a `<table>`: Obsidian and themes both style tables, and
   * the rules they draw could not be reliably removed — two attempts at
   * outranking them failed. Nothing styles a plain div, so the columns are laid
   * out here and nowhere else. Built from TOKEN_GROUPS rather than written out
   * by hand, so the list the user reads is the list the compiler implements —
   * a token added to one is a token added to both.
   */
  private renderTokens(): void {
    const table = this.contentEl.createDiv({ cls: "kalendae-format-tokens" });
    table.setAttribute("role", "table");

    const head = this.tokenRow(table);
    for (const column of ["tokens", "meaning", "used"] as const) {
      const cell = head.createDiv({
        cls: "kalendae-format-token-head",
        text: t(`settings.formats.modal.columns.${column}`),
      });
      cell.setAttribute("role", "columnheader");
    }

    for (const group of TOKEN_GROUPS) {
      const row = this.tokenRow(table);
      this.tokenCell(row, "kalendae-format-token-list", group.tokens.join("  "));

      const name = this.tokenCell(row, "kalendae-format-token-name", "");
      name.appendText(t(`settings.formats.modal.groups.${group.key}`));
      name.createSpan({
        cls: "kalendae-format-token-need",
        text: t(
          group.required ? "settings.formats.modal.required" : "settings.formats.modal.optional",
        ),
      });

      // Only the required parts are marked. A tick against the day of the week
      // would claim a format is missing something when leaving it out is a
      // perfectly good format — the word "(Optional)" already says all there is
      // to say about it.
      const cell = this.tokenCell(row, "kalendae-format-token-mark", "");
      if (group.required) {
        this.marks.set(group.key, cell.createSpan({ cls: "kalendae-format-mark" }));
      }
    }

    // Punctuation, last, and with an empty third cell: there is nothing to tick,
    // because there is no requirement to meet. It earns its row by answering the
    // question the four above it raise — what may go between the tokens. The
    // ellipsis after the samples is doing real work: what a pattern may hold is
    // everything that is not a letter, which is far longer than a row.
    const literal = this.tokenRow(table);
    const shown = `${LITERAL_SAMPLE.join("  ")}  …`;
    this.tokenCell(literal, "kalendae-format-token-list", shown);
    this.tokenCell(literal, "kalendae-format-token-name", t("settings.formats.modal.groups.literal"));
    this.tokenCell(literal, "kalendae-format-token-mark", "");
  }

  /**
   * One row of the token grid.
   *
   * The row exists for the reader, not the layout: it carries the role that
   * makes three loose cells a row to a screen reader, while `display: contents`
   * keeps the cells themselves in the grid so the columns line up across rows.
   */
  private tokenRow(table: HTMLElement): HTMLElement {
    const row = table.createDiv({ cls: "kalendae-format-token-row" });
    row.setAttribute("role", "row");
    return row;
  }

  private tokenCell(row: HTMLElement, cls: string, text: string): HTMLElement {
    const cell = row.createDiv({ cls, text });
    cell.setAttribute("role", "cell");
    return cell;
  }

  /**
   * The preview always shows what the pattern produces, even while part of it
   * is unsupported — seeing the part that works is more use than being told
   * only what is wrong. The checklist says what is still missing, and Save
   * being unavailable says the rest.
   */
  private refresh(): void {
    this.result?.setText(renderExample(this.draft));

    const present = tokenGroupsPresent(this.draft);
    for (const group of TOKEN_GROUPS) {
      const mark = this.marks.get(group.key);
      if (!mark) continue;
      const have = present.has(group.key);
      mark.toggleClass("kalendae-format-mark-missing", !have);
      setIcon(mark, have ? "check" : "x");
    }

    const problem = checkFormat(this.draft);
    const warning = problem ? null : warnFormat(this.draft);
    const empty = this.draft === "";

    // One line, three jobs. An empty field is not a mistake but a start, so it
    // gets ordinary text; a warning is advice about a format that will save; an
    // error is the reason Save is unavailable. Only one is ever shown, and a
    // problem outranks a warning about the same run of digits.
    this.problem?.setText(this.line(empty, problem, warning));
    this.problem?.toggleClass("kalendae-format-problem-error", !empty && problem !== null);
    this.problem?.toggleClass("kalendae-format-problem-warning", !empty && warning !== null);
    this.save?.setDisabled(problem !== null);
  }

  private line(empty: boolean, problem: FormatProblem | null, warning: FormatWarning | null): string {
    if (empty) return t("settings.formats.modal.hint");
    if (problem) return describe(problem);
    if (warning) return t("settings.formats.modal.warning", { digits: warning.digits });
    return "";
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** The one problem worth reporting, in words. */
function describe(problem: FormatProblem): string {
  switch (problem.code) {
    case "missing-component":
      return t(`settings.formats.modal.problem.missing.${problem.component}`);
    case "unknown-tokens":
      return t("settings.formats.modal.problem.unknownTokens", { chars: problem.chars });
    case "bracket-pair":
      return t("settings.formats.modal.problem.brackets");
    case "adjacent-numbers": {
      const names = { first: problem.first, second: problem.second };
      if (problem.widen.length === 0) {
        return t("settings.formats.modal.problem.adjacent", names);
      }
      if (problem.widen.length === 1) {
        return t("settings.formats.modal.problem.adjacentWiden", {
          ...names,
          from: problem.widen[0].from,
          to: problem.widen[0].to,
        });
      }
      return t("settings.formats.modal.problem.adjacentWidenBoth", {
        ...names,
        firstFixed: problem.widen[0].to,
        secondFixed: problem.widen[1].to,
      });
    }
  }
}
