import {
  clampView,
  pan,
  parseStoredCrop,
  sourceSquare,
  toStored,
  viewForBox,
} from "@/lib/people/avatarCrop";

describe("profile picture crop", () => {
  it("starts as the largest centred square", () => {
    expect(sourceSquare({ cx: 0.5, cy: 0.5, zoom: 1 }, 400, 200)).toEqual({
      x: 100,
      y: 0,
      size: 200,
    });
  });

  it("zooming in shrinks the square around its centre", () => {
    expect(sourceSquare({ cx: 0.5, cy: 0.5, zoom: 2 }, 400, 200)).toEqual({
      x: 150,
      y: 50,
      size: 100,
    });
  });

  it("never leaves the photo", () => {
    const square = sourceSquare({ cx: 2, cy: -1, zoom: 2 }, 400, 200);
    expect(square).toEqual({ x: 300, y: 0, size: 100 });
    expect(clampView({ cx: 0.5, cy: 0.5, zoom: 99 }, 400, 200).zoom).toBe(4);
    expect(clampView({ cx: 0.5, cy: 0.5, zoom: Number.NaN }, 400, 200).zoom).toBe(1);
  });

  it("dragging the photo right shows more of its left side", () => {
    const moved = pan({ cx: 0.5, cy: 0.5, zoom: 1 }, 0.25, 0, 400, 200);
    expect(sourceSquare(moved, 400, 200).x).toBe(50);
    // The shorter side has nowhere to go at zoom 1.
    expect(pan({ cx: 0.5, cy: 0.5, zoom: 1 }, 0, 0.5, 400, 200).cy).toBe(0.5);
  });

  it("opens on a face box with room around it", () => {
    // A 100px face in the middle of a 1000x500 photo: a 160px square around it.
    const view = viewForBox({ x: 45, y: 40, w: 10, h: 20 }, 1000, 500);
    expect(view.cx).toBe(0.5);
    expect(view.cy).toBe(0.5);
    expect(sourceSquare(view, 1000, 500).size).toBeCloseTo(160);
    // A tiny box cannot zoom past the limit; a huge one shows the whole photo.
    expect(viewForBox({ x: 0, y: 0, w: 3, h: 3 }, 1000, 500).zoom).toBe(4);
    expect(viewForBox({ x: 0, y: 0, w: 100, h: 100 }, 1000, 500).zoom).toBe(1);
  });

  it("is stored as percentages", () => {
    expect(toStored({ x: 150, y: 50, size: 100 }, 400, 200)).toEqual({ x: 37.5, y: 25, size: 50 });
  });

  it("rejects a crop that is not three percentages", () => {
    expect(parseStoredCrop({ x: 10, y: 20, size: 50 })).toEqual({ x: 10, y: 20, size: 50 });
    expect(parseStoredCrop({ x: 10, y: 20, size: 0 })).toBeNull();
    expect(parseStoredCrop({ x: -1, y: 20, size: 50 })).toBeNull();
    expect(parseStoredCrop({ x: "10", y: 20, size: 50 })).toBeNull();
    expect(parseStoredCrop(null)).toBeNull();
  });
});
