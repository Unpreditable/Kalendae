# The languages you write dates in — design

Status: drafted 2026-09-19, in conversation. Implements [TODO 14](../../../TODO.md).
Depends on [TODO 13](../../../TODO.md), fixed the same day — see *What had to be true first*.

## What this delivers

One list of languages, in settings. Turning one on makes its **month and weekday names** typable in
the date list, and detectable in a note. Nothing else about it changes.

```
Obsidian in English, Spanish turned on

@viernes                 →  the nearest Friday, as @friday already does
@sep 6                   →  6 September, as @Sep 6 already does
@septiembre 6            →  the same day, reached in Spanish

A note reading "6 septiembre 2026", with a D MMMM YYYY format
                         →  found, outlined, editable from the calendar
```

The rows you get back are the same rows, labelled in your Obsidian language. **You type in Spanish
and read in English**, which is already how months behave: `@nov 3` and `@ноя 3` produce one row,
and that row says `3 November 2026` or `3 ноября 2026` depending on the app, not on what was typed.

## What a language buys, and what it does not

**Nouns, not grammar.** A language contributes the names of its months and its days. The phrase
vocabulary stays English — `next`, `in`, `ago`, `three` — and so does the shape of a phrase.
`@next viernes` is not a date and is not meant to be: it is neither English nor Spanish, and nobody
writing either language would type it. The guide page says so in as many words, which is why this
needs no TODO of its own to promise more later.

**The token spelling stays ASCII.** `@fri`, `@+3Fri`, `@eom`, `@2w EoW` are codes rather than
English words, and they are the same codes in every language. Nothing here touches them, and
`quick.ts` — the parser both typing and the settings builder share — is not modified at all.

**Three forms per month**, the three already gathered today:

- the locale's listed name, `moment.months()`;
- its short form, `monthsShort()`, whose trailing dot is never required;
- **the form the locale writes inside a date**, which in Russian, Ukrainian and Lithuanian is a
  different word: Russian lists `ноябрь` and writes `3 ноября`. Thirteen of moment's
  139 decline this way — be, ca, cs, el, hi, hr, hy-am, lt, oc-lnc, pl, ru, tg and uk — so it is
  not a quirk of the four locales Kalendae happens to ship.

**Two forms per weekday**, long and short, and the missing third is a finding rather than an
oversight: **no locale in moment's 139 writes a weekday differently inside a date**, checked
element by element across every one of them. The declined Russian form that does exist — `в среду`
— is reachable only through a format carrying a bracketed preposition, and `checkFormat()` refuses
any pattern holding a square bracket. If moment ever gains a locale that declines a weekday, the
third form drops in where the months take theirs.

## Why a list rather than working it out

Settled in TODO 14 and not reopened here. The keyboard layout is the tempting signal and the wrong
one — there is none on mobile, it reflects the instant it is asked rather than the word being typed,
and someone writing one Russian word in an English note switches back immediately. The script of
what was typed is free and accurate but separates alphabets only, and **the collisions that matter
are Latin against Latin**: `@di` is Tuesday to a German and December to a Spaniard.

An always-on alternative is less alarming than it sounds, since names collapse onto twelve months.
It still spends prefixes the reader never asked to spend. Turning Russian on is what earns Russian
months, and the extra rows it brings are then legible rather than mysterious.

## The list itself

**111 entries, from moment's 139.** Obsidian's bundled moment carries 139 locales, confirmed on a
running vault. Twenty-five of them are duplicates by the only measure that matters here — `en-gb`,
`en-au` and `en-ca` carry month and weekday names identical to `en`, and `de-ch` to `de`. Rows that
change nothing are noise, so entries are deduplicated on their month-and-weekday names and the
first code wins.

**Names come from `Intl.DisplayNames`**, in the reader's own language:

```
English UI:   German · French · Japanese · Russian · Chinese (China)
Russian UI:   немецкий · французский · японский · русский · китайский (Китай)
```

So a list of 111 languages adds **no strings to translate**, which is the only reason offering all
of them is affordable. Where `Intl.DisplayNames` has no name for a code, the code stands in.

**English is always on and cannot be removed.** It is the universal fallback: every other language's
names are additions to it, the ASCII token spelling is unaffected either way, and the three
languages that number their months — Japanese, Korean, Chinese — have no letter prefix to type at
all without it. It appears first in the list as a toggle that is on and disabled, the same way the
Sections page shows *Body text*: a switch that cannot move says "always" more economically than a
line of prose.

