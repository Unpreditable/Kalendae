import { placementFor } from "../../src/picker/popup-math";

const window = { width: 800, height: 600 };
const popup = { width: 300, height: 320 };

describe("placementFor", () => {
  it("sits below the anchor, with a gap, when there is room", () => {
    const anchor = { left: 100, top: 100, right: 160, bottom: 120 };

    expect(placementFor(anchor, popup, window)).toEqual({ left: 100, top: 124 });
  });

  it("flips above the anchor when the bottom would leave the window", () => {
    const anchor = { left: 100, top: 400, right: 160, bottom: 420 };

    expect(placementFor(anchor, popup, window)).toEqual({ left: 100, top: 76 });
  });

  it("stays below when neither side fits, rather than flipping off the top", () => {
    const anchor = { left: 100, top: 100, right: 160, bottom: 120 };
    const tall = { width: 300, height: 590 };

    expect(placementFor(anchor, tall, window).top).toBe(124);
  });

  it("is held inside the right edge of the window", () => {
    const anchor = { left: 700, top: 100, right: 760, bottom: 120 };

    expect(placementFor(anchor, popup, window).left).toBe(500);
  });

  it("is held inside the left edge of the window", () => {
    const anchor = { left: -20, top: 100, right: 0, bottom: 120 };

    expect(placementFor(anchor, popup, window).left).toBe(0);
  });

  it("places a click from the point it landed on", () => {
    const point = { left: 250, top: 90, right: 250, bottom: 90 };

    expect(placementFor(point, popup, window)).toEqual({ left: 250, top: 94 });
  });
});
