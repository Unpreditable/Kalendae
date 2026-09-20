# Typed dates — design

Status: drafted 2026-09-13, revised 2026-09-14 with the menu's owner and a settable format switch, revised 2026-09-16
with the words layer, revised 2026-09-17 with explicit dates, revised 2026-09-19 with the settings
section and a trigger of up to three characters; one topic still open
Raised: 2026-09-13, in conversation. No TODO item yet.

## What this delivers

Today a date is inserted from the command palette: invoke *Pick a date*, choose a day, get a date.
That is three steps and a mode change in the middle of a sentence you were already typing.

This adds a second way in. Type the trigger — `@` by default, and up to three characters — at the
start of a word and a list of dates opens under the caret. Keep typing to narrow it, press Enter,
and the trigger and everything after it is replaced by the date, written in the same format the
insert command uses unless you ask for another.

```
Standup moved to @tom            →  Standup moved to 2026-09-14
Invoice due @eom                 →  Invoice due 2026-09-30
Retro @2w EoW                    →  Retro 2026-10-03
Lunch @next friday               →  Lunch 2026-09-18
Review @in three weeks           →  Review 2026-10-04
```

**The vocabulary is closed, and that is the whole safety of it.** `next friday`, `in three weeks`
and `3 months ago` are read, because every word in them is in a table — see *Saying it in words*.
A sentence is not read, and nothing here guesses at one. Guessing is the failure mode of every
plugin in this space: a reader types something plausible, gets nothing, and concludes the feature is
broken.

Two things keep that from happening. The list teaches the language — every named row carries the
keyword that produces it, so the menu a reader opens for Tomorrow is also the sheet that tells them
`1d` exists. And what cannot be read says so, in a row that stays put while the reader fixes it.

## The typed form

The stored language is unchanged: `parseRule()` still takes `today +1d`, and `data.json` still
holds exactly that. What is typed is a **looser spelling of the same language**, normalised into a
rule before anything resolves it.

Three differences from the stored form, each with a reason:

| Typed | Stored | Why |
|---|---|---|
| no anchor | `today` | Typing into empty text has no date to count from, so the anchor is always `today`. Making a reader type the only value it can take is ceremony. |
| `3d` | `+3d` | Forward is the common case and the sign is noise. `-3d` still goes back; the sign is only needed when it means something. |
| `eom`, `EOM`, `EoM` | `EoM` | Matching ignores case. `suggestionsFor()` already does this for the builder, for the same reason: the case rule is real and nobody should have to know it before they can find a token. |
| `friday`, `frid`, `thurs` | `Fri`, `Thu` | Any prefix of three letters or more of a day's name. The three-letter form is a spelling the builder chose; `friday` is what a reader reaches for, and finding nothing was the first thing to go wrong on a running build. |

Everything else holds. Steps chain, separated by single spaces, applied left to right:

```
@2w EoW      two weeks on, then the end of that week
@1M SoM      the start of next month
@1Fri        next Friday, today never counting
@fri         the nearest Friday, today counting
```

The `date` anchor and its eight presets are **out**. They count from a date in the note, and where
this feature is used there is no date in the note. `presetsAnchoredOn("today")` is already the
filter.

## The menu

**The menu is Obsidian's own.** `EditorSuggest` is the popup that already serves `[[` links, tags
and slash commands, so the keyboard, the positioning, the mobile behaviour and the theming all come
for free and this list looks like every other list in the app.

**The popup sits at the caret.** Obsidian opens it at the start of the range `onTrigger` reports,
which is the trigger character — so a long query walks the menu away from where the reader is
looking. It is handed the caret at both ends instead, and the range the write replaces is kept by
the suggester itself.

**The query is real text in the note.** There is no input box: you are typing into the document, and
the menu hangs under the caret reading what is there. `@2w EoW` is in the note the whole time the
menu is open. Accept and it is replaced by the date; walk away without accepting and it stays as
text, exactly like an abandoned `[[`.

That also settles what a hotkey can be. `EditorSuggest` only opens from `onTrigger`, which Obsidian
calls on keypresses and cursor moves; `PopoverSuggest.open()` cannot supply the context that fills
the list. A command could type the trigger character for you, but a menu opened by a hotkey that
writes nothing at all would mean building the popup ourselves — see *Out of scope*.

### When it opens

The trigger opens the menu when it **starts a word**, which is a fact about its first character: at
the start of a line, or after whitespace or an opening bracket. Never mid-word, which is what keeps
`dvitaly@gmail.com` from opening a date menu on every address ever typed.

It does not open inside code blocks, inline code, or frontmatter, subject to the same scope
settings that govern detection. `@property`, `@media` and `@Override` are the common false fires
and all three live in code. This is the opposite of how the *Pick a date* command behaves — a
command is asked for by name and works in every scope — but a menu that opens itself is not asked
for, so it is held to the detection rules rather than the command's.

### While it is open

The menu stays open while you type and narrows as it goes. Nothing is inserted until Enter.

- **Arrow keys** move the highlight, **Enter** or a click accepts the highlighted row and writes
  the date.
- **Tab completes instead of writing.** It puts the highlighted row's keyword into the note and
  leaves the menu open on what can follow, so a chain is built one key at a time: `@To` Tab gives
  `@today `, and `@2w` Tab gives `@2w `. The keyword is written rather than the name, because what
  is in the note has to go on being a query — `@Tomorrow ` is a sentence the parser has no reading
  for.
- **Nothing matches** → one row reading "Invalid date". Enter and Escape both close the menu and
  leave the text exactly as typed; nothing is written.
- **Backspace repairs.** Because the menu stays open on an unmatched query, deleting back to `@fr`
  brings the Friday row back. This is the reason it does not close on the first bad character.
