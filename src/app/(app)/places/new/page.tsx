import type { Metadata } from "next";
import { Container, Stack, Text, Title } from "@mantine/core";
import { PlaceForm } from "@/components/places/PlaceForm";
import { BLANK_PLACE } from "@/lib/places/placeEdit";
import { requireActor } from "@/server/auth/session";

export const metadata: Metadata = { title: "Add a place · Hopechest" };

export default async function NewPlacePage() {
  await requireActor("write");
  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} data-testid="new-place-title">
            Add a place
          </Title>
          <Text c="dimmed">
            Only a name is needed. A place with a latitude and longitude gets a pin on the map.
          </Text>
        </div>
        <PlaceForm initial={BLANK_PLACE} cancelHref="/places" />
      </Stack>
    </Container>
  );
}
