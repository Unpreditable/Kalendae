import { moment } from "obsidian";
import { Rule, Step, parseRule, presetById } from "./quick";
import { QuickSlot } from "../settings";
import { t } from "../i18n/i18n";

/**
 * A shortcut's rule, read back in the reader's own language.
 *
 * A separated list, never a sentence — the argument `scopeSummary()` already
 * makes for its middle dots. An arrow between independently rendered pieces
 * reads as a sequence in every script, where a joined phrase would need grammar
 * we cannot supply for thirteen languages.
 *
 * Day names come from moment, which is where the calendar grid gets them and
 * the only place they are already translated. Nothing is assembled out of two
 * translated fragments: each piece is one key with placeholders, so the
 * translator controls its word order.
 */
const GLOSS_SEPARATOR = " → ";

export function glossFor(rule: Rule): string {
  return [t(`settings.quickDates.anchors.${rule.anchor}`), ...rule.steps.map(stepGloss)].join(
    GLOSS_SEPARATOR,
  );
}

/** One step in words. */
export function stepGloss(step: Step): string {
  if (step.kind === "edge") return t(`settings.quickDates.edges.${step.edge}`);

  if (step.kind === "amount") {
    const amount = t(`settings.quickDates.steps.amount_${step.unit}`, { count: step.count });
    return t(`settings.quickDates.steps.${step.back ? "back" : "forward"}`, { amount });
  }

  const day = moment.weekdays()[step.day];
  if (step.inclusive) return t("settings.quickDates.steps.weekdayThis", { day });
  if (step.count === 1) {
    return t(`settings.quickDates.steps.${step.back ? "weekdayPrevious" : "weekdayNext"}`, { day });
  }

  return t(`settings.quickDates.steps.${step.back ? "weekdayNthBack" : "weekdayNth"}`, {
    count: step.count,
    day,
  });
}

/** The rule text a slot holds, whichever kind it is, or null for an empty one. */
export function ruleTextFor(slot: QuickSlot): string | null {
  if (slot === null) return null;

  return "preset" in slot ? (presetById(slot.preset)?.rule ?? null) : slot.rule;
}

/** The rule a slot holds, read. Null for an empty slot or one nothing can read. */
export function ruleFor(slot: QuickSlot): Rule | null {
  const text = ruleTextFor(slot);

  return text === null ? null : parseRule(text);
}

/**
 * What the button says: the alias if there is one, and a preset's short form
 * otherwise.
 *
 * The short form, not the full name: the calendar is a small popup and a
 * button reading "End of this quarter" widens it on its own. The full name
 * belongs where there is room for it — the chooser menu and the settings
 * table — and `EoQ` belongs on the button.
 *
 * A rule of the reader's own always has an alias — the page will not let it be
 * emptied, and the read-back drops one that is.
 */
export function labelFor(slot: QuickSlot): string {
  if (slot === null) return t("settings.quickDates.empty");
  if ("preset" in slot) return slot.alias ?? shortFor(slot.preset);

  return slot.alias;
}

/** A preset's short form, which is what a slot shows until it is renamed. */
export function shortFor(preset: string): string {
  return t(`settings.quickDates.short.${preset}`);
}

/** The reading of a slot's rule, or null when it holds nothing readable. */
export function slotGloss(slot: QuickSlot): string | null {
  const rule = ruleFor(slot);

  return rule === null ? null : glossFor(rule);
}
