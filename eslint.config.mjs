// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import * as espree from "espree";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

// Obsidian's review lints every TypeScript file but tests/, *.spec.*, *.test.* and docs/ as plugin
// code, and checks manifest.json; see buildScannerEslintConfig in obsidianmd/obsidian-workflows,
// src/lint.ts. Keep what it reads under the same rules: nothing switched off or relaxed outside
// tests/, and no eslint-disable comments. `npm run lint` fails on any warning.

// validate-manifest walks a JavaScript AST (an object expression statement), which no JSON parser
// produces; parsing the manifest as `(<json>)` gives it one.
const manifestParser = {
  parse: (code) =>
    espree.parse(`(${code})`, { ecmaVersion: "latest", range: true, loc: true, tokens: true, comment: true }),
};

// obsidianmd/validate-manifest, with its description rule widened by the characters this
// description uses: ( ) @ / + ↑ ↓. Everything else it checks is passed through unchanged. The
// review itself skips manifest.json, so this is stricter than it is either way.
const DESCRIPTION = /^[A-Z][A-Za-z0-9\s.,!?'"()@/+↑↓-]{9,249}$/u;
const validateManifest = obsidianmd.rules["validate-manifest"];
const manifestRules = {
  rules: {
    "validate-manifest": {
      meta: {
        ...validateManifest.meta,
        messages: {
          ...validateManifest.meta.messages,
          descriptionFormat:
            "The description must be 10 to 250 characters, start with a capital letter, end with a " +
            "period, and use only letters, digits, spaces and . , ! ? ' \" - ( ) @ / + ↑ ↓.",
        },
      },
      create(context) {
        const inner = validateManifest.create(
          Object.create(context, {
            report: { value: (d) => d.messageId !== "descriptionFormat" && context.report(d) },
          }),
        );
        return {
          ...inner,
          Property(node) {
            if (node.key.value !== "description" || typeof node.value.value !== "string") return;
            const text = node.value.value;
            if (!DESCRIPTION.test(text) || !text.endsWith(".")) {
              context.report({ node: node.value, messageId: "descriptionFormat" });
            }
          },
        };
      },
    },
  },
};

// The end-to-end harness's globals, as declared in e2e/harness.d.ts.
const harnessGlobals = Object.fromEntries(
  [
    "$", "$$", "expect", "browser", "obsidianPage", "resetState", "restartObsidian", "togglePlugin",
    "setPluginSettings", "openEmptyNote", "noteText", "line", "type", "press", "menu", "suggesters",
    "consoleErrors", "allowConsoleErrors",
  ].map((name) => [name, "readonly"]),
);

export default defineConfig([
  { ignores: ["main.js", "node_modules/**", "*.config.mjs", "*.config.js", "e2e/.output/**", "docs/**", "scripts/**"] },
  // The preset's first block has no `files`, so its JS rules would also run on manifest.json;
  // scope it to TypeScript. Every rule stays as the preset sets it.
  ...[...obsidianmd.configs.recommended].map((c) => (c.files ? c : { ...c, files: ["**/*.ts"] })),
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      // One per group of files: the plugin, the unit tests, the end-to-end tests. Without its
      // own, a file outside src/ shows a parsing error in the editor.
      parserOptions: { project: ["./tsconfig.json", "./tsconfig.test.json", "./e2e/tsconfig.json"] },
      globals: {
        ...globals.browser
      },
    },

    rules: {
      // What the review adds to the preset, as of 2026-11-14. It reports every finding as a
      // warning; here they are errors, which --max-warnings 0 makes no stricter.
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
      "obsidianmd/regex-lookbehind": "error",
      "obsidianmd/no-forbidden-elements": "error",
      "eslint-comments/require-description": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "obsidianmd/commands/no-command-in-command-id": "error",
      "obsidianmd/commands/no-plugin-id-in-command-id": "error",
      "obsidianmd/settings-tab/no-manual-html-headings": "error",
      "obsidianmd/settings-tab/no-problematic-settings-headings": "error",
      "obsidianmd/sample-names": "error",
      "obsidianmd/no-sample-code": "error",
      "obsidianmd/platform": "error",
      "obsidianmd/no-plugin-as-component": "error",
      "obsidianmd/detach-leaves": "error",
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/no-view-references-in-plugin": "error",
      "obsidianmd/no-unsupported-api": "error",
      // The obsidianmd preset passes only { args: "none" }, which resets
      // ignoreRestSiblings back to the rule default (false). Re-enable it so
      // `const { dropMe, ...rest } = obj` — the standard omit-a-key idiom —
      // isn't flagged, and honour the `_name` convention for deliberate
      // discards.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { args: "none", ignoreRestSiblings: true, varsIgnorePattern: "^_" },
      ],
      "obsidianmd/prefer-file-manager-trash-file": "error",
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          brands: ["Kalendae"],
          acronyms: [],
          ignoreWords: [],
          enforceCamelCaseLower: true
        },
      ],
    },
  },
  { files: ["e2e/**/*.ts"], languageOptions: { globals: { ...globals.mocha, ...harnessGlobals } } },
  {
    // Unit tests run in Node, and the review never reads them. The rules that keep plugin code
    // safe inside Obsidian (no Node modules, no console, popout-safe globals, no fixed config
    // folder) have nothing to protect here.
    files: ["tests/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      // TypeScript already rejects an undefined name, and knows the type-only globals ESLint does not.
      "no-undef": "off",
      "import/no-nodejs-modules": "off",
      "obsidianmd/no-nodejs-modules": "off",
      "import/no-extraneous-dependencies": "off",
      // The Obsidian mock stands in for an API it cannot type, and re-exports the real moment.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-restricted-imports": "off",
      "obsidianmd/prefer-create-el": "off",
      // Calls a function as loosely typed JavaScript would. The rule calls the cast that widens its
      // parameter to `unknown` unnecessary, and its autofix breaks the type check.
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "obsidianmd/rule-custom-message": "off",
      "obsidianmd/prefer-window-timers": "off",
      "obsidianmd/prefer-active-doc": "off",
      "obsidianmd/hardcoded-config-path": "off",
      "obsidianmd/no-global-this": "off",
    },
  },
  {
    files: ["manifest.json"],
    plugins: { manifest: manifestRules },
    languageOptions: { parser: manifestParser },
    rules: { "manifest/validate-manifest": "error" },
  },
]);
