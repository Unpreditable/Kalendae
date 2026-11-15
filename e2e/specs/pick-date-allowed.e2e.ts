// The calendar another plugin opens through `api.pickDate`, limited to the days it allows (TODO
// item 29). GTD Tasks opens it this way for a task dropped into a bucket: only the bucket's days can
// be picked, and the rest are shown struck through.
//
// Written without imports: describe, it, expect, browser, $ and the helpers are globals the harness
// provides.

/** The shape of what `pickDate` settles with, kept on the window for the spec to read. */
type Picked = { done: boolean; day: string | null };

/** Opens the calendar on 14 November 2026, with only the week of the 16th to 22nd allowed. */
async function openLimited(): Promise<void> {
  await browser.executeObsidian(({ plugins }) => {
    const api = (plugins.kalendae as unknown as {
      api: { pickDate(options: unknown): Promise<string | null> };
    }).api;
    const holder = window as unknown as { kalendaePicked: Picked };
    holder.kalendaePicked = { done: false, day: null };
    void api
      .pickDate({
        value: "2026-11-14",
        // A point near the top, so the calendar opens clear of the status bar, which takes a
        // real click meant for a day along the window's bottom edge.
        anchor: new MouseEvent("click", { clientX: 200, clientY: 150 }),
        allowed: [{ from: "2026-11-16", to: "2026-11-22" }],
      })
      .then((day) => {
        holder.kalendaePicked = { done: true, day };
      });
  });
  await $(".kalendae-panel-popup").waitForDisplayed({ timeoutMsg: "the calendar never opened" });
}

/** What `pickDate` settled with, once it has. */
async function picked(): Promise<string | null> {
  await browser.waitUntil(
    () => browser.execute(() => (window as unknown as { kalendaePicked: Picked }).kalendaePicked.done),
    { timeoutMsg: "pickDate never settled" },
  );
  return browser.execute(() => (window as unknown as { kalendaePicked: Picked }).kalendaePicked.day);
}

/** The classes on the November cell reading `day`. */
async function classesOf(day: string): Promise<string[]> {
  return browser.execute((day) => {
    const cell = Array.from(
      document.querySelectorAll(".kalendae-panel-popup .kalendae-panel-day:not(.kalendae-day-outside)"),
    ).find((each) => each.textContent === day);
    if (!cell) throw new Error(`no cell reads ${day}`);
    return Array.from(cell.classList);
  }, day);
}

/** The number on the cell the keyboard is on. */
async function ringOn(): Promise<string> {
  return $(".kalendae-panel-popup .kalendae-day-focused").getText();
}

/** Sends a mouse event to the November cell reading `day`. */
async function mouseOnDay(day: string, eventType: string): Promise<void> {
  await browser.execute(
    (day, eventType) => {
      const cell = Array.from(
        document.querySelectorAll(".kalendae-panel-popup .kalendae-panel-day:not(.kalendae-day-outside)"),
      ).find((each) => each.textContent === day);
      if (!cell) throw new Error(`no cell reads ${day}`);
      cell.dispatchEvent(new MouseEvent(eventType, { bubbles: true, cancelable: true, view: window, button: 0 }));
    },
    day,
    eventType,
  );
}

/** Whether the preview line under the calendar shows the lock. */
async function locked(): Promise<boolean> {
  return $(".kalendae-panel-popup .kalendae-panel-writes .kalendae-lock").isExisting();
}

describe("A calendar limited to some days", () => {
  before(async () => {
    // The lock lives in the preview line.
    await setPluginSettings("kalendae", { showWritesPreview: true });
  });

  beforeEach(async () => {
    await openLimited();
  });

  afterEach(async () => {
    // Closes whatever a case left open, so the next one starts clean.
    if (await $(".kalendae-panel-popup").isExisting()) await press("Escape");
  });

  it("strikes out the days outside and opens on the first one inside", async () => {
    expect(await classesOf("15")).toContain("kalendae-day-blocked");
    expect(await classesOf("16")).not.toContain("kalendae-day-blocked");
    expect(await classesOf("23")).toContain("kalendae-day-blocked");
    expect(await ringOn()).toBe("16");
  });

  it("stops the keyboard at the last day it can pick, and Enter picks it", async () => {
    await press("ArrowDown");
    expect(await ringOn()).toBe("22");
    await press("Enter");
    expect(await picked()).toBe("2026-11-22");
  });

  it("greys out every month and year arrow when no other month has a day to pick", async () => {
    const blocked = await browser.execute(() =>
      Array.from(document.querySelectorAll(".kalendae-panel-popup .kalendae-panel-step")).map((step) =>
        step.classList.contains("kalendae-day-blocked"),
      ),
    );
    expect(blocked).toEqual([true, true, true, true]);
  });

  it("leaves the ring in place on a page key that cannot change the month", async () => {
    await press("PageDown");
    expect(await ringOn()).toBe("16");
  });

  it("leaves the keyboard where it is when nothing can be picked that way", async () => {
    await press("ArrowLeft");
    expect(await ringOn()).toBe("16");
  });

  it("shows a lock beside a day that cannot be picked, until the pointer leaves", async () => {
    await mouseOnDay("25", "mouseenter");
    expect(await locked()).toBe(true);
    await browser.execute(() => {
      document
        .querySelector(".kalendae-panel-popup .kalendae-panel-grid")
        ?.dispatchEvent(new MouseEvent("mouseleave", { view: window }));
    });
    expect(await locked()).toBe(false);
  });

  it("keeps the keyboard working after a real click on a day outside", async () => {
    const index = await browser.execute(() =>
      Array.from(document.querySelectorAll(".kalendae-panel-popup .kalendae-panel-day")).findIndex(
        (each) => each.textContent === "25" && !each.classList.contains("kalendae-day-outside"),
      ),
    );
    await $$(".kalendae-panel-popup .kalendae-panel-day")[index].click();
    await press("ArrowRight");
    await press("ArrowRight");
    expect(await ringOn()).toBe("18");
  });

  it("fades only the number of a day outside, not its weekend band or today's outline", async () => {
    const opacities = await browser.execute(() => {
      const cell = Array.from(
        document.querySelectorAll(".kalendae-panel-popup .kalendae-panel-day:not(.kalendae-day-outside)"),
      ).find((each) => each.textContent === "28");
      if (!cell) throw new Error("no cell reads 28");
      const number = cell.querySelector(".kalendae-day-number");
      return {
        cell: getComputedStyle(cell).opacity,
        number: number ? getComputedStyle(number).opacity : null,
      };
    });
    expect(opacities.cell).toBe("1");
    expect(opacities.number).not.toBeNull();
    expect(Number(opacities.number)).toBeLessThan(1);
  });

  it("ignores a click on a day outside, and Escape closes with nothing", async () => {
    await mouseOnDay("25", "click");
    expect(await $(".kalendae-panel-popup").isExisting()).toBe(true);
    await press("Escape");
    expect(await picked()).toBeNull();
  });
});

export {};
