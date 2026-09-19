# Naming the day — manual tests

What to type in a note, and what should come back. Everything here is the typed date list: press `@`
and keep typing. Nothing is inserted until Enter.

**Run with `npm run dev` going and Hot Reload installed**, or restart Obsidian after `npm run build`.

**Today is assumed to be Friday 18 September 2026.** Every case with two rows depends on it: the
first row is the next time that day comes round, the second is the last time it did. On another day
the years shift, and the rule to check is that one — not the exact year printed here.

A row reads: **the date in full** on the left, nothing in the middle, **the weekday** on the right.

**Two different things end up in the note, and the cases distinguish them.** Tab leaves a *query* —
the text you typed with the missing parts filled in, menu still open. Enter leaves a *date*, written
through the first format in your settings, so whether the month comes out as `11`, `Nov` or
`November` is that format's business and not this feature's.

**The cases are numbered straight through, 1 to 58.** Say "23 is wrong" and I will know which one
you mean.

---

## The basic shapes

1. `@nov 3` — two rows: `November 3, 2026` (Tue) above `November 3, 2025` (Mon), at the top of the list
2. `@3 nov` — the same two rows
3. `@november 3` — the same two rows
4. `@NOV 3` — the same two rows; case is ignored
5. `@nov  3` (two spaces) — the same two rows
6. `@nov 03` — the same two rows; a leading zero is allowed
7. `@nov 3 ` (trailing space) — the same two rows, and **no Accept row**: a named day has nothing to chain
8. `@nov` — `November 1, 2026` (Sun) and `November 1, 2025` (Sat), at the **bottom** of the list
9. `@feb 29` — `February 29, 2028` (Tue) and `February 29, 2024` (Thu); the nearest real ones, not 28 February

## The year

10. `@nov 3 2027` — one row, `November 3, 2027` (Wed)
11. `@nov 3, 2027` — the same one row; the comma after the day is allowed
12. `@nov 3 26` — two rows: `November 3, 2026` (Tue) then `November 3, 0026` (Tue)
13. `@nov 3 198` — one row, `November 3, 0198` (Sat); a year is the year it says
14. `@nov 3 1`, then `9`, then `8`, then `5` — a row at every keystroke, the year changing under you: `November 3, 0001`, then `0019`, then `0198`, then `1985` (Sun). Nothing goes invalid on the way

## Today, and the day before it

15. `@sep 18` — `September 18, 2026` (Fri, today) above `September 18, 2025` (Thu); forward counts today
16. `@sep 17` — `September 17, 2027` (Fri) above `September 17, 2026` (Thu); yesterday has gone, so forward is next year

## One letter, and several months

17. `@j` — six rows at the bottom: `January 1, 2027`, `January 1, 2026`, `June 1, 2027`, `June 1, 2026`, `July 1, 2027`, `July 1, 2026`
18. `@n 3` — `November 3, 2026` and `November 3, 2025`, at the **bottom**: one letter is a weak reading
19. `@3 n` — the same two rows, also at the bottom

## Nothing that already worked may change

20. `@3` — counts only, as before: 3 days on, 3 days back, 3 weeks on … and **no month rows at all**
21. `@3 d` — `3 days on` (`+3d`, 21 Sep) is the **first** row; `December 3, 2026` and `December 3, 2025` sit at the very bottom
22. `@f` — the Friday rows lead (this Friday, next Friday, last Friday); `February 1, 2027` and `February 1, 2026` are at the bottom
23. `@next friday` — Next Friday, as before
24. `@2w eow` — the end-of-week row, as before
25. `@tom` — Tomorrow, as before

## What must be refused

26. `@nov 0` — `Invalid date`
27. `@nov 32` — `Invalid date`
28. `@feb 30` — `Invalid date`
29. `@0 nov` — `Invalid date`, **not** "Only counts up to 999"
30. `@in 1000 days` — `Only counts up to 999`, unchanged
31. `@1000 days ago` — `Only counts up to 999` too; the direction word does not change the answer
32. `@1000 back` — `Invalid date`; a direction with no subject is no kind of date
33. `@nov 3rd` — `Invalid date`; ordinals are out
34. `@2026 nov 3` — `Invalid date`; a year cannot come first
35. `@11/3` — `Invalid date`; numeric dates are out
36. `@nov 3 eow` — `Invalid date`; nothing chains onto a named day
37. `@nov nov` — `Invalid date`

## The keys

38. `@nov 3`, highlight the 2026 row, **Tab** — the note reads `@nov 3 2026`, menu still open, one row
39. `@nov`, **Tab** — the note reads `@nov 1 2026`; Tab fills in the day as well as the year
40. `@nov 3 26`, highlight the second row, **Tab** — the note reads `@nov 3 0026`
41. `@nov 3 2026`, **Tab** — the date is written; there is nothing left to fill in
42. `@nov 3`, **Enter** — the date is written in your first format, the `@` and the query gone
43. Ctrl+Z straight after — the typed text back, in one undo
44. `@nov 3`, **Escape** — menu closed, the text left exactly as typed, nothing inserted
45. `@nov 3` then backspace to `@nov` — the November 1 rows come back; backspace repairs

## Where it must not open

46. `@nov 3` inside a fenced code block — no menu (unless you have turned code blocks on in settings)
47. `dvitaly@gmail.com` — no menu; the trigger only fires at the start of a word

---

## Russian

**Switch Obsidian's language first, or skip this whole section.** Settings → About → Language →
Русский, then reopen the note. Until you do, every case below is correctly "Invalid date": an
English vault hands the plugin English month names, and Cyrillic matches none of them. That is the
design — the months you can type are your own language's and English, and your own language is
whatever Obsidian is set to.

Once switched, the rows themselves read in Russian without anything having been translated for this
feature: the label is moment's own long date and the right-hand column its weekday.

48. `@ноя 3` — `3 ноября 2026 г.` (вт) above `3 ноября 2025 г.` (пн)
49. `@ноябрь 3` — the same two rows; the form the list of months uses
50. `@ноября 3` — the same two rows; the form the **row itself** shows, which is the one you would type back
51. `@нояб 3` — the same two rows; the short form, with or without its dot
52. `@3 ноя` — the same two rows
53. `@nov 3` — the same two rows; English still answers in a Russian vault
54. `@мая 3` — `3 мая 2027 г.` (пн) and `3 мая 2026 г.` (вс)
55. `@май 3` — the same two rows
56. `@ноя` — `1 ноября 2026 г.` and `1 ноября 2025 г.`, at the bottom of the list
57. `@д 3` — `3 декабря 2026 г.` (чт) and `3 декабря 2025 г.` (ср), at the bottom: one letter is weak
58. `@ноя 3`, **Tab** — the note reads `@ноя 3 2026`: your three letters kept, the year added. Then **Enter** — the query is replaced by the date written through your first format, so the month appears however that format spells it, in full if the format says so

---

## Telling me what you saw

Case number, what you typed, what appeared, what you expected. The three places this can go wrong
are `src/typing/absolute.ts` (which days a query names), `src/typing/entries.ts` (where the rows
sit), and `src/editor/date-suggest.ts` (how a row reads and what Tab writes).
