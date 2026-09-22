# Languages — manual checks

Covers the language list and everything it reaches: the settings page, typing a date, and finding
one already written. Three languages, chosen because they behave differently from each other:

| | Declines its months | Latin script | Notes |
|---|---|---|---|
| **English** | no | yes | always on, cannot be turned off |
| **Latvian** | no | yes | collides with English on `ma` — *marts*, *maijs* |
| **Russian** | **yes** | no | lists `сентябрь`, writes `сентября` |

Russian is the one that proves the fix from TODO 13: a note holding the date Kalendae itself wrote
has to be found again.

**Before you start.** Add a second date format so the month-name checks have something to match:
Settings → Kalendae → Date formats → add **`D MMMM YYYY`**. Leave `YYYY-MM-DD` first.

---

## 1. The settings page

1. Settings → Kalendae — between *Calendar* and *Date formats* there is a section headed
   **Recognising dates**, holding two rows: **Sections to scan** and **Languages**.

2. The Languages row shows the names in force. On an English vault, `English` alone.

3. Open Languages. The first row is **English**, on, and its toggle will not move.

4. The line at the top reads: *Select languages in which month and weekday names should be
   detected.* One sentence, nothing after it.

5. The search field has a clear (×) button once you type in it, and **no placeholder text** inside
   it when empty.

6. Type `lat` — the list narrows to Latvian. Clear it with the × — the full list comes back.

7. Type `pt-b` — Portuguese (Brazil) is found by its code.

8. Type `zzz` — one line reading *No language matches that.*

9. **Names read properly.** Scroll the list and confirm:
   - **Portuguese** and **Portuguese (Brazil)** sit next to each other — not "Brazilian Portuguese"
     filed under B.
   - **German** and **German (Austria)** likewise.
   - **Chinese**, **Armenian**, **Punjabi**, **Uyghur** — no country in brackets after them.
   - No row shows a bare code like `x-pseudo` or `tzl`.
   - Five Arabics — plain, Algeria, Kuwait, Morocco, Palestine. These are correct: those regions
     write different month names.

10. **Scrolling.** The whole page scrolls; there is no second scrollbar around the list alone.

11. **No flicker.** Type into the search so the list shortens to a few rows, then clear it. The page
    must not jump or change width as the scrollbar comes and goes.

12. **No jumping.** Scroll well down the list, turn **Latvian** on. The row stays exactly where it
    is with its toggle now on — it must not leap to the top under your pointer.

13. Leave the page. The Languages row behind now reads `English · Latvian`.

14. Reopen Languages. *Now* Latvian is pinned under English, at the top.

---

## 2. Typing, with Latvian on

Type each into a note. `@` is the trigger unless you changed it.

15. `@piektdiena` — the Friday rows appear, labelled in English.

16. `@piek` — the same rows. A prefix has to work, not just the whole word.

17. `@PIEKTDIENA` — the same rows. Case is ignored.

18. `@Pk` — the Friday rows, from Latvian's short form.

19. `@septembris 6` — 6 September 2026 and 6 September 2025, the nearest each way.

20. `@6 septembris` — the same two rows, the other word order.

21. `@sep 6` — still works. English is never switched off.

22. `@friday` — still works, unchanged.

23. `@next friday` — **works**, because the phrase is English. `@nākamā piektdiena` is **Invalid
    date**, and that is correct: languages give you names, not phrases.

24. `@ma 13` — March 13 and May 13. Latvian's *marts* and *maijs* are the same two months, so the
    row count does not grow. On an English vault the rows and the written date are English: both
    languages read `ma`, and the app's own wins.

24a. `@septembris 6`, Enter — written in Latvian, `6 septembris 2026` with `D MMMM YYYY` first.

25. Settings → Languages → turn Latvian **off**. `@piektdiena` is now **Invalid date**, with no
    reload.

---

## 3. Typing, with Russian on

Turn Russian on, Latvian off.

26. `@пятница` — the Friday rows.

27. `@пятн` — the same. Prefix again.

28. `@пт` — the Friday rows, from the short form.

29. `@сентябрь 6` — the two Septembers. This is the **listed** spelling.

30. `@сентября 6` — **the same rows**. This is the spelling Russian writes inside a date, and it is
    the one a reader copies off the page. Both must work.

31. `@сент 6` — the short form.

32. `@ноя 3` — 3 November each way. The rows read in Russian, `3 ноября 2026 г.`, and Enter
    writes Russian into the note: `3 ноября 2026` with the `D MMMM YYYY` format first.

32a. `@nov 3` — the same rows in English, and Enter writes English. The language you typed the
     month in decides, not the vault's.

32b. `@ноя 3_` — the format list shows each format in Russian. Pick `D MMMM YYYY`; the note gets
     `3 ноября 2026`.

32c. `@пятница`, Enter — the Friday date is written in Russian.

---

## 4. Finding dates already written

Paste this block into a note. With **Latvian and Russian both on**, every line below should be
outlined and open the calendar when clicked.

```
ISO, always found:        2026-09-06
English:                  6 September 2026
Latvian:                  6 septembris 2026
Russian, as written:      6 сентября 2026
Russian, as listed:       6 сентябрь 2026
```

