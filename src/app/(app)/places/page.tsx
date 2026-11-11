import type { Metadata } from "next";
import { Container, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconMap, IconPlus } from "@tabler/icons-react";
import { LinkButton } from "@/components/LinkButton";
import { PlaceCard } from "@/components/places/PlaceCard";
import { can } from "@/server/actor";
import { requireActor } from "@/server/auth/session";
import { listPlaces } from "@/server/places/service";

export const metadata: Metadata = { title: "Places · Hopechest" };

export default async function PlacesPage() {
  const actor = await requireActor("read");
  const places = await listPlaces(actor);

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={1} data-testid="places-title">
              Places
            </Title>
            <Text c="dimmed" data-testid="places-count">
              {places.length} in the chest
            </Text>
          </div>
          <Group gap="xs">
            <LinkButton
              href="/map"
              variant="default"
              leftSection={<IconMap size={16} />}
              data-testid="places-map-link"
            >
              Map
            </LinkButton>
            {can(actor, "write") && (
              <LinkButton
                href="/places/new"
                leftSection={<IconPlus size={16} />}
                data-testid="add-place"
              >
                Add a place
              </LinkButton>
            )}
          </Group>
        </Group>

        {places.length === 0 ? (
          <Text c="dimmed" data-testid="places-empty">
            No places have been added yet.
          </Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} data-testid="places-list">
            {places.map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Container>
  );
}
