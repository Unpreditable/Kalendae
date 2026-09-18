import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  MarkdownView,
  TFile,
  moment,
} from "obsidian";
import { syntaxTree } from "@codemirror/language";
import { SCOPE_SETTING, classifyContext, frontmatterEnd } from "../detect/context";
import { FRONTMATTER_PREFIX } from "../detect/detect";
import { DayKey, firstDayOf, todayKey } from "../picker/month";
import { Rule, Step, UNITS, WEEKDAYS, presetsAnchoredOn } from "../picker/quick";
import { stepGloss } from "../picker/quick-text";
import { insertionFor } from "../picker/write";
import { KalendaeSettings } from "../settings";
import { Entry, NamedDate, entriesFor } from "../typing/entries";
import { triggerAt } from "../typing/trigger";
import { t } from "../i18n/i18n";
import { editorViewIn } from "./DatePickerExtension";

/**
 * The list of dates that opens while you type.
 *
 * Obsidian's own popup, which is why this class is as thin as it is: the
 * keyboard, the positioning, the mobile behaviour and the theming are the
 * app's, and every rule about what a query means lives in `typing/`, where it
 * can be tested. Nothing is decided here that a test could have caught.
 *
 * The query is real text in the note the whole time — there is no input box —
 * so an abandoned query stays as text, exactly like an abandoned `[[`.
 */
export class KalendaeDateSuggest extends EditorSuggest<Entry> {
  constructor(
    app: App,
    private readonly settings: () => KalendaeSettings,
  ) {
    super(app);

    // Every candidate the language can offer — twenty-seven at the widest, for
    // a step with nothing typed into it yet. How many of those are *visible* is
    // a height, not a count, and `styles.css` caps it at eight rows and lets
    // the rest scroll: cutting the list short instead threw away tokens a
    // reader had no other way to reach.
    this.limit = 50;

    // Tab completes, Enter writes. The two are different questions — "carry on
    // building this date" and "this is the date" — and a chain needs the first
    // one to be a single key.
    this.scope.register([], "Tab", (event) => {
      const chooser = this.chooser();
      if (chooser === null) return true;

      chooser.useSelectedItem(event);

      return false;
    });
  }

