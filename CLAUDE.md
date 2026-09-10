# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working agreement

**Only explicit acceptance is acceptance.** Nothing else counts — not a correction, not a question,
not feedback on a draft, not silence, not "that reads better". If the user critiques a proposal and
you incorporate the critique, the result is a *new proposal* that also needs acceptance. Two rounds
of feedback are still zero approvals.

**Show, don't write.** When asked to show, propose, draft, or explain a change, put it in the reply
as text. Do not touch a file. An instruction to show something is never also an instruction to
apply it, however clear the resulting change seems.

**One asked-for thing at a time.** Do what was requested, not the adjacent work you noticed while
doing it. Surface the rest as a list and let the user pick. Finding a real problem is a reason to
mention it, never a licence to fix it uninvited.

**Ask when uncertain, before acting.** If a request could mean two things, say so and wait. Do not
pick the likelier reading and proceed. Guessing wrong wastes more of the user's time than asking.

## Commands

```bash
npm run dev                    # esbuild watch mode (rebuilds on save — use with Hot Reload plugin)
npm run build                  # TypeScript check + eslint + production bundle → main.js
npm test                       # Jest unit tests (pure logic only, no Obsidian API)
npm run validate-translations  # every locale has exactly en.json's keys, none blank
npm run release-check          # all three, in the order the Release workflow runs them
```

