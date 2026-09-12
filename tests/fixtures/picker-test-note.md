# Picker test note

Open this in a vault and work down it. Nothing here is read by a unit test —
the editor layer cannot be tested without a real Obsidian, so this note is the
test. The counts in `manual-test-note.md` are asserted by Jest, which is why
this is a separate file.

Every date below is 2024-03-22, a Friday, so a wrong write is obvious.

## 1. The four ways in

Hover this date and click the icon: 2024-03-22
Double-click this one: 2024-03-22
Put the cursor inside this one and run **Pick a date**: 2024-03-22
Put the cursor just after this one and run the command: 2024-03-22
Run the command on this line, where the cursor is in neither date: 2024-03-22 and 2024-03-25
Click the emoji in front of this one: 📅 2024-03-22

## 2. Tasks plugin emojis

One click on the emoji opens the calendar, and the date beside it gets no icon
of ours. Hovering either half outlines the pair, emoji included, and the emoji
takes a chip behind it.

All six, each one a way in:

- [ ] Created ➕ 2024-03-22
- [ ] Start 🛫 2024-03-22
- [ ] Scheduled ⏳ 2024-03-22
- [x] Done ✅ 2024-03-22
- [ ] Due 📅 2024-03-22
- [ ] Cancelled ❌ 2024-03-22

Outside a task line, where it works the same way:

Holiday 📅 2024-03-22, and a bullet below.

- Follow up ⏳ 2024-03-22

These must behave as ordinary dates, with the icon and nothing clickable in
front of them:

- [ ] Recurring 🔁 every week, due 2024-03-22
- [ ] High priority ⏫ by 2024-03-22
- [ ] An emoji with a word after it: 📅 deadline 2024-03-22
- [ ] An emoji at the end of the line, the date on the next 📅
      2024-03-22

Then switch **Tasks plugin emojis** off in settings: every date above goes back
to the hover icon, and the emoji stop responding to a click. Switch **Icon on
hover** to Disabled with the emojis back on, which is the setup this was built
for — the task lines are reachable and nothing else in the note is drawn on.

With all three ways in off, the settings section says so in a line above the
switches; with only the emojis left on, it does not.

## 3. Formatting contexts

These are where the spike broke. The icon and the outline must appear together
in all of them.

*Italic 2024-03-22*, **bold 2024-03-22**, ~~struck 2024-03-22~~, `inline code 2024-03-22`
[Bracketed 2024-03-22], and a [[2024-03-22]] wikilink.

### Heading with 2024-03-22 in it

> A quote with 2024-03-22 in it.

- A list item with 2024-03-22
- [ ] A task with a due date 📅 2024-03-22 — the emoji, not the icon, as in section 2

## 4. Two on one line, and edges

Two dates on one line: 2024-03-22 and 2024-03-25 — each icon must open its own.

At the very start of a line:
2024-03-22 leads this one.

At the very end of a line, with nothing after it: 2024-03-22

## 5. Other formats

Add these formats in settings first. Each must be written back in its own shape.

- Dotted: 22.03.2024
- Slashed: 22/03/2024
- Spelled out: 22 March 2024
- With a weekday: 2024-03-22 (Fri)
- American: 03/22/2024

## 6. What must not happen

- Text must not shift when the icon appears
- A single click on a date must place the cursor and nothing else. A Tasks emoji
  is the one exception, and only the emoji and the space after it — a click on
  the date beside it still just places the cursor
- The text must not shift when the emoji takes its chip
- Dragging a selection across these dates must light nothing up
- Escape must close the panel and write nothing
- One Ctrl+Z must put the old date back whole
- Typing while the panel is open must close it
- Copying a line with a date in it must not put anything extra on the clipboard

## 7. Out of scope, must stay untouched

Code block, off by default:

```
2024-03-22
```

Frontmatter is off by default too — the note's own frontmatter is empty on
purpose, so add one if you want to check it.
