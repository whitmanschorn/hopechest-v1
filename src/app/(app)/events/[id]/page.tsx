import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
import { deleteEventAction } from "@/app/(app)/events/actions";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { LinkButton } from "@/components/LinkButton";
import { TextLink } from "@/components/TextLink";
import { KIND_LABELS, ROLE_LABELS } from "@/lib/events/eventEdit";
import { describe } from "@/lib/fuzzyDate";
import { can } from "@/server/actor";
import { requireActor } from "@/server/auth/session";
import { getEvent } from "@/server/events/service";

export const metadata: Metadata = { title: "Event · Hopechest" };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("read");
  const { id } = await params;
  const event = await getEvent(actor, id);
  if (!event) notFound();
  const canWrite = can(actor, "write");

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start" gap="md">
          <div>
            <Title order={1} data-testid="event-title">
              {event.title}
            </Title>
            <Group gap="xs" mt={4}>
              <Badge variant="light" tt="none" fw={500} size="lg" data-testid="event-kind">
                {KIND_LABELS[event.kind]}
              </Badge>
              <Text c="dimmed" data-testid="event-date">
                {event.date ? describe(event.date) : "Date not recorded"}
              </Text>
            </Group>
          </div>
          <Group gap="xs">
            <LinkButton href="/timeline" variant="default" data-testid="event-timeline">
              Timeline
            </LinkButton>
            {canWrite && (
              <>
                <LinkButton
                  href={`/events/${event.id}/edit`}
                  variant="default"
                  leftSection={<IconPencil size={16} />}
                  data-testid="edit-event"
                >
                  Edit
                </LinkButton>
                <ConfirmDelete
                  action={deleteEventAction}
                  fields={{ id: event.id }}
                  title="Delete this event?"
                  data-testid="delete-event"
                >
                  This removes &ldquo;{event.title}&rdquo; from the chest. The people and the place
                  stay.
                </ConfirmDelete>
              </>
            )}
          </Group>
        </Group>

        {(event.description || event.place || event.date?.deduced) && (
          <Paper p="md" radius="md" withBorder bg="var(--hc-surface)">
            <Stack gap="sm">
              {event.description && (
                <Text style={{ whiteSpace: "pre-wrap" }} data-testid="event-description">
                  {event.description}
                </Text>
              )}
              {event.place && (
                <Text data-testid="event-place">
                  <Text span c="dimmed">
                    Place:{" "}
                  </Text>
                  <TextLink href={`/places/${event.place.slug}`} inherit>
                    {event.place.label}
                  </TextLink>
                </Text>
              )}
              {event.date?.deduced && event.date.clue && (
                <Text c="dimmed" data-testid="event-clue">
                  Date deduced: {event.date.clue}
                </Text>
              )}
            </Stack>
          </Paper>
        )}

        <Stack gap="sm" component="section" data-testid="event-people">
          <Title order={2} fz="h3">
            Who took part
          </Title>
          {event.participants.length === 0 && <Text c="dimmed">No one is recorded.</Text>}
          {event.participants.map((person) => (
            <Group key={person.slug} gap="xs" data-testid={`event-person-${person.slug}`}>
              <TextLink href={`/people/${person.slug}`} fw={600}>
                {person.displayName}
              </TextLink>
              {person.role !== "subject" && (
                <Text c="dimmed" fz="sm">
                  {ROLE_LABELS[person.role]}
                </Text>
              )}
            </Group>
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
