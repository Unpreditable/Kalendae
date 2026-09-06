# Kalendae Date Picker

An [Obsidian](https://obsidian.md) plugin that lets you change a date already written in a note by
picking it from a calendar, instead of retyping it.

> *Kalendae* — the first day of the Roman month, when a priest called out the dates for the month
> ahead. From it came *kalendarium*, the book of what fell due, and from that, *calendar*.

## Status

Early. The project skeleton is in place; date detection and the calendar itself are not built yet.

## Scope

Works in **Source mode** and **Live Preview** — both are the same CodeMirror editor, so both behave
identically.

**Reading mode is not supported**, by design. It is a reading surface, not an editing one.

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # typecheck + lint + production bundle
npm test
```

Symlink this folder into `<vault>/.obsidian/plugins/kalendae/` and install
[Hot Reload](https://github.com/pjeby/hot-reload) to get changes without restarting Obsidian.

See [CONTRIBUTING.md](CONTRIBUTING.md) for bug reports, feature requests, and translations.

## License

[GPL-3.0-only](LICENSE)
