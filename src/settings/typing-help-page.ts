import { Setting, SettingPage, moment } from "obsidian";
import { renderPattern } from "../detect/formats";
import { DayKey, firstDayOf, todayKey } from "../picker/month";
import { KalendaeSettings, formatCharOf, triggerOf } from "../settings";
import { parseTyped, resolveRule } from "../picker/quick";
import { t } from "../i18n/i18n";

/**
 * How to type a date, in four steps and a worked example of each way in.
 *
 * The list already teaches half of this: open it on the trigger alone and
 * every row carries the keyword that produces it. What no reader will ever
 * guess is that the other two ways exist at all — that `next friday` is read,
 * and that a day can be named outright — so the page's whole job is to show
 * the three grammars side by side.
 *
 * **Every example resolves against today.** They are computed here through the
 * same `parseTyped` the suggester uses, so the page cannot drift from what the
 * plugin does, and a date on it is never stale. The ones that cannot go through
 * a rule — a named day — carry their own explicit answer instead.
 *
 * Every heading carries its own explanation, joined to it with an em dash
 * rather than set on the line below. Seven headings on one page is seven lines
 * of description, and the page is a reference: it is read by scanning down the
 * left edge, which a second line under every heading defeats.
 */
export class TypingHelpPage extends SettingPage {
  constructor(private readonly settings: () => KalendaeSettings) {
    super();
    this.title = t("settings.typingHelp.heading");
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.addClass("kalendae-settings-page", "kalendae-typing-help");

    const settings = this.settings();
    const trigger = triggerOf(settings);
    const today = todayKey();
    const firstDay = firstDayOf(settings.weekStart);

    this.step("start", { trigger });
    this.block([{ typed: trigger, note: t("settings.typingHelp.start.note") }]);

    this.step("say");

    this.way("shorthand");
    this.block(
      [
        { query: "1d" },
        { query: "2w" },
        { query: "eom", note: t("settings.typingHelp.shorthand.eom") },
        { query: "2w EoW", note: t("settings.typingHelp.shorthand.chain") },
      ].map((row) => this.resolved(row, trigger, today, firstDay)),
    );

    this.way("words");
    this.block(
      [{ query: "next friday" }, { query: "in three weeks" }, { query: "3 months ago" }].map(
        (row) => this.resolved(row, trigger, today, firstDay),
      ),
    );

    this.way("named");
    this.block(namedExamples(trigger, today));

    this.step("format", { character: formatCharOf(settings) });
    this.step("accept");

    // A step like the others, so it takes the same rule above it and carries
    // its own line: the three keys each say a piece of "the list is safe to
    // poke at", and nothing said the whole of it.
    this.step("tips");

    // The same two columns the examples use, rather than three settings rows:
    // a key and what it does line up the way an example and its answer do, and
    // a Setting apiece would put three rows of padding under the page for it.
    this.block(
      (["tab", "escape", "backspace"] as const).map((key) => ({
        typed: t(`settings.typingHelp.tips.${key}.key`),
        note: t(`settings.typingHelp.tips.${key}.text`),
      })),
    );
  }

  /**
   * One numbered step, as a heading carrying the line that separates it.
   *
   * The heading holds the border rather than the rows below it, so a rule
   * always sits above a title rather than floating in a gap. `border-radius: 0`
   * in the stylesheet is what keeps it a rule: `.setting-item` carries
   * `--setting-items-radius`, and a border on a row Obsidian has not squared
   * draws a rounded box instead.
   */
  private step(key: string, vars: Record<string, string> = {}): void {
    new Setting(this.containerEl)
      .setClass("kalendae-help-step")
      .setName(headingText(`settings.typingHelp.${key}`, vars))
      .setHeading();
  }

  /** One of the three ways to say a day, inside step 2 and subordinate to it. */
  private way(key: string): void {
    new Setting(this.containerEl)
      .setClass("kalendae-help-way")
      .setName(headingText(`settings.typingHelp.${key}`));
  }

  /**
   * A block of worked examples: what you type, what it means, what you get.
   *
   * Hung inside a `Setting` rather than beside one. A bare div in the container
   * misses the side padding every settings row has, which left the examples
   * outdented from the headings they belong to — the same reason the sections
   * page puts its sample inside one.
   */
  private block(rows: ExampleRow[]): void {
    const holder = new Setting(this.containerEl).setClass("kalendae-help-block");
    const table = holder.settingEl.createDiv({ cls: "kalendae-help-examples" });

    for (const row of rows) {
      const line = table.createDiv({ cls: "kalendae-help-example" });

      // A `code` element inside the cell rather than a background on the cell
      // itself: a table cell fills the row's height, so the tint would draw a
      // band across the line instead of hugging the text.
      line.createSpan({ cls: "kalendae-help-typed" }).createEl("code", { text: row.typed });
      line.createSpan({ cls: "kalendae-help-note", text: row.note ?? "" });
      line.createSpan({ cls: "kalendae-help-result", text: row.result ?? "" });
    }
  }

