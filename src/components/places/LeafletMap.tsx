"use client";

import { useMemo } from "react";
import Link from "next/link";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import classes from "./PlacesMap.module.css";

export interface MapPin {
  /** Place slug: letters, digits and hyphens only. */
  slug: string;
  label: string;
  /** A line under the name, such as the address. */
  detail: string | null;
  lat: number;
  lng: number;
}

// Leaflet's stock marker is an image that bundlers lose track of; this pin is
// drawn in CSS instead, in the theme's colour.
function pinIcon(slug: string): L.DivIcon {
  return L.divIcon({
    className: classes.pin,
    html: `<span class="${classes.pinShape}" data-testid="map-pin-${slug.replace(/[^a-z0-9-]/gi, "")}"></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 30],
    popupAnchor: [0, -30],
  });
}

/** Rendered in the browser only: import it through PlacesMap. */
export default function LeafletMap({ pins }: { pins: MapPin[] }) {
  const icons = useMemo(() => new Map(pins.map((pin) => [pin.slug, pinIcon(pin.slug)])), [pins]);
  const positions = pins.map((pin) => [pin.lat, pin.lng] as [number, number]);
  const view =
    pins.length > 1
      ? { bounds: L.latLngBounds(positions).pad(0.15) }
      : { center: positions[0] ?? ([20, 0] as [number, number]), zoom: pins.length === 1 ? 12 : 2 };

  return (
    <MapContainer {...view} scrollWheelZoom={false} className={classes.map}>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      {pins.map((pin) => (
        <Marker
          key={pin.slug}
          position={[pin.lat, pin.lng]}
          icon={icons.get(pin.slug)}
          title={pin.label}
          alt={pin.label}
        >
          <Popup>
            <Link
              href={`/places/${pin.slug}`}
              className={classes.popupLink}
              data-testid={`map-link-${pin.slug}`}
            >
              {pin.label}
            </Link>
            {pin.detail && pin.detail !== pin.label && (
              <div className={classes.popupDetail}>{pin.detail}</div>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
