# Times in notes — design

Status: approved in conversation 2026-10-06, spec awaiting review
Slice: the second step into times (TODO 3). The clock dial exists on branch `clock-dial`
(`2026-10-03-clock-dial-design.md`); this connects it to notes: time formats, detection, the ways in,
write-back and insertion. Built on `clock-dial`.

## What this delivers

A time already written in a note can be changed by picking it on the clock, the way a date is
changed on the calendar: hover it and click the clock icon, double-click it, or run a command with
the cursor on it. The time is rewritten in place, in the format and spelling it was written in. A
second command writes a new time where there is none.

## What a time is

**A format is a date or a time, never both.** `2026-10-04 14:30` is a date and a time that happen to
sit side by side; each is found and edited on its own, the date on the calendar and the time on the
clock. Nothing treats the two as one unit.

Time formats live in their own ordered list, **Time formats**, separate from Date formats. Within
it the fullest reading of a time wins, and the order of the list settles the rest.

A time passes the same three gates as a date, in order:

1. the compiled regex for an enabled time format,
2. the boundary rule — a letter or digit on either side disqualifies it, with the dot and underscore
   exceptions dates have,
3. moment's strict parse, which has the final say (`25:70` is not a time).

Rules that are new for times:

- **Seconds come with every format.** A time format also reads the same time with seconds, joined
  by the separator that stands between its hour and minute: `HH:mm` reads `14:05` and `14:05:09`,
  `h:mm a` reads `2:05 pm` and `2:05:09 pm`, `HH.mm` reads `14.05.09`. The format names the family;
  the note decides the exact shape. A custom format that spells out `ss` itself reads only times
  with seconds.
- **A longer time is not cut short.** The separator with a digit beyond it disqualifies a match on
  either side, as a dot does for dates: `HH:mm` never reads the `14:05` inside `1:14:05`, nor the
  `05:09` inside `14:05:09`.
- **The fullest reading wins.** Where one time format reads `12:05` and another reads
  `12:05 am`, the longer one takes it, whatever their order in the list. List order settles only
  readings of the same length (`09:30` under `H:mm` and `HH:mm`).
- **A UTC offset is not a time.** The `+02:00` on the end of a timestamp is shaped like one, and
  editing it as one would corrupt the timestamp. A plus sign in front always disqualifies; a minus
  does where it is written as an offset is — after a space, or straight after a time glued to its
  date by a `T`. `10:30-11:45` is a range, and both ends stay times.
- **Dates win a tie.** Where a date format and a time format can both read a string (`12.10.25` as
  `DD.MM.YY` or `HH.mm.ss`), the date takes it. Date formats are scanned first.
- **The am/pm spelling is the note's own.** For the English-style words, a time is read whether it
  says `pm`, `PM`, `p.m.`, `P.M.`, `p` or `P`, and what it said is remembered and written back:
  `2:05p` becomes `4:30p`, `2:05 P.M.` becomes `4:30 A.M.`. So there is one format per spacing —
  `h:mm a` with a space, `h:mma` without — and none per case.
- **The bare `a` / `p` counts only when attached.** `2:05p` is a time; `2:05 p` and `2:05 a` are
  not, whatever the format — "at 2:05 a friend called" is not 2:05 am. `2:05 pm` and `2:05 p.m.`
  after a space are unambiguous and stay.
- **Other languages** use their own fixed words, moment's, as the clock's toggle already does. The
  spelling memory is for the English-style pair only.

Unchanged: the scope switches (headings, inline code, code blocks, frontmatter, wikilinks) apply to
times as they do to dates. The Tasks emoji and the distance hint stay dates-only — a time on its own
does not say which day it belongs to, so "in 3 hours" would be right in today's note and wrong in
last week's.

## Ways in

The switches dates use, shared: one set covers both.

| Way in | On a time |
|---|---|
| Hover icon | A clock icon beside the time, where a date shows a calendar. Same placement, same outline. |
| Double-click | Opens the clock. |
| **Pick a date** / **Pick a time** | With the cursor on a date or a time, either command opens the panel that fits what is there. |

The two commands differ only on an empty spot: Pick a date writes a date, Pick a time writes a time.

## The clock on a time

- Opens on the time the note holds.
- The shape follows the note: 12 or 24 hours and leading zeros from the format, the seconds unit only
  when this time is written with seconds (and Snap is off, as before).
- The AM/PM toggle reads in the note's own spelling: `a` / `p` for `2:05p`, `A.M.` / `P.M.` for
  `2:05 P.M.`. It goes on saying exactly what will be written.

## Write-back

- Replaces exactly the detected range in one transaction, through the format that matched and the
  spelling that was found: one undo restores the old time whole.
- When it happens follows **Write to note**: on ✓, on double-click, or on click.
- ✓ with no change writes nothing, so untouched seconds survive.
- **Now** writes the current time — with seconds only if the note's time has them.
- The clock closes on any document change; if an edit lands first, `stillThere()` abandons the write,
  as for dates.

## Inserting a time

**Pick a time** with the cursor on neither a date nor a time:

- The clock opens on the current time, in the first format of the Time formats list, without
  seconds.
- ✓ writes even if nothing was touched: there is no original to keep, and "the time now" is a
  reasonable thing to want.
- A space is added on a side where the neighbouring text would otherwise make the time
  undetectable, as for dates.
- With no time formats, nothing opens and a notice says to add one.

## Settings