33. All five are found.

34. **Russian, as written** is the important one. `6 сентября 2026` is what moment's own `format()`
    produces and what Kalendae writes into your note — before TODO 13 it was never found again.

35. Click the Russian one and pick a different day in September. The month is rewritten in the
    declined form — `сентября`, not `сентябрь` — which is grammatical Russian, and the new
    date is still outlined afterwards.

36. Turn **Russian off**. Reopen the note. The two Russian lines are no longer outlined; the other
    three still are. No reload needed.

37. Turn **Latvian off** too. Only the ISO and English lines remain outlined.

38. With everything off but English, paste `6 septiembre 2026` (Spanish). Not outlined. Turn Spanish
    on — now it is.

---

## 5. A vault in another language

These need Obsidian's own language changed, in Settings → About → Language.

39. Set Obsidian to **Latvian** on a vault that has never had Kalendae open. Open Kalendae's
    settings → Languages: **Latvian is already on**, beside English. Nobody should have to turn
    their own language on.

40. Still in Latvian: the Languages row reads `angļu · latviešu` — the names are in Latvian, because
    they come from the system rather than from our translations.

41. Set Obsidian to **Russian**. `@ноя 3` works without visiting settings.

41a. Still in Russian, with Latvian on: `@ma 13` gives March and May in English. Russian has no
     month starting with a Latin `ma`, and English comes next in line, ahead of Latvian.

42. Still in Russian, open *How to type a date*:
    - **По названию** — reads "in any language you have turned on".
    - **Словами** — still reads "English only". The contrast is deliberate.
    - The third By-name example shows a prefix in Russian, `@ма 13`, not `@ma 13`.

43. Set Obsidian back to English. Russian stays in the list — changing the app's language must not
    take a language away that was turned on.

---

## 6. Fixes only

The reports from your last round, and nothing else, so this section runs on its own. F-numbers
are new; the number in brackets is your original report.

**Setup.** Settings → Kalendae → Date formats: add `D MMMM YYYY` if it isn't there, and drag it to
the **top** — with `YYYY-MM-DD` first, every written date is digits and the language can't be
seen. Languages: turn **Latvian** and **Russian** on. Obsidian in English.

### The language list

F1. (6) Type `cy` in the search. Serbian (Cyrillic) and Welsh both show, each with its code
    beside the name — `sr-cyrl` and `cy`. The code is what Welsh matched.

F2. (6) The codes read as secondary to the names: lighter, smaller, in a monospace font.

F3. (9) Arabic has five rows: plain, Algeria, Kuwait, Morocco, Palestine. Expected — each writes
    the months differently.

F4. One English row, `en`. British, Australian and the other English variants are left out
    because their month and weekday names are identical to `en`.

F5. (14) Hover a row. The whole row highlights, name to toggle.

### Trigger

F6. Settings → Kalendae → Typing a date → Trigger. Enter each of `"`, `'`, `[`, `(`, `{` in
    turn. Each shows an error and is not saved. `"@` is refused too — the rule is on the first
    character.

F7. Close the settings with an error still showing, reopen them. The trigger is the last valid one.

### Dates already in a note

Paste:

```
6 September 2026
6 septembris 2026
6 сентября 2026
```

F8. (34) Open the calendar on each. It opens on September 2026 with the 6th selected — all three,
    not only the English one.

F9. (35) In each, pick the 20th. The lines read `20 September 2026`, `20 septembris 2026`,
    `20 сентября 2026`, and all three are still outlined.

F10. (35) On the Russian line, pick a day in October. The month is written `октября`, declined.

### Typing writes the language you typed

F11. `@ноя 3` — the rows read in Russian. Enter writes `3 ноября 2026`.

F12. `@nov 3` — Enter writes `3 November 2026`. English typed, English written.

F13. `@septembris 6` — Enter writes `6 septembris 2027`.

F14. `@ноя 3_` — the format list shows `2026-11-03` and `3 ноября 2026`. Pick the second.

F15. `@пятница` — Enter writes Friday's date with a Russian month.

F16. `@ma 13` — March and May, in English, because English and Latvian both read `ma` and the
     vault is in English.

### Obsidian's own language

First turn **Latvian and Russian off** in the list, so only the app can be turning them on.

F17. (39) Obsidian → Latvian, restart. Kalendae → Languages: Latvian is on and locked, beside
     English.

F18. (40) Still in Latvian: `@piektdiena` works, and `6 septembris 2026` in a note is outlined.

F19. (41) Obsidian → Russian, restart. `@ноя 3` works without visiting settings, and Latvian is
     off again.

F20. (42) Still in Russian: How to type a date → By name. The third example is `@ма 13`, in
     Cyrillic, not `@ma 13`.

F21. Obsidian → English, restart. Russian is off again and `@ноя 3` is Invalid date. A language
     the app turned on is not stored.

---

## What would count as a failure

- A date Kalendae wrote that it cannot find again.
- A language turned on that needs a reload before it works.
- A row in the list showing a bare locale code.
- The page jumping, flickering or scrolling in two places at once.
- `@next friday` failing, or `@nākamā piektdiena` working.