- **Escape** closes the menu at any point and leaves what you typed exactly as it stands. It is not
  an undo: nothing is inserted, and nothing already in the note is taken away.

### What is in it

One flat list, no headings, no sections:

1. Your own named dates, where they match — **open topic, see below**.
2. The built-in names that count from today: Today, Tomorrow, Yesterday, In seven days, Next Monday,
   Next Friday, End of this week, Start of next week, End of this month, Start of next month, End of
   this quarter.

   **Today is the one name with no rule behind it.** `today` alone is not a rule — `parseRule`
   refuses it, because a shortcut that moves nowhere would duplicate the calendar's permanent Today
   button — so that row resolves to today directly and carries no rule at all. `@today` reaches it
   by name. Typing an anchor and then a step, `@today 1d`, is the rule path instead, and normalises
   to `today +1d` like any other query.
3. Step completions from `suggestionsFor()`, once the query looks like a rule rather than a name.

**A name answers to any of its words**, not only its first: `friday` finds Next Friday and `week`
finds End of this week. Matching the first word alone hides the useful half of a name behind the
part nobody types.

A named row whose rule is identical to one already listed appears once. Two rows resolving to the
same day are not duplicates and both stay — Next Friday and End of this week fall on the same day
often enough, and they mean different things.

Each row carries three things: what it means, the keyword that produces it, and the day it resolves
to, in three columns that line up down the list.

**A step row reads as the step alone**, not as the whole rule. With `@2w ` already typed, glossing
the rule would open every row with "2 weeks on →" and repeat what is on screen a line above. The row
answers "and then what".

```
@|                                    @2|
┌────────────────────────────────┐    ┌────────────────────────────────┐
│ Today          today    13 Sep │    │ In 2 days      2d       15 Sep │
│ Tomorrow       1d       14 Sep │    │ In 2 weeks     2w       27 Sep │
│ Yesterday      -1d      12 Sep │    │ In 2 months    2M       13 Nov │
│ Next Friday    1Fri     18 Sep │    │ In 2 quarters  2Q       13 Mar │
│ End of week    EoW      19 Sep │    │ In 2 years     2y       13 Sep │
└────────────────────────────────┘    │ 2nd Monday     2Mon     21 Sep │
                                      └────────────────────────────────┘
```

### Choosing the format

A date is written in the first format on the list, the same rule the insert command follows. To
write one in a different format without going to settings, type `_` after a query that already
resolves: the list becomes that day, rendered through each enabled format, in list order.

```
@tom          Tomorrow        1d      14 Sep      ← Enter writes 2026-09-14
@tom_         2026-09-14                          ← first in the list
              14/09/2026
              14.09.2026
              Sep 14, 2026
```

`_` means nothing until a query resolves, and nothing at all when only one format is enabled —
which is the default, so most readers never meet it. A menu offering one choice is not a choice.

**Amended 2026-09-17.** `_` acts on the row the reader has highlighted rather than on the text in
front of it, which is both simpler to state and the only reading that works for a query naming two
days. See *Naming the day itself*.

`_` is the default switch because it is not a token in the language and never will be: every step is
a sign, a digit, or a letter. It is refused inside a name for the same reason, so no name can shadow
it. The character is settable — see *Settings* — and everything written here holds for whichever one
is set.

Two things to watch on the running build, both about the default rather than the design. `_` is
markdown emphasis: intraword underscores do not pair in CommonMark, so `@tom_` should be inert, but
Live Preview is Obsidian's own parser and a line that already carries an underscore may flicker
italic while the query is open. And `_` is shifted on most keyboard layouts, for a key pressed
mid-flow straight after a word; `,` is unshifted nearly everywhere and means nothing in markdown.
Either observation changes the default, not the mechanism. **`,` is spent as of 2026-09-17**: an
explicit date tolerates a comma after its day, so the two cannot both have it.

`setInstructions()` carries the advertisement in the popup's footer, the same row the core
suggesters use for "↑↓ to navigate": it says `_` opens formats while a query resolves and more than
one format is enabled, and says nothing otherwise.

### The space is what asks for another step

Before a space, the list answers what has been typed. After one, it offers what could come next, and
the first row becomes **Accept** — the way back, carrying the date as it already stands, one Enter
away. Without that row a reader who typed a space and changed their mind has to delete it.

```
@Sun            this Sunday   Sun    13 Sep      ← the answer; Enter writes it
@Sun            (nothing else — the token is finished)

@Sun            ↓ type a space ↓

@Sun            Accept               13 Sep      ← in the accent colour, no keyword
                a day on      +1d    14 Sep
                end of week   EoW    19 Sep
                …
```

Accept appears for every date, the bare anchor included: `@today ` offers it, resolving to today,
even though `today` alone is not a rule. Where the chain so far is not a date at all — `@2w lunch `
— there is nothing to accept and the invalid row stands alone.

**A refused count says so.** `@in 1000 days` is a phrase the reader got right and a number the rules
cannot take, so the row reads "Only counts up to 999" rather than "Invalid date", which would send
them looking for a spelling mistake that is not there.

**A finished token narrows to itself.** `suggestionsFor()` hands back every token unfiltered once
the one under the caret is complete, so that the builder in settings can offer what could stand
*instead*; stand in `Sun` there and every weekday is on the menu. Typing asks the other question,
so the list is filtered again on the way out and `@Sun` is one row, not twenty-seven.

**A name is a first-position word.** Today, Tomorrow and Yesterday are places to start from, not
steps to add, and the same goes for the names of several steps — Start of next week is `+1w SoW`,
and it can only be the whole date, never part of one. Names are offered until a token before the
caret reads as a step or as the anchor. That is not the same as "until the first space": `@start of
next` still finds the name, because `start` and `of` are not steps, which is what makes a name of
several words typable at all.

