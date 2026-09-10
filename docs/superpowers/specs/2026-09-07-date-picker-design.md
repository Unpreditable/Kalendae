# Date picker — design

Status: approved 2026-09-07, unimplemented
Slice: the first of three. Times are slice 3; nothing here is built for them, and nothing here
blocks them.

## What this delivers

A date already written in a note can be changed by picking a day from a calendar. Hovering a
recognised date reveals an icon beside it; clicking that icon, double-clicking the date, or running
the **Pick date** command with the caret on one opens a calendar anchored to it. Choosing a day
rewrites that date in place, in the format it was already written in, and nothing else on the line
moves.

Detection already exists and is unchanged in substance: `detectDates()` decides what is a date and
whether it sits somewhere in scope. This slice consumes it.

## What the spike established

A throwaway extension (`src/editor/hover-spike.ts`, deleted when this lands) answered three
questions in a real vault, and turned up a fourth thing nobody had thought to ask:

- A zero-width widget survives Live Preview. The caret moves through a decorated date, and into and
  out of it, without the widget flickering, doubling or trapping the cursor. Source mode, Live
  Preview and headings all behave. The floating-icon fallback is therefore dropped.
- An out-of-flow frame can enclose the date and the icon as one shape without moving a pixel of
  text, provided its geometry is in `em` rather than `px` — a heading scales the icon but not a
  fixed inset, and the frame cut through the glyph.
- The icon takes a `mousedown` while the date underneath still takes an ordinary caret click.
- **The finding that changed the design:** hover state cannot lean on DOM adjacency. CodeMirror
  slips a zero-width `cm-widgetBuffer` between a mark and the widget after it, and Obsidian's own
  formatting spans — emphasis, strong, strikethrough, headings, `[…]` — reparent one and not the
  other. A date and its icon must find each other by a shared id, not by being siblings.

## Surfaces and triggers

Source mode and Live Preview are one `EditorView`, so one extension serves both. Reading mode stays
out of scope.

Three ways in, all dispatching the same effect, which is what makes the last two nearly free:

| Trigger | Mechanism |
|---|---|
| Hover icon | A widget beside each detected date, revealed with the pointer on either the date or the icon |
| Double-click | `dblclick` handler, `posAtCoords()` against the decorated ranges. Suppresses the word selection it would otherwise make |
| Command | `pick-date`, already registered; the detection containing the caret, or the nearest one on that line |

The `trigger` setting (`hover-icon` / `double-click` / `both`) starts being honoured here. It has
been stored and ignored since the scaffold.

## Decoration and hover

On `docChanged` or `viewportChanged`, the view plugin scans the visible ranges, rounded out to whole
lines so a date straddling the edge is not cut in half, and produces two decorations per accepted
detection:

- a `Decoration.mark` over the date carrying `class="kalendae-date"` and `data-kalendae="<from>"`,
- a zero-width `Decoration.widget` at its end whose element carries the same `data-kalendae`.

Marks only over the text: nothing in the line moves, and Live Preview has nothing to reshape.

Which date is hot lives in a `StateField`, not on the DOM. The spike toggled classes directly, which
a redraw can strand; the field is mapped through changes and rendered like any other decoration.

Scanning the viewport rather than the whole note also retires `contextComplete`. CodeMirror has
parsed as far as it renders, so `syntaxTree()` is reliable exactly over the range being asked about:
no parse budget, no partial answers. `detectDates()` keeps its whole-note behaviour for the report
command.

## The frame and the icon

Geometry is CSS, not JavaScript. The icon is absolutely positioned inside a zero-width inline
anchor, so it is out of flow and reflows nothing; the frame is a pseudo-element on the mark whose
inset overshoots the date's box by the icon's width on whichever side the icon sits, so one rounded
rectangle encloses both. Placement (`above` / `left` / `right` / `below`) is a class, and it moves
the icon and the frame's overshoot together; it is never a computed coordinate.
No `style` attribute is written at any point, and every value comes from an Obsidian variable.

Two rules the spike paid for: all offsets in `em`, so they track the line's font size, and the icon's
box begins where the date's ends, its leading space being padding inside that box rather than a gap
between two hover targets.

The frame's colour is `--background-modifier-border-hover`. The accent colour the spike used is the
theme's loudest, and this appears whenever a pointer drifts across a date.

## The panel

A CM6 tooltip anchored to the date. CodeMirror owns anchoring, edge-flipping and scroll-following.

```
┌ ‹‹ ‹   March 2024   › ›› ┐
│ Wk  Mo Tu We Th Fr Sa Su │
│  9               1  2  3 │
│ 10   4  5  6  7  8  9 10 │
│ 11  11 12 13 14 15 16 17 │
│ 12  18 19 20 21(22)23 24 │
│ 13  25 26 27 28 29 30 31 │
├──────────────────────────┤
│ Today                    │
│ Writes: 2024-03-22       │
└──────────────────────────┘
```

