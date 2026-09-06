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

`@codemirror/state`, `@codemirror/view` and `@codemirror/language` are devDependencies for types
only. Obsidian ships its own copy of each at runtime, and `esbuild.config.mjs` externalises them.
Bundling any of them gives the editor a second, unrelated state — decorations silently never
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
grep -o 'require("@codemirror/[a-z]*")' main.js | sort -u   # should list them
grep -c "class EditorView" main.js                          # must be 0
```

### Key files

| File | Role |
|---|---|
| [src/main.ts](src/main.ts) | Plugin entry point; settings load/save, command and editor-extension registration |
| [src/editor/DatePickerExtension.ts](src/editor/DatePickerExtension.ts) | CM6 `ViewPlugin` — the seam where date detection and the picker affordance go |
| [src/settings.ts](src/settings.ts) | `KalendaeSettings`, `TriggerMode` and defaults |
| [src/settings-tab.ts](src/settings-tab.ts) | Settings UI via `getSettingDefinitions()` (1.13+ native layout) |
| [src/i18n/i18n.ts](src/i18n/i18n.ts) | i18next init; every user-visible string goes through `t()` |

Detection, the calendar UI, and write-back do not exist yet. This section grows as they land.

### Settings API

`minAppVersion` is 1.13.0, so `KalendaeSettingTab` implements `getSettingDefinitions()` **only** —
no `display()` fallback and no `requireApiVersion` branch. Obsidian never calls `display()` for a
tab that returns definitions, and there is no older version to fall back for. That simplification
is the reason the floor is 1.13; don't reintroduce the dual path without raising the floor question
first.

Prefer a declarative `control` over the `render` escape hatch. With a `control`, the inherited
`getControlValue`/`setControlValue` read and persist `plugin.settings[key]` themselves, so there is
no save wiring to forget — which is why `main.ts` has no `saveSettings()`. Note the field is
`desc`, not `description`. Typing the return as
`SettingDefinitionItem<keyof KalendaeSettings>[]` turns a mistyped `key` into a compile error.

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