**During development**: symlink this folder into `<vault>/.obsidian/plugins/kalendae/` and install
the [Hot Reload](https://github.com/pjeby/hot-reload) community plugin. With `npm run dev` running,
any source change auto-reloads the plugin without restarting Obsidian.

## Architecture

**Purpose**: change a date — and later a time — that is *already written* in a note by picking it
from a calendar, rather than retyping it. The differentiator from date-inserter plugins is that
this one edits existing dates in place.

### Surfaces

Source mode and Live Preview are the same CodeMirror 6 `EditorView`, so a single
`registerEditorExtension()` covers both and there is no second code path to maintain.

**Reading mode is out of scope.** It is not CodeMirror, it is read-only, and editing from it would
mean a separate write path through the vault API. It is a reading surface; this plugin edits.

### CodeMirror dependencies

`@codemirror/state`, `@codemirror/view` and `@codemirror/language` are devDependencies because
Obsidian ships its own copy of each at runtime and `esbuild.config.mjs` externalises them — not
because they are types only. `@codemirror/language` is called at runtime: `detect.ts` and
`context.ts` use `syntaxTree()` and `ensureSyntaxTree()` as values, so neither import can become
an `import type`.

Bundling any of the three gives the editor a second, unrelated state — decorations silently never
appear, with nothing failing loudly. Never remove them from the `external` list.

`@codemirror/state` and `@codemirror/view` are pinned to **exact** versions, not ranges, because
the `obsidian` package declares them as exact peer dependencies (`6.5.0` and `6.38.6` for
obsidian 1.13.1) and `npm install` fails on any range. When bumping `obsidian`, read its
`peerDependencies` and move these two in lockstep:

```bash
npm view obsidian@<version> peerDependencies --json
```

To confirm a build kept them external:

```bash
grep -o 'require("@codemirror/[a-z]*")' main.js | sort -u   # language and view, today
grep -c "class EditorView" main.js                          # must be 0
```

### Key files

| File | Role |
|---|---|
| [src/main.ts](src/main.ts) | Plugin entry point; settings load/save, command and editor-extension registration |
| [src/editor/DatePickerExtension.ts](src/editor/DatePickerExtension.ts) | Composes the whole editor layer; owns the live-`EditorView` registry that `editorViewIn()` reads |
| [src/editor/decorations.ts](src/editor/decorations.ts) | Marks each date in view and hangs the icon widget off it, paired by a shared id |
| [src/editor/hover-state.ts](src/editor/hover-state.ts) | `StateField` holding which date the pointer is on |
| [src/editor/picker-tooltip.ts](src/editor/picker-tooltip.ts) | The tooltip, the three ways to open it, and the write-back transaction |
| [src/picker/month.ts](src/picker/month.ts) | Pure calendar arithmetic: `buildMonth()`, `clampDay()`, `shiftMonths()`, `firstDayOf()` |
| [src/picker/panel.ts](src/picker/panel.ts) | The calendar's DOM and keyboard; knows nothing of CodeMirror |
| [src/picker/write.ts](src/picker/write.ts) | `replacementFor()` and the `stillThere()` guard |
| [src/detect/formats.ts](src/detect/formats.ts) | Moment-token → regex compiler, `checkFormat()`, `renderPattern()`, `BUILT_IN_FORMATS` |
| [src/detect/scan.ts](src/detect/scan.ts) | `scanText()` — pure candidate finding; the three gates below |
| [src/detect/context.ts](src/detect/context.ts) | `classifyContext()` — where in the note a candidate sits, via `syntaxTree()` |
| [src/detect/detect.ts](src/detect/detect.ts) | `detectDates()` for a whole note, `detectIn()` for a range; both apply the scope settings |
| [src/detect/shadow.ts](src/detect/shadow.ts) | `shadowedFormats()` — which formats an earlier one always beats to its dates |
| [src/settings.ts](src/settings.ts) | `KalendaeSettings`, defaults, `migrateTriggers()`, `normaliseStoredFormats()`, `reorderById()` |
| [src/settings/settings-tab.ts](src/settings/settings-tab.ts) | Settings UI via `getSettingDefinitions()` (1.13+ native layout) |
| [src/settings/format-list.ts](src/settings/format-list.ts) | One format row, drawn by hand; the Sortable binding |
| [src/settings/format-modal.ts](src/settings/format-modal.ts) | The editor for a custom pattern |
| [src/settings/sections-page.ts](src/settings/sections-page.ts) | The scope toggles and their worked example |
| [src/i18n/i18n.ts](src/i18n/i18n.ts) | i18next init; every user-visible string goes through `t()` |

Times do not exist yet, and neither does anything that writes more than one date at a time.

### The picker

Three ways in, all dispatching one state effect, which is why the second and third cost almost
nothing: the hover icon, a double-click on the date, and the `pick-date` command with the caret on
one. `showPicker()` is the only entry point; the effects behind it are private.

Two rules the editor layer must keep, both paid for by a spike that is now deleted:

- **Nothing may move the text.** Marks over the date, and an icon absolutely positioned inside a
  zero-width widget. Any decoration that occupies space reflows the line every time a pointer
  crosses it.
- **A date and its icon cannot find each other through the DOM.** CodeMirror slips a
  `cm-widgetBuffer` between a mark and the widget after it, and Obsidian's formatting spans —
  emphasis, strong, strikethrough, headings, `[…]` — reparent one without the other. They carry a
  shared `data-kalendae` id instead, and which one is lit lives in a `StateField` rather than on
  the elements, where a redraw would strand it.

Geometry is CSS, never JavaScript: every offset is in `em` so it tracks the line's font size, and
the icon's leading space is padding inside its own box rather than a gap beside it — a gap belongs
to neither element and dropping the hover while crossing it is what made the affordance flicker.

`.cm-tooltip` lands on the panel element itself, not on a wrapper, and carries a hard-coded pale
background. `.cm-tooltip.kalendae-panel` names both classes to beat it; a single class ties and
loses, because CodeMirror injects its styles after ours. Obsidian's `button` rules outrank a single
class the same way, which is why every panel rule is scoped under `.kalendae-panel`.

Write-back replaces exactly the detected range in one transaction, rendered through the format that
matched — so a note that says `22.03.2024` goes on saying dates that way, and one undo restores the
old date whole. The picker closes on any document change; if an edit lands first, `stillThere()`
abandons the write rather than aiming it at whatever moved into place.

### Detection

Split on testability, and keep it that way. `scan.ts` is pure — no Obsidian, no editor — so every
rule about what counts as a date is unit-testable. `context.ts` needs a live syntax tree and
cannot be unit-tested at all: Obsidian parses markdown with its own stream parser, so the node
names in `NODE_HINTS` are Obsidian's, undocumented, and were read off a running vault (1.13). Every
detection carries the raw names so they can be read off a vault again; don't guess at them from a
grammar. The command that prints them as a table — along with every candidate and the reason each
was rejected — is kept off this branch, on `debug/report-command`, because shipping a plugin that
logs to the console fails Obsidian's review. Rebase that branch to use it.

`syntaxTree(state)` is **not** enough. CodeMirror parses lazily, roughly as far as the rendered
viewport needs, and past that horizon every lookup comes back empty — which reads as "prose" and
silently lets code blocks through the scope filter partway down a long note. `detect.ts` uses
`ensureSyntaxTree()` up to the last candidate's offset and reports `contextComplete: false` when
the parser runs out of budget. The document itself is never partial: CodeMirror virtualises
rendering, not content, so `state.doc` always holds the whole note.

A candidate must pass three gates, in order:

1. the compiled regex for an enabled format,
2. the boundary rule — a letter or digit on either side disqualifies it; a dot does so only with a
   digit beyond it (`2026-09-06.` ending a sentence versus `12.11.2026.5`), and an underscore only
   with a letter or digit beyond it (`_2026-09-06_` in italics versus `backup_2026-09-06_final`),
3. `moment.utc(text, pattern, true).isValid()`, which has the final say.

Gate 3 being the authority is why gate 1 only has to be non-lossy. Use `moment.utc(...)`, not a
bare `moment(...)`: the namespace stays callable under `esModuleInterop`, which the Jest tsconfig
sets and the build tsconfig does not.

Formats are an **ordered** list and the first enabled match claims a range — that is the whole
answer to `03/09/2026` being both a March and a September date, and reordering the list in
settings is how a user states which. Write-back reuses the format that matched, so editing a date
never restyles the note; see the normalise item in TODO.md for the opt-in that isn't built.

### Settings API

`minAppVersion` is 1.13.0, so `KalendaeSettingTab` implements `getSettingDefinitions()` **only** —
no `display()` fallback and no `requireApiVersion` branch. Obsidian never calls `display()` for a
tab that returns definitions, and there is no older version to fall back for. That simplification
is the reason the floor is 1.13; don't reintroduce the dual path without raising the floor question
first.

Prefer a declarative `control` over the `render` escape hatch. With a `control`, the inherited
`getControlValue`/`setControlValue` read and persist `plugin.settings[key]` themselves, so there is
no save wiring to forget. Note the field is `desc`, not `description`.

**The format list is the exception.** Its rows address entries in an array rather than properties
of the settings object, so no `control` can bind them and they are `render` definitions instead.
`renderFormatRow()` draws each row itself and mutates `settings.formats` directly, which is why
`main.ts` has a `saveSettings()` at all: a `render` row gets no persistence for free. The
declarative row types were tried and cannot carry this — a `page` row gets no delete or drag
affordance and a plain row gets no buttons, so a custom format could be edited or removed but
never both.

The key type stays bare `keyof KalendaeSettings`, so a typo in a plain setting is still a compile
error. Nothing routes synthetic keys, because nothing needs to.

`SettingDefinitionList` (`type: "list"`) renders the collection and supplies the add affordance
via `addItem` — a + in the list header on desktop, a tappable row beneath on mobile. Deleting and
reordering are ours: the trash button on each row, and Sortable bound to the list element. After
adding, deleting or reordering, call `update()`, not `refreshDomState()` — the definitions
themselves changed.

Two things follow from how `update()` behaves, and both have already been bugs:

- Obsidian reuses a group across `update()` but builds a fresh list element when the tab is
  reopened, so `Sortable.get()` is not enough to prevent a leak. `format-list.ts` destroys the
  previous instance on rebind, and `KalendaeSettingTab.hide()` releases it.
- A sub-page mutating settings must ask the tab to `update()`, or the summary row behind it keeps
  the value it was drawn with. `SectionsPage` takes a callback and fires it from `hide()`, on
  leaving, rather than per toggle — updating the tab under an open page redraws it while the user
  is still working on top of it.

### i18n

Every user-visible string lives in `src/i18n/locales/`. `en.json` is the source of truth and
carries a `<key>_comment` sibling for each key explaining its context to translators. All 13 other
locales must have exactly en's key set with no blank values — `npm run validate-translations`
enforces this, and the Release workflow gates on it. `sample_lang.json` is the blank template for
adding a language and is exempt from the check.

## CSS rules

- **No `!important`** — increase selector specificity or use CSS variables instead.
- **No inline styles** — style through `styles.css` and class names, never `style=""`.
- **No partially-supported CSS properties** — Obsidian's embedded Chromium lags behind the latest
  spec. Known problematic properties: `text-decoration-color`, `text-decoration-thickness`,
  `text-decoration-skip-ink`. Use `text-decoration: underline` without sub-properties; style links
  via `color` and the shorthand only.
- **Use Obsidian CSS variables** for all colors, fonts, spacing — never hardcode values that themes
  should control.
