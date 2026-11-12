import { clampView, pan, parseStoredCrop, sourceSquare, toStored } from "@/lib/people/avatarCrop";

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
