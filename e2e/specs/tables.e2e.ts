// A date and a time in a table cell (TODO item 23). A table in live preview is a widget that
// clips whatever is inside it, and the cell being edited is an editor of its own inside that
// widget: the calendar, the clock and the hint used to be drawn there and cut off, and the
// outline and the icon were cut off by the cell's own scroller.
//
// Written without imports: describe, it, expect, browser, $ and the helpers are globals the harness
// provides.

const DATE = "2026-10-04";
const TIME = "14:30";

/** The editor of the cell being edited: the only editor inside a table. */
const CELL = ".cm-table-widget .cm-editor";

/** Opens the fixture's table note in live preview. */
async function openTable(): Promise<void> {
  await browser.executeObsidian(async ({ app }) => {
    app.workspace.detachLeavesOfType("markdown");
    const file = app.vault.getFileByPath("Table.md");
    if (!file) throw new Error("no Table.md in the fixture");
    // A new tab: after a cell was edited, the leaf `getLeaf(false)` hands back is the one just
    // detached, and a note opened there is never drawn.
    const leaf = app.workspace.getLeaf(true);
    await leaf.openFile(file, { state: { mode: "source", source: false } });
    app.workspace.setActiveLeaf(leaf, { focus: true });
  });
  await $(".cm-table-widget").waitForExist({ timeoutMsg: "the table never appeared" });
}

/**
 * Clicks the table cell holding `text`, which puts it in edit mode with an editor of its own.
 * "Holding" rather than "reading": a cell left in edit mode by the test before also holds the
 * icon's widget.
 */
async function editCell(text: string): Promise<void> {
  // Waited for: a table is drawn a moment after its note opens.
  let index = -1;
  await browser.waitUntil(
    async () => {
      index = await browser.execute((text) => {
        const cells = Array.from(document.querySelectorAll(".cm-table-widget td"));
        return cells.findIndex((cell) => cell.textContent?.includes(text) === true);
      }, text);
      return index >= 0;
    },
    { timeoutMsg: `no table cell holds ${text}` },
  );

  await $$(".cm-table-widget td")[index].click();
  await browser.waitUntil(
    () =>
      browser.execute(
        (cell, text) =>
          Array.from(document.querySelectorAll(`${cell} .kalendae-date`)).some(
            (mark) => mark.textContent === text,
          ),
        CELL,
        text,
      ),
    { timeoutMsg: `${text} was never marked in an editor of its cell` },
  );
}

/**
 * Sends a mouse event to the middle of `text` where it is marked in the cell's editor. Synthetic,
 * because a spec has no pointer to move, but with real coordinates, which is what CodeMirror reads.
 */
async function mouseOn(text: string, eventType: string, detail = 0): Promise<void> {
  await browser.execute(
    (cell, text, eventType, detail) => {
      const mark = Array.from(document.querySelectorAll(`${cell} .kalendae-date`)).find(
        (each) => each.textContent === text,
      );
      if (!mark) throw new Error(`${text} is not marked in the cell`);
      const box = mark.getBoundingClientRect();
      mark.dispatchEvent(
        new MouseEvent(eventType, {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          detail,
          clientX: box.left + box.width / 2,
          clientY: box.top + box.height / 2,
        }),
      );
    },
    CELL,
    text,
    eventType,
    detail,
  );
}

/**
 * Whether the element matching `selector` is drawn whole: what lies on top 2px inside the middle of
 * each of its edges is the element or something in it. A clipped edge shows whatever is beneath
 * instead. Middles rather than corners, which a rounded border leaves outside the element.
 */
async function shownWhole(selector: string): Promise<boolean> {
  return browser.execute((selector) => {
    const element = document.querySelector(selector);
    if (!element) return false;
    const box = element.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) return false;
    const middleX = box.left + box.width / 2;
    const middleY = box.top + box.height / 2;
    const edges = [
      [box.left + 2, middleY],
      [box.right - 2, middleY],
      [middleX, box.top + 2],
      [middleX, box.bottom - 2],
    ];
    return edges.every(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && element.contains(hit);
    });
  }, selector);
}

/** Whether the element matching `selector` sits anywhere inside a table. */
async function insideTable(selector: string): Promise<boolean> {
  return browser.execute(
    (selector) => document.querySelector(selector)?.closest(".cm-table-widget") != null,
    selector,
  );
}

/** The note as the editor holds it, which a pick reaches before the file on disk does. */
async function noteNow(): Promise<string> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error("no markdown view is active");
    return view.editor.getValue();
  });
}

describe("A date in a table cell", () => {
  before(async () => {
    // The hint shows only with a distance; it is off by default.
    await setPluginSettings("kalendae", { hoverDistance: "days" });
  });

  beforeEach(async () => {
    await openTable();
    await editCell(DATE);
  });

  it("shows the hover icon whole, at the table's left edge", async () => {
    await mouseOn(DATE, "mouseover");
    await $(`${CELL} .kalendae-icon-anchor.kalendae-hot`).waitForExist();
    expect(await shownWhole(`${CELL} .kalendae-icon`)).toBe(true);
  });

  it("shows the hint whole, outside the table", async () => {
    await mouseOn(DATE, "mousemove");
    await $(".kalendae-hint").waitForDisplayed();
    expect(await insideTable(".kalendae-hint")).toBe(false);
    expect(await shownWhole(".kalendae-hint-host")).toBe(true);
  });

  it("opens the calendar whole on a double-click, and writes the day picked", async () => {
    await mouseOn(DATE, "mousedown", 2);
    await $(".kalendae-panel").waitForDisplayed();
    expect(await insideTable(".kalendae-panel")).toBe(false);
    expect(await shownWhole(".kalendae-panel")).toBe(true);

    const index = await browser.execute(() => {
      const days = Array.from(document.querySelectorAll(".kalendae-panel-day"));
      return days.findIndex(
        (day) => day.textContent === "15" && !day.classList.contains("kalendae-day-outside"),
      );
    });
    await $$(".kalendae-panel-day")[index].click();

    await browser.waitUntil(async () => (await noteNow()).includes("2026-10-15"), {
      timeoutMsg: "the picked day never reached the note",
    });
    expect(await $(".kalendae-panel").isExisting()).toBe(false);
  });
});

describe("A time in a table cell", () => {
  before(async () => {
    // A vault starts with the time format its region writes, which here may not be 24-hour.
    await setPluginSettings("kalendae", { timeFormats: [{ id: "time-24", pattern: "HH:mm" }] });
  });

  beforeEach(async () => {
    await openTable();
    await editCell(TIME);
  });

  it("opens the clock whole on a double-click, and Escape closes it", async () => {
    await mouseOn(TIME, "mousedown", 2);
    await $(".kalendae-clock").waitForDisplayed();
    expect(await insideTable(".kalendae-clock")).toBe(false);
    expect(await shownWhole(".kalendae-clock")).toBe(true);

    await press("Escape");
    await $(".kalendae-clock").waitForExist({ reverse: true });
    expect(await noteNow()).toContain(TIME);
  });
});

export {};
