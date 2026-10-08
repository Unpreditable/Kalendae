# Times in notes — manual tests

Copy this whole file into a note. Every case has the line to test right under it; expected results
are in `code style`, which the plugin leaves alone, so the only live times are the test lines.

**Run with `npm run dev` going and Hot Reload installed**, or restart Obsidian after `npm run build`.

**Before you start — Settings → Time formats:** add `HH:mm`, `H:mm`, `h:mm a`, `h:mma` and
`hh:mm a`, in that order. Leave **Write to note** on **On ✓ click** and **Snap minutes** on unless a
case says otherwise.

**The cases are numbered straight through.** Say "17 is wrong" and I will know which one you mean.

---

## Finding

**1.** Hover the time — a clock icon appears beside it, with the outline.

14:05

**2.** Same, for a time with no leading zero.

9:05

**3.** Same, with seconds: one outline around all of it.

14:05:09

**4.** Same, for each of these six spellings.

2:05 pm
2:05 PM
2:05 p.m.
2:05pm
2:05p
02:05 pm

**5.** Same, 12-hour with seconds.

2:05:09 pm

**6.** Two icons: a calendar beside the date, a clock beside the time. Neither outline covers the
other.

Meet 2026-10-04 14:30.

**7.** The outline stops before the full stop.

We left at 2:05 pm.

**8.** The outline is around `2:05` only: a 24-hour time, read by `H:mm`. The "a" after it is
not part of it.

at 2:05 a friend called

**9.** One outline around all of `1:14:05`: a time with seconds, read by `H:mm`. Never around
`14:05` alone.

took 1:14:05 in all

**10.** One outline around all of it, not around the `12:05` alone. The longer reading wins:
`h:mm a` takes it although `HH:mm` and `H:mm` sit above it in the list.

12:05 am

**11.** Nothing is found: not the date, not the time, not the `+02:00` on the end.

created: 2026-10-04T14:30:00+02:00

**12.** Two clocks, one for each end of the range.

10:30-11:45

**13.** None of these three is found.

v14:05 and 14:05x and 25:70

**14.** Hover the time with the distance hint switched on (Settings → On hover) — no hint such as
"in 3 hours" appears.

14:05

## Opening

**15.** Click the clock icon — the clock opens.

14:05

**16.** Double-click the time — the clock opens.

9:05

**17.** Cursor in the time, run **Kalendae: Pick a time** — the clock opens.

14:05:09

**18.** Cursor in the time, run **Kalendae: Pick a date** — the clock opens all the same.

14:05:09

**19.** Cursor in the date, run **Kalendae: Pick a time** — the calendar opens.

Meet 2026-10-04 14:30.

## Shapes

Open the clock on each line and look; press Escape to close.

**20.** Two rings (1–12 outside, 13–23 and 00 inside), no AM/PM toggle, big hour `14`.

14:05

**21.** The big hour has no leading zero: `9`.

9:05

**22.** With the magnet on, two big numbers. With it off, three, and a seconds step.

14:05:09

**23.** One ring; the toggle reads `am` / `pm`.

2:05 pm

**24.** The toggle reads `AM` / `PM`.

2:05 PM

**25.** The toggle reads `a.m.` / `p.m.`.

2:05 p.m.

**26.** The toggle reads `a` / `p`.

2:05p

**27.** The big hour is padded: `02`. The toggle is no taller than the big numbers.

02:05 pm

## Writing

On each line, set the time to half past four in the afternoon and press ✓.

**28.** Becomes `16:30`.

14:05

**29.** Becomes `16:30` — this format writes no leading zero, and 16 needs none.

9:05

**30.** Magnet on: becomes `16:30:00`.

14:05:09

**31.** Magnet off, seconds untouched: becomes `16:30:09`.

14:05:09

**32.** Becomes `4:30 pm`.

2:05 pm

**33.** Becomes `4:30 PM`.

2:05 PM

**34.** Becomes `4:30 p.m.`.

2:05 p.m.

**35.** Becomes `4:30pm`.

2:05pm

**36.** Becomes `4:30p`.

2:05p

**37.** Becomes `04:30 pm`.

02:05 pm

**38.** Magnet off: becomes `4:30:09 pm`.

2:05:09 pm

**39.** Only the time changes; the date and the full stop stay.

Meet 2026-10-04 14:30.

**40.** The full stop stays, once.

We left at 2:05 pm.

**41.** Change the time, then undo once — the old time is back whole.

14:05

**42.** Open the clock and press ✓ without touching anything — nothing is written, and undo has
nothing to undo.

14:05

**43.** Open the clock, magnet on, press ✓ untouched — the seconds are still `09`.

14:05:09

**44.** Flip the toggle to the morning and press ✓ — becomes `2:05 am`.

2:05 pm

## Write to note

Change **Settings → Time picker → Write to note** as each case says; put it back on **On ✓ click**
afterwards.

**45.** **On ✓ click** — a click on the minutes waits; ✓ writes; ✕ and Escape write nothing.