  /**
   * The range the write replaces, which is not the range Obsidian is told.
   *
   * Obsidian opens the popup at the start of what it is given, and the start of
   * the query is the trigger — so a long query walks the menu further and
   * further from the caret the reader is watching. It is handed the caret at
   * both ends, which is where the popup then appears, and the real range is
   * kept here for `selectSuggestion`. Set on every keystroke, since `onTrigger`
   * runs on each one.
   */
  private range: WriteRange | null = null;

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    _file: TFile | null,
  ): EditorSuggestTriggerInfo | null {
    const found = triggerAt(editor.getLine(cursor.line), cursor.ch, TRIGGER);
    if (found === null) {
      this.range = null;
      return null;
    }

    const start = { line: cursor.line, ch: found.from };
    if (!this.inScope(editor, start)) {
      this.range = null;
      return null;
    }

    this.range = { start, end: cursor };

    return { start: cursor, end: cursor, query: found.query };
  }

  getSuggestions(context: EditorSuggestContext): Entry[] {
    const settings = this.settings();

    const today = todayKey();
    const firstDay = firstDayOf(settings.weekStart);

    return entriesFor(context.query, { today, firstDay, names: catalogue(today, firstDay) });
  }

  renderSuggestion(entry: Entry, el: HTMLElement): void {
    if (entry.kind === "invalid") {
      const text = entry.reason === "count" ? t("typing.countTooBig") : t("typing.invalid");

      el.createSpan({ cls: "kalendae-suggest-invalid", text });
      return;
    }

    // The row that takes the date as it stands is the odd one out and is
    // coloured as such: every other row adds something, and this one is the way
    // out. Its keyword column is kept but left empty — the keyword is what the
    // reader already typed, and the columns to its right only read as columns
    // while every row starts them in the same place.
    const accepting = entry.kind === "accept" ? " kalendae-suggest-accepting" : "";

    el.addClass("kalendae-suggest-row");
    el.createSpan({ cls: `kalendae-suggest-label${accepting}`, text: labelFor(entry) });
    el.createSpan({
      cls: "kalendae-suggest-keyword",
      text: entry.kind === "accept" ? "" : entry.keyword,
    });
    el.createSpan({ cls: `kalendae-suggest-day${accepting}`, text: dayText(entry.day) });
  }

  /**
   * Writes the date, or closes on the invalid row without touching the text.
   *
   * `insertionFor` is the insert command's own write, so the spacing rule that
   * keeps an inserted date findable again is not reimplemented here. The range
   * runs from the trigger character to the caret, so the trigger is consumed
   * along with the query that was typed after it.
   */
  selectSuggestion(entry: Entry, evt: MouseEvent | KeyboardEvent): void {
    const context = this.context;
    if (context === null) return;

    if (entry.kind === "invalid") {
      this.close();
      return;
    }

    const range = this.range;
    if (range === null) return;

    // Tab completes, except on the row that is already complete: there is
    // nothing to add to `@Sun `, so the key writes the date rather than the
    // same text over again.
    if (evt instanceof KeyboardEvent && evt.key === "Tab" && entry.kind !== "accept") {
      this.complete(entry, range);
      return;
    }

    const { editor } = context;
    const from = editor.posToOffset(range.start);
    const insert = insertionFor(
      editor.getValue(),
      from,
      editor.posToOffset(range.end),
      this.settings().formats[0].pattern,
      entry.day,
    );

    editor.replaceRange(insert, range.start, range.end);
    editor.setCursor(editor.offsetToPos(from + insert.length));
  }

  /**
   * Writes the row's completion into the note and leaves the menu open.
   *
   * The row's own text, not its name: what is written has to go on being a
   * query, and `@Tomorrow ` is a sentence the parser has no reading for. It
   * keeps whatever the reader has already typed word for word and puts the new
   * token after it, so `@today ` plus a step is `@today +1d ` and not `@+1d `.
   * The trailing space is the invitation — `onTrigger` runs again on the change
   * and the menu comes back offering what can follow.
   */
  private complete(entry: Extract<Entry, { kind: "named" | "step" }>, range: WriteRange): void {
    const editor = this.context?.editor;
    if (editor === undefined) return;

    const text = `${TRIGGER}${entry.complete}`;
    const from = editor.posToOffset(range.start);

    editor.replaceRange(text, range.start, range.end);
    editor.setCursor(editor.offsetToPos(from + text.length));
  }

  /**
   * The row the reader has highlighted, which the public API does not expose.
   *
   * `EditorSuggest` owns a chooser and Enter goes through it; Tab has to reach
   * the same selection to mean anything, and there is no method for that on
   * `PopoverSuggest`. The shape is checked before it is called, so a build of
   * Obsidian that renames it leaves Tab doing nothing rather than throwing:
   * the key falls through and every other way in still works.
   */
  private chooser(): Chooser | null {
    const held = (this as unknown as { suggestions?: Partial<Chooser> }).suggestions;

    return held !== undefined && typeof held.useSelectedItem === "function"
      ? (held as Chooser)
      : null;
  }

  /**
   * Whether the plugin works where the caret is.
   *
   * The scope toggles, not `commandScopes`: a command is asked for by name and
   * treats every context as plain text, but a menu that opens itself is not
   * asked for. `@property`, `@media` and `@Override` are the false fires that
   * matter, and all three live in code.
   *
   * No editor view means no scope information, which is answered as prose: a
   * suggester that cannot tell where it is should behave as it does in the
   * common case rather than refuse to open at all.
   */
  private inScope(editor: Editor, at: EditorPosition): boolean {
    const content = this.app.workspace.getActiveViewOfType(MarkdownView)?.contentEl;
    const view = content ? editorViewIn(content) : null;
    if (view === null) return true;

    // `syntaxTree`, not `ensureSyntaxTree`, and the exception is narrow enough
    // to name: the caret is on screen by definition, so the parser has already
    // reached it. `detectIn` pays for the tree because it answers about a whole
    // range that may run past the viewport; this answers about one offset the
    // reader is looking at.
    const offset = editor.posToOffset(at);
    const settings = this.settings();
    const context = classifyContext(
      syntaxTree(view.state),
      frontmatterEnd(view.state.doc.sliceString(0, Math.min(offset, FRONTMATTER_PREFIX))),
      offset,
      offset,
    );

    return context.scope === "prose" || settings[SCOPE_SETTING[context.scope]];
  }
}

/**
 * The range a write replaces: the trigger character through the caret.
 *
 * Not named `Range`: this file touches the DOM, and shadowing that global with
 * something unrelated is a trap for whoever reads it next.
 */
interface WriteRange {
  start: EditorPosition;
  end: EditorPosition;
}

/** As much of Obsidian's suggestion chooser as Tab needs, and no more. */
interface Chooser {
  useSelectedItem(event: KeyboardEvent): void;
}

/** Fixed until the settings land. */
const TRIGGER = "@";