### Matching order

A query is matched as a **name** first and as a **rule** second. Names are matched on the whole
query, case-insensitively, on a prefix; rules are matched token by token through `tokenAt()` and
`suggestionsFor()`, which already handle a caret inside a half-typed token.

Name-first matters because names may contain spaces and so may chains. `@end of` is a name in
progress, `@2w Eo` is a rule in progress, and trying rules first would classify the former as a
broken chain and put "Invalid date" in front of someone who is spelling a name correctly.

## Saying it in words

Everything above is typed in the language the builder writes: `+1Fri`, `EoM`, `2w`. This is the same
dates said the way a reader would say them — `next friday`, `in three weeks`, `3 months ago`.

Two layers, and only one of them costs anything.

### Rows the plugin generates, in every language

Next and last for each of the seven days, and this one too on the day itself — `this Friday` and
`next Friday` are the same date every day but Friday, and two rows for one date under two names a
reader cannot tell apart is worse than none. A step forward and back for each unit rides along. None
of them is a preset, none is stored, and **not one needs a new string**: the labels come from the
glosses the settings builder already reads rules back with, and the day names from
`moment.weekdays()`, which Obsidian localises itself. They are capitalised where they are built,
since the glosses are written for the middle of a sentence and these are entries in a list.

The days run from the reader's own first day of the week, so the list reads in the order their
calendar does.

```
settings.quickDates.steps.weekdayThis      "this {{day}}"     →  this Friday   Fri
settings.quickDates.steps.weekdayNext      "next {{day}}"     →  next Friday   +1Fri
settings.quickDates.steps.weekdayPrevious  "last {{day}}"     →  last Friday   -1Fri
settings.quickDates.steps.forward          "{{amount}} on"    →  1 week on     +1w
settings.quickDates.steps.back             "{{amount}} back"  →  1 month back  -1M
```

They are ordinary `NamedDate`s to `entriesFor`, and they are matched the way every name is: on the
whole query or on any word of it. `@next f` finds next Friday in English and its own words in every
other language, which is the point — this layer is not English-only and never was.

**They sort after the catalogue.** The eleven curated names are what `@` opens with; the generated
rows follow, reachable by scrolling or by typing one letter. A `NamedDate` carries a flag saying
which half it is in, and nothing more elaborate than that: an ordering, not a ranking system.

*(The unit rows read "1 week on" rather than "next week", because that is the string that already
exists. Reading them naturally would mean a `next {{unit}}` key and four unit nouns — six strings in
thirteen locales. Worth doing, not worth blocking on; the word table below lets `next week` find the
row whatever it is labelled.)*

### The English word table

A closed vocabulary and a three-slot grammar. No parser, no guessing, nothing that fails silently:

```
phrase  := lead? count? subject trail?
lead    := "in" | "next" | "last" | "previous" | "prev" | "this"
count   := 1…999 | "one"…"twelve" | "a" | "an"
subject := "day" | "week" | "month" | "quarter" | "year"   (plural too)
         | "monday"…"sunday" | "mon"…"sun"
trail   := "ago" | "back"
```

Five rules decide what that accepts, and each exists because the alternative is an answer nobody can
predict:

- **Direction comes from one end or neither.** `last`, `previous` and `prev` at the front, or `ago`
  and `back` at the end, mean backwards; anything else means forwards. Both at once —
  `last friday ago` — is refused rather than resolved.
- **`next`, `last` and `this` take no count.** `next 3 weeks` is not a date, and choosing which of
  the three weeks it means would be guessing. Counts go with `in` or with nothing: `in 3 weeks`,
  `3 weeks`, `3 weeks ago`.
- **`this` applies to weekdays only.** `this Friday` is a day; `this month` is not, and the
  catalogue already carries End of this month for the reader who meant that.
- **A bare subject needs a count, a lead or a trail.** `week` alone is refused; `in a week`,
  `next week`, `1 week` and `week ago` are not — a trail qualifies a subject from the other end,
  exactly as a lead does from the front.
- **The last word may be a prefix**, as everywhere else here, so `in 3 w` narrows while it is being
  typed. A number word needs two letters of it — `in th` is three, where `in t` would be two, ten
  and twelve against every subject at once.
- **A count with no direction runs both ways.** `3 weeks` is three weeks on *and* three weeks back,
  paired subject by subject; `in 3 weeks` and `3 weeks ago` are one row each, because the words said
  which way. There is no word for forward, and none is needed. The same holds of the token spelling:
  `2w` pairs, `+2w` and `-2w` do not.

```
@next friday     +1Fri   18 Sep
@last friday     -1Fri   11 Sep
@in three weeks  +3w      4 Oct
@3 months ago    -3M     13 Jun
@in 200 days     +200d    1 Apr 2027
@3 weeks         +3w /   -3w    both, since nothing said which way
```

The ceiling is 999, which is the rule grammar's own limit rather than a second one to explain.

### Words are a first-position thing

A phrase is matched against the **whole query**, and only while nothing before the caret is a
finished token — the same gate names already pass through. So `@next friday eow` is not a date: it
reads as a four-word phrase, and there is no such phrase.

The way to that date is the way the menu already works. Type `@next friday`, press **Tab**, and the
note holds `@+1Fri ` — the canonical spelling, a space, and the menu open on what can follow with
**Accept** at the top. Then `eow` narrows to the edges and Enter writes it.

**A space after a phrase is not the invitation a space after a token is.** `@2w ` offers Accept and
the steps that could follow, because `2w` is already the spelling a step is written in. `@next
friday ` offers that date and nothing to chain onto it, because the words are not that spelling.
Tab is what turns one into the other, and is the only route on.

