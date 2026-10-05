# Clock dial — design

Status: approved in conversation 2026-10-03, revised 2026-10-04 after a first look in the vault
Slice: the first step into times (TODO 15, under 3). The time selector alone: no detection, no
write-back. A temporary command opens it so it can be seen and tuned in a real vault.

## What this delivers

A panel for picking a time, built to sit beside the calendar as its continuation. It opens on a
time, takes the shape of the pattern that time was written in, and reports what the user chose.
In this slice nothing calls it but a throwaway command; the goal is that the panel looks and feels
right before anything depends on it.

## Base

Material's clock dial, re-skinned as a Kalendae panel: the same `.kalendae-panel` shell, theme
variables and keyboard habits as the calendar, not Material's look. Material's keyboard icon and its
typing mode are dropped — typing a time belongs in the note, which is already a text field.

## Shape from the pattern

The panel is handed a moment pattern and a locale, as the calendar is today. The pattern, not the
locale, decides the shape:

| In the pattern | The panel |
|---|---|
| `H` / `HH` | 24 hours, two rings, no AM/PM toggle |
| `h` / `hh` with `a` or `A` | 12 hours, one ring, AM/PM toggle |
| `s` / `ss` | a seconds unit after minutes (only with Snap off) |
| `H`, `h`, `m`, `s` versus doubled | leading zeros in the big numbers and in what is written |
| `a` versus `A` | the case of the AM/PM words |

## Layout

Top to bottom, with nothing below the dial:

```
┌──────────────────────────────┐
│     14 : 35           ┌────┐ │
│                       │ AM │ │
│                       │ PM │ │
│                       └────┘ │
│ 🕘      ╭─ 12 ─╮         🧲  │   Now, Snap
│      11 ╱  00    ╲ 1         │
│    10  23  ●  13   2         │
│      9 22 ╱   14  3          │
│ ✕       ╰─ 6 ──╯         ✓   │   Cancel, OK
└──────────────────────────────┘
```

- **Big numbers** — `HH : mm`, or `HH : mm : ss` when the pattern has seconds and Snap is off, at
  1.5× Obsidian's large UI font. They display the time and act as tabs: clicking one switches the
  dial to that unit. They are not typeable. The active one is filled with the accent.
- **AM/PM toggle** — beside the numbers, 12-hour patterns only. The numbers set the row's height and
  the toggle stretches to it, never taller. See *AM/PM words* below.
- **Dial** — one unit at a time, an SVG 16em wide. 24-hour hours use Material's two rings: outer
  1–12 with 12 at the top, inner 13–23 with 00 at the top. 12-hour hours use the outer ring alone.
  Minutes and seconds use one ring labelled `00 05 10 … 55`. A hand runs from the centre to the
  value.
- **Corners** — the controls sit in the four corners the round face leaves free, so the panel ends
  where the dial does. All four are icons with their name as tooltip and screen-reader label, so a
  translation never changes their size:
  - top left: **Now** (clock icon); top right: **Snap** (magnet icon);
  - bottom left: **Cancel** (✕); bottom right: **OK** (✓, in the accent colour, tooltip "Write this time").
  - When a click writes (see *Writing the time*), there is no Cancel or OK, and Now and Snap move
    down to the bottom corners.
- **Snap's state** — on, it is a filled accent circle with the icon in the on-accent colour, as the
  active big number is; off, a plain muted icon. An icon's colour alone was lost in some themes.
- The panel's padding is half the calendar's: the face leaves air of its own at the sides.

There is no line showing what will be written. In the calendar that line earns its place — the grid
shows `9`, the note gets `Wednesday, 9 September 2026` — but here the big numbers and the toggle
already say nearly everything the note gets, and the hover preview below covers the rest.

The dial is SVG because the CSS rules forbid inline styles: every label's position and the hand's
angle are SVG attributes, computed, rather than one hand-written class per position. Colours come
from theme variables in `styles.css`, and every panel rule is scoped under `.kalendae-panel` as the
calendar's are.

## Behaviour

**Pointer.**
- With the pointer resting on the dial, a faded marker in the knob's shape sits on the value a click
  there would pick — not under the raw pointer, but snapped to what a click can land on, on the ring
  a click would hit. A value without a label of its own, such as minute 37, shows its number in the
  marker.
- At the same time the big numbers (and the AM/PM toggle) show the time that click would give, at
  full strength. Leaving the dial puts the time being built back.
- Pressing or dragging moves the solid hand live and hides the faded marker; the big numbers follow.
- Releasing settles that unit and advances: hour → minute → second, where there is one. What the
  last unit does on release depends on *Writing the time*.
- On the 24-hour dial, the distance from the centre picks the ring.
- Snap on: minutes land on the nearest 5. Snap off: every minute. Hours always land on whole hours.
- Changing Snap mid-pick leaves the current value as it is; the next dial move follows the new
  setting.
- Only the primary button turns the hand.

**Keyboard.**
- Up / Down change the active unit by one step: one hour, or 5 or 1 minutes according to Snap.
- Left / Right move between the units in the big numbers.
- Hours wrap through the whole day; in 12-hour mode, passing 11 flips AM and PM.
- Minutes and seconds wrap within their unit (59 → 00) and do not carry into the hour.
- Enter is OK, Escape is Cancel, in every mode. Tab reaches the toggle and the corner buttons; a
  button reached with Tab answers Enter itself, and only itself.
