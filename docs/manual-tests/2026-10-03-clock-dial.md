# Clock dial — manual tests

Everything here starts from the command palette: **Kalendae: Try the time picker**, with the cursor
anywhere in a note. Each run opens on the current time in a pattern and language picked at random;
run it again until you get the one a case needs. Nothing is written: where a case says "writes", the
panel closes, and that is the sign.

**Run with `npm run dev` going and Hot Reload installed**, or restart Obsidian after `npm run build`.

**Settings → Time picker** holds the two settings the cases use: *Snap minutes* and *Write to note*.
Leave *Write to note* on **On ✓ click** unless a case says otherwise.

**The cases are numbered straight through.** Say "7 is wrong" and I will know which one you mean.

---

## Shapes

1. `HH:mm` — two rings: 1–12 outside with 12 at the top, 13–23 inside with 00 at the top. No AM/PM.
2. `H:mm` before 10 o'clock — the big hour has no leading zero (`9`), the minutes do (`05`).
3. `h:mm a` — one ring, 12 at the top, an AM/PM toggle in lowercase.
4. `hh:mm A` — the toggle in uppercase, the big hour padded (`02`).
5. `HH:mm:ss` with the magnet off — three big numbers. On — two.
6. Ukrainian, 12-hour — the toggle shows the word for this hour on each side (`ночі`/`дня` at 2,
   `ранку`/`вечора` at 9). Step the hour across 4, 12 and 17: the toggle never changes width.
7. Chinese, 12-hour — the same, with six words; at 11:30 the morning side turns to `中午`.
8. Any 12-hour pattern — the toggle is no taller than the big numbers beside it.

## Corners

9. *On ✓ click* — clock icon top left, magnet top right, ✕ bottom left, ✓ bottom right. Nothing below
   the dial.
10. *On click* — no ✕ or ✓; the clock and the magnet sit in the bottom corners, the top ones empty.
11. Hover each corner icon — its tooltip names it.
12. Magnet on — a filled accent circle. Off — a plain grey icon. Check in two or three themes.

## Pointer

13. Rest the pointer on the dial and move it — a faded marker follows, sitting on the value a click
    would pick, and the big numbers show the time that click would give, at full strength. Leave the
    dial — the big numbers go back.
14. Magnet off, rest between 35 and 40 on the minute dial — the faded marker reads `37`.
15. On the 24-hour dial, rest near the centre at 3 o'clock — the marker is on 15. Near the edge — 3.
16. Press on an hour and drag around the dial — the solid hand and the big hour follow, the faded
    marker is gone. Release — the dial switches to minutes.
17. Magnet on, drag through minutes — the hand lands on fives. Off — every minute.
18. Start a drag on the dial and release outside the panel — the hand follows to the end, the unit
    settles, and the panel stays open.
19. With seconds, release on minutes — the dial moves to seconds. Release on seconds — it stays.
20. Click the big minutes, then the big hour — the dial switches unit each time.
21. Click PM at 2 AM — the hour shows 2 PM, on the same spot on the dial.
22. Right-click on the dial — nothing moves.

## Writing the time

23. *On ✓ click* — a click on the last unit settles it and waits. ✓ writes.
24. *On ✓ click*, ✓ without touching anything — closes; nothing changed, so nothing would be written.
25. *On click* — click an hour, then a minute: the minute click writes.
26. *On double-click* — at 14:30, double-click 3 on the hour dial: writes, and the time was 15:30.
27. *On double-click* — on the minute dial, double-click 40: writes with the hour kept.
28. *On double-click* — single clicks behave as in *On ✓ click*; ✓ still writes.
29. Any mode — click an hour and then a minute quickly. Note whether it counted as a double-click
    when you did not mean one.

## Keyboard

30. Up and Down — the active unit steps by one hour, or 5 / 1 minutes as the magnet says.
31. Magnet on, on an odd minute (magnet off, set 37, magnet on) — Up goes to 40, Down to 35.
32. Hours: Up past 11 AM — 12 PM. Up past 23 — 00.
33. Minutes: Up past 55 (or 59) — 00, and the hour does not change.
34. Left and Right — move between the big numbers, stopping at the ends.
35. With the seconds unit active, turn the magnet on — seconds disappear and minutes are active.
36. Enter writes, Escape closes — in every mode, *On click* included.
37. Tab to ✕, press Enter — closes as Cancel; nothing else fires.
38. Tab to the magnet, press Space, then click the dial and press Up — the arrows work again.

## Now

39. Hover the clock icon — the big numbers show the current time; leave — they go back.
40. Click it — writes the exact current time, seconds included, even with the magnet on.

## Looks

41. Light theme and dark theme — the face, hand, knob, faded marker, numbers and toggle all follow
    the theme.
42. Larger interface font (Settings → Appearance) — the panel grows with it and nothing overlaps.
43. Cursor on the last lines of a long note, near the bottom of the window — the panel flips above.
44. Next to the calendar (open both in turn) — same border, shadow and colours; the clock's margin
    is tighter on purpose.

## Settings

45. *Snap minutes* off — the picker opens with the magnet off. Turning it on in the picker and
    reopening — off again; the setting has not changed.
46. *Write to note* — each choice changes the corners and the clicks as in 9, 10 and 23–28.