That is what makes words and tokens one language rather than two: words are how a date is *found*,
tokens are what ends up in the note, and Tab is the door between them.

### One date, one row

Several spellings reach the same date — `in a month`, `in 1 month`, `in one month` and `next month`
are all `+1M`. They produce **one row**, because the words are a matcher over rules rather than a
producer of rows: a phrase resolves to a rule, and the rule is already keyed in the `seen` set that
stops "End of this month" and `EoM` appearing twice.

The row is labelled by the plugin's own gloss, never by the words that found it. That is what keeps
the list steady while a reader types, and what keeps a Russian reader's list in Russian when an
English phrase is what matched.

**Different rules are not duplicates.** `next month` is `+1M` and Start of next month is `+1M SoM`:
two dates, two rows, both earned.

### What this costs in translation

| | New strings |
|---|---|
| Generated weekday and unit rows | none |
| The English word table | none — a table in code, not UI text |
| Naming the unit rows "next week" rather than "1 week on" | six, if taken |

The word table is English-only, shaped as a per-locale table so another language is a list of about
a dozen words rather than a feature. Nothing is lost in the meantime: the generated rows carry their
own language's words, and the codes stay ASCII everywhere — `@+3Fri` is `@+3Fri` in Japanese.

**One assumption to confirm before this is built:** that `moment.weekdays()` follows Obsidian's
language setting rather than the system locale. The calendar grid's day names come from the same
call, so a vault switched to another language answers it in one look.

### Files and testing

| File | Role |
|---|---|
| `src/typing/words.ts` | new — the table and the grammar; query in, canonical rule out. Pure, English-only for now |
| `src/typing/entries.ts` | the `secondary` flag on a name, words as a source of candidates, the first-position gate widened to cover them |
| `src/editor/date-suggest.ts` | `catalogue()` generates the weekday and unit rows beside the presets |

Unit tests on `words.ts` carry the weight: every lead, every trail, digits and number words, the
count ceiling, the four refusals above, and a prefix in the last word. `entries.ts` gets the
ordering and the collapse — one row for four spellings, two rows for two rules.

### Out of scope, still

- Months by name — `in March`. A month is not a day, and there is no slot in this grammar for one.
  Naming a day outright is a layer of its own, below; `in March` stays out of both.
- Word tables for the other twelve languages. The shape is there; the words are not.
- Anything that reads a sentence. The vocabulary is closed, and a word outside it is not a date.

## Naming the day itself

Everything above counts from today. `1d`, `EoM`, `next friday` and `3 months ago` are offsets, said
in tokens or in words, and an offset is what the quick-date language is for. This is the other thing
a reader means by a date: the day itself, named. `@nov 3`.

It was out of scope until 2026-09-17, on the grounds that the language has no way to say it. That is
true, and it is the reason this is a layer of its own rather than a table bolted onto the word
grammar — it is not a reason to leave it out. It adds no strings, and it reads the reader's own
month names, because those are moment's and Obsidian localises them.

```
Invoice due @nov 3            →  Invoice due 2026-11-03
Contract ends @3 nov 2027     →  Contract ends 2027-11-03
Filed @feb 29                 →  Filed 2028-02-29
```

### The grammar

```
explicit := month day year?
          | day month year?
month    := any prefix of a month's name, in any case — long, short or
            declined, in the reader's language or in English
day      := 1…31, one or two digits, with one optional comma after it in
            month-day order
year     := a run of digits, read as the year it says
```

Each rule below is here because the alternative is an answer a reader cannot predict:

- **With no year typed, two rows: the nearest forward and the nearest back, forward first.** The
  same shape the words layer already has for a count with no direction on it — `3 weeks` is three
  weeks each way, and `nov 3` is the November behind and the one ahead. Forward counts today, so on
  3 November `@nov 3` is today and last year, which is the reading the bare `fri` already has.
- **Occurrences, not year arithmetic.** `@feb 29` is 2028 and 2024, because those are the nearest
  29ths of February. Taking this year and next and clamping would have offered 28 February twice —
  two rows, one date, and neither of them the one asked for.
- **A month alone is the 1st of it.** `@nov` is 1 November, both years, and typing a day narrows it.
  The alternative is "Invalid date" in front of a reader who is spelling `nov 3` correctly, for
  every keystroke until the day lands.
- **A year is the year it says.** `@nov 3 198` is the year 198, and `@nov 3 0026` is the year 26. No
  century is assumed and no digits are added, which is what keeps every keystroke of `1985` a row of
  its own rather than three refusals followed by an answer.
- **Two digits are read both ways**, since two digits are the one length with something to complete:
  as typed, and with the current century in front. `@nov 3 26` is 2026 and 26, the century first,
  because that is what a two-digit year nearly always means and the first row is the one Enter
  takes.
- **A day the month does not have drops its row**, and a query whose rows all drop has nothing to
  show. `@feb 30` is not a date in any year.
- **A month answers to any prefix of its name**, one letter up, in any case, and every month a
  prefix names gets rows. `@n 3` and `@3 n` are November; `@j` is January, June and July, six rows
  with the years. They are paired month by month, forward then back, the way the words layer pairs
  `3 weeks` on and back, and the day column is what tells them apart. A minimum length was tried on
  paper and cut: it made `@j` nothing at all, when three months is a list a reader can read.
- **A prefix of digits alone is not a month.** Japanese, Korean and Chinese name their months
  `1月`…`12月`, and without this rule `@3` would stop meaning three days on for every reader of
  those languages. `@3月 4` still reads, because the prefix carries the character that makes it a
  month name.
- **A bare day is not a date.** `@3` is three days on, three weeks on and ten more rows, exactly as
  it is today. The month has to be there for the day to be a day.