- A click anywhere in the panel puts the keyboard back on the panel.

**AM/PM.** Choosing the other half keeps the hour on the dial: 2 AM becomes 2 PM.

**Now.** Hovering it previews the current time in the big numbers. Clicking it writes the exact
current time, seconds included, whatever Snap says, and closes — at once, as Today does.

**Closing.**
- **OK** writes the time. With Snap on, seconds in the pattern are written as `00` — but only when
  something was edited.
- **OK with no change is Cancel.** Opening `14:32:47` and pressing OK untouched writes nothing, so
  the seconds survive.
- **Cancel**, Escape, or a click outside the panel closes it and writes nothing.

## Writing the time

A setting, **Write to note**, under Time picker, with three choices:

| Choice | A click on the dial | OK and Cancel |
|---|---|---|
| On ✓ click (default) | settles the unit and moves on; the last one waits | shown |
| On double-click | the same; a double-click writes what is under it, keeping the other units | shown |
| On click | settles the unit and moves on; on the last unit it writes | not shown |

OK is the default because it is the safe one: nothing reaches the note until the user says so.

A double-click is a second press within 500 ms of the last release. Because the first click has
already moved the dial on, the second goes back to the unit the first was on before writing: at
14:30, double-clicking 3 on the hour dial writes 15:30.

## Snap

One setting, **Snap minutes**, default on, under Time picker. It is only where Snap starts: the
panel's magnet overrides it for that one pick and is back to the setting the next time the panel
opens. It never writes the setting.

Snap on: the dial snaps to 5 minutes and there is no seconds unit. Snap off: the dial lands on every
minute, and a pattern with seconds gets the seconds unit at one-second precision.

## AM/PM words

Moment's meridiem words are not one pair per language. English, German, French, Spanish, Portuguese,
Lithuanian and most others write `AM`/`PM`; Japanese and Korean write `午前`/`午後` and `오전`/`오후`;
Turkish `ÖÖ`/`ÖS`. Russian and Ukrainian have four words chosen by hour, and Chinese six chosen by
hour and minute.

So each half of the toggle shows the word moment would write for the current time on that side: at
2 o'clock in Ukrainian the toggle reads `ночі` / `дня`, at 9 o'clock `ранку` / `вечора`. The toggle
is always two options, and always says what will be written. Its width holds the language's longest
word without shifting as the hour changes.

Moment's switch points are kept as they are, lopsided ones included — Ukrainian and Russian turn
night into morning at 4:00 and day into evening at 17:00. A table of our own would write words that
nothing else in Obsidian writes.

The words come from the locale the time was written in, as dates stay in theirs.

## The temporary command

**Try the time picker** opens the panel in a CodeMirror tooltip at the caret, through the same
mechanism the calendar uses. Each run opens on the current time with a pattern and a locale picked
at random:

- patterns: `HH:mm`, `H:mm`, `HH:mm:ss`, `h:mm a`, `hh:mm A`, `h:mm:ss a`
- locales: English, Ukrainian, Chinese, Japanese, Turkish

OK, Now and a writing click close the panel and write nothing. The command lives on this branch and
is deleted when detection opens the panel for real.

## Files

| File | Role |
|---|---|
| `src/picker/clock-math.ts` | Pure: shape from a pattern, angle ↔ value, which ring a point hits, snapping, arrow steps and wrapping, meridiem words per time and locale, formatting the result |
| `src/picker/clock.ts` | The panel's DOM, SVG, pointer and keyboard. Knows nothing of CodeMirror: takes a time, a pattern, a locale and settings; reports a time or closes |
| `src/editor/clock-tooltip.ts` | Temporary: the tooltip at the caret and the command behind it |
| `src/settings.ts` | `snapMinutes: boolean` (default `true`), `clockCommit: "ok" \| "double-click" \| "click"` (default `"ok"`) and `readClockCommit()` |
| `src/settings/settings-tab.ts` | The Time picker heading, the Snap toggle and the Write to note dropdown |
| `src/main.ts` | Registers the temporary command; reads `clockCommit` through `readClockCommit()` |
| `styles.css` | The clock panel, under `.kalendae-panel` |
| `src/i18n/locales/en.json` | New strings, with `_comment` siblings; other locales at the end |

## Testing

- **Unit tests** for `clock-math.ts`: the shape of every pattern in the pool, angle ↔ value both
  ways, ring hit-testing, snapping, arrow steps and wrapping including AM/PM flips, meridiem words
  by hour (and by minute, for Chinese), and OK-without-change writing nothing.
- **Unit tests** for `readClockCommit()`: the default, a stored choice kept, an unknown value
  falling back to OK.
- **A key test** (`tests/i18n/keys.test.ts`): every literal key the source hands to `t()` names a
  string in en.json.
- **Manual checklist** in `docs/manual-tests/2026-10-03-clock-dial.md`: themes, font sizes, the
  panel flipping near the bottom of the window, the longest meridiem words, the three writing modes,
  keyboard-only use.

## Out of scope

- Detecting times in notes and writing them back.
- Dates and times together in one panel, or one pick leading into the other.
- Typing a time into the panel.
- The 15-minute interval (TODO 10), dropped in this design.
