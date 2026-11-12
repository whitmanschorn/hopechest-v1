import { boxFromColumns, boxFromDrag, parseBox } from "@/lib/photos/box";

describe("face boxes", () => {
  it("is the rectangle between the two ends of a drag, whichever way it went", () => {
    const box = { x: 20, y: 10, w: 30, h: 40 };
    expect(boxFromDrag({ x: 0.2, y: 0.1 }, { x: 0.5, y: 0.5 })).toEqual(box);
    expect(boxFromDrag({ x: 0.5, y: 0.5 }, { x: 0.2, y: 0.1 })).toEqual(box);
  });

  it("stays inside the picture when the drag leaves it", () => {
    expect(boxFromDrag({ x: 0.8, y: 0.8 }, { x: 1.4, y: 2 })).toEqual({
      x: 80,
      y: 80,
      w: 20,
      h: 20,
    });
  });

  it("ignores a slip of the finger", () => {
    expect(boxFromDrag({ x: 0.2, y: 0.2 }, { x: 0.21, y: 0.6 })).toBeNull();
  });

  it("accepts only rectangles inside the picture", () => {
    expect(parseBox({ x: 10, y: 10, w: 20, h: 20 })).toEqual({ x: 10, y: 10, w: 20, h: 20 });
    expect(parseBox({ x: 90, y: 10, w: 20, h: 20 })).toBeNull();
    expect(parseBox({ x: 10, y: 10, w: 1, h: 20 })).toBeNull();
    expect(parseBox({ x: "10", y: 10, w: 20, h: 20 })).toBeNull();
    expect(parseBox(null)).toBeNull();
  });

  it("reads the stored columns, all or nothing", () => {
    expect(boxFromColumns({ boxX: 1, boxY: 2, boxW: 3, boxH: 4 })).toEqual({
      x: 1,
      y: 2,
      w: 3,
      h: 4,
    });
    expect(boxFromColumns({ boxX: 1, boxY: null, boxW: 3, boxH: 4 })).toBeNull();
  });
});
