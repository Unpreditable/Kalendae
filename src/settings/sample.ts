import { ScopeKind, SCOPE_SETTING } from "../detect/context";
import { scanText } from "../detect/scan";
import { KalendaeSettings } from "../settings";

/**
 * The worked example on the sections page: a few lines of note with a date in
 * every section the toggles cover, and the highlighting that shows which of
 * them the current settings would pick up.
 *
 * Whether a date *matches* is computed for real by `scanText`, so the example
 * cannot drift from the scanner. Which section each date sits in is known by
 * construction rather than parsed — we wrote the sample, so there is no syntax
 * tree to consult and nothing to get wrong.
 */

/**
 * The sample, authored as labelled segments so no offset is ever counted by
 * hand. Concatenated in order, these are both the text and its regions.
 */
const SEGMENTS: ReadonlyArray<readonly [ScopeKind, string]> = [
  ["frontmatter", "---\ndue: 2026-09-06\n---\n"],
  ["heading", "\n## Week of 2026-09-07\n"],
  ["prose", "\nDraft due 2026-09-14, review the week after.\n\nRun "],
  ["inline-code", "`git log --since 2026-09-01`"],
  ["prose", " before the standup.\n\n"],
  ["code-block", "```yaml\nreleased: 2026-09-20\n```"],
  ["prose", "\n\nSee "],
  ["wikilink", "[[2026-09-28]]"],
  ["prose", " for the retro notes.\n"],
];

export const SAMPLE_TEXT: string = SEGMENTS.map(([, text]) => text).join("");

interface Region {
  scope: ScopeKind;
  from: number;
  to: number;
}

const REGIONS: Region[] = (() => {
  const regions: Region[] = [];
  let at = 0;
  for (const [scope, text] of SEGMENTS) {
    regions.push({ scope, from: at, to: at + text.length });
    at += text.length;
  }
  return regions;
})();

export type HighlightKind = "detected" | "skipped";

export interface Highlight {
  from: number;
  to: number;
  kind: HighlightKind;
}

/**
 * Every date in the sample that the user's formats can read, marked by whether
 * the current section settings would let it through.
 *
 * A date the formats cannot read is not highlighted at all — on a page about
 * sections, flagging a format the user simply has not added would be noise.
 */
export function sampleHighlights(settings: KalendaeSettings): Highlight[] {
  return scanText(SAMPLE_TEXT, settings.formats)
    .filter((candidate) => candidate.accepted)
    .map((candidate) => ({
      from: candidate.from,
      to: candidate.to,
      kind: inScope(scopeAt(candidate.from), settings) ? ("detected" as const) : ("skipped" as const),
    }));
}

function scopeAt(offset: number): ScopeKind {
  return REGIONS.find((region) => offset >= region.from && offset < region.to)?.scope ?? "prose";
}

function inScope(scope: ScopeKind, settings: KalendaeSettings): boolean {
  return scope === "prose" || settings[SCOPE_SETTING[scope]];
}
