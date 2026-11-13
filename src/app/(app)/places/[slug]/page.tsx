import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconMap, IconPencil, IconPlus, IconTopologyStar3 } from "@tabler/icons-react";
import { deletePlaceAction } from "@/app/(app)/places/actions";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { EventCard } from "@/components/events/EventCard";
import { LinkButton } from "@/components/LinkButton";
import { addressLine } from "@/lib/places/placeEdit";
import { can } from "@/server/actor";
import { FactsPanel } from "@/components/graph/FactsPanel";
import { requireActor } from "@/server/auth/session";
import { listEvents } from "@/server/events/service";
import { getPlace } from "@/server/places/service";

export const metadata: Metadata = { title: "Place · Hopechest" };

export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const actor = await requireActor("read");
  const { slug } = await params;
  const place = await getPlace(actor, slug);
  if (!place) notFound();
  const events = await listEvents(actor, { place: place.slug });
  const canWrite = can(actor, "write");
  const { values } = place;
  const address = addressLine(values);
  const pinned = values.lat !== null && values.lng !== null;

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start" gap="md">
          <div>
            <Title order={1} data-testid="place-name">
              {values.label}
            </Title>
            <Text c="dimmed" mt={4} data-testid="place-address">
              {address ?? "Address not recorded"}
            </Text>
          </div>
          <Group gap="xs">
            {pinned && (
              <LinkButton
                href="/map"
                variant="default"
                leftSection={<IconMap size={16} />}
                data-testid="place-map-link"
              >
                Map
              </LinkButton>
            )}
            {canWrite && (
              <>
                <LinkButton
                  href={`/places/${place.slug}/edit`}
                  variant="default"
                  leftSection={<IconPencil size={16} />}
                  data-testid="edit-place"
                >
                  Edit
                </LinkButton>
                <ConfirmDelete
                  action={deletePlaceAction}
                  fields={{ slug: place.slug }}
                  title="Delete this place?"
                  data-testid="delete-place"
                >
                  This removes &ldquo;{values.label}&rdquo; from the chest.{" "}
                  {events.length > 0
                    ? `The ${events.length === 1 ? "event" : `${events.length} events`} recorded here will be kept, without a place.`
                    : "No events are recorded here."}
                </ConfirmDelete>
              </>
            )}
          </Group>
        </Group>

        {(values.notes || pinned) && (
          <Paper p="md" radius="md" withBorder bg="var(--hc-surface)">
            <Stack gap="sm">
              {values.notes && (
                <Text style={{ whiteSpace: "pre-wrap" }} data-testid="place-notes">
                  {values.notes}
                </Text>
              )}
              {pinned && (
                <Text c="dimmed" fz="sm" data-testid="place-coordinates">
                  Pin at {values.lat}, {values.lng}
                </Text>
              )}
            </Stack>
          </Paper>
        )}

        <Stack gap="sm" component="section" data-testid="node-facts">
          <Title order={2} fz="h3">
            More about this place
          </Title>
          <FactsPanel actor={actor} nodeKey={`place:${place.slug}`} core={false} />
          <Group>
            <LinkButton
              href={`/graph?center=${encodeURIComponent(`place:${place.slug}`)}`}
              variant="subtle"
              size="compact-sm"
              leftSection={<IconTopologyStar3 size={14} />}
              data-testid="see-in-graph"
            >
              See in the graph
            </LinkButton>
          </Group>
        </Stack>
        <Stack gap="sm" component="section" data-testid="place-events">
          <Group justify="space-between" align="center">
            <Title order={2} fz="h3">
              What happened here
            </Title>
            {canWrite && (
              <LinkButton
                href={`/events/new?place=${place.slug}`}
                variant="default"
                leftSection={<IconPlus size={16} />}
                data-testid="add-event-here"
              >
                Add an event
              </LinkButton>
            )}
          </Group>
          {events.length === 0 && <Text c="dimmed">No events are recorded here yet.</Text>}
          {events.map((event) => (
            <EventCard key={event.id} event={event} hidePlace />
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
