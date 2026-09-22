import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  KeymapEventHandler,
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
import { KalendaeSettings, enabledLocales, formatCharOf, triggerOf } from "../settings";
import { Spelling } from "../typing/absolute";
import { Entry, NamedDate, entriesFor, localeOf } from "../typing/entries";
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

    this.bindFormatKey(formatCharOf(this.settings()));

    // The popup's own box, marked so `styles.css` can cap its height without
    // touching any other suggester's. Not public API, so the shape is checked:
    // a build that renames it leaves the list at Obsidian's own height, which
    // is longer rather than broken — the same bargain `chooser()` makes.
    const box = (this as unknown as { suggestEl?: unknown }).suggestEl;
    if (box instanceof HTMLElement) box.addClass("kalendae-suggest");
  }

  /**
   * The key that opens the formats, rebound when the setting changes.
   *
   * The format character asks the third question — "this date, written which
   * way" — and it asks it of the row the reader has arrowed to, which is why
   * it goes through the chooser rather than reading the text. Null modifiers
   * rather than none: `_` is shifted on most layouts and a character someone
   * else sets may not be.
   *
   * Rebound rather than registered once against every key. A handler on a null
   * key matches every keypress in the popup, including the arrows and Enter
   * that Obsidian's own chooser is listening for, and that is too much to put
   * in the way of a list that already works.
   */
  private formatKey: { character: string; handler: KeymapEventHandler } | null = null;

  private bindFormatKey(character: string): void {
    if (this.formatKey?.character === character) return;
    if (this.formatKey !== null) this.scope.unregister(this.formatKey.handler);

    this.formatKey = {
      character,
      handler: this.scope.register(null, character, (event) => {
        const chooser = this.chooser();
        if (chooser === null) return true;

        chooser.useSelectedItem(event);

        return false;
      }),
    };
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
    const settings = this.settings();
    if (!settings.typeToInsert) {
      // Nulled like every other early return: a range left behind is a write
      // aimed at text that has since moved.
      this.range = null;
      return null;
    }

    const found = triggerAt(editor.getLine(cursor.line), cursor.ch, triggerOf(settings));
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
    const formatChar = formatCharOf(settings);

    // The popup is open, so no key can have been pressed in it since the last
    // time this ran: rebinding here is early enough, and it is the one place
    // the settings are read on every keystroke.
    this.bindFormatKey(formatChar);

    const today = todayKey();
    const firstDay = firstDayOf(settings.weekStart);
    // The app's own language first. Where two languages read what was typed —
    // `ma` is March in English and marts in Latvian — the one listed first is
    // the one the date is written in, and a reader's own language should win.
    const app = moment.locale();
    const locales = [app, ...enabledLocales(settings, app).filter((code) => code !== app)];

    // Said here rather than once in the constructor: the last row depends on
    // how many formats are configured, and settings change under a running
    // plugin. `setInstructions` is a method, and this is the one place the
    // settings are already to hand on every keystroke.
    //
    // One word each. The four sit on a single line and the line sets the
    // popup's width, so "to insert the date" made the list half again as wide
    // as the rows it was describing.
    this.setInstructions([
      { command: "↑↓", purpose: t("typing.instructions.navigate") },
      { command: "↵", purpose: t("typing.instructions.accept") },
      // The word, not `⇥`: the glyph reads as an indent, where Obsidian's own
      // suggesters happily spell `esc` out beside `↑↓` and `↵`.
      { command: "Tab", purpose: t("typing.instructions.complete") },
      ...(settings.formats.length < 2
        ? []
        : [{ command: formatChar, purpose: t("typing.instructions.format") }]),
    ]);

    return entriesFor(context.query, {
      today,
      firstDay,
      months: monthNames(locales),
      names: catalogue(today, firstDay, weekdayNames(locales)),
      formats: settings.formats,
      formatChar,
    });
  }

  renderSuggestion(entry: Entry, el: HTMLElement): void {
    if (entry.kind === "invalid") {
      const text = entry.reason === "count" ? t("typing.countTooBig") : t("typing.invalid");

      el.createSpan({ cls: "kalendae-suggest-invalid", text });
      return;
    }

    // One column, because the row is the day. A keyword column would hold the
    // pattern, which is the thing the reader is being shown an example of
    // instead, and a day column would say the date a second time.
    if (entry.kind === "format") {
      el.addClass("kalendae-suggest-row");
      el.createSpan({ cls: "kalendae-suggest-label", text: entry.text });
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
      text: entry.kind === "accept" || entry.kind === "date" ? "" : entry.keyword,
    });
    el.createSpan({ cls: `kalendae-suggest-day${accepting}`, text: trailingText(entry) });
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

    const range = this.range;
    if (range === null) return;

    // Before the invalid row is dismissed, because the character has to reach
    // the note even where there is no date to act on: the handler has already
    // swallowed the keypress.
    if (evt instanceof KeyboardEvent && evt.key === formatCharOf(this.settings())) {
      this.switchFormat(entry, range);
      return;
    }

    if (entry.kind === "invalid") {
      this.close();
      return;
    }

    // Tab completes, except on a row with nothing left to add: there is nothing
    // to put after `@Sun ` or `@nov 3 2026`, so the key writes the date rather
    // than the same text over again.
    const completion = completionOf(entry);
    if (evt instanceof KeyboardEvent && evt.key === "Tab" && completion !== null) {
      this.complete(completion, range);
      return;
    }

    const { editor } = context;
    const from = editor.posToOffset(range.start);
    const insert = insertionFor(
      editor.getValue(),
      from,
      editor.posToOffset(range.end),
      // A format row was chosen for its pattern, which is the whole point of
      // it. Every other row takes the first format, as the insert command does.
      entry.kind === "format" ? entry.pattern : this.settings().formats[0].pattern,
      entry.day,
      // In the language the reader typed the month or weekday in, so `@ноя 3`
      // writes Russian into an English vault.
      localeOf(entry),
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
   * and the menu comes back offering what can follow. A named day is the
   * exception that leaves none: a space invites a step, and a named day takes
   * none.
   */
  /**
   * Completes the highlighted row into the note and opens the formats on it.
   *
   * The completion is trimmed, where Tab leaves its trailing space: a space
   * invites another step, and the format character ends the query rather than
   * continuing it. A row with nothing left to complete — Accept, a finished
   * named day — keeps the text as it stands, and so does a query with nothing
   * to act on. With one format configured, or on the invalid row, the character
   * is simply written as the ordinary character it is, and the list answers
   * whatever that text means.
   */
  private switchFormat(entry: Entry, range: WriteRange): void {
    const settings = this.settings();
    const query = this.context?.query ?? "";
    const completion =
      settings.formats.length < 2 || entry.kind === "invalid"
        ? query
        : (completionOf(entry) ?? query).trimEnd();

    this.complete(`${completion}${formatCharOf(settings)}`, range);
  }

  private complete(completion: string, range: WriteRange): void {
    const editor = this.context?.editor;
    if (editor === undefined) return;

    const text = `${triggerOf(this.settings())}${completion}`;
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


/**
 * Every spelling each month answers to in the reader's own language, January
 * first.
 *
 * Three forms, and the third is the one that is easy to miss. Russian lists
 * `ноябрь` and writes `3 ноября`; Lithuanian lists `lapkritis` and writes
 * `lapkričio`. The row shows the written form, so without it a reader typing
 * back what they are looking at fails on the last letter. moment gives it up to
 * `months()` when it is handed the format the name would be written in, which is
 * all `D MMMM` is doing: no date is rendered, the day only tells the locale
 * which of its two lists to answer from. Formatting a real date and stripping
 * the number off the front gives the same answer in every language this plugin
 * ships and a wrong one wherever moment writes digits outside ASCII: Obsidian
 * speaks Arabic where Kalendae does not, and there the `١` survives the strip
 * and sits on the front of all twelve names.
 *
 * English is not here. `absolute.ts` carries it, because it is a table in code
 * rather than anything the reader's language decides.
 *
 * Read through `moment.localeData(code)` rather than by switching locales:
 * `moment.locale(code)` changes what Obsidian itself formats dates with, which
 * is not a plugin's to change even for an instant.
 *
 * Rebuilt on every call, deliberately. A few lists are a fraction of what one
 * keystroke already costs — `catalogue()` reads some forty strings and
 * `entriesFor` resolves every row through moment — and a cache would have to
 * be keyed on the enabled set and on `moment.locale()`, since the reader can
 * change either with the app running. State to save microseconds is a bad
 * trade.
 */
function monthNames(locales: readonly string[]): Spelling[][] {
  const when = moment.utc({ year: 2026, month: 0, day: 1 });

  return MONTH_INDEXES.map((month) => {
    const on = when.clone().month(month);

    return spellings(locales, (data) => [
      data.months(on),
      data.monthsShort(on),
      data.months(on, "D MMMM"),
    ]);
  });
}

/**
 * Every spelling each weekday answers to, beyond the row's own label.
 *
 * Two forms, not the months' three: no locale moment carries writes a weekday
 * differently inside a date — checked element by element across all of them.
 * The declined Russian `в среду` is reachable only through a format carrying
 * a bracketed preposition, and `checkFormat()` refuses a bracket outright.
 *
 * Indexed by moment's day number, Sunday first, which is what `weekdayRows`
 * indexes its own names by.
 */
function weekdayNames(locales: readonly string[]): Spelling[][] {
  const when = moment.utc({ year: 2026, month: 0, day: 1 });

  return WEEKDAY_INDEXES.map((day) => {
    const on = when.clone().day(day);

    return spellings(locales, (data) => [data.weekdays(on), data.weekdaysShort(on)]);
  });
}

/**
 * One unit's names across the languages in force, without repeats.
 *
 * A spelling two languages share keeps the first one's code, which is why the
 * order `locales` arrives in matters: `septembris` is Latvian alone, but `Sep`
 * is English and Latvian both, and the one listed first writes the date.
 */
function spellings(
  locales: readonly string[],
  read: (data: ReturnType<typeof moment.localeData>) => string[],
): Spelling[] {
  const byText = new Map<string, string>();

  for (const locale of locales) {
    for (const text of read(moment.localeData(locale))) {
      if (!byText.has(text)) byText.set(text, locale);
    }
  }

  return [...byText].map(([text, locale]) => ({ text, locale }));
}

const MONTH_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];

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
function catalogue(today: DayKey, firstDay: number, aliases: Spelling[][]): NamedDate[] {
  return [
    { label: t("picker.today"), rule: null },
    ...presetsAnchoredOn("today").map((preset) => ({
      label: t(`settings.quickDates.presets.${preset.id}`),
      rule: preset.rule,
    })),
    ...weekdayRows(today, firstDay, aliases),
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
function weekdayRows(today: DayKey, firstDay: number, aliases: Spelling[][]): NamedDate[] {
  const names = moment.weekdays();
  const todayIndex = moment.utc(today).day();
  const fromFirstDay = WEEKDAYS.map((_, offset) => (firstDay + offset) % WEEKDAYS.length);

  return fromFirstDay.flatMap((index) => {
    const row = (gloss: string, step: string): NamedDate => ({
      label: capitalised(t(`settings.quickDates.steps.${gloss}`, { day: names[index] })),
      rule: `today ${step}`,
      // Every enabled language's names for this day. The label is the app's
      // own; these are the other ways to reach the row it names.
      aliases: aliases[index],
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
 * A row drawn in columns, which is every row but the two that are one span:
 * the invalid row and a format, both of which `renderSuggestion` answers and
 * returns on before it reaches any of this.
 */
type Drawn = Exclude<Entry, { kind: "invalid" } | { kind: "format" }>;

/**
 * What a row reads as: a name says its own name, a step says the step it would
 * add, and the row that takes the date as it stands says so in words — its
 * keyword column is empty, and "Sun" alone does not read as an answer.
 */
function labelFor(entry: Drawn): string {
  if (entry.kind === "named") return entry.label;
  if (entry.kind === "accept") return t("typing.accept");
  if (entry.kind === "date") return dateIn(entry.day, entry.locale).format("LL");

  return stepGloss(lastStep(entry.rule));
}

/**
 * What Tab would write, or null on a row that is already whole.
 *
 * The Accept row is whole by definition, and a named day is whole once its year
 * is in the text: `@nov 3` fills in the year, `@nov` fills in the day as well,
 * and `@nov 3 2026` has nothing left to fill in. A format row is the end of the
 * road — it is a date written out, with nothing to add to it — and the invalid
 * row has nothing to complete either.
 */
function completionOf(entry: Entry): string | null {
  return entry.kind === "named" || entry.kind === "step" || entry.kind === "date"
    ? entry.complete
    : null;
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

/**
 * The right-hand column: the day a row lands on, or its weekday where the row
 * is the day.
 *
 * A named day has already said its date in the label, where every other row
 * says a name or a step. The weekday is the one thing about it the reader
 * cannot read off what they typed, which is what earns it the space.
 */
function trailingText(entry: Drawn): string {
  return entry.kind === "date"
    ? dateIn(entry.day, entry.locale).format("ddd")
    : moment.utc(entry.day).format("D MMM");
}

/**
 * A day to show on a named-day row, in the language it will be written in.
 *
 * The row is a preview of what Enter writes, so `@ноя 3` reads as a Russian
 * date before it becomes one. `.locale()` on this moment only, never the global
 * one Obsidian formats its own dates with.
 */
function dateIn(day: DayKey, locale: string): moment.Moment {
  return moment.utc(day).locale(locale);
}
