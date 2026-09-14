# Quick dates — design

Status: drafted 2026-09-12, revised 2026-09-13 after review and again after the settings rework, built
Item: TODO 11, *Let users choose the picker's quick-date shortcuts*

## What this delivers

The calendar ships one shortcut, **Today**, because it is the only one everybody wants. This adds
up to four more, of the reader's own choosing, on a row of their own under the calendar — Tomorrow,
end of week, next Monday, a fortnight out, whatever they actually reach for.

They are built rather than typed. A slot is filled from a menu of fourteen presets in one click, or
assembled step by step in a small builder; nothing about how a rule is written is ever put in front
of someone who did not ask for it. Underneath, every rule — ours and theirs alike — is one short
expression in one language, which is what gets stored, what the catalogue is written in, and what
extends to times when item 3 lands.

**Today does not change.** It stays a permanent button in the footer, unconfigurable, and is not in
the catalogue. It is the one shortcut that should never be lost to a stray click in settings.

## The expression language

A rule is an **anchor** followed by one or more **steps**, applied left to right, separated by
single spaces.

```
rule     := anchor step+                 -- at least one step
anchor   := "today" | "date"
step     := amount | weekday | edge
amount   := sign count unit
weekday  := day | sign count day
edge     := "SoW"|"EoW"|"SoM"|"EoM"|"SoQ"|"EoQ"|"SoY"|"EoY"
sign     := "+" | "-"
count    := [1-9][0-9]{0,2}              -- 1 to 999, always beside a sign
unit     := "d" | "w" | "M" | "Q" | "y"
day      := "Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat"|"Sun"
```

| | |
|---|---|
| `today` | the reader's own clock — the local date now, as `todayKey()` already reads it |
| `date` | the day the calendar opened on — *The date* in a reading. On an insert there is no date yet, so it is today |
| `+1w` `-3d` `+2M` `+1Q` `-1y` | move by an amount |
| `+1Mon` `-1Mon` `+2Mon` | move to that weekday, strictly: on a Monday, `+1Mon` is seven days out |
| `Mon` | the nearest Monday at or after the anchor — today counts |
| `SoW` `EoW` | the week's first and last day, by the **week-start setting**, never ISO |
| `SoM` `EoM` · `SoQ` `EoQ` · `SoY` `EoY` | the month's, quarter's and year's first and last day |

```
today +1d                 tomorrow
today EoW                 end of this week
today +2Mon               the Monday after next
today +1Q EoQ             end of next quarter
date  +1w                 a week after the date in the note
date  EoM                 end of the note's own month
```

**A sign and a count always appear together.** Neither is ever alone: `2Mon` is not a rule and
nor is `+Mon`. Anchors, edges and the bare weekday take neither, which is what keeps the two
weekday forms from overlapping — `Mon` and `+1Mon` differ only when the anchor is already a Monday,
which is precisely the case they exist to separate.

The count starts at 1, so `+0d` cannot be written; a step that moves nowhere is not a step. It
stops at 999 for the same reason a text field has a maximum: a rule reading `+99999999y` is a slip,
not an intention. And a rule must carry at least one step — `today` on its own is the Today button,
which is already there and cannot be configured away.

**Case is exact.** `M` is months and `m` is minutes, which is moment's own rule and the one the
custom format modal already teaches anyone who has written `DD.MM.YYYY`. Accepting either case
today would make `+15m` unreadable the day times ship, or silently change the meaning of every
stored `+1m` — a migration for a problem we chose to create.

**Reserved, unimplemented, and not to be spent on anything else:** `h` `H` `m` `s`, `SoD` `EoD`,
`SoB` `EoB`, `now`. Every one of them is a time, and times are item 3. `h` and `H` are both taken
because moment uses both — twelve- and twenty-four-hour — and leaving one free would make the pair
inconsistent later. In particular `EoB` is *end of business* — five o'clock on a day — and is not a
synonym for the working week's last day.

**Every step here is date-only, and stays that way.** When times arrive, `EoM` must mean the last
day of the month at whatever time the value already carries, with `EoD` as the separate thing that
sets a time. An edge that quietly also set a time would change what existing rules do.

**The working week is not in the language.** `EoW` means the calendar week's last day and nothing
else. A week that ends on a Friday is `today Fri`; one that ends on a Thursday is `today Thu`. The
plugin does not guess which, because the next question after the weekend is the holiday calendar,
and a named day answers both without a second calendar model to maintain.

