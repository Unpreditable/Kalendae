# Typed dates — manual checks

Reload the plugin, open a scratch note, type each line at the start of a line in a paragraph.
"Writes" means press Enter. The trigger is fixed at `@` until the settings task lands.

1. @ - list opens at the caret: Today, Tomorrow, Yesterday, then the generated rows further down

2. @tom - Tomorrow only; Enter writes tomorrow's date and the `@` and query disappear

3. @tod - Today only, one row, not two

4. @e - End of week, End of month, End of quarter, End of year, all reading the same way

5. @f - Next Friday and Last Friday only; This Friday appears on Fridays, when it means something else

6. @wed - all three on a Wednesday, since today, next and last are three different days

7. @friday - the full word finds the same rows as `@fri`

8. @thurs - Thursday rows, from a prefix of the full name

9. @2 - each subject on and back in pairs, weekdays running from your own first day of the week

10. @2w - one row, two weeks on; Enter writes that date

11. @2w<space> - Accept first, in the accent colour with no keyword, then the next-step options

12. @2w eo - narrows to EoW, EoM, EoQ, EoY, and the middle column shows only the token

13. @2w eow - the middle column reads EoW, not +2w EoW

14. @2w then Tab - text becomes `@2w `, menu stays open with Accept on top

15. @Sun - Next Sunday and Last Sunday; not twenty-seven alternatives

16. @Sun<space> - Accept plus the steps that could follow

17. @next friday - one row, the Friday after this one

18. @last friday - the Friday just gone

19. @in th weeks - three weeks out, from two letters of the number word

20. @in 3 weeks - the same date as the line above

21. @3 months ago - three months back

22. @3 weeks a - already reads as three weeks back while "ago" is half-typed

23. @3 months - both directions, 3 months on and 3 months back

24. @in 200 days - 200 days out

25. @next friday<space> - still the Friday, not an invalid row

26. @next friday then Tab - text becomes `@+1Fri `, Accept on top; then type eow and Enter

27. @in a month / @in 1 month / @next month - each shows exactly one "1 month on" row

28. @in 1000 days - the row reads "Only counts up to 999", not "Invalid date"

29. @next 3 weeks - Invalid date; next takes no count

30. @this month - Invalid date; "this" is for weekdays only

31. @week - the week rows, found by name rather than as a phrase

32. @week ago - a week back; the trail is what qualifies it

33. @nonsense - one row reading Invalid date; backspace to @n and the rows come back

34. @nonsense then Escape - menu closes, the text stays exactly as typed, nothing written

35. word@tom - no menu at all; the trigger has to start a word

36. dvitaly@gmail.com - no menu

37. @tom inside a fenced code block - no menu

38. @tom inside frontmatter - no menu

39. @tom, Enter, then Ctrl+Z - one undo brings back the text you typed

40. @ then arrow down past the eighth row - the list scrolls rather than stopping

41. @channel please review this - the menu stays open showing Invalid date to the end of the line; judge whether that is acceptable

42. @1 - includes "1 day back" and "1 week back" among the forward rows, because the labels start with 1

43. Switch Obsidian's language, then @f - the rows read in that language

44. Settings, Calendar, Quick dates, open the preset chooser - each period reads start, end, start of next, and the quarter's short form is "Next SoQ"

45. @s - Start of week, Start of month, Start of quarter among the rows

46. @friday - Next Friday and Last Friday, with no on/back pair: pairs are for counts

## The format switch

Add a second date format in settings first — the switch does nothing with one, which is the
default.

47. @tom then `_` - the list becomes tomorrow written in each format, in the order settings lists them; Enter writes the highlighted one

48. @nov 3, arrow down to last year's row, then `_` - the note reads `@nov 3 2025_` and the formats are for 2025

49. @nov 3 then `_` with nothing moved - this year's November, the row Enter would have taken

50. @e, arrow down to End of month, then `_` - the formats are for the end of the month, not the end of the week

51. @tom then `_` then part of a date, e.g. `14/` - only the formats that start that way stay

52. After a format row is written, Ctrl+Z - one undo brings back the text you typed, `_` and all

53. With one format configured, @tom then `_` - Invalid date, and `_` sits in the note as an ordinary character

54. @xyz then `_` - Invalid date, unchanged; the character goes in as text

55. The footer of the list - `↑↓ navigate`, `↵ insert`, `Tab complete`, and `_ formats` only while two or more formats are configured; all four on one line, and the line no wider than the rows above it
