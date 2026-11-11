/**
 * Turns what someone typed into the place form into checked values, and works
 * out what changed for the edit history. Pure: no database.
 */

/** The place form as submitted: every field is text. */
export interface PlaceFormInput {
  label: string;
  street: string;
  city: string;
  region: string;
  country: string;
  lat: string;
  lng: string;
  notes: string;
}

export interface PlaceValues {
  label: string;
  street: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
}

export type PlaceField = keyof PlaceValues;
export type PlaceErrors = Partial<Record<PlaceField, string>>;

export const PLACE_FIELD_LABELS: Record<PlaceField, string> = {
  label: "Name",
  street: "Street",
  city: "City",
  region: "State or region",
  country: "Country",
  lat: "Latitude",
  lng: "Longitude",
  notes: "Notes",
};

export const BLANK_PLACE: PlaceFormInput = {
  label: "",
  street: "",
  city: "",
  region: "",
  country: "",
  lat: "",
  lng: "",
  notes: "",
};

const text = (raw: string) => raw.trim() || null;

function coordinate(
  raw: string,
  field: "lat" | "lng",
  limit: number,
  errors: PlaceErrors,
): number | null {
  const value = raw.trim();
  if (!value) return null;
  const number = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(value) ? Number(value) : NaN;
  if (Number.isNaN(number)) {
    errors[field] = "Use a number in decimal degrees, such as 33.6189.";
    return null;
  }
  if (Math.abs(number) > limit) {
    errors[field] = `${PLACE_FIELD_LABELS[field]} is between -${limit} and ${limit}.`;
    return null;
  }
  return number;
}

export function parsePlaceForm(
  input: PlaceFormInput,
): { ok: true; values: PlaceValues } | { ok: false; errors: PlaceErrors } {
  const errors: PlaceErrors = {};
  const label = input.label.trim();
  if (!label) errors.label = "A name is needed.";
  else if (label.length > 120) errors.label = "That name is too long.";

  const lat = coordinate(input.lat, "lat", 90, errors);
  const lng = coordinate(input.lng, "lng", 180, errors);
  // A pin needs both, so half a position is refused rather than stored.
  if (input.lat.trim() && !input.lng.trim()) errors.lng = "Give the longitude too, or clear both.";
  if (input.lng.trim() && !input.lat.trim()) errors.lat = "Give the latitude too, or clear both.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    values: {
      label,
      street: text(input.street),
      city: text(input.city),
      region: text(input.region),
      country: text(input.country),
      lat,
      lng,
      notes: text(input.notes),
    },
  };
}

export function toPlaceFormInput(values: PlaceValues): PlaceFormInput {
  return {
    label: values.label,
    street: values.street ?? "",
    city: values.city ?? "",
    region: values.region ?? "",
    country: values.country ?? "",
    lat: values.lat === null ? "" : String(values.lat),
    lng: values.lng === null ? "" : String(values.lng),
    notes: values.notes ?? "",
  };
}

export interface PlaceChange {
  field: PlaceField;
  before: string | null;
  after: string | null;
}

/** The fields whose value differs, in form order. */
export function diffPlace(before: PlaceValues, after: PlaceValues): PlaceChange[] {
  const show = (value: string | number | null) => (value === null ? null : String(value));
  const changes: PlaceChange[] = [];
  for (const field of Object.keys(PLACE_FIELD_LABELS) as PlaceField[]) {
    const [was, now] = [show(before[field]), show(after[field])];
    if (was !== now) changes.push({ field, before: was, after: now });
  }
  return changes;
}

/** "1 Lucille Lane, Newport Beach, CA, USA", or null when none of it is known. */
export function addressLine(
  place: Pick<PlaceValues, "street" | "city" | "region" | "country">,
): string | null {
  return [place.street, place.city, place.region, place.country].filter(Boolean).join(", ") || null;
}
