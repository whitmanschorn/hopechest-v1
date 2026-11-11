import { takenAt, takenDate } from "../exif";
import {
  contentTypeForKey,
  derivedKeys,
  fileUrl,
  isOriginalKey,
  isSafeKey,
  keyFromUrl,
  originalKey,
} from "../keys";

const ID = "018f3c5e-7b1a-7c3d-9e2f-0123456789ab";

describe("keys", () => {
  it("builds an original's key from the upload id and type", () => {
    expect(originalKey(ID, "image/jpeg")).toBe(`originals/${ID}.jpg`);
    expect(originalKey(ID, "image/heic")).toBeNull();
    expect(originalKey("../../etc", "image/jpeg")).toBeNull();
    expect(isOriginalKey(`originals/${ID}.jpg`)).toBe(true);
    expect(isOriginalKey(`photos/${ID}/display.jpg`)).toBe(false);
    expect(isOriginalKey(`originals/${ID}.jpg/../x`)).toBe(false);
  });

  it("accepts only plain keys", () => {
    expect(isSafeKey(derivedKeys(ID).display)).toBe(true);
    for (const bad of [
      "../secret",
      "/etc/passwd",
      "photos/../../x",
      "photos//x",
      "a b",
      "",
      "photos/x.jpg?y",
    ]) {
      expect([bad, isSafeKey(bad)]).toEqual([bad, false]);
    }
  });

  it("round-trips between key and address", () => {
    const { thumb } = derivedKeys(ID);
    expect(keyFromUrl(fileUrl(thumb))).toBe(thumb);
    expect(keyFromUrl("https://example.com/x.jpg")).toBeNull();
    expect(keyFromUrl("/api/files/../x")).toBeNull();
    expect(contentTypeForKey(thumb)).toBe("image/jpeg");
    expect(contentTypeForKey("originals/x.tif")).toBe("image/tiff");
    expect(contentTypeForKey("x.bin")).toBe("application/octet-stream");
  });
});

describe("takenDate", () => {
  it("reads the calendar day from camera data", () => {
    expect(takenDate({ DateTimeOriginal: "1998:07:04 15:30:00" })).toEqual({
      year: 1998,
      month: 7,
      day: 4,
      precision: "day",
      display: "July 4, 1998",
    });
    expect(takenDate({ CreateDate: new Date(2004, 11, 25, 9, 0) })?.display).toBe(
      "December 25, 2004",
    );
  });

  it("ignores scanners, dead clocks and junk", () => {
    expect(
      takenDate({ DateTimeOriginal: "2024:01:02 10:00:00", Software: "EPSON Scan 2" }),
    ).toBeNull();
    expect(takenDate({ DateTimeOriginal: "0000:00:00 00:00:00" })).toBeNull();
    expect(takenDate({ DateTimeOriginal: "2999:01:01 00:00:00" })).toBeNull();
    expect(takenDate({ DateTimeOriginal: "yesterday" })).toBeNull();
    expect(takenDate({})).toBeNull();
  });
});

describe("takenAt", () => {
  it("keeps plausible positions only", () => {
    expect(takenAt({ latitude: 33.6, longitude: -117.9 })).toEqual({ lat: 33.6, lng: -117.9 });
    expect(takenAt({ latitude: 0, longitude: 0 })).toBeNull();
    expect(takenAt({ latitude: 91, longitude: 0 })).toBeNull();
    expect(takenAt({ latitude: "33.6", longitude: -117.9 })).toBeNull();
  });
});