- **Spacing and zeros are forgiving.** `@NOV 3`, `@nov  3` and `@nov 03` all read as 3 November, and
  a trailing space changes nothing: `@nov 3 ` shows the rows `@nov 3` shows. A terminal date has
  nothing to chain, so there is no Accept row and no "and then what" — the space rule that governs
  tokens does not reach here.
- **Nothing else is read.** No ordinals (`@nov 3rd` — a second number grammar, and English-only), no
  year first (`@2026 nov 3`), no numeric dates (`@11/3` — the order would have to be guessed, and a
  reader typing a full numeric date has already finished writing it), and no step after it. A query
  carrying anything outside this grammar is not an explicit date, which is the safety the word table
  has for the same reason.

### A bad day is an invalid date, not a bad count

`@nov 0`, `@nov 32`, `@0 nov`, `@32 nov` and `@feb 30` all read "Invalid date". That needs saying
because the reason a row gives is already branched: `countRefused()` fires on a leading number
outside 1…999 whatever follows it, so `@0 nov` would announce "Only counts up to 999" about a number
the reader typed as a day. The count message belongs to a query that is a count, which this one is
not.

### Which month names are typable

Four lists, all handed to the module as data:

- the locale's long names, `moment.months()`;
- its short ones, `monthsShort()`, whose trailing dot is never required — `нояб` reads as well as
  `нояб.`;
- **the form the locale uses inside a date**, which in Russian, Ukrainian and Lithuanian is not the
  one it lists. Russian lists `ноябрь` and writes `3 ноября`; Lithuanian lists `lapkritis` and
  writes `lapkričio`. The row shows the written form, so without this a reader who types back what
  they are looking at fails on the last letter;
- English, long and short, always. The codes elsewhere in this language are ASCII — `@+3Fri` is
  `@+3Fri` in Japanese — and a month name in one of the thirteen locales is not a prefix of a
  different month in another, so accepting both costs nothing.

A name containing a space cannot be typed, since the grammar splits on spaces. None of the thirteen
locales has one; Vietnamese, which writes `tháng 11`, would be the case that needs a different
answer, and it can have one when it arrives.

### It is the end of a query

An explicit date is terminal. Nothing chains onto it: the stored language has no anchor that counts
from an arbitrary day, and inventing one would change the grammar `data.json` holds for the sake of
a date that is never stored. So `@nov 3 eow` is not a date, and *the Monday after 3 November* is not
reachable this way. If it is ever wanted, the way in is an absolute anchor in `quick.ts`, not
anything in this layer.

Three keys act on the row, and the last is the only character allowed to follow it:

- **Enter** writes the date, through the first format or the one `_` chose.
- **Tab fills in what is missing.** `@nov 3` and Tab leaves `@nov 3 2026` in the note with one row
  under it; on a month-alone row it fills in the day as well, so `@nov` and Tab leaves `@nov 1
  2026`. That is what Tab does everywhere else — keep what the reader typed, word for word, and add
  what was missing — and it is what makes `_` reach a single day. Nothing is left to complete after
  that, so Tab on the finished row writes. A one-letter month is kept exactly as typed, so `@j 29`
  and Tab leaves `@j 29 2027` — a query that still names three months, since filling in the year adds
  nothing to the letters already there, and it is why the format-switch amendment below only holds
  after a month of two letters or more.
- **`_` picks the format**, on the day the highlighted row names — see the amendment below.

Tab leaves no trailing space here, unlike every other completion in the list. Deliberate: a space
invites another step, and there is none to invite.

### The row

The label is the day spelled out and the right-hand column is its weekday. The keyword column is
kept and left empty, as on the Accept row: a keyword is the token that produces a row, and this row
has no token behind it.

```
@nov 3                                    @nov 3 26
┌──────────────────────────────────┐      ┌──────────────────────────────────┐
│ November 3, 2026           Tue   │      │ November 3, 2026           Tue   │
│ November 3, 2025           Mon   │      │ November 3, 0026           Tue   │
└──────────────────────────────────┘      └──────────────────────────────────┘
```

The year is always shown, because the year is exactly what the reader did not type. The weekday
earns its column for the same reason in reverse: it is the one fact about a named day that cannot be
read off the query, where a row ending in the date again would say only what is on screen a column
to its left.

**Both are moment's, so both are localised** — `format("LL")` and `format("ddd")` answer in
Obsidian's own language, which is why the rows above read `November 3, 2026` rather than
`3 November 2026`: English is `en`, not `en-gb`. It is also where `moment.weekdays()` already gets
the generated weekday rows. **This section adds no strings at all**, and so no translation pass.

### Where the rows sit

One rule, and it is not the one this section first carried:

**A named day leads the list only where nothing else answered the query. Where something else did,
its rows go last.**

What this replaced put a day with a month of two letters or more first, on the grounds that nothing
else in the language reads those keystrokes. That holds in English and not in every language a
reader might have: Lithuanian names January `sausis`, so `@3 sa` is both a date and three Saturdays,
and the date took the Enter key from a row the reader already had. A sweep of all thirteen locales
found exactly that one collision, which is one more than the old rule survives.

None of the examples changes. `@nov 3`, `@3 dec`, `@feb 29`, `@nov` and `@j` reach no other rows, so
they are the whole list and lead it. `@3 d` keeps three days on at the top with 3 December beneath
it, and `@f` keeps the Friday rows first with 1 February last — which is where `@3 n` and `@n 3`
were asked to be seen.

```
@f                                @f 3
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Next Friday      +1Fri  18 … │  │ February 3, 2027       Wed   │
│ Last Friday      -1Fri  11 … │  │ February 3, 2026       Tue   │
│ …                            │  └──────────────────────────────┘
│ February 1, 2027        Mon  │
│ February 1, 2026        Sun  │
└──────────────────────────────┘
```

