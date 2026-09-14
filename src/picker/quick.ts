/**
 * The quick-date language: what a shortcut's rule is, how it is read, and how
 * it is written back.
 *
 * Pure, like `month.ts` beside it — no DOM, no editor, nothing from Obsidian
 * but `moment` — so every rule about what a shortcut means is unit-testable.
 *
 * Nobody types one of these. The builder in settings is the only way a rule is
 * made, and this is what it produces, what `data.json` holds and what the
 * catalogue is written in. The grammar is strict to the point of pedantry —
 * one spelling per meaning, no optional parts — because the only thing that
 * writes it is a program, and the only thing that reads it is this file.
 */

import { moment } from "obsidian";
import type { DayKey } from "./month";

export type Anchor = "today" | "date";

/** moment's own duration letters, and `m` is deliberately absent: it is minutes. */
export const UNITS = ["d", "w", "M", "Q", "y"] as const;
export type Unit = (typeof UNITS)[number];

/** Indexed as moment counts days, so `WEEKDAYS.indexOf("Mon")` is moment's 1. */
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const EDGES = ["SoW", "EoW", "SoM", "EoM", "SoQ", "EoQ", "SoY", "EoY"] as const;
export type Edge = (typeof EDGES)[number];

export interface AmountStep {
  kind: "amount";
  /** 1 to 999. A step that moves nowhere is not a step. */
  count: number;
  unit: Unit;
  back: boolean;
}

export interface WeekdayStep {
  kind: "weekday";
  /** moment's day number: Sunday 0. */
  day: number;
  count: number;
  back: boolean;
  /**
   * The bare form — the nearest such day at or after the anchor, today
   * counting. Never carries a count or a direction; `Mon` takes neither.
   */
  inclusive: boolean;
}

export interface EdgeStep {
  kind: "edge";
  edge: Edge;
}

export type Step = AmountStep | WeekdayStep | EdgeStep;

export interface Rule {
  anchor: Anchor;
  /** Never empty: `today` alone is the Today button, which is already there. */
  steps: Step[];
}