14:05

**46.** **On click** — click an hour, then a minute: the minute click writes. There is no ✕ or ✓,
and the clock and magnet icons sit in the bottom corners.

14:05

**47.** **On double-click** — double-click 3 on the hour dial: becomes `15:05`.

14:05

**48.** **On double-click** — move to the minute dial and double-click 40: becomes `14:40`.

14:05

**49.** **On double-click** — click an hour and then a minute quickly. Tell me if it counted as a
double-click when you did not mean one.

14:05

## Now and hover

**50.** Open the clock. Hover the clock icon inside the panel — the big numbers show the current
time; move away — they go back.

14:05

**51.** Click that icon — the line becomes the current time, hours and minutes only.

14:05

**52.** Click that icon — the line becomes the current time with seconds.

14:05:09

**53.** Open the clock and rest the pointer on the dial — a faded marker follows on the value a
click would pick, and the big numbers show that time.

14:05

**54.** Magnet off, on the minute dial, rest between 35 and 40 — the faded marker reads `37`.

14:05

## Inserting

**55.** Put the cursor on the empty line below and run **Pick a time** — the clock opens on the
current time. Press ✓ untouched: the time is written, in the first format of the list, without
seconds.


**56.** Put the cursor straight after the word below, run **Pick a time**, press ✓ — a space
separates the word and the time.

call

**57.** Settings → Time formats: remove every format. Run **Pick a time** on the empty line below —
a notice says to add a time format. The time under it has no icon. Then put the formats back.


14:05

**58.** Put the cursor on the empty line below and run **Pick a date** — it still writes a date.


## Left alone

**59.** Cursor in the time, press Ctrl/Option + ↑ — the time does not change.

14:05

**60.** Clicking the emoji does nothing; the clock icon is still there.

📅 14:05

## Keyboard in the clock

Open the clock on the line under each case.

**61.** Up and Down step the active unit; Left and Right move between the big numbers.

14:05

**62.** Magnet off, set the minutes to 37, magnet on — Up goes to `40`, Down to `35`.

14:05

**63.** The whole of it is one 12-hour time (the longer reading again). On the hours, press Up —
`11 am` becomes `12 pm`.

11:05 am

**64.** On the minutes, magnet on, press Up — `55` becomes `00` and the hour does not change.

14:55

**65.** Enter writes; Escape closes. Try both.

14:05

**66.** Press Tab repeatedly — a ring moves from icon to icon, stays inside the panel, and comes
back round to the dial, where the arrows work again. Shift + Tab goes the other way. With the ring
on ✕, press Enter — the clock closes and nothing else happens.

14:05

## Settings

**67.** The section is called **Dates and times in a note**; the hover icon's description shows a
calendar and a clock.

**68.** **Time formats** sits directly below **Date formats**. Each row shows one sample time with
its seconds in faded brackets — the current time before 10 o'clock, `9:05[:07]` from 10 on, so
`H:mm` and `HH:mm` always look different. `h:mm a` reads `9:05[:07] pm`.

**69.** The + menu offers the built-in formats not already in the list, each with its example, and
**Custom…**.

**70.** Add the custom format `HH.mm` — it saves, and its row reads like `09.05[.07]`. Then both
times below are found.

14.05 and 14.05.09

**71.** Custom, each refused with its own message: `mm:ss` (needs an hour), `HH` (needs a minute),
`h:mm` (needs am/pm), `HH:mm a` (am/pm with a 24-hour hour), `YYYY-MM-DD HH:mm` (unknown tokens),
`Hmm` (run together).

**72.** In the table above the format field, am/pm reads "(Required with h or hh)": a tick for
`h:mm a`, a cross for `h:mm` and for `HH:mm a`, nothing for `HH:mm`.

**73.** In **Date formats**, Custom: `YYYY-MM-DD HH:mm` is refused as unknown tokens, and `HH:mm`
as needing a year — the same messages as before times existed.

**74.** Drag `H:mm` above `HH:mm` — the `HH:mm` row shows a warning that the one above claims its
times. Drag it back.

**75.** Drag a time row — it moves within Time formats only, and Date formats can still be dragged.

**76.** The last time format can be removed; the last date format cannot.

**77.** Close and reopen settings — both lists still drag.

**78.** Switch off double-click, the hover icon and the Tasks emoji — a note appears naming both
**Pick a date** and **Pick a time**. Switch them back on.

## Looks

**79.** Light and dark theme — face, hand, knob, faded marker, numbers, toggle and corner icons
follow the theme. The magnet is a filled circle when on.

14:05

**80.** Larger interface font (Settings → Appearance) — the panel grows with it and nothing
overlaps.

2:05 pm

**81.** Scroll so this line is near the bottom of the window and open the clock — the panel flips
above the line.

14:05

**82.** In each of the three lines below the clock icon sits beside the time, and the text does not
move when the icon appears.

### Heading at 14:05

- a list item at 14:05

**bold 14:05 text**
