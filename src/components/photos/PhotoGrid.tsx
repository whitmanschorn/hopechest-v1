import Link from "next/link";
import { describe } from "@/lib/fuzzyDate";
import type { PhotoCard } from "@/server/photos/service";
import classes from "./PhotoGrid.module.css";

/** What a screen reader says for a photo: its caption, else its date, else a plain label. */
export function photoLabel(photo: Pick<PhotoCard, "caption" | "date">): string {
  if (photo.caption) return photo.caption;
  return photo.date ? `Photo, ${describe(photo.date)}` : "Photo with no caption yet";
}

export function PhotoGrid({ photos }: { photos: PhotoCard[] }) {
  return (
    <div className={classes.grid} data-testid="photo-grid">
      {photos.map((photo) => (
        <Link
          key={photo.id}
          href={`/photos/${photo.id}`}
          className={classes.tile}
          data-testid="photo-tile"
        >
          {/* Served by /api/files behind the session, so next/image's optimizer cannot fetch it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.thumbUrl} alt={photoLabel(photo)} loading="lazy" decoding="async" />
        </Link>
      ))}
    </div>
  );
}