### What the module reads, and what it is handed

`src/typing/absolute.ts` is pure, like `scan.ts` and `words.ts`: a query, today, and the month names
in, days out.

It owns the English month names itself — data in code, not UI text, exactly as the word table is.
The reader's own are **handed to it as data**, through `EntryContext`, so the only file that asks
moment what language it is in stays `date-suggest.ts` and the module can be tested with plain
strings.

**The whole query, and no first-position gate.** A phrase and a name are matched only while nothing
before the caret is a finished token, which is what `namesAllowed()` decides. An explicit date needs
no such gate: it is matched against the whole query, so `@today nov 3` and `@2w nov 3` are not dates
and nothing has to be taught that they are not.

An explicit row carries its day and nothing else, the way the Accept row does: no rule, so no gloss,
no keyword, and nothing for `seen` to key on. Two rows of one query cannot name the same day —
forward and back are different years — and nothing else in the list can reach a day by this route,
so this source needs no deduplication against the other three.

### Three consequences elsewhere

**The format switch acts on the highlighted row, not on the text before it.** As drafted, `_` was
read out of the query: the list became the formats for the day *the text* resolved to, and a query
resolving to more than one day left `_` an ordinary character. An explicit date with no year names
two days, which is what shows that rule to be the wrong one — the reader has a row highlighted and
means that one. So `_` completes the highlighted row into the note first, the implicit Tab, and then
lists the formats for the single day it names: `@nov 3` and `_` becomes `@nov 3 2026_`, with the
formats for 3 November 2026 under it.

The reading from the text stays, as the floor rather than the rule. A key handler is how `_` is
caught on a desktop, and a mobile keyboard may never fire one, so `_` has to mean something when it
simply arrives as text — and what it means is the formats for the day the **first** row names. That
is the same day the handler would have used until an arrow key moves the highlight, which on mobile
there is none to move. What goes away is the draft's "exactly one day" test: the first row is always
a single day, or there is no row and `_` is an ordinary character.

**Task 6 of the plan still builds the version this replaces.** The plan at
`docs/superpowers/plans/2026-09-14-typed-dates.md` carries `formatEntries()` and `dayFor()` reading `_` out of the text with a "one row, not the first
row" test, and its tests call `entriesFor("tom_", …)`. That task needs rewriting before it is built,
not reading around.

**`,` is no longer a candidate for the format character.** The switch's own section floats it as a
better default than `_`, being unshifted on nearly every layout. The comma after a day spends it:
`@Nov 3, 2027` has to be typable, and it cannot be if `,` opens the format list. The tolerance is
worth more than the shift key, since a reader whose format writes `Nov 3, 2027` will type it that
way, so `,` joins `+`, `-` and the trigger character among the values the format field refuses.

### Files and testing

| File | Role |
|---|---|
| `src/typing/absolute.ts` | new — the English month table and the grammar; a query, today and the reader's month names in, days out. Pure |
| `src/typing/entries.ts` | `months` in `EntryContext`, a fourth source of rows, the `date` row kind, and where a named day's rows sit |
| `src/editor/date-suggest.ts` | the four month-name lists from moment, the row's two columns, the day and year Tab fills in |

Unit tests on `absolute.ts` carry the weight, a case per rule above: both orders, the two rows and
which comes first, today counting forward, the nearest 29th of February, a month alone, a one-letter
prefix and every month it names, a digit-only prefix refused with `1月`…`12月` in the table, a
declined form matched, a year of one, two, three and four digits and one with a leading zero, a day
the month does not have, the comma, case, doubled spaces, a trailing space, and the refusals — an
ordinal, a year first, a bare day, a step after the date.

`entries.ts` gets the row kind, the placement rule — `@nov 3` leading where nothing else answered,
`@3 d` and `@f` last — the reason on a bad day, and that `@3`, `@3 d` and `@next friday` answer
exactly as they do today.

## Writing the date

The accepted row resolves through `resolveRule(rule, { today, date })` with `date` set to today,
since there is none in the note, and is written by `insertionFor()` from `picker/write.ts` — the
same function the insert command already uses, so the spacing rules that keep an inserted date
editable are not reimplemented here.

The replaced range runs from the trigger character through the caret, so the trigger itself is
consumed, along with a `_` and any format query after it. The format is the first in the format
list, matching the insert command exactly, unless a format was chosen through `_`.

One transaction, so one undo takes the whole thing back to the text as typed.

## Settings

**Revised 2026-09-19.** The first draft put three rows at the bottom of *Dates in a note*, made the
trigger a single character, and asked the command-only notice to count a fourth switch. All three
have changed; what follows is the current design, and the reasoning that replaced each is kept where
it reads as the answer to an obvious question.

### A section of its own

**Typing a date** is its own section, between *Calendar* and *Sections to scan*.

Not the bottom of *Dates in a note*, where this was first put. Every row in that section answers one
question — what opens the calendar on a date already written — and typing answers a different one:
how a date that is not there yet gets written. The heading earns its clarity by being narrow. The
place it sits earns something too: the typed list obeys the scope settings, so it stands next to the
section that sets them.

Five rows, the last of them later:

- **Type to insert** (switch, default on). Whether the list opens while you type at all.
- **Trigger** (text, default `@`). One to three characters, typed at the start of a word, that open
  the list.
- **Format character** (text, default `_`). The single character that turns an open list into that
  day written each way.
- **How to type a date** (a page, `>`). Four steps and a worked example of each grammar — see
  below.
- **Languages** (a page, `>`). The languages whose month and weekday names can be typed. Not built
  here: it is [TODO 14](../../../TODO.md), and only its place in this section is settled.

### The page of instructions

Four numbered steps, the second of them carrying the three ways to say a day, and three keys at the
foot.

