import type { Metadata } from "next";
import { Container, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { PlaceCard } from "@/components/places/PlaceCard";
import { PlacesMap } from "@/components/places/PlacesMap";
import { addressLine } from "@/lib/places/placeEdit";
import { requireActor } from "@/server/auth/session";
import { listPlaces } from "@/server/places/service";

export const metadata: Metadata = { title: "Map · Hopechest" };

export default async function MapPage() {
  const actor = await requireActor("read");
  const places = await listPlaces(actor);
  const pins = places.flatMap(({ slug, values }) =>
    values.lat !== null && values.lng !== null
      ? [
          {
            slug,
            label: values.label,
            detail: addressLine(values),
            lat: values.lat,
            lng: values.lng,
          },
        ]
      : [],
  );
  const unpinned = places.filter(({ values }) => values.lat === null || values.lng === null);

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="map-title">
            Map
          </Title>
          <Text c="dimmed" data-testid="map-count">
            {pins.length} {pins.length === 1 ? "place" : "places"} on the map
          </Text>
        </div>

        {pins.length > 0 ? (
          <PlacesMap pins={pins} />
        ) : (
          <Text c="dimmed" data-testid="map-empty">
            No place has a position yet. Add a latitude and longitude to a place to pin it here.
          </Text>
        )}

        {unpinned.length > 0 && (
          <Stack gap="sm" component="section" data-testid="map-unpinned">
            <Title order={2} fz="h3">
              Not on the map
            </Title>
            <Text c="dimmed" fz="sm">
              These places have no latitude and longitude recorded.
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
              {unpinned.map((place) => (
                <PlaceCard key={place.id} place={place} />
              ))}
            </SimpleGrid>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