Month, quarter and year arithmetic clamps exactly as the calendar's paging already does: the 31st
of January plus a month is the 29th of February, never the 2nd of March.

**`SoW` and `EoW` are computed from `firstDayOf(settings.weekStart)`, not from
`moment().startOf("week")`.** moment's own week start follows its locale, which is not the setting
the reader chose and not what the grid is drawn from — `buildMonth()` already does this arithmetic
by hand for exactly that reason. The two agree often enough that the wrong one would survive
casual testing.

### The weekday spelling, and why it is settled

The bare-versus-signed weekday was the one part of the grammar with no obviously right answer.
It is decided rather than provisional, and the reasoning is recorded here so it is not reopened
by accident.

`Mon` and `+1Mon` are two meanings, not two spellings — *the nearest one, today counting* and
*strictly forward* — and the sign is what separates them. No other spelling put the distinction
anywhere more visible.

It was briefly justified by an escape hatch that does not exist: a slot stores which preset it
holds, but a rule of the reader's own is stored as text, and those are precisely the rules that
would use this. Changing the spelling later would migrate real settings. What makes that bearable
is that nobody can type a rule: the builder writes every stored rule, so if the spelling ever had
to change, the builder could rewrite them all on upgrade.

## The catalogue

Eighteen presets. Each is an id, a translated label, and a rule in the language above; the id is
what a slot stores.

**They are not grouped by a heading.** The menu separates the two families with a plain rule and
names neither, because the headings that were there first confused more than they settled — a
reader choosing *End of this month* does not begin by asking what it counts from. The labels carry
it instead, and consistently: **in** and **this** always mean today, **later** and **that** always
mean the date being edited.

| id | label | short form | rule |
|---|---|---|---|
| `tomorrow` | Tomorrow | Tomorrow | `today +1d` |
| `yesterday` | Yesterday | Yesterday | `today -1d` |
| `inSevenDays` | In 7 days | In 7 days | `today +7d` |
| `nextMonday` | Next Monday | Next Mon | `today +1Mon` |
| `nextFriday` | Next Friday | Next Fri | `today +1Fri` |
| `endOfThisWeek` | End of this week | EoW | `today EoW` |
| `startOfNextWeek` | Start of next week | Next SoW | `today +1w SoW` |
| `endOfThisMonth` | End of this month | EoM | `today EoM` |
| `startOfNextMonth` | Start of next month | Next SoM | `today +1M SoM` |
| `endOfThisQuarter` | End of this quarter | EoQ | `today EoQ` |
| `dayLater` | 1 day later | +1 day | `date +1d` |
| `sevenDaysLater` | 7 days later | +7 days | `date +7d` |
| `fourteenDaysLater` | 14 days later | +14 days | `date +14d` |
| `monthLater` | 1 month later | +1 month | `date +1M` |
| `startOfThatWeek` | Start of that week | That SoW | `date SoW` |
| `endOfThatWeek` | End of that week | That EoW | `date EoW` |
| `startOfThatMonth` | Start of that month | That SoM | `date SoM` |
| `endOfThatMonth` | End of that month | That EoM | `date EoM` |

**Each preset carries two names.** The label is what the chooser menu and the settings table show,
where there is room for a sentence. The short form is what the button in the calendar says, and
what stands in the name field until the reader types over it — the calendar is a small popup, and a
button reading *End of this quarter* widens it on its own. The same distinction the labels make
survives into the short forms: unmarked means today, `That …` and `+ …` mean the date being edited.

A name the reader writes is their own words and can be any length. **The shortcut row is a grid,
not a flex row**, and that is what decides how they share the space: `grid-auto-flow: column` with
`grid-auto-columns: minmax(0, auto)`. Each column starts at zero and may grow to the width of its
own name; free space is handed out equally and a track freezes the moment it fits. `EoM` freezes at
three letters, `Yesterday` at nine, and what is left over is split between the names still asking
for more — so the longest is cut first and a short name is never touched.