**No cap, and no minimum prefix length.** Worth stating because the instinct is to add one: enabling
more languages adds **spellings, not rows**. `@m` with five languages on is March and May, because
twelve months and two years bound the list however many names feed it. The three-letter floor TODO
14 floats belongs to the always-on variant, which this is not — you asked for these languages.

## Where it lives

**Sections to scan** stops being a section and becomes a row, beside **Languages**, under a new
heading: **Recognising dates**.

```
Dates in a note        double-click, hover icon, Tasks emoji, outline
Calendar               week start, week numbers, preview, Quick dates >
Typing a date          switch, trigger, format character, How to type a date >
Recognising dates      Sections to scan >     Body text · Headings
                       Languages >            English · Russian
Date formats           the list
```

Not a section of its own, and not under *Typing a date*, because **both rows govern both halves of
the plugin**. The scope toggles are not detection-only: `date-suggest.ts` reads them too, which is
why `@tom` opens nothing inside a code block. Languages is the same shape. A heading naming that
shared subject is honest where either alternative is not.

This also settles something that was already awkward. *Sections to scan* is a heading with one
**nameless** row today, on the reasoning that the heading names the thing once and the row has
nothing left to say but its value. A second row ends that, so the row takes its name back.

Languages sits directly above *Date formats*, and the adjacency earns its keep: a language changes
nothing for a format that carries no `MMMM`, `MMM` or weekday token, so the two rows are read
together by exactly the people they affect.

### The page

Reached from `Languages >`. In order:

1. One line saying what turning a language on does, and what it does not.
2. A search field.
3. English, on and disabled.
4. The languages already on, so the answer to "what is on?" needs no scrolling.
5. Everything else, alphabetically by displayed name in the reader's language.

A search field with toggles rather than an add-and-remove list. The format list is already the one
page in this plugin that reads as too much machinery, and a list four times longer in the same shape
would be worse. A search field is one control, and it shows what is on without opening anything.

## What changes in typing

**Months** already arrive as data: `EntryContext.months` is every spelling each month answers to,
built in `date-suggest.ts` — the one file that asks moment what language it is in. It becomes the
**union across the enabled languages**, deduplicated. `absolute.ts` needs no change at all: it
already matches any prefix of any spelling it is handed.

**Weekdays reach the list a different way, and keep it.** They are not matched by a table today;
they are matched by the *labels* of the generated catalogue rows — typing `пятн` in a Russian vault
finds the row reading `Следующая пятница`, because `matchesName()` matches any word of a label.
That is why weekdays are typable in the UI language today and months are typable in two.

So a `NamedDate` gains **aliases**: extra spellings a row answers to, never shown.
`weekdayRows()` fills them with every enabled language's names for that day, and `matchesName()`
tries the label and then the aliases.

Three reasons this beats teaching `quick.ts` the names:

- **`quick.ts` stays fixed and ASCII.** It is the parser the settings builder shares, where a
  Spanish weekday would be wrong: a stored rule is `today +1Fri` in every language.
- **Prefixes work for free.** `@vier` narrows the way `@frid` does, because an alias is matched by
  the same prefix rule a label is. A normalising pass that rewrote whole words to tokens would
  answer nothing until the last letter.
- **No new rows.** The rows exist; they gain spellings. `@viernes` and `@friday` reach the same row,
  and the deduplication that already runs needs no help.

## What changes in detection

Two places, and both were only reachable once TODO 13 was fixed.

**The alternation spans the enabled languages.** `buildTokenPatterns()` in `formats.ts` builds
`MMMM` from the current locale's two spellings. It becomes the union over enabled locales, read
through `moment.localeData(code).months(when, format)`, which answers for a named locale **without
touching the global one** — verified. The cache, keyed on `moment.locale()` today, takes the enabled
set into its key.

**Gate 3 tries each enabled language.** `parsesStrictly()` resolves a match through moment's strict
parser, which uses the global locale, so a Spanish month in an English vault is matched by the regex
and then refused. moment takes a locale argument — `moment.utc(text, pattern, locale, true)` — and
it does not mutate the global locale either. So the gate tries the app's language first, then each
enabled one, and the existing standalone-spelling retry rides along unchanged.