/**
 * Every named date the list offers, curated first.
 *
 * Today is not in `QUICK_PRESETS` — the calendar's Today button is permanent
 * and unconfigurable, so it was never a preset — and `today` alone is not a
 * rule either. It is the rule-less `NamedDate`, and it reuses the button's own
 * string rather than adding a second "Today" to translate. The presets that
 * count from a date in the note are left out: there is no date in the note
 * where this is used.
 *
 * Order is the only ranking here. The curated names are what `@` opens with,
 * and everything generated below them is a letter or a scroll away — a flag
 * saying which half a row is in would say exactly what its position says.
 *
 * Nothing generated below adds a string. The labels are the glosses the
 * settings builder already reads rules back with, and the day names are
 * moment's, which is where the calendar grid gets its own — so a reader in any
 * language types their own words at a list nobody translated for this.
 */
function catalogue(today: DayKey, firstDay: number): NamedDate[] {
  return [
    { label: t("picker.today"), rule: null },
    ...presetsAnchoredOn("today").map((preset) => ({
      label: t(`settings.quickDates.presets.${preset.id}`),
      rule: preset.rule,
    })),
    ...weekdayRows(today, firstDay),
    ...unitRows(),
  ];
}

/**
 * Next and last for each of the seven days, and this one only where it means
 * something of its own.
 *
 * The catalogue carries next Monday and next Friday and nothing for the other
 * five, which was the right call for a row of four buttons under a calendar and
 * the wrong one for a list you type at. Both of those are generated here too,
 * and dropped as duplicates of the presets that already say them.
 *
 * `this Friday` and `next Friday` are the same date on every day except Friday,
 * so the first is offered only on the day itself — where it is today, and the
 * other two are a week away in either direction.
 *
 * The days run from the reader's own first day of the week, not from moment's
 * Sunday, so the list reads in the order their calendar does.
 */
function weekdayRows(today: DayKey, firstDay: number): NamedDate[] {
  const names = moment.weekdays();
  const todayIndex = moment.utc(today).day();
  const fromFirstDay = WEEKDAYS.map((_, offset) => (firstDay + offset) % WEEKDAYS.length);

  return fromFirstDay.flatMap((index) => {
    const row = (gloss: string, step: string): NamedDate => ({
      label: capitalised(t(`settings.quickDates.steps.${gloss}`, { day: names[index] })),
      rule: `today ${step}`,
    });
    const short = WEEKDAYS[index];
    const rows = [row("weekdayNext", `+1${short}`), row("weekdayPrevious", `-1${short}`)];

    return index === todayIndex ? [row("weekdayThis", short), ...rows] : rows;
  });
}

/**
 * One step forward and back for each unit.
 *
 * `+1d` and `-1d` are Tomorrow and Yesterday, which the catalogue already
 * carries. They are generated anyway and dropped by the deduplication, rather
 * than special-cased into a loop that would then have to explain itself.
 */
function unitRows(): NamedDate[] {
  return UNITS.flatMap((unit) => {
    const amount = t(`settings.quickDates.steps.amount_${unit}`, { count: 1 });

    return [
      {
        label: capitalised(t("settings.quickDates.steps.forward", { amount })),
        rule: `today +1${unit}`,
      },
      {
        label: capitalised(t("settings.quickDates.steps.back", { amount })),
        rule: `today -1${unit}`,
      },
    ];
  });
}

/**
 * What a row reads as: a name says its own name, a step says the step it would
 * add, and the row that takes the date as it stands says so in words — its
 * keyword column is empty, and "Sun" alone does not read as an answer.
 */
function labelFor(entry: Exclude<Entry, { kind: "invalid" }>): string {
  if (entry.kind === "named") return entry.label;
  if (entry.kind === "accept") return t("typing.accept");

  return stepGloss(lastStep(entry.rule));
}

/**
 * The step a row would add, which is the only part worth reading back.
 *
 * Not the whole rule: with `@2w ` already typed, every row would open with
 * "2 weeks on →" and repeat what is on screen a line above. The row answers
 * "and then what", so it reads as the step alone.
 */
function lastStep(rule: Rule): Step {
  return rule.steps[rule.steps.length - 1];
}

/**
 * A generated label, with the capital a list entry wants.
 *
 * The glosses are written lowercase because the settings builder reads them
 * inside a sentence — "Today → next Friday" — and a capital in the middle of
 * that would be wrong. Here they are entries in a list beside "Tomorrow" and
 * "End of month", where lowercase is what looks wrong instead. The one place
 * that differs is the point of use, so that is where it is fixed.
 *
 * Only the first character, which is a no-op in a script that has no cases.
 */
function capitalised(label: string): string {
  return label.charAt(0).toLocaleUpperCase() + label.slice(1);
}

/** The day on a row, short enough to sit at the end of it. */
function dayText(day: DayKey): string {
  return moment.utc(day).format("D MMM");
}
