# Let `pickDate` callers limit which days can be picked

TODO item 29. Short design.

## Why

GTD Tasks' drop menu opens Kalendae from "Custom…" after a task is dropped into a bucket. Only
days inside that bucket's range should be pickable: a task dropped into "Next week" must not end
up dated outside it. GTD Tasks already sends the option (`src/integrations/Kalendae.ts` there) and
checks the picked day itself, so an older Kalendae is covered on its side.

## Goals, non-goals

- Goal: a caller passes the allowed days, and the calendar makes everything else impossible to
  pick, by pointer or keyboard.
- Non-goal: ranges with no end. GTD Tasks offers "Custom…" only for buckets with an end date.
- Non-goal: any change to the calendar opened from the editor. It never passes the option.
- Anti-goal: a shaded day that looks like a day from the previous or next month, a weekend, or
  today.

## Approaches

The API shape was settled by the caller, which is already built against it. The open choice was
how a day outside looks. Four were mocked in light and dark:

- A. Faint and struck through.
- **D. Struck through, numbers faded to near-invisible.** Chosen by Vitaly.
- B. Diagonal hatching joined into one region, numbers readable.
- C. Hatching with faded numbers.

D keeps the calendar's backgrounds as they are (the weekend band shows through) and is the
quietest of the four.

## Design

**The option.** `allowed?: Array<{ from: string; to: string } | string>` on `pickDate`, always
`YYYY-MM-DD` whatever `pattern` is, both ends inclusive. Missing, empty, not a list, or nothing
in it readable means no limit: the caller checks the day it gets back. An entry that cannot be
read is skipped. Ranges may overlap or come in any order. `docs/kalendae-api.d.ts`
and `src/api.ts` gain the field and its comment, including that an older Kalendae ignores it.

**Looks (D).** A day outside is `--text-faint`, faded further, and `text-decoration: line-through`
(the shorthand only, per the CSS rules). No hover fill, default cursor, `aria-disabled`. A day from
the next or previous month that is also outside gets both treatments. Today's outline stays on
today even when it is outside.

**Pointer.** Clicking a day outside does nothing.

**Preview line.** Hovering a day outside shows its date in full, readable, with Obsidian's `lock`
icon in front in the same muted colour. Back on a pickable day the lock goes. A disabled Today or
quick-date button shows the same on hover. No new string: the day itself carries `aria-disabled`
for screen readers. Chosen by Vitaly over a struck-through date (hard to read) and a word such as
"Not available" (thirteen translations, and the line jumps between a date and a word).

**Keyboard.** The ring never lands on a day outside:

1. If the day a key aims at can be picked, go there.
2. Otherwise the pickable day nearest to it, not past the day the ring started from. ↓ from
   Monday the 16th in a 16–22 range aims at the 23rd and lands on Sunday the 22nd.
3. If nothing lies between, the next pickable day beyond the target in that direction (only
   matters with more than one range).
4. If nothing lies that way at all, the ring stays put.

Arrows, PageUp/PageDown and Shift+Page all follow it. Enter on the ring always picks, since the
ring is always on a pickable day.

**Chevrons.** A month or year step goes to the allowed day nearest the day it aims at, among the
months past the one on show in its direction (the later day on a tie). A month with nothing to
pick is skipped: with January and March allowed, › from January lands in March and ‹ from March
back in January. With nothing that way, the step does nothing and its chevron is disabled.
PageUp and PageDown follow the same rule. Found in Obsidian: with 23–30 November allowed, › used
to move the ring to the 30th and stay on November, which read as a broken button.

**Opening.** When `value` is outside, the ring opens on the nearest pickable day, the later one on
a tie. The fill stays on `value`, struck through like any day outside, so the reader still sees
the date the task had.

**Today and quick-date buttons.** Disabled when the day they would pick is outside. A disabled
button still answers hover, so the preview line can show its locked date.

**Where.** The pure parts go in `src/picker/month.ts` and are unit-tested: reading `allowed`,
"is this day allowed", and the nearest-day rule. `panel.ts` takes an `AllowedDays` value, a
test plus the ranges it was read from, and applies it; absent means every day. The ranges are
there for the nearest-day searches, which compare against each range rather than walking a day
at a time, so entries years apart cost no more than a week. `popup.ts` passes it through. No new strings.

## Left to the builder

Exact opacity for D (the mockup used 0.35).
