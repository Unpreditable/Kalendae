---
created: 2024-01-15
due: 2024-03-22
---

# Detection corpus

This note is both a Jest fixture and a manual test note. Open it in a vault with Kalendae
installed and hover the dates: the ones that show the calendar icon should agree with
`tests/detect/corpus.test.ts` for everything outside code and frontmatter, and the scope settings
decide the rest.

## Prose — should be recognised

The deadline is 2024-03-22.
Between 2024-03-22 and 2024-04-05 there are two weeks.
Filed on 2024-02-29, a real leap day.
Parenthesised (2024-03-22), and quoted "2024-03-22".
At the very end of a line: 2024-03-22
2024-03-22 at the very start of a line.

## Prose — should not be recognised

Version 0.9.1 shipped, then v0.9.1-rc2, then 2.11.1.1 and 1.2.3.4.
Section 2.11.1.1 of the standard.
An impossible day: 2024-02-30. An impossible month: 2024-13-01.
Twenty-nine February in a common year: 2023-02-29.
Digits stuck on: 12024-03-22 and 2024-03-221.
A letter stuck on: v2024-03-22 and 2024-03-22z.
Not zero-padded, so not ISO: 2024-3-2.
A phone number: 555-01-99.

## Inline code — off by default

The constant `2024-03-22` and the version `v0.9.1` both sit in inline code.

## Code block — off by default

```yaml
released: 2024-03-22
version: 0.9.1
```

## Links — off by default

A daily note link: [[2024-03-22]] and an aliased one: [[2024-04-05|next month]].

## Other formats — off by default

Dotted: 22.03.2024. Slashed: 22/03/2024 and 03/22/2024. Short: 03/22/24.
Long: 22 March 2024, March 22, 2024, and Friday, March 22, 2024.
With a weekday in brackets: 2024-03-22 (Fri).