const AMOUNT = /^([+-])([1-9][0-9]{0,2})([dwMQy])$/;
const SIGNED_DAY = /^([+-])([1-9][0-9]{0,2})(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/;
const BARE_DAY = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/;

/**
 * A rule, or null for anything that is not exactly one.
 *
 * Split on a single space and nothing else: a double space leaves an empty
 * token and is refused, which keeps one rule to one spelling. Everything this
 * rejects, the builder cannot produce — this is the guard on what a hand-edited
 * `data.json` can put in front of a reader, not a parser anyone talks to.
 */
export function parseRule(text: string): Rule | null {
  const tokens = text.split(" ");
  const anchor = tokens.shift();
  if (anchor !== "today" && anchor !== "date") return null;
  if (tokens.length === 0) return null;

  const steps: Step[] = [];
  for (const token of tokens) {
    const step = stepFor(token);
    if (step === null) return null;
    steps.push(step);
  }

  return { anchor, steps };
}

/** The text a rule is stored as; the exact inverse of `parseRule`. */
export function formatRule(rule: Rule): string {
  return [rule.anchor, ...rule.steps.map(formatStep)].join(" ");
}

/** One token as a step, or null when it is not one. */
export function stepFor(token: string): Step | null {
  const amount = AMOUNT.exec(token);
  if (amount) {
    return {
      kind: "amount",
      count: Number(amount[2]),
      unit: amount[3] as Unit,
      back: amount[1] === "-",
    };
  }

  const signed = SIGNED_DAY.exec(token);
  if (signed) {
    return {
      kind: "weekday",
      day: WEEKDAYS.indexOf(signed[3] as Weekday),
      count: Number(signed[2]),
      back: signed[1] === "-",
      inclusive: false,
    };
  }

  const bare = BARE_DAY.exec(token);
  if (bare) {
    return {
      kind: "weekday",
      day: WEEKDAYS.indexOf(bare[1] as Weekday),
      count: 1,
      back: false,
      inclusive: true,
    };
  }

  return EDGES.includes(token as Edge) ? { kind: "edge", edge: token as Edge } : null;
}

function formatStep(step: Step): string {
  if (step.kind === "edge") return step.edge;

  const sign = step.back ? "-" : "+";
  if (step.kind === "amount") return `${sign}${step.count}${step.unit}`;

  return step.inclusive ? WEEKDAYS[step.day] : `${sign}${step.count}${WEEKDAYS[step.day]}`;
}

export interface RuleContext {
  /** The date the calendar opened on — what `date` anchors to. */
  value: DayKey;
  /** Today by the reader's own clock — what `today` anchors to. */
  today: DayKey;
  /**
   * The day a week starts on as moment counts days — Sunday 0 — which is the
   * only thing SoW and EoW obey.
   *
   * A number rather than the `WeekStart` setting, so this file depends on
   * nothing in `settings.ts`. Settings reads the catalogue and the parser back
   * out of here, and taking the setting itself would close that into a cycle.
   * Callers pass `firstDayOf(settings.weekStart)`.
   */
  firstDay: number;
}

/**
 * The day a rule lands on.
 *
 * In UTC throughout, as the calendar grid is: a shortcut is a question about
 * the calendar, not about the reader's offset from Greenwich. The one place
 * their clock matters is `context.today`, which the caller reads locally.
 */
export function resolveRule(rule: Rule, context: RuleContext): DayKey {
  const at = moment.utc(rule.anchor === "today" ? context.today : context.value);
  for (const step of rule.steps) apply(at, step, context.firstDay);

  return { year: at.year(), month: at.month(), day: at.date() };
}

type Moment = ReturnType<typeof moment.utc>;

/** Mutates `at`, which is ours alone: `resolveRule` made it and nobody else holds it. */
function apply(at: Moment, step: Step, firstDay: number): void {
  if (step.kind === "amount") {
    // moment clamps a month step into a shorter month by itself, which is the
    // behaviour `shiftMonths()` hand-rolls for the grid: 31 January plus a
    // month is 29 February, never 2 March.
    at.add(step.back ? -step.count : step.count, step.unit);
    return;
  }

  if (step.kind === "weekday") {
    at.add(weekdayOffset(at.day(), step), "days");
    return;
  }

  applyEdge(at, step.edge, firstDay);
}

/**
 * How far to the weekday a step names.
 *
 * The inclusive form stays where it is when it is already that day; the signed
 * form always moves, which is why its remainder is taken over 6 and then
 * stepped past. Those are the only two readings, and they differ on exactly one
 * day of the week.
 */
function weekdayOffset(from: number, step: WeekdayStep): number {
  if (step.inclusive) return (step.day - from + 7) % 7;

  const first = step.back ? -(((from - step.day + 6) % 7) + 1) : ((step.day - from + 6) % 7) + 1;

  return first + (step.count - 1) * (step.back ? -7 : 7);
}

function applyEdge(at: Moment, edge: Edge, firstDay: number): void {
  // Never moment's own startOf("week"): that follows moment's locale, which is
  // not the setting the reader chose and not what the grid is drawn from.
  if (edge === "SoW" || edge === "EoW") {
    const lead = (at.day() - firstDay + 7) % 7;
    at.add(edge === "SoW" ? -lead : 6 - lead, "days");
    return;
  }

  // The day is set to the 1st before the month moves, so a month step off the
  // 31st cannot clamp on the way past and land a day early.
  at.date(1);
  if (edge === "SoM") return;
  if (edge === "SoQ") {
    at.month(at.month() - (at.month() % 3));
    return;
  }
  if (edge === "SoY") {
    at.month(0);
    return;
  }

  if (edge === "EoQ") at.month(at.month() - (at.month() % 3) + 2);
  if (edge === "EoY") at.month(11);
  at.date(at.daysInMonth());
}

export interface QuickPreset {
  /** Also the i18n key under `settings.quickDates.presets`, and what a slot stores. */
  id: string;
  rule: string;
}

/**
 * The shortcuts on offer, written in the same language a reader's own rule is.
 *
 * Ten counting from today and four from the date in the note. Only two weekdays
 * are here: all seven would be half the catalogue for the sake of the two
 * nobody has to think about, and `today +1Wed` is one custom slot away.
 */
export const QUICK_PRESETS: QuickPreset[] = [
  { id: "tomorrow", rule: "today +1d" },
  { id: "yesterday", rule: "today -1d" },
  { id: "inSevenDays", rule: "today +7d" },
  { id: "nextMonday", rule: "today +1Mon" },
  { id: "nextFriday", rule: "today +1Fri" },
  { id: "endOfThisWeek", rule: "today EoW" },
  { id: "startOfNextWeek", rule: "today +1w SoW" },
  { id: "endOfThisMonth", rule: "today EoM" },
  { id: "startOfNextMonth", rule: "today +1M SoM" },
  { id: "endOfThisQuarter", rule: "today EoQ" },
  { id: "dayLater", rule: "date +1d" },
  { id: "sevenDaysLater", rule: "date +7d" },
  { id: "fourteenDaysLater", rule: "date +14d" },
  { id: "monthLater", rule: "date +1M" },
  { id: "startOfThatWeek", rule: "date SoW" },
  { id: "endOfThatWeek", rule: "date EoW" },
  { id: "startOfThatMonth", rule: "date SoM" },
  { id: "endOfThatMonth", rule: "date EoM" },
];

/**
 * The presets counting from one anchor, in the catalogue's own order.
 *
 * Derived rather than listed. A second list naming each id again has to be
 * kept in step with this one, and the only thing it knew that the rules do not
 * is which anchor each starts with.
 */
export function presetsAnchoredOn(anchor: Anchor): QuickPreset[] {
  return QUICK_PRESETS.filter((preset) => preset.rule.startsWith(`${anchor} `));
}

export function presetById(id: string): QuickPreset | undefined {
  return QUICK_PRESETS.find((preset) => preset.id === id);
}

/**
 * Why a rule does not parse, in the terms the reader can act on.
 *
 * `parseRule` answers yes or no, which is all the read-back of `data.json`
 * needs. The editor needs to say what is wrong, so this classifies the first
 * bad token the way `checkFormat()` does for a date pattern — and the reserved
 * time units get their own answer, because "m means minutes" is the one mistake
 * this language actively invites.
 */
export type RuleProblem =
  | { kind: "empty" }
  | { kind: "anchor"; token: string }
  | { kind: "steps" }
  | { kind: "minutes"; token: string }
  | { kind: "reserved"; token: string }
  | { kind: "count"; token: string }
  | { kind: "token"; token: string };

/** Times, which item 3 will bring and this must not silently accept meanwhile. */
const RESERVED = /^(?:[+-][0-9]*[hHs]|SoD|EoD|SoB|EoB|now)$/;
const MINUTES = /^[+-][0-9]*m$/;
/** A real unit wearing the wrong sign or count: `+Mon`, `2Mon`, `+0d`, `+007d`. */
const MISCOUNTED = /^[+-]?[0-9]*(?:[dwMQy]|Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/;

export function checkRule(text: string): RuleProblem | null {
  if (text.trim() === "") return { kind: "empty" };

  const tokens = text.split(" ");
  const anchor = tokens.shift() ?? "";
  if (anchor !== "today" && anchor !== "date") return { kind: "anchor", token: anchor };
  if (tokens.length === 0 || tokens.every((token) => token === "")) return { kind: "steps" };

  for (const token of tokens) {
    if (stepFor(token) !== null) continue;
    if (MINUTES.test(token)) return { kind: "minutes", token };
    if (RESERVED.test(token)) return { kind: "reserved", token };
    if (MISCOUNTED.test(token)) return { kind: "count", token };

    return { kind: "token", token };
  }

  return null;
}

/** One token of a rule, and where it sits in the text it came from. */
export interface Token {
  text: string;
  from: number;
  to: number;
  /** Its place in the rule: 0 is the anchor, and only the anchor. */
  index: number;
}

/**
 * The token the caret is in.
 *
 * Tokens are separated by single spaces, so this is the run between the space
 * before the caret and the space after it. A caret against a space belongs to
 * the token it is touching, which is what lets the end of a half-typed token be
 * completed without moving first.
 */
export function tokenAt(text: string, caret: number): Token {
  const at = Math.max(0, Math.min(caret, text.length));
  const from = text.lastIndexOf(" ", at - 1) + 1;
  const after = text.indexOf(" ", at);
  const to = after === -1 ? text.length : after;

  return {
    text: text.slice(from, to),
    from,
    to,
    index: (text.slice(0, from).match(/ /g) ?? []).length,
  };
}

/**
 * What could stand where the caret is.
 *
 * Everything offered is a completion of the token the caret is in, not of the
 * text as a whole: standing in `today` offers the anchors, because that is what
 * may go there, and picking one replaces that token rather than appending after
 * the rule.
 *
 * A sign and digits already typed are carried into every candidate, so `+3`
 * offers `+3d` and `+3Mon` rather than starting the number again.
 *
 * Matching ignores case; what is inserted does not. Typing `eom` finds `EoM`,
 * which is the whole reason the list exists — the case rule is real and nobody
 * should have to know it before they can find a token.
 */
export function suggestionsFor(text: string, caret: number): string[] {
  const token = tokenAt(text, caret);
  const candidates = token.index === 0 ? ["today", "date"] : steps(token.text);

  // A token already standing complete offers what could stand there instead,
  // unfiltered: filtering by a finished word leaves only the word itself, so
  // resting in `today` offered `today` and nothing to change it to.
  if (candidates.includes(token.text)) return candidates;

  return candidates.filter((candidate) =>
    candidate.toLowerCase().startsWith(token.text.toLowerCase()),
  );
}

/** Every step, written with whatever sign and count the reader has typed. */
function steps(partial: string): string[] {
  const signed = /^([+-])([0-9]*)/.exec(partial);
  const prefix = `${signed?.[1] ?? "+"}${signed?.[2] || "1"}`;

  return [
    ...UNITS.map((unit) => `${prefix}${unit}`),
    ...EDGES,
    ...WEEKDAYS,
    ...WEEKDAYS.map((day) => `${prefix}${day}`),
  ];
}