  /** An example whose answer comes from the real parser, or nothing if it cannot. */
  private resolved(
    row: { query: string; note?: string },
    trigger: string,
    today: DayKey,
    firstDay: number,
  ): ExampleRow {
    const rule = parseTyped(row.query);
    const day = rule === null ? null : resolveRule(rule, { value: today, today, firstDay });

    return {
      typed: `${trigger}${row.query}`,
      note: row.note,
      // The year on every answer, including the ones a week away. Half the
      // page names a year outright, and a column that shows one on some rows
      // and not others reads as a difference in meaning rather than in date.
      result: day === null ? "" : moment.utc(day).format("D MMM YYYY"),
    };
  }
}

interface ExampleRow {
  /** The text a reader types, trigger included — or a key, in the tips block. */
  typed: string;
  /** What it means, where the words alone do not say. */
  note?: string;
  /** The date it lands on, as the page is opened. */
  result?: string;
}

/**
 * A heading and its explanation on one line, the explanation muted.
 *
 * A fragment rather than a string, so the two halves can be styled apart: run
 * together in one string the whole line would take the heading's weight, and
 * the explanation would stop reading as an aside.
 */
function headingText(key: string, vars: Record<string, string> = {}): DocumentFragment {
  return createFragment((fragment) => {
    fragment.createSpan({ text: t(`${key}.name`, vars) });
    fragment.createSpan({
      cls: "kalendae-help-aside",
      text: ` — ${t(`${key}.desc`, vars)}`,
    });
  });
}

/**
 * The three named-day examples, in the reader's own month names.
 *
 * Built here rather than resolved through a rule, because naming a day is not
 * a rule — `absolute.ts` answers it, and it answers with two years at once.
 *
 * **Two dates on the first row, and the note says so.** A single answer there
 * was the page's one outright lie: `@Nov 3` produces the November behind and
 * the one ahead, and showing the forward one alone made a choice look settled.
 * The second row exists to say what buys you a single answer — typing the year
 * — which nothing else on the page states.
 *
 * The month names come from moment, so a Russian vault reads `@ноя 3` and the
 * example is one the reader can type back.
 */
function namedExamples(trigger: string, today: DayKey): ExampleRow[] {
  const short = moment.monthsShort();
  const forward = yearFor(today, 10, 3);
  const typed = today.year + 1;

  return [
    {
      typed: `${trigger}${short[10]} 3`,
      note: t("settings.typingHelp.named.two"),
      // Forward first, which is the order the list puts them in and so the one
      // Enter takes. The nearest one back is the year before it: a given day
      // and month comes round once a year.
      result: [forward, forward - 1]
        .map((year) => renderPattern("D MMM YYYY", { year, month: 10, day: 3 }))
        .join(RESULT_SEPARATOR),
    },
    {
      typed: `${trigger}3 ${short[10]} ${typed}`,
      note: t("settings.typingHelp.named.one"),
      result: renderPattern("D MMM YYYY", { year: typed, month: 10, day: 3 }),
    },
    {
      typed: `${trigger}${sharedMonthPrefix(moment.months()) ?? ENGLISH_PREFIX} 13`,
      note: t("settings.typingHelp.named.prefix"),
      // No dates. A prefix naming two months answers with four rows, which will
      // not fit the column, and the note is the answer in any case.
    },
  ];
}

/**
 * Separates two answers on one row.
 *
 * The middle dot rather than a comma, for the reason the scope summary already
 * settled: a comma and a space is English typography, where Chinese and
 * Japanese enumerate with a comma of their own and no space.
 */
const RESULT_SEPARATOR = " · ";

/** Where no month name in the reader's language shares a prefix with another. */
const ENGLISH_PREFIX = "ma";

/**
 * A two-letter prefix that names more than one month, in the reader's own
 * language.
 *
 * The example is worth showing because a reader will type half a month name by
 * accident long before they do it on purpose, and the list answering with four
 * dates is unnerving until you know why. Which two letters do it is a fact
 * about the language: English and Russian answer `ma`, German and French `ju`.
 *
 * Null where the language has no such pair, which is the three that number
 * their months — `10月`, `11月` and `12月` share a prefix of digits, and a
 * prefix of digits alone is deliberately not read as a month. Those fall back
 * to English, which is typable in every language and so demonstrates the rule
 * even where the reader's own months cannot.
 */
function sharedMonthPrefix(months: string[]): string | null {
  for (const name of months) {
    const prefix = name.slice(0, 2).toLowerCase();
    if (!/\p{L}/u.test(prefix)) continue;

    const named = months.filter((month) => month.toLowerCase().startsWith(prefix));
    if (named.length > 1) return prefix;
  }

  return null;
}

/** The nearest year forward in which that day falls, today counting. */
function yearFor(today: DayKey, month: number, day: number): number {
  const thisYear = month > today.month || (month === today.month && day >= today.day);

  return thisYear ? today.year : today.year + 1;
}