```
Step 1 · Type @ to start          a list of suggestions opens
Step 2 · Specify the date
          Shorthand                 @1d  @2w  @eom  @2w EoW
          In words                  @next friday  @in three weeks  @3 months ago
          By name                   @Nov 3  @3 Nov 2027  @ma 13
Step 3 · (Optional) Type _ to write in another date format
Step 4 · Press Enter
Tips      Tab picks and moves on · Esc leaves your text · Backspace repairs
```

**Every heading carries its explanation on its own line**, joined with an em dash. Seven headings is
seven lines of description otherwise, and a reference page is read by scanning down its left edge.

**The three ways are not numbered.** The steps are sequential and the ways are alternatives;
numbering them inside a numbered step would read as "now do all three".

**A named day shows every answer it has.** `@Nov 3` resolves to two dates, not one, and a single
answer there was the page's one outright lie — the list offers the November ahead and the one
behind, and showing the forward one alone made a choice look settled. The row carries both, nearest
ahead first. `@3 Nov 2027` sits under it to say what buys a single answer, which nothing else on the
page states. The third row is a half-typed month, whose four answers do not fit a column, so its
note is the answer instead.

**That third example's prefix is computed from the reader's language.** Two letters that name more
than one month: `ma` in English, Spanish, French, Portuguese and Latvian; `ju` in German and
Estonian; `ма` in Russian, `ли` in Ukrainian, `ru` in Lithuanian. Japanese, Korean and Chinese number
their months, and a prefix of digits alone is deliberately not read as one, so those three fall back
to English — which is typable in every language and so demonstrates the rule anyway.

The page exists because the list teaches only half of itself. Open it on the trigger alone and every
row carries the keyword that produces it, so `1d` and `EoW` are discoverable by looking. That words
are read at all, and that a day can be named outright, is discoverable by nothing.

**Every example resolves as the page is opened**, through the same `parseTyped` the suggester uses,
so the page cannot drift from the plugin and a date on it is never stale. The named-day examples
take their month names from moment, so a Russian vault reads `@ноя 3` — an example the reader can
type back. The trigger and the format character in the headings are the reader's own.

**"Shorthand" is the name for the token grammar**, chosen over *language* or *codes*: it says
compact-and-learnable without claiming more than a dozen tokens deserve.

The two text fields grey out while the switch is off rather than disappearing, because a row that
vanishes is a worse surprise than one visibly inactive. The format field shows whether or not a
second format is configured, for the same reason in the other direction: formats are added in a
different section, and a row that came and went while the reader worked there would be baffling.

### The trigger is a phrase, not a character

One to three characters. `@@`, `;;` and `$%@` are all triggers a reader can set, and the rule that
governs them is the one that already governs `@`: **the phrase starts a word**, which is a fact
about its first character and nothing else.

This is the answer to a false fire the design had no other answer for. `@channel please review this`
opens the list and leaves it sitting there saying *Invalid date* to the end of the line — check 41
in `docs/typed-dates-manual-checks.md`, left open on purpose. A two-character trigger ends that
whole class of it, and it lets the reader who has the problem fix it, rather than this document
guessing which single characters are safe in a language it cannot see.

What the trigger field refuses:

- **Nothing, and more than three characters.** A trigger is a keystroke or two, not a word.
- **Whitespace, anywhere in it.** The query is read up to the caret and a space inside the trigger
  cannot be told from the space that ends a step.
- **A letter or a digit in first position.** This is the whole of the word-start rule's safety: a
  trigger that can land inside ordinary words and numbers is noise no filtering afterwards cleans
  up. Later positions are unconstrained — `@d` only ever begins where `@` does.
- **`#` or `[` in first position.** Obsidian opens its own menu on both, and two menus over one
  caret is a defect rather than a preference. Later positions are fine for the same reason letters
  are: Obsidian's menus start at a word start too, so the `#` in `@#` fires nothing.

And what it does not refuse: `(`, `{`, `"` and `'`, which `trigger.ts` treats as word-starts, so a
trigger of `"` fires after every opening quote. That is unwise rather than broken, and a field that
refuses every unwise value argues with the reader. The phrase is what makes this affordable —
someone who wants a quiet trigger types `""` instead of being told `"` is not allowed.

### The format character

A single character, and none of those the date language has already spent: not `+` or `-`, which
begin a step, and not `,`, which an explicit date tolerates after its day. A letter, a digit or a
space would be read as part of the query in front of it — with `d` here, `@2d` could never be typed.

**`#` and `[` are allowed**, unlike in the trigger's first position. The first draft refused them
there too, and the reason it gave does not reach: Obsidian opens its tag and link menus at a *word
start*, and by the time this character is pressed the caret is mid-query. Nothing collides.

It may not be a character the trigger is made of, and that rule is concrete rather than tidy-minded.
`triggerAt` finds the trigger by looking back for the last one before the caret, so with `@` in both
fields `@tom@` finds the second `@`, fails the word-start test against the `m` in front of it, and
the list closes rather than offering anything.

The clash rule is about a pair of fields rather than one field, so it is checked from both sides:
changing either one to collide reports it on the field being edited.

### A rejected value is never stored

Obsidian's `validate` rejects the change and shows the message under the field; it does not write
the value. So the stored trigger stays whatever it last was, and closing settings on a bad value
leaves the last good one in force — not the default, which is only reached by a fresh install.

That is also why nothing here warns without refusing. Two states, not three: refuse what breaks,
save everything else without comment. A field that lectures the reader about a legal value is worse
than one that says nothing.

The framework runs `validate` once on mount and shows the message without rewriting the stored
value, so a hand-edited `data.json` can hold something unusable. The suggester therefore checks
again when it reads the setting and falls back to the default rather than trusting it.

### The command-only notice

