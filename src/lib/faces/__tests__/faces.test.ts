import { faceCrop, overlap } from "../crop";
import { groupFaces, pickPerson } from "../group";
import { DIMENSIONS, distance, fromVectorText, parseEmbedding, toVectorText } from "../model";

/** A vector that is `value` in one place and zero elsewhere. */
const at = (place: number, value = 1) =>
  Array.from({ length: DIMENSIONS }, (_, index) => (index === place ? value : 0));

describe("parseEmbedding", () => {
  it("takes exactly 128 finite numbers", () => {
    expect(parseEmbedding(at(0))).toHaveLength(DIMENSIONS);
    expect(parseEmbedding(at(0).slice(1))).toBeNull();
    expect(parseEmbedding([...at(0).slice(1), NaN])).toBeNull();
    expect(parseEmbedding([...at(0).slice(1), "1"])).toBeNull();
    expect(parseEmbedding("[1,2]")).toBeNull();
  });

  it("survives the trip through the database's text form", () => {
    const vector = at(3, -0.125);
    expect(fromVectorText(toVectorText(vector))).toEqual(vector);
  });
});

describe("groupFaces", () => {
  it("puts near faces together and far ones apart, biggest group first", () => {
    const vectors = [at(0, 1), at(1, 1), at(0, 1.1), at(1, 1.2), at(1, 0.9), at(2, 1)];
    expect(groupFaces(vectors, 0.45)).toEqual([[1, 3, 4], [0, 2], [5]]);
  });

  it("joins faces linked by a chain of near pairs", () => {
    const vectors = [at(0, 0), at(0, 0.4), at(0, 0.8)];
    expect(distance(vectors[0], vectors[2])).toBeGreaterThan(0.45);
    expect(groupFaces(vectors, 0.45)).toEqual([[0, 1, 2]]);
  });

  it("gives nothing for nothing", () => {
    expect(groupFaces([], 0.45)).toEqual([]);
  });
});

describe("pickPerson", () => {
  const near = [
    { personId: "lucille", distance: 0.3 },
    { personId: "lindsay", distance: 0.2 },
    { personId: "lucille", distance: 0.4 },
    { personId: "gob", distance: 0.9 },
  ];

  it("goes with the person who has the most near faces", () => {
    expect(pickPerson(near, 0.5)).toEqual({ personId: "lucille", distance: 0.3, votes: 2 });
  });

  it("lets the nearest settle a tie", () => {
    expect(pickPerson(near.slice(0, 2), 0.5)?.personId).toBe("lindsay");
  });

  it("skips people already ruled out, and says nothing when nobody is near", () => {
    expect(pickPerson(near, 0.5, new Set(["lucille"]))?.personId).toBe("lindsay");
    expect(pickPerson(near, 0.1)).toBeNull();
    expect(pickPerson([], 0.5)).toBeNull();
  });
});

describe("faceCrop", () => {
  it("fills the window with the face and some room around it", () => {
    // A 100px face in the middle of a 1000x500 photo: the window shows 150px.
    const crop = faceCrop({ x: 45, y: 40, w: 10, h: 20 }, 1000, 500);
    expect(crop).toEqual({ width: "666.7%", left: "-283.3%", top: "-116.7%" });
  });

  it("never shows beyond the edge of the photo", () => {
    const crop = faceCrop({ x: 0, y: 0, w: 20, h: 20 }, 1000, 1000);
    expect(crop.left).toBe("0%");
    expect(crop.top).toBe("0%");
  });

  it("shows the whole short side when the face is most of the photo", () => {
    expect(faceCrop({ x: 10, y: 10, w: 80, h: 80 }, 400, 300).width).toBe("133.3%");
  });
});

describe("overlap", () => {
  it("is 1 for the same box, 0 for boxes apart, and between otherwise", () => {
    const box = { x: 10, y: 10, w: 20, h: 20 };
    expect(overlap(box, box)).toBe(1);
    expect(overlap(box, { x: 50, y: 50, w: 10, h: 10 })).toBe(0);
    expect(overlap(box, { x: 20, y: 10, w: 20, h: 20 })).toBeCloseTo(1 / 3);
  });
});
