import { frontmatterEnd } from "../../src/detect/context";

describe("frontmatterEnd", () => {
  it("returns 0 for a note with no frontmatter", () => {
    expect(frontmatterEnd("# Heading\n\ndue 2026-09-06\n")).toBe(0);
  });

  it("covers everything up to and including the closing fence", () => {
    const doc = "---\ndue: 2026-09-06\n---\nbody\n";

    expect(doc.slice(0, frontmatterEnd(doc))).toBe("---\ndue: 2026-09-06\n---\n");
  });

  it("ignores a --- rule that is not at the very start of the note", () => {
    expect(frontmatterEnd("intro\n---\ndue: 2026-09-06\n---\n")).toBe(0);
  });

  it("treats an unterminated block as no frontmatter, matching Obsidian", () => {
    expect(frontmatterEnd("---\ndue: 2026-09-06\n")).toBe(0);
  });

  it("handles CRLF line endings", () => {
    const doc = "---\r\ndue: 2026-09-06\r\n---\r\nbody";

    expect(doc.slice(0, frontmatterEnd(doc))).toBe("---\r\ndue: 2026-09-06\r\n---\r\n");
  });

  it("does not treat a horizontal rule on the first line as an opening fence", () => {
    expect(frontmatterEnd("---\n\nbody\n")).toBe(0);
  });
});