The notice already in *Dates in a note* is reworded rather than rewired. It reads:

> Note: Only "Pick a date" from the command palette opens the calendar **on an existing date**

The draft asked `commandOnly()` to count typing as a fourth way in and fall silent when it was on.
That is wrong: typing never opens the calendar, it writes a date. Counting it would hide a true
notice from someone who had turned off every way to *edit* a date and left typing on. Three switches
still, and four words of accuracy instead.

## Open topic — your own named dates

The wish is to type names you defined yourself: `@payday`, `@sprint`, matched by name alone. Three
shapes, none chosen:

**One list, the calendar picks from it.** A single collection of named dates in settings. Typing
matches any of them; the calendar's four quick-date buttons become a choice of four entries from
that list. Define Payday once, get it in both places. Costs a rework of the quick-dates page and a
migration of the `quickDates` array, which stores four positional slots today.

**A list of its own.** Typing gets its own collection; quick dates are untouched. Nothing to
migrate, two places to define the same thing.

**The four you already have.** A filled slot's `alias` is already a name the reader chose, so those
four become typeable and nothing new is built. Capped at four, and those aliases are short by design
because they sit on small calendar buttons.

Whichever wins, these follow:

- A name is matched case-insensitively, on a prefix, and must be unique within its list.
- A name that collides with a built-in keyword (`eom`, `1d`, `fri`) is refused at the point of
  naming, not silently shadowed at the point of typing.
- A named date anchored on `date` cannot appear in this menu, for the same reason the eight presets
  cannot.

## Files

| File | Role |
|---|---|
| `src/typing/trigger.ts` | new — where a trigger starts and what the query is; the word-start rule |
| `src/typing/entries.ts` | new — the rows for a query: named matches, step completions, format rows, the invalid row |
| `src/editor/date-suggest.ts` | new — the `EditorSuggest` subclass: rendering, the footer instructions, the write |
| `src/picker/quick.ts` | `normalise()` for the typed form: no anchor, unsigned counts |
| `src/settings.ts` | `typeToInsert`, `typeTrigger`, `formatTrigger`, their validation, and `commandOnly()` reading four switches |
| `src/settings/settings-tab.ts` | the two new rows |
| `src/i18n/locales/en.json` | new strings, English only until the work stops moving |

`EditorSuggest` is Obsidian's, which means `date-suggest.ts` cannot be unit-tested at all. Every
rule about what a query means therefore lives in `typing/`, which is pure — the same split
`scan.ts` and `context.ts` already keep, and for the same reason.

## Testing

Unit tests, all against the pure modules:

- **trigger.ts** — fires at line start, after a space, after `(` and `[`; does not fire mid-word,
  inside an email address, or when the setting is off; the query is the text from the trigger to the
  caret.
- **entries.ts** — a bare trigger lists every today-anchored name; a name prefix narrows; a rule
  prefix produces step rows; an unmatched query produces exactly the invalid row; identical rules
  are deduplicated; name matching beats rule matching.
- **entries.ts, the format switch** — the format character after a resolving query lists every
  enabled format in list order; after one that does not resolve it is an ordinary character and
  changes nothing; with a single format enabled it does the same; the format rows carry the day the
  query resolved to, not today; a configured character other than `_` behaves identically.
- **settings.ts** — both character fields refuse a letter, a digit, whitespace, `#`, `[` and an
  empty or longer value; the format character also refuses `+`, `-` and whatever the trigger is set
  to; setting the trigger to the format character is refused from that side too.
- **quick.ts** — the typed form normalises to the stored one: `3d` → `+3d`, `eom` → `EoM`,
  `2w EoW` → `today +2w EoW`; an anchor typed by hand is still accepted.

Resolution, spacing and formatting are already covered by the quick-date and write tests and are
not retested here.

## Build order

Front-loaded so there is something to look at before the polish is paid for:

1. ~~`trigger.ts` and `entries.ts` with tests. No UI.~~ **Done.**
2. ~~`date-suggest.ts` with the built-in names only, insertion working, fixed `@`.~~ **Done**, and
   looked at: the rows, the space rule, Tab, and the narrowing all came out of that review.
3. ~~Row layout and wording, against the running build.~~ **Done.**
4. ~~The words layer, in two halves that do not depend on each other: the generated rows, then the
   English word table.~~ **Done**, both halves, in `cfbf27a`.
5. Naming the day itself: `absolute.ts` and its tests, then the row and the year Tab fills in. Ahead
   of the three below it, because it adds no strings either.
6. The format switch and the footer instructions, on the fixed default, so the character can be
   judged in use before it becomes a setting.
7. Named dates, once the open topic is settled.
8. Settings, then i18n, then the twelve other locales last.

## Out of scope

- **Sentences.** `next friday` is read because both words are in a table; `the friday after the
  sprint review` is not, and nothing here guesses at it. See *Saying it in words* for where the
  vocabulary ends.
- **Numeric dates, ordinals, and a step after a named day** — `@11/3`, `@nov 3rd`, `@nov 3 eow`.
  Naming a day is in as of 2026-09-17; *Naming the day itself* is where that grammar stops.
- **A month as a span** — `in March`, meaning some time in March. This plugin writes days.
- Times. The language has no time units yet; TODO 3 is where that starts.
- Editing an existing date by typing. That is what the calendar is for.
- Reading mode, as everywhere else in this plugin.
- **A hotkey that opens the menu.** Obsidian's popup cannot be opened by a command, so the only
  versions of this are a command that types the trigger character for you, or a popup of our own.
  The first is a few lines and can be added any time it is missed; the second means rebuilding
  keyboard navigation, positioning, mobile behaviour and theming to arrive back where
  `EditorSuggest` already is. *Pick a date* covers the no-typing path in the meantime.