One view. No month view, no year view, no zoom ladder. `‹ ›` step a month, `‹‹ ››` a year, and the
header is plain text. Reaching a date decades away costs more clicks than typing it, and typing it
is then the right answer: this plugin edits dates that are already written.

Four cell states, which must stay distinguishable:

- **selected**, filled — the date the note holds. Page away from its month and nothing is filled, so
  no cell invites a pointless click.
- **focused**, a ring — where the keyboard is. Paging moves it to the equivalent day, clamped to the
  last day of a shorter month.
- **today**, outlined.
- **outside month**, dimmed.

Navigating never changes the note. A click on a day, or Enter on the focused day, is the only
acceptance.

Keyboard: arrows move a day, PageUp/PageDown a month, Shift with them a year, Enter picks, Escape
closes and returns the caret to the date. The panel takes focus when it opens, which is what makes
the command a real keyboard path.

The footer carries **Today** and the writes line, both switchable off. The writes line shows the
exact text that will replace the date, rendered through the format that matched it, which is where
the format-preserving promise becomes visible.

Month names, weekday names and the week-numbering rule come from moment's active locale, the same
source detection uses. None of them go into the locale files; only our own words do.

## Write-back

Picking a day dispatches one transaction replacing the detected range, so one undo restores the old
date in a single step.

- The replacement is rendered through the format carried on the detection. No re-guessing, and no
  restyling: `22.03.2024` stays dotted, `Friday, 22 March 2024` stays spelled out.
- Exactly the detected range is replaced. Nothing else on the line is touched.
- Any document change closes the picker. If a change lands first, positions map through it, and if
  the text at the mapped range is no longer the date that was detected, the write is abandoned
  rather than aimed at whatever is there now.
- The same note open in two panes is one document: the edit lands once and both show it. The picker
  belongs to the view that opened it and closes with that view.

## Settings

Six, added as plain rows with names only — no descriptions, no sub-page. The settings tab's layout
is being reworked in its own session, and this slice does not pre-empt it.

| Setting | Values | Default |
|---|---|---|
| `trigger` | hover icon / double-click / both | both (existing, now honoured) |
| `iconPlacement` | above / left / right / below | right |
| `showHoverFrame` | on / off | on |
| `showWeekNumbers` | on / off | off |
| `weekStart` | follow the vault's language, or a named day | follow the vault's language |
| `showWritesPreview` | on / off | on |

## Files

| File | Role |
|---|---|
| `src/detect/detect.ts` | gains `detectIn(state, settings, from, to)`; `detectDates()` unchanged for the report |
| `src/editor/decorations.ts` | visible ranges → marks and icon widgets, paired by id |
| `src/editor/hover-state.ts` | the `StateField` holding which date is hot, and the effects that set it |
| `src/editor/picker-tooltip.ts` | open and close effects, the tooltip, and mounting the panel |
| `src/editor/DatePickerExtension.ts` | wires the above; keeps the live-view registry it owns today |
| `src/picker/month.ts` | pure: `buildMonth(year, month, options)` → weeks of flagged cells and week numbers |
| `src/picker/panel.ts` | the panel's DOM, its four cell states and its keyboard |
| `src/picker/write.ts` | pure: old text plus format plus chosen day → replacement string |
| `src/settings.ts` | the five new settings |
| `styles.css` | frame, icon, placement classes, panel |

`src/editor/hover-spike.ts` is deleted, and its CSS block with it.

## Testing

| Layer | How |
|---|---|
| `src/picker/month.ts` | Jest: month lengths, leap years, first day of week per locale, week numbers, the clamp when paging off a 31st |
| `src/picker/write.ts` | Jest: every built-in format round-trips — detect, pick another day, assert the same shape with a new value |
| `src/detect/detect.ts` | Jest: the range-limited entry point, including a date straddling the range edge |
| Tooltip, panel, decorations, hover | By hand in a vault. Neither CodeMirror's view layer nor Obsidian's is available to Jest, which is why `context.ts` has no unit tests either |

`tests/fixtures/manual-test-note.md` grows a picker section: a date in prose, in a heading, in bold,
inside `[…]`, two dates on one line, a date ending a note, and one in each built-in format. The
spike showed the formatting contexts are where this breaks, so those are the ones written down.

## Out of scope

- Times, and everything about them. Slice 3.
- Quick-date shortcuts beyond Today, which are a settings feature of their own (TODO: *Let users
  choose the picker's quick-date shortcuts*).
- Using a Tasks emoji as the affordance (TODO: *Reuse the Tasks plugin's own date icons as the
  affordance*).
- A mobile pass (TODO: *Mobile pass*). The panel is built with touch in mind and verified on a
  device in its own slice.
- Reading mode, permanently.
- Normalising a note's dates to one format (TODO: *Batch command to normalise every date in a
  file*).
