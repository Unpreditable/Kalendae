// The CSS half of Obsidian's community directory review, copied from SCANNER_STYLELINT_CONFIG in
// obsidianmd/obsidian-workflows (src/lint.ts, as of 2026-11-03), with the same stylelint and
// stylelint-no-unsupported-browser-features versions pinned in package.json. Keep it the same:
// no rules switched off, and no stylelint-disable comments (the review ignores them, and so does
// this config). `npm run lint` fails on any warning.
//
// The review checks browser features against the Electron of the newest Obsidian in its table
// that is not newer than manifest.json's minAppVersion: 1.13.0 → Electron 39 (Obsidian 1.11.4).

export default {
  plugins: ["stylelint-no-unsupported-browser-features"],
  ignoreDisables: true,
  ignoreFiles: ["node_modules/**", "e2e/.output/**", "docs/**"],
  rules: {
    "function-url-scheme-disallowed-list": [
      ["http", "https", "file"],
      { severity: "error", message: "External URLs are not allowed. Embed images and fonts as base64." },
    ],
    "function-url-scheme-allowed-list": ["data"],
    "declaration-no-important": [
      true,
      { severity: "warning", message: "Avoid !important — override styles by increasing selector specificity or using CSS variables instead." },
    ],
    "color-named": [
      "never",
      { severity: "warning", message: "Use hex colors or Obsidian CSS variables instead of named colors." },
    ],
    "declaration-block-no-duplicate-properties": [true, { severity: "warning" }],
    "plugin/no-unsupported-browser-features": [
      true,
      { severity: "warning", browsers: ["electron >= 39"], ignore: ["css-nesting", "css-cascade-layers"] },
    ],
    "selector-pseudo-class-disallowed-list": [
      ["has"],
      { severity: "warning", message: "Avoid :has() — it can cause significant performance issues due to broad selector invalidation." },
    ],
    "selector-pseudo-class-no-unknown": [true, { ignorePseudoClasses: ["global", "local"], severity: "warning" }],
    "selector-pseudo-element-no-unknown": [true, { severity: "warning" }],
    "selector-type-no-unknown": [true, { ignoreTypes: [], severity: "warning" }],
    "at-rule-no-unknown": [true, { ignoreAtRules: ["layer", "property", "container"], severity: "warning" }],
    "unit-no-unknown": [true, { severity: "warning" }],
    "property-disallowed-list": [["all"], { severity: "warning" }],
  },
};
