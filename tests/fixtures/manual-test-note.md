---
created: 2024-01-15
due: 2024-03-22
tags: [test]
---

# Kalendae detection test note

Run **Kalendae: report detected dates in this note** from the command palette, then open the
developer console (`Ctrl+Shift+I`) to read the table.

With the shipped defaults — **only `YYYY-MM-DD` enabled, prose only** — you should see
**17 accepted** and **22 rejected**. Each section below says what it is testing.

---

## 1. Should be accepted (16)

The deadline is 2024-03-22.
Between 2024-03-22 and 2024-04-05 there are two weeks.
Filed on 2024-02-29, a real leap day.
Parenthesised (2024-03-22), quoted "2024-03-22", and bracketed [2024-03-22].
The bracketed one is deliberate: Obsidian tags it `hmd-barelink`, but a barelink has no target,
so editing the date changes nothing but the date. It counts as prose, not as a link.
At the end of a line, no full stop: 2024-03-22
2024-03-22 at the very start of a line.
Inside **bold 2024-03-22** and *italic 2024-03-22*.
Wrapped tight in emphasis, where the marks touch the date: *2024-03-22*, _2024-03-22_,
**2024-03-22**, __2024-03-22__ and ~~2024-03-22~~. All five are the same date written in prose,
so all five are offered; the underscore forms are the ones that used to be missed.

## 2. Rejected — not a real calendar date (5)

`reason: not-a-date`. These match the shape but no such day exists.

An impossible day: 2024-02-30.
An impossible month: 2024-13-01.
A zeroth day: 2024-03-00.
A zeroth month: 2024-00-15.
February 29 in a common year: 2023-02-29.

## 3. Rejected — glued to something else (8)

`reason: boundary`. This is the rule that answers the false-positive complaints on the prior-art
plugin.

Digit on the end: 2024-03-221
Digit on the front: 12024-03-22
Letter on the front: v2024-03-22
Letter on the end: 2024-03-22z
Underscore joining it to a word on both sides: my_2024-03-22_backup
Underscore joining it to a word on one side: _2024-03-22_backup
And the other side: my_2024-03-22_
Part of a longer dotted run: 1.2024-03-22.3

## 4. Not matched at all — nothing should appear for these

These produce **no rows**, because nothing even matches the ISO pattern. This is the semver
family that the prior-art plugin offered as dates.

Version 0.9.1 shipped, then v0.9.1-rc2, then 2.11.1.1 and 1.2.3.4.
Section 2.11.1.1 of the standard, and clause 4.7.2.
A phone number: 555-01-99. An IP: 192.168.1.1.
Not zero-padded, so not ISO: 2024-3-2 and 2024-3-22.
A range with no separator: 20240322.

## 5. Rejected — wrong place (9)

`reason: scope`. Turn the matching toggle on in settings and re-run; each of these should flip to
accepted, and its `scope` column tells you which toggle.

Frontmatter at the top of this note holds two dates. They are the first two rows of the table,
on lines 2 and 3.

Inline code: the constant `2024-03-22` and the string `"2024-04-05"`.

```yaml
released: 2024-03-22
deprecated: 2024-04-05
```

A daily-note link: [[2024-03-22]], an aliased one: [[2024-04-05|next month]], and one inside a
sentence — see [[2024-05-01]] for details.

## 6. Other formats — off by default

Only the ISO date inside the bracketed-weekday line should be accepted here; the rest match no
enabled format and produce no rows at all. Enable them one at a time in settings to check each.

Dotted: 22.03.2024
Slashed, day first: 22/03/2024
Slashed, month first: 03/22/2024
Short year: 03/22/24
Long, day first: 22 March 2024
Long, month first: March 22, 2024
With weekday: Friday, March 22, 2024
ISO with a bracketed weekday: 2024-03-22 (Fri)

## 7. Ambiguity — needs two formats enabled

Enable both `DD/MM/YYYY` and `MM/DD/YYYY`, then re-run. The date below matches both. Exactly one
row should be accepted and the other rejected with `reason: overlap` — and dragging one format
above the other in settings should swap which.

03/09/2026
