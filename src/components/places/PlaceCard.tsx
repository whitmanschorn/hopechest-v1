import Link from "next/link";
import { Text } from "@mantine/core";
import { addressLine } from "@/lib/places/placeEdit";
import type { PlaceView } from "@/server/places/service";
import classes from "./PlaceCard.module.css";

/** A place as a link, with its address and how many events happened there. */
export function PlaceCard({ place }: { place: PlaceView }) {
  const address = addressLine(place.values);
  const events =
    place.eventCount > 0
      ? `${place.eventCount} ${place.eventCount === 1 ? "event" : "events"}`
      : null;
  return (
    <Link
      href={`/places/${place.slug}`}
      className={classes.card}
      data-testid={`place-${place.slug}`}
    >
      <Text fw={600} lh={1.25} className={classes.name}>
        {place.values.label}
      </Text>
      <Text c="dimmed" fz="sm" lh={1.3}>
        {[address, events].filter(Boolean).join(" · ") || "Address not recorded"}
      </Text>
    </Link>
  );
}
