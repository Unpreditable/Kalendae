import { syntaxTree } from "@codemirror/language";

/**
 * Decides where in a note a candidate date sits, so the scope settings can
 * say whether it should be offered at all.
 *
 * Frontmatter is found by position — a note either opens with a `---` fence or
 * it does not, and that is knowable without a parser. Everything else is a
 * question for CodeMirror's syntax tree.
 */

/** The tree `syntaxTree()` hands back, without depending on @lezer/common directly. */
export type SyntaxTree = ReturnType<typeof syntaxTree>;

export type ScopeKind =
  | "prose"
  | "heading"
  | "inline-code"
  | "code-block"
  | "frontmatter"
  | "wikilink";

export interface ContextInfo {
  scope: ScopeKind;
  /**
   * The raw syntax-tree node names covering the range, outermost first.
   *
   * Obsidian parses markdown with its own stream parser, so these names are
   * Obsidian's, not those of any published grammar, and they are not
   * documented. Carried on every detection so that NODE_HINTS below can be
   * corrected against a running vault rather than guessed at: the detection
   * report on `debug/report-command` prints this column for exactly that
   * reason.
   */
  nodes: string[];
}

/**
 * Offset just past the closing `---` of the note's frontmatter, or 0 when
 * there is none. An unterminated block is not frontmatter, which is how
 * Obsidian reads it too.
 */
export function frontmatterEnd(doc: string): number {
  if (!/^---[ \t]*\r?\n/.test(doc)) return 0;

  const fence = /\n---[ \t]*(\r?\n|$)/g;
  fence.lastIndex = 3;
  const closing = fence.exec(doc);

  return closing ? closing.index + closing[0].length : 0;
}

/**
 * Substrings looked for in a node name, most specific first. Order matters:
 * an inline-code span inside a code block should read as the block.
 *
 * Confirmed against a real vault (Obsidian 1.13) rather than guessed:
 * `hmd-frontmatter`, `inline-code`,
 * `HyperMD-codeblock_HyperMD-codeblock-bg › hmd-codeblock`, `hmd-internal-link`
 * and `hmd-internal-link_link-has-alias`. Bold and italic come back as
 * `strong` and `em`, which match nothing here and so read as prose, correctly.
 *
 * `hmd-barelink` — Obsidian's tag for `[2024-03-22]` — is deliberately absent.
 * Links are out of scope by default because editing `[[2024-03-22]]` changes
 * which note the link points at. A barelink has no target, so editing it
 * changes only the date, which makes it prose.
 */
const NODE_HINTS: ReadonlyArray<[ScopeKind, readonly string[]]> = [
  ["frontmatter", ["frontmatter"]],
  ["code-block", ["codeblock", "code-block", "hmd-codeblock"]],
  ["inline-code", ["inline-code"]],
  // Wikilink before heading: a date inside `## [[2026-09-06]]` is both, and
  // the link is the stronger claim — editing it repoints the link as well as
  // rewriting the heading.
  ["wikilink", ["internal-link"]],
  ["heading", ["header"]],
];

/**
 * `frontmatterUpto` is passed in rather than recomputed because it is a
 * property of the document, not of the candidate — working it out per
 * candidate would re-scan the note once for every date in it.
 */
export function classifyContext(
  tree: SyntaxTree,
  frontmatterUpto: number,
  from: number,
  to: number,
): ContextInfo {
  const nodes = nodeNamesAt(tree, from, to);

  if (from < frontmatterUpto) return { scope: "frontmatter", nodes };

  const haystack = nodes.join(" ").toLowerCase();
  for (const [scope, hints] of NODE_HINTS) {
    if (hints.some((hint) => haystack.includes(hint))) return { scope, nodes };
  }

  return { scope: "prose", nodes };
}

function nodeNamesAt(tree: SyntaxTree, from: number, to: number): string[] {
  const names: string[] = [];
  // Resolve just inside the range: a candidate's first character is reliably
  // within whatever construct contains it, while its edges may sit on the
  // boundary of an adjacent one.
  let node = tree.resolveInner(Math.min(from + 1, to), 1);

  while (node.parent) {
    names.unshift(node.name);
    node = node.parent;
  }

  return names;
}

/** The setting that governs each scope. Prose has none — it is always in. */
export const SCOPE_SETTING = {
  heading: "scopeHeadings",
  "inline-code": "scopeInlineCode",
  "code-block": "scopeCodeBlocks",
  frontmatter: "scopeFrontmatter",
  wikilink: "scopeWikilinks",
} as const;
