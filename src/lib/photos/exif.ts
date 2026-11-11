import type { FuzzyDate } from "@/lib/fuzzyDate";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The day a photo was taken, from its camera data. Cameras record local time
 * without a zone, so only the calendar day is kept. A scan's "date taken" is
 * the day it was scanned, which says nothing about the picture, so software
 * names that look like scanners are ignored.
 */
export function takenDate(exif: {
  DateTimeOriginal?: unknown;
  CreateDate?: unknown;
  Make?: unknown;
  Software?: unknown;
}): FuzzyDate | null {
  const source = `${String(exif.Make ?? "")} ${String(exif.Software ?? "")}`;
  if (/scan|epson|canoscan|vuescan|silverfast/i.test(source)) return null;

  const raw = exif.DateTimeOriginal ?? exif.CreateDate;
  let year: number, month: number, day: number;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    // exifr builds the Date from the camera's wall-clock fields as if they were local time.
    [year, month, day] = [raw.getFullYear(), raw.getMonth() + 1, raw.getDate()];
  } else if (typeof raw === "string") {
    const match = /^(\d{4})[:-](\d{2})[:-](\d{2})/.exec(raw);
    if (!match) return null;
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  // Cameras with a dead clock battery report their epoch.
  if (
    year < 1826 ||
    year > new Date().getFullYear() + 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return { year, month, day, precision: "day", display: `${MONTHS[month - 1]} ${day}, ${year}` };
}

/** GPS position from camera data, when present and plausible. */
export function takenAt(exif: {
  latitude?: unknown;
  longitude?: unknown;
}): { lat: number; lng: number } | null {
  const { latitude: lat, longitude: lng } = exif;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}
