import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import en from "../../src/i18n/locales/en.json";

/**
 * Every literal key the source hands to `t()` names a string in en.json. A key
 * that resolves to nothing shows the reader the key itself, and nothing else
 * notices: the build and the translation check both pass.
 */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

function lookup(key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    return node !== null && typeof node === "object"
      ? (node as Record<string, unknown>)[part]
      : undefined;
  }, en);
}

/** A plural key is stored under its forms, `key_one` and `key_other`. */
function resolves(key: string): boolean {
  return [key, `${key}_one`, `${key}_other`].some((each) => typeof lookup(each) === "string");
}

describe("en.json", () => {
  const root = join(__dirname, "../../src");
  const keys = new Set<string>();

  for (const file of sourceFiles(root)) {
    for (const match of readFileSync(file, "utf8").matchAll(/\bt\(\s*"([\w.]+)"/g)) {
      keys.add(match[1]);
    }
  }

  it("finds keys to check", () => {
    expect(keys.size).toBeGreaterThan(50);
  });

  it.each([...keys])("has a string for %s", (key) => {
    expect(resolves(key)).toBe(true);
  });
});