**Order of work matters here.** The alternation without the gate is exactly the half-fix TODO 13
left behind: a candidate found and then thrown out one gate later, which looks identical to finding
nothing while claiming more.

## What had to be true first

TODO 13, fixed on 2026-09-19 and committed with this work. Its own note claimed `renderPattern` and
the strict parse could stay as they were; both were wrong, and both are why this design is possible:

- `renderPattern()` formatted each token alone, so the plugin **wrote** `6 сентябрь 2026` where
  moment writes `6 сентября 2026`. It now hands moment the whole pattern with literals escaped.
- Gate 3 refused the declined spelling in Ukrainian and Lithuanian, so a `MMMM` format found nothing
  there even after the regex matched.

## The guide page

*How to type a date* gains the contrast it currently lacks, and only there:

```
  In words   — use common phrases. English only.
  By name    — type the date, in any language you have turned on.
```

Two lines, one reworded and one extended. It is the page that states the boundary, which is why the
phrase grammar needs no item tracking a promise nobody made.

The `@ma 13` example already computes its prefix from the reader's language and already says *"a
date for each month starting this way, in every language you have turned on"* — written for this
change and true once it lands.

## Storage and migration

```ts
/** Locale codes whose month and weekday names are typable and detectable. */
languages: string[];
```

Seeded on first run with the app's own language, the way `weekStart` resolves a region default once
and is an ordinary setting afterwards. **Nobody loses anything by upgrading**: a Russian vault types
`@ноя 3` today and goes on doing so without visiting settings.

English is not stored. It is always in force, so storing it would invite a `data.json` that says
otherwise. A code that moment no longer carries is ignored rather than dropped, so a vault opened on
an older Obsidian does not quietly lose a language on the way back.

## Files

| File | Role |
|---|---|
| `src/settings.ts` | `languages`, its default, and `enabledLocales()` — the codes in force, English first |
| `src/i18n/languages.ts` | new — the deduplicated locale list and its display names; pure, no Obsidian |
| `src/settings/languages-page.ts` | new — the search field, the toggles, the disabled English row |
| `src/settings/settings-tab.ts` | the *Recognising dates* group, both rows and the summary |
| `src/detect/formats.ts` | the alternation and `parsesStrictly()` spanning the enabled locales |
| `src/editor/date-suggest.ts` | month spellings union; weekday aliases on the generated rows |
| `src/typing/entries.ts` | `NamedDate.aliases`, matched as the label is |
| `src/i18n/locales/en.json` | the page's strings, English only until the work stops moving |

## Testing

Pure modules carry it, as everywhere else in this plugin.

- **`languages.ts`** — 139 in, 111 out; `en-gb` folds into `en` and `de-ch` into `de`; a code with
  no display name falls back to itself; the order is alphabetical by displayed name.
- **`settings.ts`** — English is in force whether or not it is stored; an unknown code is ignored,
  not dropped; the seed picks the app's language on a fresh install and leaves a stored list alone.
- **`entries.ts`** — a row is found by an alias exactly as by a label, on a prefix; an alias never
  appears in what is rendered; `@viernes` and `@friday` produce one row, not two.
- **`formats.ts`** — the alternation matches a month name from an enabled language and not one from
  a language that is off; the cache rebuilds when the set changes; gate 3 accepts a date written in
  an enabled language and refuses the same shape in one that is not.
- **`scan.ts`** — end to end: a note holding `6 septiembre 2026` yields an accepted candidate with
  Spanish on and none with it off.

`Intl.DisplayNames` and the settings page cannot be unit-tested and hold no rules, which is the same
split `scan.ts` and `context.ts` already keep.

## Out of scope

- **The phrase grammar.** `next`, `in`, `ago` and the number words stay English. Translating them is
  a grammar per language rather than a name table, and the guide page states the boundary instead.
- **Weekday prepositions.** Escaping literals for `renderPattern` turned on moment's Russian rule,
  so a custom `в dddd, D MMMM` writes the accusative `в среду` while the alternation carries only
  `среда` — written and then not found. No shipped format has one, and curing it means repeating the
  month workaround for weekdays against the same moment limitation.
- **Ordinals, and any other locale-dependent token** beyond months and weekdays.
- **Detecting the language of a note.** The whole point of a list is that nothing is guessed.
