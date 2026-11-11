"use client";

import dynamic from "next/dynamic";
import { Center, Loader } from "@mantine/core";
import type { MapPin } from "./LeafletMap";
import classes from "./PlacesMap.module.css";

// Leaflet touches `window` as soon as it is imported, so it is loaded in the browser only.
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <Center h="100%">
      <Loader />
    </Center>
  ),
});

/** A map with a pin for each place; each pin opens a link to the place's page. */
export function PlacesMap({ pins }: { pins: MapPin[] }) {
  return (
    <div
      className={classes.frame}
      role="region"
      aria-label="Map of the family's places"
      data-testid="places-map"
    >
      <LeafletMap pins={pins} />
    </div>
  );
}