**Dates in a note** becomes **Dates and times in a note**. Its switches keep their behaviour and
cover both kinds; the hover icon's description shows the clock beside the calendar.

**Time formats**, a new list directly below Date formats, built from the same row, add menu, drag
handle and editor (one implementation, two lists — the deferred rework of the format list will
reach both).

- Description: "The time formats Kalendae recognises in your notes, applied top to bottom." — the
  date list's sentence, with one word changed.
- Each row shows the format and one sample time, with the seconds it also reads in brackets drawn
  fainter than the rest: one time rather than two and an "or", which is shorter, shows where the
  seconds go, and needs nothing translated. The sample is the current time, unless its hour would
  take two digits: `H:mm` and `HH:mm` both read `22:41`, and the rows are there to show the two
  apart. Then it is five past nine, in the same half of the day:

  | Format | Example |
  |---|---|
  | `HH:mm` | 09:05[:07] |
  | `H:mm` | 9:05[:07] |
  | `h:mm a` | 9:05[:07] pm |
  | `h:mma` | 9:05[:07]pm |
  | `hh:mm a` | 09:05[:07] pm |

  These five are in the add menu, with a sixth for the languages that write am/pm first:
  `a h:mm` (`오후 2:05`).
- The first format is the one Pick a time inserts.
- The list may be empty, which switches times off.
- **Seeded once, by region**, as the week start and the languages are, from moment's own short
  time for the app's language: `h:mm a` where it is 12-hour, `a h:mm` where it is 12-hour with
  am/pm first (Korean, Hindi and a few others), `HH:mm` elsewhere. A vault updating from a version
  without times is seeded the same way on first load.

**Custom time formats** use the format editor, showing the time's building blocks — hour (`H`, `HH`,
`h`, `hh`), minute (`m`, `mm`), second (`s`, `ss`), am/pm (`a`, `A`). The am/pm row reads
"(Required with h or hh)" and is ticked or crossed like a required part: ticked with a 12-hour hour
and am/pm, crossed with a 12-hour hour and none or with a 24-hour hour and one, and left blank for a
24-hour format without it. The editor refuses:

- a format without an hour or without a minute;
- a 12-hour hour without am/pm, or am/pm with a 24-hour hour;
- a date's letters, as any other letters it does not know — and the date editor refuses a time's
  letters the same way it always has. Neither editor says "a date or a time, not both": tried, and
  it read as the editor recognising a time and refusing it anyway.

**Warnings between rows** (`shadowedFormats`) work for the time list as for dates.

**Time picker** is unchanged: Snap minutes, Write to note.

## Clean-up

- The temporary **Try the time picker** command and `src/editor/clock-tooltip.ts` are deleted, with
  the command's string in every locale.
- `docs/manual-tests/2026-10-03-clock-dial.md` is rewritten so each case starts from a time written
  in a note, which can be edited to set the case up.
- CLAUDE.md's architecture section stops saying times do not exist.

## Files

| File | Change |
|---|---|
| `src/detect/formats.ts` | Time tokens; a format's kind; `checkFormat` per kind, with the mixed-format problem; the seconds variant of a time pattern; `BUILT_IN_TIME_FORMATS` |
| `src/detect/meridiem.ts` (new) | Pure: read the am/pm spelling out of a matched time, and write a time in that spelling |
| `src/detect/scan.ts` | `Candidate.kind`; time entries scanned after date entries; the separator-with-digit boundary for times; the attached-only bare `a`/`p` |
| `src/detect/detect.ts` | Passes `settings.timeFormats` through |
| `src/detect/shadow.ts` | Works on either list |
| `src/picker/clock-math.ts` | Reading a time out of text; a meridiem style on the toggle's words and on the result |
| `src/picker/write.ts` | Replacement and insertion for a time |
| `src/editor/decorations.ts` | The clock icon on time detections; no Tasks-emoji mark for them |
| `src/editor/picker-tooltip.ts` | One target type carrying its kind; the clock mounted for a time, with real writes |
| `src/editor/hover-hint.ts`, `src/editor/nudge-keys.ts` | Ignore time detections |
| `src/editor/clock-tooltip.ts` | Deleted |
| `src/main.ts` | `pick-time`; the insert path for a time; the seeded default; temporary command removed |
| `src/settings.ts` | `timeFormats`, its normaliser, the regional default |
| `src/settings/settings-tab.ts`, `format-list.ts`, `format-modal.ts` | The Time formats list; rows, add menu and editor taking a kind |
| `src/i18n/locales/en.json` | New and changed strings; other locales at the end |
| `styles.css` | The clock icon beside a time, if it needs anything the calendar icon does not |

## Testing

- **Unit tests**, pure: time tokens and `checkFormat` for each refusal; the seconds variant and its
  separator; the boundary rule (`14:05:09` under `HH:mm`, `1:14:05`, a time ending a sentence);
  dates winning a tie; every am/pm spelling read and written back; bare `a`/`p` attached and not;
  non-English words; write-back keeping format, seconds and spelling; insertion padding; the
  regional default; the time list's normaliser.
- **Round trip**: every built-in time format, written and then scanned, is found again — with and
  without seconds.
- **Manual checklist**, rewritten: each case a time in a note.

## Out of scope

Each gets its own TODO item:

- Stepping a time with Ctrl/Option + ↑/↓.
- Typing a time in words (`@3pm`).
- A date and a time as one unit (`2026-10-04T14:30`), and with it a distance hint for times.