Flex cannot express that, and three attempts proved it. Flex has no *then*: every item with a
non-zero shrink gives up part of any shortfall at once, so a short name always lost a fraction of a
pixel, and a fraction is enough — `text-overflow: ellipsis` fires whenever the text exceeds its box
by any amount, so a name losing 0.08px rendered as `Eo…`. Ranking the shrink factors by name length
only changed how lopsided that loss was. Pinning the short ones at `flex-shrink: 0` then left flex
with nowhere to put the overflow but a second line, and the popup grew to three rows. A frozen grid
track, by contrast, is exactly the width the ellipsis test compares against.

Two supporting rules. The footer is `width: 0` with `min-width: 100%`, which keeps it out of the
panel's own measurement: without it the panel is as wide as its widest child, so a shortcut named
`asdf23423424` made the whole calendar that wide and nothing ever needed clipping. And the row is
`flex: 0 1 auto`, which is what decides whether it shares Today's line. Flex asks whether an item
fits using its hypothetical size — what it wants before any shrinking — so a content-sized basis
drops the row onto a line of its own exactly when the names would not fit beside Today at full
width. Squeezing them in and cutting them short is the worse trade, and this is how the row knows
without anything measuring anything. The preview case keeps its own line through
`flex-basis: 100%`.

The cut has to be at the end, and two properties are needed for it rather than one. Obsidian's
buttons are flex containers, so a label is a flex item centred by `justify-content` — `text-align`
applies to nothing and an over-wide name loses both ends with the ellipsis marking neither.
`display: block` on the button is what makes `text-align: start` mean something.

Hiding what does not fit was refused twice over: it needs the row and its buttons measured in
JavaScript, which this plugin's layout never does, and a shortcut the reader configured would then
be missing with nothing to say why. The page says so instead, under the Shortcuts heading:
*Keep names short. The calendar cuts off a name too long for its row.*

`In 7 days` rather than `In a week`, and `today +7d` rather than `today +1w`, so the label and the
rule say the same thing: they resolve identically, and the one a reader can check against the other
is worth more than the tidier unit.

Only two weekdays are offered. All seven would be a third of the catalogue for the sake of the two
nobody has to think about, and `today +1Wed` is one custom slot away.

## Settings

### The row on the tab

The **Calendar** section gains one `page` row beside week start and week numbers, reading out what
is set — the same shape the scope summary already has, separators included:

```
First day of the week                                 Monday
Week numbers                                             [●]
Preview the new date                                     [●]
Quick dates      Tomorrow · End of week · End of month     ›
```

Three states: the filled slots' names, `None` when nothing is filled, and `Off` when quick dates
are switched off whatever the slots hold.

### The page

```
── Quick dates ────────────────────────────────────────────

  Show quick dates                                     [●]

  Shown under the calendar, after Today.

  Rule                Name          Meaning
  ──────────────────────────────────────────────────────────
  [ Yesterday    ▾ ]  [          ]  Today → 1 day back
  [ — None —     ▾ ]  [          ]
  [ Custom…      ▾ ]  [ Sprint   ]  Today → 2 Monday on    ✎
  [ — None —     ▾ ]  [          ]
```

**A table, drawn by hand**, for the reason the format list is: a `Setting` row puts its name and
description on the left and its controls hard against the right, which stranded each rule's reading
on a line of its own and bunched the chooser and the name field at the far edge. One grid carries
the header and all four rows, so a cell shares its column's track with the cell above it — rows are
not elements of their own, because a wrapper per row would give each its own tracks, which is the
misalignment being fixed.

No slot numbers. Nothing else in settings refers to a slot by position, so the column would be a
label with no reader.

**One chooser per slot**, a `Menu` rather than a `<select>`: it separates, and it draws in-theme.
It holds `— None —`, the eighteen presets in two separated families, and `Custom…`.

Each entry in it is two columns — the preset's name, and its rule in words away to the right —
built as a `DocumentFragment` rather than one string. Spaces between two strings collapse, and the
pair then read as one sentence.

- **A preset** fills the slot in one click. Nothing opens.
- **`Custom…`** opens the editor, pre-filled from whatever the slot held.
- **`— None —`** clears the slot. Nothing else deletes.

**The name** is a text field in the same column for every kind of slot, filled in with the preset's
short form until the reader types something else. The real text, not a placeholder standing in for
it: a placeholder cannot be selected, appended to or edited down, so shortening a preset's name
meant retyping it from nothing.

