# Picker test note

Open this in a vault and work down it. Nothing here is read by a unit test —
the editor layer cannot be tested without a real Obsidian, so this note is the
test. The counts in `manual-test-note.md` are asserted by Jest, which is why
this is a separate file.

Every date below is 2024-03-22, a Friday, so a wrong write is obvious.

## 1. The three ways in

Hover this date and click the icon: 2024-03-22
Double-click this one: 2024-03-22
Put the cursor inside this one and run **Pick a date**: 2024-03-22
Put the cursor just after this one and run the command: 2024-03-22
Run the command on this line, where the cursor is in neither date: 2024-03-22 and 2024-03-25

## 2. Formatting contexts

These are where the spike broke. The icon and the outline must appear together
in all of them.

*Italic 2024-03-22*, **bold 2024-03-22**, ~~struck 2024-03-22~~, `inline code 2024-03-22`
[Bracketed 2024-03-22], and a [[2024-03-22]] wikilink.

### Heading with 2024-03-22 in it

> A quote with 2024-03-22 in it.

- A list item with 2024-03-22
- [ ] A task with a due date 📅 2024-03-22

## 3. Two on one line, and edges

Two dates on one line: 2024-03-22 and 2024-03-25 — each icon must open its own.

At the very start of a line:
2024-03-22 leads this one.

At the very end of a line, with nothing after it: 2024-03-22

## 4. Other formats

Add these formats in settings first. Each must be written back in its own shape.

- Dotted: 22.03.2024
- Slashed: 22/03/2024
- Spelled out: 22 March 2024
- With a weekday: 2024-03-22 (Fri)
- American: 03/22/2024

## 5. What must not happen

- Text must not shift when the icon appears
- A single click on a date must place the cursor and nothing else
- Dragging a selection across these dates must light nothing up
- Escape must close the panel and write nothing
- One Ctrl+Z must put the old date back whole
- Typing while the panel is open must close it
- Copying a line with a date in it must not put anything extra on the clipboard

## 6. Out of scope, must stay untouched

Code block, off by default:

```
2024-03-22
```

Frontmatter is off by default too — the note's own frontmatter is empty on
purpose, so add one if you want to check it.
