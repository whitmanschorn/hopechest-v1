import {
  addressLine,
  BLANK_PLACE,
  diffPlace,
  parsePlaceForm,
  toPlaceFormInput,
  type PlaceFormInput,
} from "../placeEdit";

const form = (over: Partial<PlaceFormInput>): PlaceFormInput => ({
  ...BLANK_PLACE,
  label: "The cabin",
  ...over,
});
const errorsOf = (input: PlaceFormInput) => {
  const parsed = parsePlaceForm(input);
  return parsed.ok ? {} : parsed.errors;
};
const valuesOf = (input: PlaceFormInput) => {
  const parsed = parsePlaceForm(input);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.values;
};

describe("parsePlaceForm", () => {
  it("needs a name", () => {
    expect(errorsOf(form({ label: " " }))).toEqual({ label: "A name is needed." });
  });

  it("trims text and treats blanks as not recorded", () => {
    expect(valuesOf(form({ label: " The cabin ", city: " Big Bear ", notes: "  " }))).toEqual({
      label: "The cabin",
      street: null,
      city: "Big Bear",
      region: null,
      country: null,
      lat: null,
      lng: null,
      notes: null,
    });
  });

  it("reads coordinates as numbers", () => {
    expect(valuesOf(form({ lat: " 33.6189 ", lng: "-117.9298" }))).toMatchObject({
      lat: 33.6189,
      lng: -117.9298,
    });
    expect(valuesOf(form({ lat: "0", lng: "0" }))).toMatchObject({ lat: 0, lng: 0 });
    expect(valuesOf(form({ lat: "-90", lng: "180" }))).toMatchObject({ lat: -90, lng: 180 });
  });

  it("latitude and longitude come together", () => {
    expect(errorsOf(form({ lat: "33.6" }))).toEqual({
      lng: "Give the longitude too, or clear both.",
    });
    expect(errorsOf(form({ lng: "-117.9" }))).toEqual({
      lat: "Give the latitude too, or clear both.",
    });
  });

  it("refuses coordinates out of range or not numbers", () => {
    expect(errorsOf(form({ lat: "91", lng: "-181" }))).toEqual({
      lat: "Latitude is between -90 and 90.",
      lng: "Longitude is between -180 and 180.",
    });
    expect(errorsOf(form({ lat: "north", lng: "1e2" }))).toEqual({
      lat: "Use a number in decimal degrees, such as 33.6189.",
      lng: "Use a number in decimal degrees, such as 33.6189.",
    });
  });
});

describe("the form round trip", () => {
  it("gives back what was stored", () => {
    const input = form({ street: "1 Lucille Lane", lat: "33.6189", lng: "-117.9298" });
    expect(toPlaceFormInput(valuesOf(input))).toEqual(input);
  });
});

describe("diffPlace", () => {
  it("lists only what changed", () => {
    const before = valuesOf(form({ city: "Newport Beach" }));
    const after = valuesOf(form({ city: "Newport Beach", lat: "33.6", lng: "-117.9" }));
    expect(diffPlace(before, before)).toEqual([]);
    expect(diffPlace(before, after)).toEqual([
      { field: "lat", before: null, after: "33.6" },
      { field: "lng", before: null, after: "-117.9" },
    ]);
  });
});

describe("addressLine", () => {
  it("joins what is known", () => {
    expect(
      addressLine({
        street: "1 Lucille Lane",
        city: "Newport Beach",
        region: "CA",
        country: "USA",
      }),
    ).toBe("1 Lucille Lane, Newport Beach, CA, USA");
    expect(addressLine({ street: null, city: null, region: "CA", country: "USA" })).toBe("CA, USA");
    expect(addressLine({ street: null, city: null, region: null, country: null })).toBeNull();
  });
});