Filling it in has one consequence to guard. A field whose contents read exactly the preset's short
form stores no name at all, so clicking into it and out again writes nothing down — a stored name
stops following the app's language, and a German vault would otherwise be left holding an English
one nobody typed. A slot holding a rule of the reader's own cannot
be left nameless: clearing that field and leaving it reverts, because the read-back empties a
nameless rule and a keystroke should not be able to destroy one.

**A preview closes the page**: the calendar as these settings currently draw it, built by the real
`createPanel()` from the live settings — the rule the scope page's sample already follows, where a
worked example cannot drift from what the plugin does because it is what the plugin does. It
redraws on every keystroke in a name field, so a name that will be cut off shows itself being cut
off while it is still being typed. Only the sample is rebuilt, never the table: redrawing the row
under the caret would take the focus out of the field being typed into. Picking a day does nothing;
there is no note behind this one.

**Four slots, always four.** No add button, no trash and no dragging: a list that cannot exceed
four rows earns none of the three. Reordering means editing two slots.

### The editor

The only place a rule of the reader's own is made, and what `Custom…` and the pencil both open.

```
── Custom quick date ──────────────────────────────────────

  Name        [ Sprint end                              ]

              Start with today or date, then add steps.
  Rule        [ today +2Mo                              ]
              ┌────────────────────────────────────────┐
              │ +2Mon        2 Monday on               │
              └────────────────────────────────────────┘

              Today → 2 Monday on
  Rule        [ today +2Mon                             ]

  Test date   [ 2026/12/28 ] 📅  → 2027/01/11
```

**The rule is typed, with a list under the caret.** The chip builder that came first was the wrong
answer: three kinds of step, each with its own controls and most of them disabled, was harder to
understand than the language it existed to hide. This is the interaction everyone already knows
from the command palette, and the list is the documentation — every entry carries its own meaning,
so `EoM` reads **End of month** in the row that inserts it.

**The list is about the token the caret is in**, not about the end of the field. Standing in
`today` offers the anchors, because that is what may go there, and choosing one replaces that token
rather than appending after the rule. A token already standing complete offers what could stand
there *instead*, unfiltered: filtering by a finished word leaves only that word, so resting in
`today` offered `today` and no way to change it. Moving the caret fires no `input` event, so the
list is asked again on a click, on the horizontal arrows and on Home and End — but not on the
vertical arrows, which are the reader moving through the list itself. It completes whatever sign and digits are already typed, so
`+3` offers `+3d` and `+3Mon` rather than starting the number again. Matching ignores case and
insertion does not: typing `eom` finds `EoM`, which is the point, since the case rule is real and
nobody should have to know it to find a token.

**It chains at the end, and only there.** Choosing the last token appends a space and opens the
list again for the next one, so a rule is assembled without typing between picks; choosing a token
in the middle puts the caret after it and stops, because a reader who went back to fix one token
has fixed it. **— Done —** heads the list once the rule reads and the caret is at its end, and
takes the focus out of the field rather than merely closing the list — a list dismissed under a
caret still in the field is one keystroke from being back. Escape does the same. Returning to the
field asks again. `AbstractInputSuggest` is
Obsidian's own, so the popover draws and navigates like every other suggestion list in the app.

**The test date** stands in for both today and the date in the note, so every rule answers to it —
a shortcut can be tried on the day it behaves differently, end of quarter in December or a weekday
rule on that weekday.

It is written and answered in `YYYY/MM/DD`, fixed, never the reader's own format: theirs could be
`DD.MM.YYYY` or `MMM D, YYYY`, which makes the field ambiguous to type into and gives the answer a
different shape from the thing it answers. The row says which format it wants. Nothing about the
shortcut depends on this — it is a bench test, not a date going into a note.

The row carries no description. A `Setting`'s description widens its info column, which pushes
every control on the row to the right; the format belongs in the field's own placeholder, not in a
line that costs the answer beside it its space.

It can also be picked from the plugin's own calendar, which `createPanel()` provides — **in a
dialog of its own**, not a popover inside this one. An absolutely positioned panel still counts
towards the modal's scroll height, so it grew the dialog under the pointer; taking it out of the
dialog would mean positioning it against the button's rectangle, and measuring geometry in
JavaScript is the one thing this plugin's layout never does. A second dialog needs no measurement
and closes on Escape and on a click outside.

**The label column is as wide as the labels and no wider**, against the halves Obsidian gives a
setting row by default: the labels are one word each and the fields are what the reader is working
in. Every control then starts at the same place, which is also what puts the reading over the rule
rather than beside it.

