import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { ContextInfo, SCOPE_SETTING, classifyContext, frontmatterEnd } from "./context";
import { Candidate, RejectReason, scanText } from "./scan";
import { KalendaeSettings } from "../settings";

/**
 * Joins the two halves of detection: what the text says (`scan.ts`, pure) and
 * where in the note it says it (`context.ts`, syntax tree).
 *
 * `detectIn` is what the editor layer asks: the dates in the range it is about
 * to decorate. `detectDates` answers for a whole note and has no caller on this
 * branch — the detection report that used it lives on `debug/report-command`.
 */

/** A scan reason, plus the one rejection only this layer can make. */
export type DetectionReason = RejectReason | "scope";

export interface Detection extends Omit<Candidate, "accepted" | "reason"> {
  context: ContextInfo;
  accepted: boolean;
  reason?: DetectionReason;
}

export interface DetectionResult {
  detections: Detection[];
  /**
   * False when the parser could not reach the end of the note in time.
   *
   * CodeMirror parses lazily, roughly as far as the rendered viewport needs.
   * Past that horizon every node lookup comes back empty, which would read as
   * "prose" and quietly let code blocks through the scope filter. Callers must
   * surface this rather than present a partial answer as a complete one.
   */
  contextComplete: boolean;
}

/** Milliseconds to let the parser run before giving up on the tail of a note. */
const PARSE_BUDGET_MS = 3000;

export function detectDates(state: EditorState, settings: KalendaeSettings): DetectionResult {
  const text = state.doc.toString();
  const candidates = scanText(text, settings.formats);

  // Parse only as far as the last candidate: a note whose dates all sit in the
  // first screen costs nothing extra just because it is long.
  const needed = candidates.reduce((max, candidate) => Math.max(max, candidate.to), 0);
  const tree = ensureSyntaxTree(state, needed, PARSE_BUDGET_MS);
  const upto = frontmatterEnd(text);
  // Resolved once rather than inside the map. Neither operand varies per
  // candidate, and the fallback is taken exactly on the long-note path where
  // there are most candidates to pay for it.
  const parsed = tree ?? syntaxTree(state);

  return {
    contextComplete: tree !== null,
    detections: candidates.map((candidate) => withContext(parsed, upto, candidate, settings)),
  };
}

/**
 * How far into a note the positional frontmatter guard is worth computing.
 *
 * The guard needs the text from the start of the note, and a viewport halfway
 * down a long one would pay for all of it on every keystroke. Past this, the
 * syntax tree carries frontmatter on its own — `NODE_HINTS` matches Obsidian's
 * `hmd-frontmatter`, and over a rendered range the tree is fully parsed, which
 * is the case the guard exists to cover for.
 */
const FRONTMATTER_PREFIX = 8192;

/**
 * The dates in one range of a note.
 *
 * `detectDates` above answers for a whole note and pays `ensureSyntaxTree` to
 * do it. This one answers for a range, which is what a view plugin asks about:
 * CodeMirror has already parsed as far as it renders, so `syntaxTree(state)` is
 * reliable exactly here. No parse budget, and nothing partial to report.
 *
 * The range widens to whole lines before scanning. A viewport ends where the
 * screen ends, and half of `2026-02-02` matches nothing at all.
 */
export function detectIn(
  state: EditorState,
  settings: KalendaeSettings,
  from: number,
  to: number,
): Detection[] {
  const start = state.doc.lineAt(clamp(state, from)).from;
  const end = state.doc.lineAt(clamp(state, to)).to;
  const tree = syntaxTree(state);
  const upto = frontmatterEnd(state.doc.sliceString(0, Math.min(end, FRONTMATTER_PREFIX)));

  return scanText(state.doc.sliceString(start, end), settings.formats).map((candidate) =>
    withContext(
      tree,
      upto,
      { ...candidate, from: candidate.from + start, to: candidate.to + start },
      settings,
    ),
  );
}

function clamp(state: EditorState, at: number): number {
  return Math.max(0, Math.min(state.doc.length, at));
}

function withContext(
  tree: ReturnType<typeof syntaxTree>,
  frontmatterUpto: number,
  candidate: Candidate,
  settings: KalendaeSettings,
): Detection {
  const context = classifyContext(tree, frontmatterUpto, candidate.from, candidate.to);
  const { accepted, reason, ...rest } = candidate;

  if (!accepted) return { ...rest, context, accepted, reason };
  if (!isInScope(context, settings)) {
    return { ...rest, context, accepted: false, reason: "scope" as const };
  }
  return { ...rest, context, accepted: true };
}

/** Prose is always in scope; every other place is opt-in. */
function isInScope(context: ContextInfo, settings: KalendaeSettings): boolean {
  if (context.scope === "prose") return true;
  return settings[SCOPE_SETTING[context.scope]];
}