**The rule reads back above its own field**, in the field's column rather than at the dialog's left
edge — a walkthrough of what you are typing belongs where you are typing it. The answer sits on the
test date's own row, `→ 2027/01/11`, beside the date it answers: a result with no visible base says
nothing about what it was a result of, and a line further down repeating the base said it twice.

**When the rule does not read, the reading is replaced by the reason.** `checkRule()` classifies
the first bad token the way `checkFormat()` does for a date pattern, so `today +15m` answers
**m means minutes — write M for months** and `today EoD` answers that a time is not a date. An
empty field gets a hint rather than an error. Save is unavailable until the rule reads and the name
is filled.

**That calendar is handed `showQuickDates: false`.** Otherwise the calendar that picks a test date
for a shortcut offers the shortcuts themselves — including, while it is being edited, the half-built
one that opened it.

No rules are drawn between rows, on the page or in the dialog: Obsidian draws one over every
setting item, and four slots and five short rows are one block rather than five sections. Removing
it takes both of the container's classes in the selector — Obsidian's own rule is
`.modal:not(.mod-settings) .setting-item:not(.setting-item-heading)`, and a single class in front of
`.setting-item` ties with it at best, which is the same arithmetic `.cm-tooltip.kalendae-panel`
already has to do.

## The calendar

The shortcuts follow Today, in slot order. Empty slots take no space, and there is nothing at all
when the feature is off or nothing is filled.

**They are children of the footer, which wraps.** With the date preview off they sit on Today's
line and wrap among themselves if four long names will not fit. With the preview on they are given
a full-width break and always form their own row beneath it.

The condition is the setting, never a measurement. The preview's text changes width on every hover
— it is the date under the pointer — so a layout that wrapped on available width would re-wrap as
the pointer crossed the grid, and the row would jump while being read. One class, set from
`showWritesPreview`, and the rest is CSS: the geometry rule the editor layer already keeps.

`panel.ts` binds `mouseleave` on the footer and the grid to restore the preview line; the
shortcuts need the same treatment wherever they end up, or leaving one strands the preview on a
date the reader is no longer pointing at.

A click is a **selection**: it writes the date into the note and closes the calendar, exactly as
Today and a day cell do. Hovering puts the date it would write on the preview line, as a day cell
does. The buttons are real buttons, so Tab reaches them and Escape still closes the panel, and each
carries the date it lands on in its accessible name — a screen reader hears more than "Sprint end".

## What is stored

Flat on the settings object, matching the reasoning that keeps the scope flags flat:

```ts
/** Exactly four after normalisation; a slot is a preset, a rule of your own, or empty. */
type QuickSlot =
  | null
  | { preset: string; alias?: string }
  | { rule: string; alias: string };

showQuickDates: boolean;   // default true
quickDates: QuickSlot[];   // default [tomorrow, endOfWeek, endOfMonth, null]
```

Fresh installs and upgrades both get Tomorrow, End of week and End of month, with the fourth slot
free. An upgrade therefore gains a row it did not have, which is deliberate: a configurable row
nobody can see is a feature only the settings page knows about.

`normaliseStoredQuickDates()` reads whatever is in `data.json` the way `normaliseStoredFormats()`
already does — the shape is not to be trusted. It always returns four entries. An unknown preset
id, an unparseable rule, or a rule with no alias leaves that slot **empty** rather than guessing:
a `data.json` from a future version must never be able to produce a wrong date or a nameless
button.

The union has no discriminant field, so one rule settles the impossible case: an object carrying
both `preset` and `rule` is read as the preset, and the rule is dropped. A preset is the reading
that cannot be wrong — its rule is ours and is known good — while an orphaned rule string is
exactly the shape a half-finished write would leave behind.

## i18n

English only until the rest has stopped moving, per the working agreement; the other twelve locales
are the second-to-last step before a commit, and `npm run release-check` waits for them.

Three groups of strings: the page and editor's own furniture — column headers included — the
eighteen preset labels, and the step vocabulary: units, weekdays, directions and the eight edges.
The vocabulary is written once and read in three places: the Meaning column, the reading under the
editor's field, and the meaning beside every entry in the suggestion list.

**No phrase is ever concatenated from two translated fragments.** Counts and names are placeholders
inside a single key, so the translator controls word order — which is why an edge is one phrase from
one list rather than *[End] of [month]* assembled from two controls. The chip for a step and the
control that made it are separate strings for the same reason: a dropdown wants the bare noun
*weeks*, a chip wants *2 weeks*, and forcing one string to serve both is what produces "1 weeks".

**Plural keys are available and are used for the chips.** `scripts/validate-translations.mjs`
recognises `_zero` through `_other` (`PLURAL_SUFFIXES`, `basePluralKey()`): a locale may carry forms
English lacks, so Russian's `_few` and `_many` pass the gate. It still requires every key en
declares, so a language that does not distinguish — Japanese, Chinese, Korean — fills `_one` and
`_other` with the same text. That is the cost, and it is smaller than the alternative.

**Weekday ordinals do not come from moment.** `localeData().ordinal()` is the day-of-month ordinal:
it renders as `2日` in Japanese and is gendered by period in Russian, where it cannot agree with the
weekday it is attached to. *2nd Monday* is an English sentence, not a translatable pattern. A
counted weekday is therefore a plural key with a `{{day}}` placeholder, and the day name itself
comes from moment — which is how the grid already says **lundi**.

The gloss under a slot — `Today → Monday ×2` — is a **separated list, not a sentence**. That is the
argument `scopeSummary()` already makes for its middle dots: an arrow between independently
rendered pieces reads as a sequence in every script, where a joined phrase would need grammar we
cannot supply for thirteen languages.

Every user-visible string goes through the stop-slop pass before the translation pass.

## Files

| File | Change |
|---|---|
| `src/picker/quick.ts` | **New.** The language: parse, resolve, describe, and `QUICK_PRESETS`. Pure — moment only, no DOM, no editor |
| `src/picker/quick-text.ts` | **New.** A rule, a step and a slot read back in words, shared by the calendar and both settings surfaces |
| `src/picker/panel.ts` | The shortcut row and its hover previews; the footer becomes a wrapping flex |
| `src/settings.ts` | `QuickSlot`, the two new fields, `normaliseStoredQuickDates()` |
| `src/settings/quick-dates-page.ts` | **New.** The page: the switch and four slots. Calls the tab's `update()` from `hide()`, as `SectionsPage` does, or the summary row keeps the value it was drawn with |
| `src/settings/quick-date-modal.ts` | **New.** The builder |
| `src/settings/settings-tab.ts` | The summary row in the Calendar group |
| `src/i18n/locales/en.json` | The three groups of strings above, with `_comment` siblings |
| `styles.css` | The row, the chips, the slot rows |

## Testing

`quick.ts` is pure and carries every rule, so the whole language is unit-testable and is tested in
full: each unit and sign, both weekday forms including the day where they differ, each edge against
both week starts — Sunday and Monday give different answers for `EoW` on the same date — the 31
January clamp, step order, both anchors, and every way a rule can fail to parse, `+0d`, `+Mon`,
`2Mon` and a stepless `today` among them.

`checkRule()` is tested for every kind of problem it names — a missing anchor, an anchor with no
steps, `+15m`, `EoD`, `+Mon`, `2Mon`, `+0d`, `+1000d` — and `suggestionsFor()` for what it offers
where: anchors only at the start, steps after one, the typed sign and count carried into every
candidate, case-insensitive matching, and completion of the last token rather than the whole field.

`normaliseStoredQuickDates()` is tested beside the format reader: four entries out of any input,
an unknown preset emptied, an unparseable rule emptied, a custom rule with no alias emptied, and
an object carrying both `preset` and `rule` read as the preset.

The page, the builder and the row are not unit-tested. That is the line this repo already draws:
anything needing the Obsidian API or a live editor is verified by hand in a vault.

## Out of scope

- **A step-by-step builder.** Built, then removed on 2026-09-13: chips and three kinds of step
  were harder to follow than the language they hid. Typing with suggestions replaced it, and the
  error messages the builder was supposed to make unnecessary are now what teaches the language.
- **Slot numbers, reordering by dragging, and per-slot switches.** All three are answered by four
  slots and one switch.
- **Working days and holidays.** A named weekday covers the case that prompted it.
- **Times.** Item 3 extends this grammar; the reserved tokens are the whole of the preparation.
- **More than four shortcuts.** The cap is the reason the settings page needs no machinery.
